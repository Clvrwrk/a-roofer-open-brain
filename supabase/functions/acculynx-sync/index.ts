// acculynx-sync — Phase 2 multi-location fan-out entry point
//
// Replaces the v10 single-account index.ts with a serial account fan-out over all
// production AccuLynx accounts. Runs all resource syncs in order for each account
// under a shared runtime deadline.
//
// Hard rules honored:
//   - Rule 2: apiKey resolved only at runtime via Deno.env.get(env_secret_name);
//             the NAME is warned on skip, the VALUE is never logged (T-02-05)
//   - Rule 1: all diff detection uses markNotSeen (.update only, never .delete) (T-02-06)
//   - T-02-04: apiKey passed as explicit param to every resource fn (no module-level key)
//   - T-02-07: serial account loop — 30 req/s IP limit enforced (no concurrent fan-out)
//
// v10 behavior preserved: users sync, jobs incremental+full-sync, crm_pipeline, resolveLeads.
// Phase 2 additions: multi-account fan-out for contacts, estimates, job-walk sub-resources.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadProductionAccounts, resolveKey } from "./lib/accounts.ts";
import { readWatermark, advanceWatermark } from "./lib/watermark.ts";
import { markNotSeen } from "./lib/diff.ts";
import { syncJobs } from "./resources/jobs.ts";
import { syncContacts } from "./resources/contacts.ts";
import { syncEstimates } from "./resources/estimates.ts";
import { syncJobWalk } from "./resources/job-walk.ts";

// deno-lint-ignore-file no-explicit-any

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RUNTIME_BUDGET_MS = 110_000; // leave 10s of the 120s edge function limit
const BATCH_PACE_MS = 150; // inter-request pacing for legacy resolveLeads loop

const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// v10 preserved helpers (single-account jobs + users + resolveLeads)
// ---------------------------------------------------------------------------

const ACCULYNX_BASE = "https://api.acculynx.com/api/v2";
const PAGE_SIZE_USERS = 50;
const PAGE_SIZE_JOBS = 25;
const MAX_RETRIES = 3;
const DEFAULT_MILESTONES = "lead,prospect,approved,completed,invoiced,closed,cancelled,dead";

// Module-level key for v10 compatibility — only used by legacy helpers below.
// Phase 2 resource modules all receive apiKey as an explicit parameter (T-02-04).
const LEGACY_KEY = Deno.env.get("ACCULYNX_API_KEY");

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function parseLeadSource(name?: string | null): { parent: string | null; sub: string | null } {
  if (!name) return { parent: null, sub: null };
  const m = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { parent: m[1].trim(), sub: m[2].trim() };
  return { parent: name, sub: null };
}

function parseJobName(jobName?: string | null): { prefix: string | null; rest: string | null } {
  if (!jobName) return { prefix: null, rest: null };
  let m = jobName.match(/^([A-Z]{2,3}-[0-9]+):\s*(.*)$/);
  if (m) return { prefix: m[1], rest: m[2].trim() || null };
  m = jobName.match(/^([0-9]+):\s*(.*)$/);
  if (m) return { prefix: m[1], rest: m[2].trim() || null };
  m = jobName.match(/^N\/A:\s*(.*)$/);
  if (m) return { prefix: null, rest: m[1].trim() || null };
  return { prefix: null, rest: jobName.trim() || null };
}

function toDate(iso?: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

function daysBetween(fromIso?: string | null, toDate: Date = new Date()): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (isNaN(from.getTime())) return null;
  const ms = toDate.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function normalizeMarket(state?: string | null): string {
  if (!state) return "unknown";
  switch (state.toUpperCase()) {
    case "KS": return "sedgwick_ks";
    case "TX": return "collin_tx";
    case "CO": return "denver_co";
    case "GA": return "atlanta_ga";
    case "MO": return "mo_other";
    case "FL": return "fl_other";
    case "NC": return "nc_other";
    case "SC": return "sc_other";
    case "IL": return "il_other";
    case "AL": return "al_other";
    case "AR": return "ar_other";
    case "OK": return "ok_other";
    case "CA": return "ca_other";
    case "UT": return "ut_other";
    case "NE": return "ne_other";
    case "WA": return "wa_other";
    case "VA": return "va_other";
    case "AZ": return "az_other";
    case "KY": return "ky_other";
    case "PA": return "pa_other";
    case "LA": return "la_other";
    case "IA": return "ia_other";
    case "ME": return "me_other";
    default: return `${state.toLowerCase()}_other`;
  }
}

function normalizeMilestone(j: any): string {
  const raw = (j?.currentMilestone || "unknown").toString();
  const lc = raw.toLowerCase();
  if (lc === "lead") {
    const assigned =
      j?.assignedSalesperson?.id ||
      j?.assignedSalespersonId ||
      j?.primarySalespersonId ||
      j?.primarySalesperson?.id ||
      j?.salespeople?.[0]?.id;
    return assigned ? "assigned_lead" : "unassigned_lead";
  }
  const allowed = new Set([
    "lead", "unassigned_lead", "assigned_lead",
    "prospect", "approved", "completed", "invoiced",
    "closed", "cancelled", "dead", "unknown",
  ]);
  return allowed.has(lc) ? lc : "unknown";
}

function normalizeJobCategory(name?: string | null): string | null {
  if (!name) return null;
  const slug = name.toString().trim().toLowerCase().replace(/\s+/g, "_");
  const allowed = new Set(["residential", "commercial", "property_management"]);
  return allowed.has(slug) ? slug : null;
}

async function legacyAcculynxFetch(
  path: string,
  batchId: string,
  resourceType: string,
  pageIndex?: number,
): Promise<any> {
  const url = `${ACCULYNX_BASE}${path}`;
  let attempt = 0;
  let lastStatus = 0;
  let lastBody: any = null;
  while (attempt <= MAX_RETRIES) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${LEGACY_KEY}`, Accept: "application/json" },
    });
    lastStatus = res.status;
    lastBody = await res.json().catch(() => ({}));
    await sb.from("acculynx_raw").insert({
      sync_batch_id: batchId,
      resource_type: resourceType,
      api_endpoint: path,
      http_status: res.status,
      page_index: pageIndex ?? null,
      payload: lastBody,
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || Math.pow(2, attempt) * 1000;
      await sleep(retryAfter);
      attempt++;
      continue;
    }
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(Math.pow(2, attempt) * 1000);
      attempt++;
      continue;
    }
    if (!res.ok) {
      throw new Error(`AccuLynx ${res.status} on ${path}: ${JSON.stringify(lastBody).slice(0, 400)}`);
    }
    return lastBody;
  }
  throw new Error(`AccuLynx retry exhausted ${lastStatus} on ${path}: ${JSON.stringify(lastBody).slice(0, 400)}`);
}

async function resolveLeadMilestones(
  batchId: string,
  deadline: number,
): Promise<{ found: number; checked: number; assignedLeads: number; stillUnassigned: number; errors: number }> {
  const { data: leads, error: fetchErr } = await sb
    .from("crm_pipeline")
    .select("id, acculynx_job_id, milestone_date")
    .eq("data_source", "api_sync")
    .eq("current_milestone", "unassigned_lead");
  if (fetchErr) throw new Error(`resolveLeadMilestones fetch: ${fetchErr.message}`);
  if (!leads || leads.length === 0) return { found: 0, checked: 0, assignedLeads: 0, stillUnassigned: 0, errors: 0 };

  const { data: users } = await sb.from("acculynx_users").select("id, display_name, first_name, last_name");
  const userMap = new Map<string, string>();
  for (const u of users ?? []) {
    const name = u.display_name || [u.first_name, u.last_name].filter(Boolean).join(" ") || u.id;
    userMap.set(u.id, name);
  }

  let checked = 0;
  let assignedLeads = 0;
  let stillUnassigned = 0;
  let errors = 0;
  const nowIso = new Date().toISOString();

  // Sequential loop — serial per IP rate limit (T-02-07)
  for (let i = 0; i < leads.length && Date.now() < deadline; i++) {
    const lead = leads[i];
    const path = `/jobs/${lead.acculynx_job_id}/representatives/sales-owner`;
    const url = `${ACCULYNX_BASE}${path}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${LEGACY_KEY}`, Accept: "application/json" },
      });
      let payload: any = {};
      if (res.status === 200) payload = await res.json().catch(() => ({}));
      await sb.from("acculynx_raw").insert({
        sync_batch_id: batchId,
        resource_type: "sales_owner",
        api_endpoint: path,
        http_status: res.status,
        page_index: null,
        payload,
      });
      if (res.status === 200) {
        const userId = payload?.user?.id ?? null;
        const salesperson = userId ? (userMap.get(userId) ?? userId) : null;
        const msDate = toDate(lead.milestone_date);
        const { error: uErr } = await sb
          .from("crm_pipeline")
          .update({
            current_milestone: "assigned_lead",
            primary_salesperson: salesperson,
            assigned_date: msDate,
            acculynx_synced_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", lead.id);
        if (uErr) throw new Error(uErr.message);
        assignedLeads++;
      } else if (res.status === 204) {
        stillUnassigned++;
      } else {
        throw new Error(`Unexpected ${res.status} from ${path}`);
      }
      checked++;
    } catch (e) {
      errors++;
      console.error(`resolveLeads ${lead.acculynx_job_id}: ${(e as Error).message}`);
    }
    if (i < leads.length - 1) await sleep(BATCH_PACE_MS);
  }
  return { found: leads.length, checked, assignedLeads, stillUnassigned, errors };
}

async function legacySyncUsers(batchId: string, deadline: number) {
  let idx = 0;
  let total = 0;
  let pages = 0;
  while (Date.now() < deadline) {
    const qs = new URLSearchParams({
      pageSize: String(PAGE_SIZE_USERS),
      pageStartIndex: String(idx),
      status: "Active,Inactive,Archived",
    });
    const data = await legacyAcculynxFetch(`/users?${qs}`, batchId, "users", pages);
    const items: any[] = data.items ?? [];
    if (items.length === 0) break;
    const rows = items.map((u) => ({
      id: u.id,
      display_name: u.displayName ?? null,
      first_name: u.firstName ?? null,
      last_name: u.lastName ?? null,
      initials: u.initials ?? null,
      role_id: u.role?.id ?? null,
      role_name: u.role?.name ?? null,
      status: u.status ?? null,
      phone: u.phone ?? null,
      mobile_phone: u.mobilePhone ?? null,
      email: u.email ?? null,
      raw: u,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await sb.from("acculynx_users").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`upsert acculynx_users: ${error.message}`);
    total += rows.length;
    pages++;
    idx += PAGE_SIZE_USERS;
    if (idx >= (data.count ?? 0)) break;
  }
  await sb.from("acculynx_sync_watermark").update({
    last_successful_sync_at: new Date().toISOString(),
    last_sync_batch_id: batchId,
    total_records_synced: total,
    updated_at: new Date().toISOString(),
  }).eq("resource_type", "users");
  return { total, pages };
}

async function legacySyncJobs(
  batchId: string,
  deadline: number,
  fullSync = false,
  runStartIso: string,
) {
  let startDate: string;
  const endDate = new Date().toISOString().slice(0, 10);

  if (fullSync) {
    startDate = "2000-01-01";
  } else {
    const { data: wm } = await sb
      .from("acculynx_sync_watermark")
      .select("last_modified_date")
      .eq("resource_type", "jobs")
      .maybeSingle();
    const since = wm?.last_modified_date ? new Date(wm.last_modified_date) : new Date("2000-01-01");
    startDate = since.toISOString().slice(0, 10);
  }

  let idx = 0;
  let total = 0;
  let pages = 0;
  let maxModified = new Date(startDate);
  let totalCount = 0;
  let incomplete = false;
  const seenIds = new Set<string>();

  while (Date.now() < deadline) {
    const qs = new URLSearchParams({
      pageSize: String(PAGE_SIZE_JOBS),
      pageStartIndex: String(idx),
      dateFilterType: "ModifiedDate",
      startDate,
      endDate,
      sortBy: "ModifiedDate",
      sortOrder: "Ascending",
      includes: "contact,initialAppointment,assignedSalesperson",
      milestones: DEFAULT_MILESTONES,
    });
    const data = await legacyAcculynxFetch(`/jobs?${qs}`, batchId, "jobs", pages);
    const items: any[] = data.items ?? [];
    totalCount = data.count ?? totalCount;
    if (items.length === 0) break;

    for (const j of items) seenIds.add(j.id);

    const lsMap = new Map<string, any>();
    for (const j of items) {
      if (j.leadSource?.id) {
        lsMap.set(j.leadSource.id, {
          id: j.leadSource.id,
          name: j.leadSource.name,
          raw: j.leadSource,
          synced_at: new Date().toISOString(),
        });
      }
    }
    if (lsMap.size > 0) {
      const { error } = await sb
        .from("acculynx_lead_sources")
        .upsert([...lsMap.values()], { onConflict: "id" });
      if (error) throw new Error(`upsert acculynx_lead_sources: ${error.message}`);
    }

    const nowIso = new Date().toISOString();
    const jobRows = items.map((j) => ({
      id: j.id,
      job_name: j.jobName ?? null,
      job_number: j.jobNumber ?? null,
      priority: j.priority ?? null,
      current_milestone: j.currentMilestone ?? null,
      milestone_date: j.milestoneDate || null,
      created_date: j.createdDate || null,
      modified_date: j.modifiedDate || null,
      lead_dead_reason: j.leadDeadReason ?? null,
      job_category_id: j.jobCategory?.id ?? null,
      job_category_name: j.jobCategory?.name ?? null,
      trade_types: j.tradeTypes ?? [],
      location_street1: j.locationAddress?.street1 ?? null,
      location_city: j.locationAddress?.city ?? null,
      location_state: j.locationAddress?.state?.name ?? null,
      location_state_abbrev: j.locationAddress?.state?.abbreviation ?? null,
      location_zip: j.locationAddress?.zipCode ?? null,
      location_country: j.locationAddress?.country?.abbreviation ?? null,
      latitude: j.geoLocation?.latitude ?? null,
      longitude: j.geoLocation?.longitude ?? null,
      lead_source_id: j.leadSource?.id ?? null,
      lead_source_name: j.leadSource?.name ?? null,
      initial_appointment_start: j.initialAppointment?.startDate || null,
      initial_appointment_end: j.initialAppointment?.endDate || null,
      initial_appointment_notes: j.initialAppointment?.notes ?? null,
      raw: j,
      synced_at: nowIso,
    }));
    const { error: ej } = await sb.from("acculynx_jobs").upsert(jobRows, { onConflict: "id" });
    if (ej) throw new Error(`upsert acculynx_jobs: ${ej.message}`);

    const pipelineRows = items.map((j) => {
      const ls = parseLeadSource(j.leadSource?.name);
      const primary =
        (j.contacts ?? []).find((c: any) => c.isPrimary) ?? (j.contacts ?? [])[0];
      const ms = normalizeMilestone(j);
      const parsedName = parseJobName(j.jobName);
      const leadDate = toDate(j.createdDate);
      const msDate = toDate(j.milestoneDate);
      const touched = j.modifiedDate || null;
      const stateAbbr = j.locationAddress?.state?.abbreviation ?? null;
      return {
        acculynx_job_id: j.id,
        job_name: j.jobName || j.jobNumber || "(unnamed)",
        client_job_number:
          j.jobNumber && j.jobNumber.length > 0 ? j.jobNumber : parsedName.prefix,
        client_name: parsedName.rest,
        location_street: j.locationAddress?.street1 ?? null,
        location_city: j.locationAddress?.city ?? null,
        location_state: stateAbbr,
        location_zip: j.locationAddress?.zipCode ?? null,
        latitude: j.geoLocation?.latitude ?? null,
        longitude: j.geoLocation?.longitude ?? null,
        priority: j.priority ?? null,
        trade_types: j.tradeTypes ?? [],
        current_milestone: ms,
        market: normalizeMarket(stateAbbr),
        job_category: normalizeJobCategory(j.jobCategory?.name),
        lead_dead_reason: j.leadDeadReason ?? null,
        milestone_date: j.milestoneDate || null,
        lead_date: leadDate,
        assigned_date: ms === "assigned_lead" ? msDate : null,
        approved_date: ms === "approved" ? msDate : null,
        days_in_lead:
          ms === "unassigned_lead" || ms === "assigned_lead"
            ? (daysBetween(j.createdDate) ?? 0)
            : 0,
        total_process_days: daysBetween(j.createdDate) ?? 0,
        last_touched_days: daysBetween(touched),
        initial_appointment_start: j.initialAppointment?.startDate || null,
        initial_appointment_end: j.initialAppointment?.endDate || null,
        initial_appointment_notes: j.initialAppointment?.notes ?? null,
        parent_lead_source: ls.parent,
        sub_lead_source: ls.sub,
        contact_first_name: primary?.contact?.firstName ?? null,
        contact_last_name: primary?.contact?.lastName ?? null,
        last_touched_at: touched,
        acculynx_synced_at: nowIso,
        sync_batch_id: batchId,
        data_source: "api_sync",
        api_raw: j,
        updated_at: nowIso,
      };
    });
    const { error: ep } = await sb.from("crm_pipeline").upsert(pipelineRows, {
      onConflict: "acculynx_job_id",
      ignoreDuplicates: false,
    });
    if (ep) throw new Error(`upsert crm_pipeline: ${ep.message}`);

    for (const j of items) {
      if (j.modifiedDate) {
        const d = new Date(j.modifiedDate);
        if (d > maxModified) maxModified = d;
      }
    }

    if (!fullSync) {
      await sb.from("acculynx_sync_watermark").update({
        last_modified_date: maxModified.toISOString(),
        last_successful_sync_at: new Date().toISOString(),
        last_sync_batch_id: batchId,
        total_records_synced: total + items.length,
        updated_at: new Date().toISOString(),
      }).eq("resource_type", "jobs");
    }

    total += items.length;
    pages++;
    idx += PAGE_SIZE_JOBS;
    if (idx >= totalCount) break;
  }

  if (idx < totalCount) incomplete = true;

  let notSeenCount = 0;
  let notSeenRecords: any[] = [];
  if (fullSync) {
    const { data: notSeen, error: nsErr } = await sb
      .from("acculynx_jobs")
      .select("id, job_number, job_name, current_milestone, location_state_abbrev, modified_date, synced_at")
      .lt("synced_at", runStartIso)
      .order("modified_date", { ascending: false });
    if (nsErr) {
      console.error(`diff detect error: ${nsErr.message}`);
    } else {
      notSeenCount = notSeen?.length ?? 0;
      notSeenRecords = notSeen ?? [];
    }

    await sb.from("acculynx_sync_watermark").update({
      last_successful_sync_at: new Date().toISOString(),
      last_sync_batch_id: batchId,
      total_records_synced: total,
      updated_at: new Date().toISOString(),
    }).eq("resource_type", "jobs");
  }

  return {
    total,
    pages,
    totalCount,
    maxModified: maxModified.toISOString(),
    incomplete,
    fullSync,
    diff: fullSync
      ? {
          seen_in_api: seenIds.size,
          not_seen_in_api: notSeenCount,
          not_seen_records: notSeenRecords,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 multi-account fan-out
// ---------------------------------------------------------------------------

/**
 * Run Phase 2 resource syncs for a single account.
 * SERIAL across resources — 30 req/s IP limit enforced (T-02-07).
 * apiKey is explicit — never a module-level shared key (T-02-04).
 */
async function runAccountSync(
  acct: { account_key: string; env_secret_name: string; label: string | null; market: string | null; state: string | null },
  apiKey: string,
  deadline: number,
): Promise<{ jobs: string; contacts: string; estimates: string; jobWalk: string }> {
  const result = { jobs: "skipped", contacts: "skipped", estimates: "skipped", jobWalk: "skipped" };

  // --- Jobs (date-windowed) ---
  try {
    const jobWm = await readWatermark(sb, acct.account_key, "jobs");
    await syncJobs(sb, acct, apiKey, deadline, jobWm);

    // Advance watermark for jobs
    await advanceWatermark(sb, {
      account_key: acct.account_key,
      resource_type: "jobs",
      last_sync_at: new Date().toISOString(),
    });
    result.jobs = "ok";
  } catch (e) {
    result.jobs = `error: ${(e as Error).message}`;
    console.warn(`[sync] ${acct.account_key}/jobs: ${(e as Error).message}`);
  }

  if (Date.now() >= deadline) return result;

  // --- Contacts (full sweep) ---
  const contactsSweepStart = new Date().toISOString();
  try {
    const contactsWm = await readWatermark(sb, acct.account_key, "contacts");
    await syncContacts(sb, acct, apiKey, deadline, contactsWm);

    // Mark rows not seen in this sweep
    await markNotSeen(sb, "acculynx_contacts", acct.account_key, contactsSweepStart);

    await advanceWatermark(sb, {
      account_key: acct.account_key,
      resource_type: "contacts",
      last_page_index: 0, // reset cursor on completion
      last_sync_at: new Date().toISOString(),
    });
    result.contacts = "ok";
  } catch (e) {
    result.contacts = `error: ${(e as Error).message}`;
    console.warn(`[sync] ${acct.account_key}/contacts: ${(e as Error).message}`);
  }

  if (Date.now() >= deadline) return result;

  // --- Estimates (full sweep) ---
  const estimatesSweepStart = new Date().toISOString();
  try {
    const estimatesWm = await readWatermark(sb, acct.account_key, "estimates");
    await syncEstimates(sb, acct, apiKey, deadline, estimatesWm);

    await markNotSeen(sb, "acculynx_estimates", acct.account_key, estimatesSweepStart);

    await advanceWatermark(sb, {
      account_key: acct.account_key,
      resource_type: "estimates",
      last_page_index: 0,
      last_sync_at: new Date().toISOString(),
    });
    result.estimates = "ok";
  } catch (e) {
    result.estimates = `error: ${(e as Error).message}`;
    console.warn(`[sync] ${acct.account_key}/estimates: ${(e as Error).message}`);
  }

  if (Date.now() >= deadline) return result;

  // --- Job Walk (sub-resources + invoice two-level) ---
  try {
    const jobWalkWm = await readWatermark(sb, acct.account_key, "job_walk");

    // Load ordered job IDs for this account (sorted by created_date ASC for deterministic resumption)
    const { data: jobRows, error: jobErr } = await sb
      .from("acculynx_jobs")
      .select("id")
      .eq("account_key", acct.account_key)
      .order("created_date", { ascending: true });
    if (jobErr) throw new Error(`job IDs load: ${jobErr.message}`);

    const jobIds = (jobRows ?? []).map((r: { id: string }) => r.id);
    await syncJobWalk(sb, acct, apiKey, deadline, jobWalkWm, jobIds);
    result.jobWalk = "ok";
  } catch (e) {
    result.jobWalk = `error: ${(e as Error).message}`;
    console.warn(`[sync] ${acct.account_key}/job-walk: ${(e as Error).message}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const started = Date.now();
  const runStartIso = new Date(started).toISOString();
  const deadline = started + RUNTIME_BUDGET_MS;

  const body = await req.json().catch(() => ({}));
  const resources: string[] = body.resources ?? ["users", "jobs"];
  const fullSync: boolean = body.fullSync ?? false;
  const resolveLeads: boolean =
    body.resolveLeads === true || resources.includes("resolveLeads");
  const multiAccount: boolean = body.multiAccount ?? false;

  const batchId = `sync-${runStartIso.replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;

  await sb.from("crm_sync_log").insert({
    sync_batch_id: batchId,
    sync_type: multiAccount
      ? "multi_account"
      : (fullSync ? "full_sync" : resources.join(",") || "api_incremental"),
    started_at: runStartIso,
    status: "running",
    api_endpoint: "acculynx-sync",
  });

  const result: any = {
    batch_id: batchId,
    resources: {},
    fullSync,
    resolveLeads,
    multiAccount,
    run_start: runStartIso,
  };
  let totalFetched = 0;
  let errorCount = 0;
  const errorDetails: any[] = [];

  try {
    // Phase 2 multi-account fan-out (triggered by multiAccount flag)
    if (multiAccount) {
      const accounts = await loadProductionAccounts(sb);
      result.accounts = {};

      // SERIAL loop — 30 req/s IP limit (T-02-07)
      for (const acct of accounts) {
        if (Date.now() >= deadline) break;

        const apiKey = resolveKey(acct);
        if (!apiKey) {
          // Warn with NAME only — hard rule 2 (T-02-05)
          console.warn(`[sync] secret ${acct.env_secret_name} not set — skipping ${acct.account_key}`);
          result.accounts[acct.account_key] = "skipped (no key)";
          continue;
        }

        result.accounts[acct.account_key] = await runAccountSync(acct, apiKey, deadline);
      }
    }

    // v10 legacy resources (users, jobs, resolveLeads) — preserved for backward compat
    if (!multiAccount || resources.includes("users")) {
      if (resources.includes("users")) {
        try {
          result.resources.users = await legacySyncUsers(batchId, deadline);
          totalFetched += result.resources.users.total;
        } catch (e) {
          errorCount++;
          errorDetails.push({ resource: "users", message: (e as Error).message });
          result.resources.users = { error: (e as Error).message };
        }
      }
    }

    if (!multiAccount) {
      if (resources.includes("jobs")) {
        try {
          result.resources.jobs = await legacySyncJobs(batchId, deadline, fullSync, runStartIso);
          totalFetched += result.resources.jobs.total;
        } catch (e) {
          errorCount++;
          errorDetails.push({ resource: "jobs", message: (e as Error).message });
          result.resources.jobs = { error: (e as Error).message };
        }
      }
      if (resolveLeads) {
        try {
          result.resources.resolveLeads = await resolveLeadMilestones(batchId, deadline);
        } catch (e) {
          errorCount++;
          errorDetails.push({ resource: "resolveLeads", message: (e as Error).message });
          result.resources.resolveLeads = { error: (e as Error).message };
        }
      }
    }

    result.runtime_ms = Date.now() - started;
    result.status = errorCount > 0 ? "partial_success" : "completed";

    await sb.from("crm_sync_log").update({
      completed_at: new Date().toISOString(),
      status: result.status,
      rows_fetched: totalFetched,
      error_count: errorCount,
      error_details: errorDetails.length ? errorDetails : null,
      api_response_ms: result.runtime_ms,
    }).eq("sync_batch_id", batchId);

    return json(result);
  } catch (err) {
    const msg = (err as Error).message;
    await sb.from("crm_sync_log").update({
      completed_at: new Date().toISOString(),
      status: "failed",
      rows_fetched: totalFetched,
      error_count: errorCount + 1,
      error_details: [...errorDetails, { message: msg }],
      api_response_ms: Date.now() - started,
    }).eq("sync_batch_id", batchId);
    return json({ error: msg, batch_id: batchId }, 500);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
