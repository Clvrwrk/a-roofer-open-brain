import type { CommandCenterActor } from "@lib/access-control";
import { persistActivityRollup } from "@lib/activity-rollups.server";
import { loadAgreementGapSurface } from "@lib/abc-price-gaps";
import { loadEstimateAudit } from "@lib/estimate-audit";
import { loadExecutivePipelineDashboard } from "@lib/executive-pipeline";
import { loadInvoiceAuditSummary } from "@lib/invoice-audit";
import { loadCommandCenterSurface } from "@lib/live-work";
import { loadOrderAudit } from "@lib/order-audit";
import { getRuntimeEnv } from "@lib/runtime-env";
import { loadVendorTerritorySurface } from "@lib/vendor-territories";

let prewarmStarted = false;
let warmInFlight: Promise<CacheWarmResult[]> | null = null;
let humanSessionTimer: ReturnType<typeof setTimeout> | null = null;
let dailyWarmTimer: ReturnType<typeof setTimeout> | null = null;

export type CacheWarmTrigger = "boot" | "manual" | "human_session_idle" | "daily_activity_cadence";

export interface CacheWarmResult {
  name: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

interface WarmSummary {
  trigger: CacheWarmTrigger;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  ok: boolean;
  results: CacheWarmResult[];
}

interface ActivityInput {
  actor: CommandCenterActor | null;
  pathname: string;
}

const warmTargets: Array<{ name: string; run: () => Promise<unknown> }> = [
  { name: "command_center", run: () => loadCommandCenterSurface() },
  { name: "vendor_territories", run: () => loadVendorTerritorySurface() },
  { name: "executive_pipeline", run: () => loadExecutivePipelineDashboard() },
  { name: "agreement_gaps", run: () => loadAgreementGapSurface() },
  { name: "invoice_audit_summary", run: () => loadInvoiceAuditSummary(undefined, { force: true }) },
  { name: "order_audit_active", run: () => loadOrderAudit(undefined, "active") },
  { name: "estimate_audit", run: () => loadEstimateAudit() },
];

const bootedAtMs = Date.now();
const routeCounts = new Map<string, number>();
const liveDetailRouteCounts = new Map<string, number>();
const humanHourCounts = new Map<number, number>();

const cadenceState = {
  bootedAt: new Date(bootedAtMs).toISOString(),
  lastHumanActivityAtMs: 0,
  sessionWarmScheduledForMs: 0,
  nextDailyWarmAtMs: 0,
  lastWarm: null as WarmSummary | null,
  lastSkippedWarm: null as { trigger: CacheWarmTrigger; skippedAt: string; reason: string } | null,
  activityCounts: {
    humanPageViews: 0,
    humanApiRequests: 0,
    agentRequests: 0,
    liveDetailRequests: 0,
  },
};

function envNumber(name: string, fallback: number) {
  const value = Number(getRuntimeEnv()[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envHour(name: string, fallback: number) {
  const value = Number(getRuntimeEnv()[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(23, Math.floor(value)));
}

const HUMAN_SESSION_IDLE_MS = envNumber("COMMAND_CENTER_HUMAN_SESSION_IDLE_MS", 20 * 60 * 1000);
const MIN_SCHEDULED_WARM_GAP_MS = envNumber("COMMAND_CENTER_MIN_SCHEDULED_WARM_GAP_MS", 10 * 60 * 1000);
const DEFAULT_DAILY_WARM_HOUR = envHour("COMMAND_CENTER_DAILY_WARM_HOUR", 5);
// Never warm at :00. pg_cron, the AccuLynx sync and the agent-host timers all
// used to start at :00, and a full warm on top of them starved PostgREST for
// every other app on the shared DB (docs/125). A jitter of up to 4 minutes keeps
// several containers from firing in the same minute.
const DAILY_WARM_MINUTE = Math.max(0, Math.min(55, Math.floor(envNumber("COMMAND_CENTER_DAILY_WARM_MINUTE", 41))));
const DAILY_WARM_JITTER_MS = 4 * 60 * 1000;
const MAX_COUNTER_KEYS = 100;

const LIVE_DETAIL_PREFIXES = [
  "/api/invoice-audit/invoice",
  "/api/order-audit/lines",
  "/api/price-agreement/branch-detail",
  "/api/vendor-territories",
];

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function iso(ms: number) {
  return ms ? new Date(ms).toISOString() : null;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  const maybeTimer = timer as ReturnType<typeof setTimeout> & { unref?: () => void };
  maybeTimer.unref?.();
}

function incrementCounter(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
  if (map.size <= MAX_COUNTER_KEYS) return;

  let lowestKey: string | null = null;
  let lowestCount = Number.POSITIVE_INFINITY;
  for (const [candidate, count] of map.entries()) {
    if (count < lowestCount) {
      lowestKey = candidate;
      lowestCount = count;
    }
  }
  if (lowestKey) map.delete(lowestKey);
}

function counterEntries(map: Map<string, number>, limit = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([path, count]) => ({ path, count }));
}

function normalizedPath(pathname: string) {
  const clean = pathname.split("?")[0] || "/";
  return clean
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
      if (/^\d{4,}(?:[-_]\d+)?$/.test(segment)) return ":id";
      if (segment.length > 24 && /^[a-z0-9_-]+$/i.test(segment)) return ":id";
      return segment;
    })
    .join("/") || "/";
}

function isHumanActor(actor: CommandCenterActor) {
  return actor.type === "human" || actor.type === "local_operator";
}

function isLiveDetailPath(pathname: string) {
  return LIVE_DETAIL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function preferredDailyWarmHour() {
  if (!humanHourCounts.size) return DEFAULT_DAILY_WARM_HOUR;

  let bestHour = DEFAULT_DAILY_WARM_HOUR;
  let bestCount = -1;
  for (const [hour, count] of humanHourCounts.entries()) {
    if (count > bestCount || (count === bestCount && hour < bestHour)) {
      bestHour = hour;
      bestCount = count;
    }
  }

  return (bestHour + 23) % 24;
}

function nextDateForHour(hour: number) {
  const next = new Date();
  next.setHours(hour, DAILY_WARM_MINUTE, 0, 0);
  next.setTime(next.getTime() + Math.floor(Math.random() * DAILY_WARM_JITTER_MS));
  if (next.getTime() <= Date.now() + 60_000) next.setDate(next.getDate() + 1);
  return next;
}

/**
 * `COMMAND_CENTER_PREWARM=off` turns off the boot and scheduled warms. Set it on
 * every container that is not the Coolify app (the /sales mirror, check and
 * rollback slots): each one otherwise re-reads every surface against prod.
 */
function prewarmDisabled() {
  return String(getRuntimeEnv().COMMAND_CENTER_PREWARM ?? "").trim().toLowerCase() === "off";
}

function scheduleDailyWarm() {
  if (dailyWarmTimer) clearTimeout(dailyWarmTimer);
  // A container nobody has used since boot (an unrouted or rollback slot) has
  // nothing to warm for. Recording human activity schedules the first one.
  if (prewarmDisabled() || humanHourCounts.size === 0) {
    cadenceState.nextDailyWarmAtMs = 0;
    return;
  }

  const due = nextDateForHour(preferredDailyWarmHour());
  cadenceState.nextDailyWarmAtMs = due.getTime();
  dailyWarmTimer = setTimeout(() => {
    dailyWarmTimer = null;
    void warmIfStale("daily_activity_cadence", Math.max(MIN_SCHEDULED_WARM_GAP_MS, 60 * 60 * 1000)).finally(() => {
      scheduleDailyWarm();
    });
  }, Math.max(0, due.getTime() - Date.now()));
  unrefTimer(dailyWarmTimer);
}

function scheduleHumanSessionWarm() {
  if (humanSessionTimer) clearTimeout(humanSessionTimer);
  if (prewarmDisabled()) return;

  const scheduledFor = Date.now() + HUMAN_SESSION_IDLE_MS;
  cadenceState.sessionWarmScheduledForMs = scheduledFor;
  humanSessionTimer = setTimeout(() => {
    humanSessionTimer = null;
    cadenceState.sessionWarmScheduledForMs = 0;
    const idleForMs = Date.now() - cadenceState.lastHumanActivityAtMs;
    if (idleForMs + 1000 < HUMAN_SESSION_IDLE_MS) return;
    void warmIfStale("human_session_idle", MIN_SCHEDULED_WARM_GAP_MS);
  }, HUMAN_SESSION_IDLE_MS + 250);
  unrefTimer(humanSessionTimer);
}

async function warmIfStale(trigger: CacheWarmTrigger, minGapMs: number) {
  const completedAt = cadenceState.lastWarm ? Date.parse(cadenceState.lastWarm.completedAt) : 0;
  if (completedAt && Date.now() - completedAt < minGapMs) {
    cadenceState.lastSkippedWarm = {
      trigger,
      skippedAt: new Date().toISOString(),
      reason: `last warm completed less than ${Math.round(minGapMs / 1000)} seconds ago`,
    };
    return null;
  }
  return warmCommandCenterCaches(trigger);
}

export function recordCommandCenterActivity({ actor, pathname }: ActivityInput) {
  if (!actor || pathname.startsWith("/api/performance/")) return;

  const safePath = normalizedPath(pathname);
  persistActivityRollup(safePath, actor.type);

  if (!isHumanActor(actor)) {
    cadenceState.activityCounts.agentRequests += 1;
    return;
  }

  const isApi = pathname.startsWith("/api/");
  if (isApi) cadenceState.activityCounts.humanApiRequests += 1;
  else cadenceState.activityCounts.humanPageViews += 1;

  cadenceState.lastHumanActivityAtMs = Date.now();
  incrementCounter(routeCounts, safePath);

  const hour = new Date().getHours();
  humanHourCounts.set(hour, (humanHourCounts.get(hour) ?? 0) + 1);

  if (isLiveDetailPath(pathname)) {
    cadenceState.activityCounts.liveDetailRequests += 1;
    incrementCounter(liveDetailRouteCounts, safePath);
  }

  scheduleHumanSessionWarm();
  scheduleDailyWarm();
}

export async function warmCommandCenterCaches(trigger: CacheWarmTrigger = "manual"): Promise<CacheWarmResult[]> {
  if (warmInFlight) return warmInFlight;

  const startedWallMs = Date.now();
  const startedPerfMs = nowMs();
  // One surface at a time. Each loader already fans out in parallel; running all
  // seven at once put ~500 requests on PostgREST in one minute (docs/125).
  warmInFlight = (async () => {
    const results: CacheWarmResult[] = [];
    for (const target of warmTargets) {
      const started = nowMs();
      try {
        await target.run();
        results.push({ name: target.name, ok: true, durationMs: Math.round((nowMs() - started) * 10) / 10 });
      } catch (error) {
        results.push({
          name: target.name,
          ok: false,
          durationMs: Math.round((nowMs() - started) * 10) / 10,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  })()
    .then((results) => {
      cadenceState.lastWarm = {
        trigger,
        startedAt: new Date(startedWallMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Math.round((nowMs() - startedPerfMs) * 10) / 10,
        ok: results.every((result) => result.ok),
        results,
      };
      return results;
    })
    .finally(() => {
      warmInFlight = null;
    });

  return warmInFlight;
}

export function getCommandCenterWarmCadenceState() {
  return {
    strategy: "first-party activity cadence; no third-party session recorder",
    bootedAt: cadenceState.bootedAt,
    now: new Date().toISOString(),
    config: {
      humanSessionIdleMinutes: Math.round((HUMAN_SESSION_IDLE_MS / 60_000) * 10) / 10,
      minScheduledWarmGapMinutes: Math.round((MIN_SCHEDULED_WARM_GAP_MS / 60_000) * 10) / 10,
      defaultDailyWarmHour: DEFAULT_DAILY_WARM_HOUR,
      dailyWarmMinute: DAILY_WARM_MINUTE,
      prewarmDisabled: prewarmDisabled(),
      preferredDailyWarmHour: preferredDailyWarmHour(),
    },
    schedule: {
      lastHumanActivityAt: iso(cadenceState.lastHumanActivityAtMs),
      sessionWarmScheduledFor: iso(cadenceState.sessionWarmScheduledForMs),
      nextDailyWarmAt: iso(cadenceState.nextDailyWarmAtMs),
      warmInFlight: Boolean(warmInFlight),
    },
    activityCounts: cadenceState.activityCounts,
    topHumanRoutes: counterEntries(routeCounts),
    topLiveDetailRoutes: counterEntries(liveDetailRouteCounts),
    humanHourCounts: [...humanHourCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => ({ hour, count })),
    lastWarm: cadenceState.lastWarm,
    lastSkippedWarm: cadenceState.lastSkippedWarm,
  };
}

/**
 * Warm the in-process surface caches shortly after boot so the first human
 * request after a deploy is served from cache instead of paying the full
 * Supabase fan-out. Fire-and-forget; every loader already fails soft.
 */
export function prewarmSurfaceCaches() {
  if (prewarmStarted) return;
  prewarmStarted = true;
  if (prewarmDisabled()) return;

  scheduleDailyWarm();

  setTimeout(() => {
    void warmCommandCenterCaches("boot").catch(() => undefined);
  }, 250);
}
