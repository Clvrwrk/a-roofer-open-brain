// acculynx-sync — resources/crm-pipeline.ts (Phase 7, plan 07-06 Task 1)
//
// Restores the crm_pipeline write path on the live multiAccount hourly cron.
//
// VERIFICATION gap 1: runAccountSync (index.ts) never touched crm_pipeline — the only
// upsert lived in the retired legacySyncJobs path, gated `if (!multiAccount)`. Since the
// multiAccount cutover, crm_pipeline has been frozen for every account.
//
// VERIFICATION gap 3: even where the API has financials/representative data (job KS-11:
// approvedJobValue 30368.48, balanceDue 17532.48, company rep Bob Smolek), nothing mapped
// it forward into crm_pipeline.contract_amount/balance_due/primary_salesperson.
//
// This module ports the pipelineRows mapping from legacySyncJobs (index.ts:401-458) into a
// pure buildPipelineRow(job, financials, repName) helper, reusing the SAME normalizers
// (normalizeMilestone, normalizeMarket, parseLeadSource, parseJobName, toDate, daysBetween)
// so behavior does not drift from the proven legacy shape — then layers in the
// financials -> contract_amount/balance_due and repName -> primary_salesperson mapping
// the legacy path never had.
//
// T-07-06-01 (null-safe merge): primary_salesperson only overwrites when repName is
// present; a missing financials/rep row never nulls an existing real value — contract_amount
// and balance_due are set to null only when NO financials row exists (first-sight/no data
// yet), never used to blank out a previously-synced value with an absent-this-run read.

// deno-lint-ignore-file no-explicit-any

const CHUNK_SIZE = 200;

/** Shape of an acculynx_jobs row this module reads (account_key-scoped). */
export interface JobRow {
  id: string;
  job_name: string | null;
  job_number: string | null;
  priority: string | null;
  current_milestone: string | null;
  milestone_date: string | null;
  created_date: string | null;
  modified_date: string | null;
  lead_dead_reason: string | null;
  job_category_name: string | null;
  trade_types: string[] | null;
  location_street1: string | null;
  location_city: string | null;
  location_state: string | null;
  location_state_abbrev: string | null;
  location_zip: string | null;
  latitude: number | null;
  longitude: number | null;
  lead_source_name: string | null;
  initial_appointment_start: string | null;
  initial_appointment_end: string | null;
  initial_appointment_notes: string | null;
  raw: any;
}

/** Shape of an acculynx_job_financials row (job_id PK). */
export interface JobFinancialsRow {
  job_id: string;
  approved_job_value: number | string | null;
  balance_due: number | string | null;
}

// ---------------------------------------------------------------------------
// Normalizers — ported verbatim from index.ts legacySyncJobs (no behavior drift)
// ---------------------------------------------------------------------------

export function parseLeadSource(name?: string | null): { parent: string | null; sub: string | null } {
  if (!name) return { parent: null, sub: null };
  const m = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { parent: m[1].trim(), sub: m[2].trim() };
  return { parent: name, sub: null };
}

export function parseJobName(jobName?: string | null): { prefix: string | null; rest: string | null } {
  if (!jobName) return { prefix: null, rest: null };
  let m = jobName.match(/^([A-Z]{2,3}-[0-9]+):\s*(.*)$/);
  if (m) return { prefix: m[1], rest: m[2].trim() || null };
  m = jobName.match(/^([0-9]+):\s*(.*)$/);
  if (m) return { prefix: m[1], rest: m[2].trim() || null };
  m = jobName.match(/^N\/A:\s*(.*)$/);
  if (m) return { prefix: null, rest: m[1].trim() || null };
  return { prefix: null, rest: jobName.trim() || null };
}

export function toDate(iso?: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

export function daysBetween(fromIso?: string | null, toDate: Date = new Date()): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (isNaN(from.getTime())) return null;
  const ms = toDate.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function normalizeMarket(state?: string | null): string {
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

export function normalizeMilestone(j: any): string {
  const raw = (j?.current_milestone || j?.currentMilestone || "unknown").toString();
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

export function normalizeJobCategory(name?: string | null): string | null {
  if (!name) return null;
  const slug = name.toString().trim().toLowerCase().replace(/\s+/g, "_");
  const allowed = new Set(["residential", "commercial", "property_management"]);
  return allowed.has(slug) ? slug : null;
}

/**
 * Pure builder: acculynx_jobs row + optional financials row + optional resolved rep
 * name -> a crm_pipeline upsert row.
 *
 * T-07-06-01 null-safe merge: contract_amount/balance_due are null ONLY when no
 * financials row exists yet (never overwrite a real value with an absent read);
 * primary_salesperson is included in the row ONLY when repName is present — omitting
 * the key (rather than sending null) means the upsert's ON CONFLICT DO UPDATE leaves
 * whatever value is already stored on that row untouched when this run has no rep data.
 */
export function buildPipelineRow(
  job: JobRow,
  financials: JobFinancialsRow | null,
  repName: string | null,
  batchId: string | undefined,
  nowIso: string,
): Record<string, unknown> {
  const j = job.raw ?? job;
  const ls = parseLeadSource(job.lead_source_name ?? j.leadSource?.name);
  const primaryContact = (j.contacts ?? []).find((c: any) => c.isPrimary) ?? (j.contacts ?? [])[0];
  const ms = normalizeMilestone(job);
  const parsedName = parseJobName(job.job_name);
  const leadDate = toDate(job.created_date);
  const msDate = toDate(job.milestone_date);
  const touched = job.modified_date || null;
  const stateAbbr = job.location_state_abbrev ?? j.locationAddress?.state?.abbreviation ?? null;

  const row: Record<string, unknown> = {
    acculynx_job_id: job.id,
    job_name: job.job_name || job.job_number || "(unnamed)",
    client_job_number:
      job.job_number && job.job_number.length > 0 ? job.job_number : parsedName.prefix,
    client_name: parsedName.rest,
    location_street: job.location_street1 ?? null,
    location_city: job.location_city ?? null,
    location_state: stateAbbr,
    location_zip: job.location_zip ?? null,
    latitude: job.latitude ?? null,
    longitude: job.longitude ?? null,
    priority: job.priority ?? null,
    trade_types: job.trade_types ?? [],
    current_milestone: ms,
    market: normalizeMarket(stateAbbr),
    job_category: normalizeJobCategory(job.job_category_name),
    lead_dead_reason: job.lead_dead_reason ?? null,
    milestone_date: job.milestone_date || null,
    lead_date: leadDate,
    assigned_date: ms === "assigned_lead" ? msDate : null,
    approved_date: ms === "approved" ? msDate : null,
    days_in_lead:
      ms === "unassigned_lead" || ms === "assigned_lead"
        ? (daysBetween(job.created_date) ?? 0)
        : 0,
    total_process_days: daysBetween(job.created_date) ?? 0,
    last_touched_days: daysBetween(touched),
    initial_appointment_start: job.initial_appointment_start || null,
    initial_appointment_end: job.initial_appointment_end || null,
    initial_appointment_notes: job.initial_appointment_notes ?? null,
    parent_lead_source: ls.parent,
    sub_lead_source: ls.sub,
    contact_first_name: primaryContact?.contact?.firstName ?? null,
    contact_last_name: primaryContact?.contact?.lastName ?? null,
    last_touched_at: touched,
    // D-06: AccuLynx job financials is the primary profit/contract-value source.
    contract_amount: financials?.approved_job_value ?? null,
    balance_due: financials?.balance_due ?? null,
    acculynx_synced_at: nowIso,
    sync_batch_id: batchId ?? null,
    data_source: "api_sync",
    api_raw: j,
    updated_at: nowIso,
  };

  // Null-safe merge (T-07-06-01): only set primary_salesperson when we have a
  // resolved name this run — omitting the key preserves whatever crm_pipeline
  // already holds for this job on conflict.
  if (repName) {
    row.primary_salesperson = repName;
  }

  return row;
}

/**
 * syncCrmPipeline(sb, acct, deadline, repNameByJobId) — account-scoped crm_pipeline
 * upsert reading this account's acculynx_jobs + acculynx_job_financials rows.
 *
 * Batches the upsert by CHUNK_SIZE and stops issuing further batches once the
 * deadline has passed (budget-aware, matching the rest of the fan-out).
 *
 * @param sb              - Supabase client (service role)
 * @param acct            - account row (account_key)
 * @param deadline         - epoch ms budget limit
 * @param repNameByJobId  - Map<jobId, repName> returned by syncJobWalk's
 *                          full-representatives fetch (Task 2a)
 * @param batchId         - sync_batch_id for cross-referencing this run
 */
export async function syncCrmPipeline(
  sb: any,
  acct: { account_key: string },
  deadline: number,
  repNameByJobId: Map<string, string> = new Map(),
  batchId?: string,
): Promise<{ upserted: number; error?: string }> {
  const { data: jobRows, error: jobsErr } = await sb
    .from("acculynx_jobs")
    .select(
      "id,job_name,job_number,priority,current_milestone,milestone_date,created_date,modified_date," +
        "lead_dead_reason,job_category_name,trade_types,location_street1,location_city,location_state," +
        "location_state_abbrev,location_zip,latitude,longitude,lead_source_name,initial_appointment_start," +
        "initial_appointment_end,initial_appointment_notes,raw",
    )
    .eq("account_key", acct.account_key);
  if (jobsErr) return { upserted: 0, error: `jobs load: ${jobsErr.message}` };

  const jobs: JobRow[] = jobRows ?? [];
  if (jobs.length === 0) return { upserted: 0 };

  const { data: finRows, error: finErr } = await sb
    .from("acculynx_job_financials")
    .select("job_id,approved_job_value,balance_due")
    .in("job_id", jobs.map((j) => j.id));
  if (finErr) return { upserted: 0, error: `financials load: ${finErr.message}` };

  const financialsByJobId = new Map<string, JobFinancialsRow>();
  for (const f of (finRows ?? []) as JobFinancialsRow[]) {
    financialsByJobId.set(f.job_id, f);
  }

  const nowIso = new Date().toISOString();
  const rows = jobs.map((job) =>
    buildPipelineRow(
      job,
      financialsByJobId.get(job.id) ?? null,
      repNameByJobId.get(job.id) ?? null,
      batchId,
      nowIso,
    )
  );

  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    if (Date.now() >= deadline) break;
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await sb.from("crm_pipeline").upsert(chunk, {
      onConflict: "acculynx_job_id",
      ignoreDuplicates: false,
    });
    if (error) return { upserted, error: `crm_pipeline upsert: ${error.message}` };
    upserted += chunk.length;
  }

  return { upserted };
}
