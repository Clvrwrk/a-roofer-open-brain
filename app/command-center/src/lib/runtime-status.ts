// Runtime board engine for /agents (docs/109). Computes one red / yellow / green light
// per component from the system that actually knows (D2): pg_cron run details, the
// host-job report table, feed freshness, and Better Stack monitors + heartbeats.
// Colour rules are D5, applied by classifyScheduled() / classifyFeed() below.
import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICE_AGENT_IDENTITIES, getServiceTokenHashEnvKey } from "./access-control";
import { loadBetterStackSnapshot, type BetterStackHeartbeat, type BetterStackMonitor } from "./betterstack.server";
import { expectedStatus, probeIntegrations, type ProbeResult } from "./integration-probes.server";
import { getRuntimeEnv, type RuntimeEnv } from "./runtime-env";
import {
  AGENTS,
  EDGE_FUNCTIONS,
  FEEDS,
  GROUP_ORDER,
  INTEGRATIONS,
  MONITORED_ROUTES,
  type IntegrationSpec,
  PG_CRON_JOBS,
  SYSTEMD_JOBS,
  type RuntimeKind,
} from "./runtime-registry";
import { createServerSupabaseClient } from "./supabase.server";

export type Light = "green" | "yellow" | "red" | "unknown";

export interface RuntimeComponent {
  key: string;
  group: string;
  kind: RuntimeKind;
  label: string;
  purpose: string;
  light: Light;
  headline: string;
  detail: string;
  cadenceLabel: string | null;
  lastAt: string | null;
  evidence: string[];
  href?: string;
}

export interface RuntimeGroup {
  id: string;
  label: string;
  description: string;
  counts: Record<Light, number>;
  components: RuntimeComponent[];
}

export interface RuntimeSource {
  name: string;
  light: Light;
  detail: string;
}

export interface RuntimeBoard {
  generatedAt: string;
  summary: Record<Light, number>;
  groups: RuntimeGroup[];
  sources: RuntimeSource[];
  deploy: { buildCommit: string | null; mainCommit: string | null };
  errors: string[];
}

const RANK: Record<Light, number> = { green: 0, unknown: 1, yellow: 2, red: 3 };
export function worst(...lights: Light[]): Light {
  return lights.reduce<Light>((acc, l) => (RANK[l] > RANK[acc] ? l : acc), "green");
}

function emptyCounts(): Record<Light, number> {
  return { green: 0, yellow: 0, red: 0, unknown: 0 };
}

export function humanAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function cadenceLabel(cadenceS: number): string {
  if (cadenceS < 3_600) return `every ${Math.round(cadenceS / 60)} min`;
  if (cadenceS < 86_400) return cadenceS === 3_600 ? "hourly" : `every ${Math.round(cadenceS / 3_600)} h`;
  if (cadenceS < 604_800) return cadenceS === 86_400 ? "daily" : `every ${Math.round(cadenceS / 86_400)} d`;
  if (cadenceS < 2_592_000) return "weekly";
  return "quarterly";
}

/** Rough cadence from a 5-field cron expression, for jobs that exist in cron.job but not the registry. */
export function cadenceFromCron(schedule: string): number {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return 86_400;
  const [min, hour, dom, mon, dow] = parts;
  const stepMin = /^\*\/(\d+)$/.exec(min);
  if (stepMin && hour === "*") return Number(stepMin[1]) * 60;
  if (min === "*" && hour === "*") return 60;
  if (hour === "*") return 3_600;
  if (dom === "*" && mon === "*" && dow === "*") return 86_400;
  if (dom === "*" && mon === "*") return 604_800;
  if (/,/.test(mon)) return 7_862_400;
  return 2_592_000;
}

export interface ScheduledInput {
  cadenceS: number;
  lastRunAt: string | null;
  lastStatus: string | null; // succeeded|failed (pg_cron) · success|failure|timeout|skipped (host)
  lastSuccessAt: string | null;
  failedSinceSuccess: number;
  exitCode?: number | null;
  now: number;
}

/** D5 — scheduled job rule. Pure; unit-tested. */
export function classifyScheduled(input: ScheduledInput): { light: Light; headline: string } {
  const { cadenceS, lastRunAt, lastStatus, lastSuccessAt, failedSinceSuccess, exitCode, now } = input;
  if (!lastRunAt && !lastSuccessAt) return { light: "unknown", headline: "no run recorded yet" };
  const failed = lastStatus === "failed" || lastStatus === "failure" || lastStatus === "timeout";
  if (failed) {
    const n = Math.max(1, failedSinceSuccess);
    const since = lastSuccessAt ? `last success ${humanAge(now - Date.parse(lastSuccessAt))}` : "never succeeded";
    return { light: "red", headline: `last run failed · ${n === 1 ? "1 failure" : `${n} consecutive failures`} · ${since}` };
  }
  if (!lastSuccessAt) return { light: "red", headline: "has never succeeded" };
  const ageMs = now - Date.parse(lastSuccessAt);
  const age = humanAge(ageMs);
  if (ageMs > 2 * cadenceS * 1000) return { light: "red", headline: `overdue · last success ${age}` };
  if (ageMs > 1.5 * cadenceS * 1000) return { light: "yellow", headline: `late · last success ${age}` };
  if (exitCode != null && exitCode !== 0) return { light: "yellow", headline: `completed with warnings (exit ${exitCode}) · ${age}` };
  return { light: "green", headline: `ok · last success ${age}` };
}

export interface FeedInput {
  expectedWindowS: number;
  expectsRowsDaily: boolean;
  lastRowAt: string | null;
  rows24h: number | null;
  laggingRows: number | null;
  now: number;
}

/** D5 — data feed rule. Pure; unit-tested. */
export function classifyFeed(input: FeedInput): { light: Light; headline: string } {
  const { expectedWindowS, expectsRowsDaily, lastRowAt, rows24h, laggingRows, now } = input;
  if (laggingRows != null && laggingRows > 0) {
    return { light: "red", headline: `${laggingRows} recent invoice${laggingRows === 1 ? "" : "s"} missing from the matview` };
  }
  if (!lastRowAt) return { light: "unknown", headline: "no rows yet" };
  const ageMs = now - Date.parse(lastRowAt);
  const age = humanAge(ageMs);
  if (ageMs > 2 * expectedWindowS * 1000) return { light: "red", headline: `stale · newest row ${age}` };
  if (ageMs > expectedWindowS * 1000) return { light: "yellow", headline: `ageing · newest row ${age}` };
  if (expectsRowsDaily && rows24h === 0) return { light: "yellow", headline: `fresh window but 0 rows in 24 h (green-but-empty)` };
  return { light: "green", headline: `current · newest row ${age}${rows24h != null ? ` · ${rows24h} in 24 h` : ""}` };
}

export function monitorLight(m: BetterStackMonitor | undefined): { light: Light; headline: string } {
  if (!m) return { light: "unknown", headline: "no Better Stack monitor" };
  if (m.paused || m.status === "paused") return { light: "red", headline: "monitor paused (blind spot)" };
  switch (m.status) {
    case "up":
      return { light: "green", headline: `up · checked every ${m.checkFrequency ?? "?"} s` };
    case "down":
      return { light: "red", headline: "DOWN per Better Stack" };
    case "pending":
    case "validating":
    case "maintenance":
      return { light: "yellow", headline: `${m.status} per Better Stack` };
    default:
      return { light: "unknown", headline: `Better Stack status: ${m.status}` };
  }
}

export function heartbeatEvidence(hb: BetterStackHeartbeat | undefined): { light: Light; text: string } {
  if (!hb) return { light: "unknown", text: "heartbeat: none" };
  if (hb.paused || hb.status === "paused") return { light: "red", text: "heartbeat: paused" };
  if (hb.status === "up") return { light: "green", text: "heartbeat: up" };
  if (hb.status === "down") return { light: "red", text: "heartbeat: DOWN (missed period + grace)" };
  if (hb.status === "pending") return { light: "yellow", text: "heartbeat: pending (no ping yet)" };
  return { light: "unknown", text: `heartbeat: ${hb.status}` };
}

// ── data access ─────────────────────────────────────────────────────────────
interface PgCronRow {
  jobid: number; jobname: string; schedule: string; active: boolean;
  last_status: string | null; last_start: string | null; last_end: string | null; last_message: string | null;
  last_success_end: string | null; n_failed_since_success: number | null;
}
interface HostRunRow { component_key: string; host: string | null; status: string; exit_code: number | null; summary: string | null; finished_at: string; }
/**
 * D16 — a direct ping judged against the documented healthy answer. Authenticated pings
 * that come back 401/403 are red (the credential is wrong); a reachability ping that
 * gets the expected anonymous code is green; a credential this deployment should hold
 * but does not caps the light at yellow so the gap stays visible.
 */
export function classifyProbe(r: ProbeResult, expected: number, needsCredential: boolean): { light: Light; headline: string } {
  if (r.error) return { light: "red", headline: `unreachable · ${r.error}` };
  const s = r.status ?? 0;
  if (r.mode === "authenticated") {
    if (r.ok) return { light: "green", headline: `authenticated · HTTP ${s} · ${r.ms} ms` };
    if (s === 401 || s === 403) return { light: "red", headline: `credential rejected · HTTP ${s}` };
    if (s >= 500 || s === 0) return { light: "red", headline: `server error · HTTP ${s}` };
    return { light: "yellow", headline: `unexpected HTTP ${s} (expected ${expected})` };
  }
  if (r.ok) {
    return needsCredential && r.credentialConfigured === false
      ? { light: "yellow", headline: `reachable · HTTP ${s} · credential not configured on this deployment` }
      : { light: "green", headline: `ping HTTP ${s} · ${r.ms} ms` };
  }
  if (s >= 500 || s === 0) return { light: "red", headline: `server error · HTTP ${s}` };
  return { light: "yellow", headline: `unexpected HTTP ${s} (expected ${expected})` };
}

interface HeartbeatRow { component_key: string; betterstack_id: string | null; name: string; last_pinged_success_at: string | null; }
interface FeedRow { feed_key: string; last_row_at: string | null; rows_24h: number | null; lagging_rows: number | null; }
interface CronOutcomeRow { fired_at: string | null; outcome: string | null; error_msg: string | null; }

async function rows<T>(client: SupabaseClient, table: string, columns: string, errors: string[], shape?: (q: any) => any): Promise<T[]> {
  try {
    let q = client.from(table).select(columns);
    if (shape) q = shape(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  } catch (error) {
    errors.push(`${table}: ${error instanceof Error ? error.message : "query failed"}`);
    return [];
  }
}

let mainCommitCache: { at: number; sha: string | null } | null = null;
async function loadMainCommit(env: RuntimeEnv, now: number): Promise<string | null> {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) return null;
  if (mainCommitCache && now - mainCommitCache.at < 300_000) return mainCommitCache.sha;
  try {
    const res = await fetch("https://api.github.com/repos/Clvrwrk/a-roofer-open-brain/commits/main", {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "open-brain-command-center" },
    });
    const sha = res.ok ? String((await res.json())?.sha ?? "") || null : null;
    mainCommitCache = { at: now, sha };
    return sha;
  } catch {
    mainCommitCache = { at: now, sha: null };
    return null;
  }
}

function firstSet(...values: Array<string | undefined>) {
  return values.find((value) => value && value !== "__set_me__") ?? null;
}

// ── the board ───────────────────────────────────────────────────────────────
export async function loadRuntimeBoard(env: RuntimeEnv = getRuntimeEnv(), now = Date.now()): Promise<RuntimeBoard> {
  const errors: string[] = [];
  const { client, config } = createServerSupabaseClient(env);
  const betterStackPromise = loadBetterStackSnapshot(env, now);
  const mainCommitPromise = loadMainCommit(env, now);
  const integrationProbesPromise = probeIntegrations(INTEGRATIONS, env, now);

  const [cronRows, hostRows, hbRows, feedRows, outcomeRows] = client
    ? await Promise.all([
        rows<PgCronRow>(client, "v_runtime_pg_cron_status", "jobid,jobname,schedule,active,last_status,last_start,last_end,last_message,last_success_end,n_failed_since_success", errors),
        rows<HostRunRow>(client, "v_runtime_job_latest", "component_key,host,status,exit_code,summary,finished_at", errors),
        rows<HeartbeatRow>(client, "runtime_heartbeats", "component_key,betterstack_id,name,last_pinged_success_at", errors),
        rows<FeedRow>(client, "v_runtime_feed_freshness", "feed_key,last_row_at,rows_24h,lagging_rows", errors),
        rows<CronOutcomeRow>(client, "v_acculynx_cron_outcomes", "fired_at,outcome,error_msg", errors, (q) => q.order("fired_at", { ascending: false, nullsFirst: false }).limit(10)),
      ])
    : [[], [], [], [], []];
  if (!client) errors.push(`Supabase unconfigured: missing ${config.missing.join(", ") || "credentials"}`);

  const betterStack = await betterStackPromise;
  const mainCommit = await mainCommitPromise;
  const monitorsByUrl = new Map(betterStack.monitors.map((m) => [m.url.replace(/\/$/, ""), m]));
  const heartbeatsById = new Map(betterStack.heartbeats.map((h) => [h.id, h]));
  const hbRowByKey = new Map(hbRows.map((r) => [r.component_key, r]));
  const hostByKey = new Map(hostRows.map((r) => [r.component_key, r]));
  const cronByName = new Map(cronRows.map((r) => [r.jobname, r]));
  const feedByKey = new Map(feedRows.map((r) => [r.feed_key, r]));
  const lightByKey = new Map<string, Light>();
  const components: RuntimeComponent[] = [];
  const site = (env.COMMAND_CENTER_PUBLIC_URL ?? "https://cc.proexteriorsus.net").replace(/\/$/, "");

  const push = (c: RuntimeComponent) => { components.push(c); lightByKey.set(c.key, c.light); };

  // Site & APIs — Better Stack from outside when configured (D10: a 401 on an API route is
  // the healthy answer); otherwise the app pings its own public routes (D16) so the group
  // never sits on "not configured" because a token is missing.
  const selfPings = betterStack.state === "ok" ? new Map<string, ProbeResult>() : new Map(
    (await probeIntegrations(MONITORED_ROUTES.map((route): IntegrationSpec => ({ key: route.key, label: route.label, purpose: route.purpose, url: `${site}${route.path}`, expectAnon: route.expect, expectBody: route.expectBody })), env, now)).map((r) => [r.key, r]),
  );
  for (const route of MONITORED_ROUTES) {
    const m = monitorsByUrl.get(`${site}${route.path}`);
    const self = selfPings.get(route.key);
    const { light, headline } = betterStack.state === "ok"
      ? monitorLight(m)
      : self ? classifyProbe(self, route.expect, false) : { light: "unknown" as Light, headline: `Better Stack ${betterStack.state}` };
    const why = betterStack.state === "unconfigured" ? "Better Stack not configured on this deployment" : betterStack.state === "error" ? `Better Stack error: ${betterStack.detail}` : null;
    push({ key: route.key, group: "site", kind: route.kind, label: route.label, purpose: route.purpose, light, headline: self && why ? `self-ping · ${headline}` : headline,
      detail: m ? `Better Stack monitor ${m.id} · last check ${m.lastCheckedAt ? humanAge(now - Date.parse(m.lastCheckedAt)) : "n/a"}` : `expects HTTP ${route.expect}${route.expectBody ? ` with ${route.expectBody}` : ""}${why ? ` · ${why}` : ""}`,
      cadenceLabel: m?.checkFrequency ? `every ${m.checkFrequency} s` : self ? "every 60 s (self-ping)" : null, lastAt: m?.lastCheckedAt ?? self?.checkedAt ?? null, evidence: [], href: `${site}${route.path}` });
  }

  // Connected systems — direct pings from this app (D16).
  const probes = new Map((await integrationProbesPromise).map((r) => [r.key, r]));
  for (const spec of INTEGRATIONS) {
    const r = probes.get(spec.key);
    const expected = r ? expectedStatus(spec, r.mode) : spec.expectAnon;
    const { light, headline } = r ? classifyProbe(r, expected, Boolean(spec.authEnv)) : { light: "unknown" as Light, headline: "probe did not run" };
    const evidence: string[] = [];
    if (spec.authEnv) evidence.push(r?.credentialConfigured ? `${spec.authEnv} present → authenticated ping` : `${spec.authEnv} not set here → reachability ping`);
    if (spec.credentialHome) evidence.push(`credential lives: ${spec.credentialHome}`);
    push({ key: spec.key, group: "integrations", kind: "integration", label: spec.label, purpose: spec.purpose, light, headline,
      detail: `${r?.mode ?? "ping"} ${spec.method ?? "GET"} ${r?.url ?? spec.url} · expects HTTP ${expected}${spec.expectBody ? ` with ${spec.expectBody}` : ""}`,
      cadenceLabel: "every 60 s", lastAt: r?.checkedAt ?? null, evidence, href: r?.url ?? undefined });
  }

  // Data feeds.
  for (const feed of FEEDS) {
    const r = feedByKey.get(feed.key);
    const { light, headline } = r
      ? classifyFeed({ expectedWindowS: feed.expectedWindowS, expectsRowsDaily: feed.expectsRowsDaily, lastRowAt: r.last_row_at, rows24h: r.rows_24h, laggingRows: r.lagging_rows, now })
      : { light: "unknown" as Light, headline: "freshness view unavailable" };
    push({ key: `feed.${feed.key}`, group: "feeds", kind: "feed", label: feed.label, purpose: feed.purpose, light, headline,
      detail: feed.jobKey ? `produced by ${feed.jobKey}` : "human-driven ingest", cadenceLabel: `window ${cadenceLabel(feed.expectedWindowS)}`, lastAt: r?.last_row_at ?? null, evidence: [] });
  }

  // pg_cron jobs — registry first, then anything in cron.job the registry does not know.
  const knownJobs = new Set(PG_CRON_JOBS.map((j) => j.jobname));
  const cronSpecs = [
    ...PG_CRON_JOBS.map((j) => ({ ...j, row: cronByName.get(j.jobname) })),
    ...cronRows.filter((r) => !knownJobs.has(r.jobname)).map((r) => ({ key: `pgcron.${r.jobname}`, jobname: r.jobname, label: r.jobname, purpose: `unregistered pg_cron job (schedule ${r.schedule})`, cadenceS: cadenceFromCron(r.schedule), row: r })),
  ];
  for (const job of cronSpecs) {
    const r = job.row;
    const base = r
      ? classifyScheduled({ cadenceS: job.cadenceS, lastRunAt: r.last_start, lastStatus: r.last_status, lastSuccessAt: r.last_success_end, failedSinceSuccess: r.n_failed_since_success ?? 0, now })
      : { light: "unknown" as Light, headline: cronRows.length ? "not scheduled in cron.job" : "pg_cron view unavailable" };
    const hbRow = hbRowByKey.get(job.key);
    const hb = hbRow?.betterstack_id ? heartbeatsById.get(hbRow.betterstack_id) : undefined;
    const hbEv = betterStack.state === "ok" ? heartbeatEvidence(hb) : { light: "unknown" as Light, text: "heartbeat: Better Stack unavailable" };
    const light = base.light === "unknown" && hbEv.light === "green" ? "green" : worst(base.light, hbEv.light === "unknown" ? "green" : hbEv.light);
    const evidence = [hbEv.text];
    if (r?.last_message && r.last_status === "failed") evidence.push(`last error: ${r.last_message}`);
    if (r && r.active === false) evidence.push("job is INACTIVE in cron.job");
    push({ key: job.key, group: "pg_cron", kind: "pg_cron", label: job.label, purpose: job.purpose, light: r && r.active === false ? "red" : light, headline: base.headline,
      detail: r ? `cron ${r.schedule} · job ${r.jobid} · last run ${r.last_start ? humanAge(now - Date.parse(r.last_start)) : "n/a"} (${r.last_status ?? "n/a"})` : "", cadenceLabel: cadenceLabel(job.cadenceS), lastAt: r?.last_success_end ?? null, evidence });
  }

  // systemd jobs — from the host's own reports (D7); no SSH from the web tier.
  for (const job of SYSTEMD_JOBS) {
    const r = hostByKey.get(job.key);
    const base = r
      ? classifyScheduled({ cadenceS: job.cadenceS, lastRunAt: r.finished_at, lastStatus: r.status, lastSuccessAt: r.status === "success" ? r.finished_at : null, failedSinceSuccess: r.status === "success" ? 0 : 1, exitCode: r.exit_code, now })
      : { light: "unknown" as Light, headline: "awaiting first report from the agent host (ExecStopPost hook)" };
    const hbRow = hbRowByKey.get(job.key);
    const hb = hbRow?.betterstack_id ? heartbeatsById.get(hbRow.betterstack_id) : undefined;
    const hbEv = betterStack.state === "ok" ? heartbeatEvidence(hb) : { light: "unknown" as Light, text: "heartbeat: Better Stack unavailable" };
    const light = base.light === "unknown" ? (hbEv.light === "green" ? "green" : hbEv.light === "red" ? "red" : "unknown") : worst(base.light, hbEv.light === "unknown" ? "green" : hbEv.light);
    const evidence = [hbEv.text];
    if (r?.summary) evidence.push(`host report: ${r.summary}${r.host ? ` (${r.host})` : ""}`);
    push({ key: job.key, group: "systemd", kind: "systemd", label: job.label, purpose: job.purpose, light, headline: base.headline,
      detail: `${job.unit} · ${job.scheduleLabel}${job.docs ? ` · ${job.docs}` : ""}`, cadenceLabel: cadenceLabel(job.cadenceS), lastAt: r?.finished_at ?? null, evidence });
  }

  // Edge functions — only acculynx-sync has dispatch telemetry today; say so for the rest.
  const latestOutcome = outcomeRows[0];
  for (const fn of EDGE_FUNCTIONS) {
    if (fn.name === "acculynx-sync") {
      const o = latestOutcome;
      const light: Light = !o ? "unknown" : o.outcome === "success" ? "green" : o.outcome === "pending" || o.outcome === "unreconciled" ? "yellow" : "red";
      const bad = outcomeRows.filter((x) => x.outcome && !["success", "pending"].includes(x.outcome)).length;
      push({ key: fn.key, group: "edge", kind: "edge_function", label: fn.label, purpose: fn.purpose, light,
        headline: o ? `latest dispatch ${o.outcome} · ${o.fired_at ? humanAge(now - Date.parse(o.fired_at)) : ""}` : "no dispatch telemetry",
        detail: `${bad} of the last ${outcomeRows.length} dispatches were not success`, cadenceLabel: "hourly", lastAt: o?.fired_at ?? null, evidence: o?.error_msg ? [`error: ${o.error_msg}`] : [] });
    } else {
      push({ key: fn.key, group: "edge", kind: "edge_function", label: fn.label, purpose: fn.purpose, light: "unknown", headline: "no outcome telemetry wired yet", detail: "Deployed as a Supabase edge function; invocation logs live in the Supabase dashboard.", cadenceLabel: null, lastAt: null, evidence: [] });
    }
  }

  // Agents — identity configured + the worst light of their jobs.
  for (const agent of AGENTS) {
    const tokenOk = agent.slackTokenEnv ? Boolean(env[agent.slackTokenEnv] && env[agent.slackTokenEnv] !== "__set_me__") : true;
    const jobLights = agent.jobKeys.map((k) => lightByKey.get(k) ?? "unknown");
    const jobsLight = jobLights.length ? worst(...jobLights.map((l) => (l === "unknown" ? "yellow" : l))) : "green";
    const light = worst(tokenOk ? "green" : "red", jobsLight);
    const evidence = [
      agent.slackTokenEnv ? (tokenOk ? `Slack bot token ${agent.slackTokenEnv} present` : `Slack bot token ${agent.slackTokenEnv} MISSING`) : "no Slack identity",
      ...agent.jobKeys.map((k) => `${k}: ${lightByKey.get(k) ?? "unknown"}`),
    ];
    push({ key: agent.key, group: "agents", kind: "agent", label: agent.displayName, purpose: agent.role, light,
      headline: !tokenOk ? "cannot post to Slack" : jobLights.length ? `owns ${agent.jobKeys.length} job${agent.jobKeys.length === 1 ? "" : "s"} · worst ${jobsLight}` : "identity only (no scheduled work)",
      detail: `@${agent.handle}`, cadenceLabel: null, lastAt: null, evidence });
  }
  for (const svc of SERVICE_AGENT_IDENTITIES) {
    const hashed = Boolean(env[getServiceTokenHashEnvKey(svc.id)]);
    const csv = Boolean(env.AGENT_SERVICE_TOKENS && env.AGENT_SERVICE_TOKENS.includes(svc.id));
    const ok = hashed || csv;
    push({ key: `service.${svc.id}`, group: "agents", kind: "agent", label: `${svc.displayName} ${svc.handle}`, purpose: svc.roles.join(", "), light: ok ? "green" : "yellow",
      headline: ok ? "API service credential configured" : "no API service credential on this deployment", detail: `department access: ${svc.departmentAccess === "all" ? "all" : svc.departmentAccess.join(", ")}`, cadenceLabel: null, lastAt: null, evidence: [] });
  }

  // Deployment.
  const buildCommit = firstSet(env.COMMAND_CENTER_BUILD_SHA, env.SOURCE_COMMIT, env.COOLIFY_GIT_COMMIT, env.GIT_COMMIT);
  const deployLight: Light = !buildCommit ? "unknown" : !mainCommit ? "yellow" : mainCommit.startsWith(buildCommit) || buildCommit.startsWith(mainCommit) ? "green" : "red";
  push({ key: "deploy.command-center", group: "deploy", kind: "deploy", label: "Command Center build", purpose: "Deployed commit vs origin/main (hard rule 11)", light: deployLight,
    headline: !buildCommit ? "build commit unknown" : !mainCommit ? `running ${buildCommit.slice(0, 7)} · set GITHUB_TOKEN to compare with origin/main` : deployLight === "green" ? `running ${buildCommit.slice(0, 7)} = origin/main` : `DEPLOY DRIFT · running ${buildCommit.slice(0, 7)}, origin/main is ${mainCommit.slice(0, 7)}`,
    detail: "Coolify builds from GitHub; /healthz publishes buildCommit.", cadenceLabel: null, lastAt: null, evidence: [] });

  // Assemble.
  const groups: RuntimeGroup[] = GROUP_ORDER.map((g) => {
    const list = components.filter((c) => c.group === g.id);
    const counts = emptyCounts();
    for (const c of list) counts[c.light]++;
    return { ...g, counts, components: list };
  });
  const summary = emptyCounts();
  for (const c of components) summary[c.light]++;
  const sources: RuntimeSource[] = [
    { name: "Supabase (prod)", light: client ? (errors.length ? "yellow" : "green") : "red", detail: client ? (errors.length ? errors.join(" · ") : `project ${config.projectRef ?? "configured"}`) : "unconfigured" },
    { name: "Better Stack", light: betterStack.state === "ok" ? "green" : betterStack.state === "unconfigured" ? "yellow" : "red", detail: betterStack.detail },
    { name: "Agent host reports", light: hostRows.length ? "green" : "yellow", detail: hostRows.length ? `${hostRows.length} units reporting` : "no runtime_job_runs rows yet — install the ExecStopPost hook on the host" },
    (() => {
      const all = [...probes.values()];
      const failed = all.filter((r) => r.error).length;
      const slowest = all.reduce((max, r) => Math.max(max, r.ms), 0);
      return { name: "Direct pings", light: (failed ? "red" : "green") as Light, detail: `${all.length} systems pinged from this app${failed ? ` · ${failed} unreachable` : ""} · slowest ${slowest} ms · 60 s cache` };
    })(),
  ];
  return { generatedAt: new Date(now).toISOString(), summary, groups, sources, deploy: { buildCommit, mainCommit }, errors };
}
