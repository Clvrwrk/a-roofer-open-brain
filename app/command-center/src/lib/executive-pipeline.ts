import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardStatus = "live" | "degraded" | "unconfigured";

/** D-03 (planner choice): selectable window tokens; default is last_7_days. */
export type WindowToken = "this_week" | "last_7_days" | "mtd" | "qtd";

export interface DashboardFilters {
  window?: WindowToken;
  /** account_key filter; "all" (default) rolls up every location. */
  accountKey?: string | "all";
  /** job_category_name filter (residential/commercial/property management/uncategorized); "all" default. */
  commercialResidential?: string | "all";
  /** Checkpoint round 3: assigned-rep filter (crm_pipeline.primary_salesperson); "all" default. */
  rep?: string | "all";
}

export interface PipelineRow {
  id: number | string;
  acculynx_job_id: string | null;
  job_name: string | null;
  location_city: string | null;
  location_state: string | null;
  market: string | null;
  current_milestone: string | null;
  primary_salesperson: string | null;
  contract_amount: number | string | null;
  primary_estimate_amount: number | string | null;
  balance_due: number | string | null;
  lead_date: string | null;
  approved_date: string | null;
  milestone_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  insurance_company: string | null;
  insurance_claim_number: string | null;
  insurance_claim_filed: boolean | null;
  insurance_claim_filed_date: string | null;
  insurance_date_of_loss: string | null;
  parent_lead_source: string | null;
  sub_lead_source: string | null;
  data_source: string | null;
}

/** Join target for region/office + commercial-residential derivation (Pitfall 2). */
export interface AcculynxJobRow {
  id: string;
  account_key: string | null;
  job_category_name: string | null;
}

export interface AcculynxAccountRow {
  account_key: string;
  label: string | null;
  program: string | null;
  market: string | null;
  state: string | null;
}

export interface FunnelStage {
  milestone: string;
  count: number;
  value: number;
}

export interface CloseRateResult {
  leadCount: number;
  soldCount: number;
  closeRate: number;
  soldValue: number;
  /** Mandatory honesty qualifier per Pitfall 4 — period-snapshot proxy, not a cohort conversion. */
  qualifier: string;
}

export interface MarginCoverage {
  jobsWithCostData: number;
  totalJobsInSlice: number;
  coveragePct: number;
}

export interface MarginByDimensionRow {
  dimension: string;
  marginPct: number;
  avgDollarProfit: number;
  coverage: MarginCoverage;
  /** UI-SPEC.md copywriting contract caption, emitted as data. */
  caption: string;
}

export interface LeaderboardRow {
  salesperson: string;
  soldCount: number;
  soldValue: number;
  arBalance: number;
}

/** Checkpoint round 4, item 1: collected-vs-AR split for one stacked-bar segment
 * (funnel-by-stage or rep leaderboard). `collected` = value - arOutstanding (never
 * negative); `arOutstanding` = the summed balance_due for the same row set (currently
 * $0 everywhere in production — see 07-UI-SPEC.md amendment #3 measurement — but the
 * chart must render cleanly in that all-zero state and split correctly once real
 * balance_due data lands). */
export interface CollectedArSplit {
  collected: number;
  arOutstanding: number;
}

export interface FreshnessInput {
  accountKey: string;
  lastSyncAt: string | null;
}

export interface FreshnessBadge {
  accountKey: string;
  tone: "ready" | "review" | "critical";
  lastSyncAt: string | null;
  label: string;
}

export interface RegionOfficeDerived {
  /** One of the 8 acculynx_accounts.account_key values, or "unknown" when unresolvable. */
  accountKey: string;
  /** "Residential" | "Commercial" | "Property Management" | "uncategorized" */
  commercialResidential: string;
}

/** Checkpoint round 3 (user spec, item 4): segmentation is BY ACCOUNT.
 * "commercial" = the multi_family_commercial account ONLY; every other account
 * (insurance_program + all geo location accounts) = "residential". */
export type Segment = "residential" | "commercial";

/** Checkpoint round 3 (user spec, item 3): the five queues shown per location.
 * "completed" folds into "approved" per the user's explicit decision. */
export type QueueName = "leads" | "prospects" | "approved" | "invoiced" | "closed";

/** Per-queue value + count for one location row (checkpoint round 3, item 3). Leads
 * carry a count but no $ value (excluded from value entirely); prospects value is
 * ONLY the sum of jobs with a primary_estimate_amount > 0 (the pre-close pipeline
 * value); closed carries its own arValue (AR outstanding for that queue). */
export interface QueueValue {
  queue: QueueName;
  count: number;
  /** null for "leads" (value intentionally excluded, per user spec item 3). */
  value: number | null;
}

/** One row per production location (account_key) — the inline right-aligned metrics
 * for the primary breakdown/expandable-row layout (checkpoint rework directive 6),
 * reworked in checkpoint round 3 to show queue values + a snapshot close rate. */
export interface LocationRollupRow {
  accountKey: string;
  /** Pre-close pipeline value: prospects-with-estimate summed value (item 3). */
  pipelineValue: number;
  soldValue: number;
  soldCount: number;
  leadCount: number;
  arValue: number;
  /** Per-queue value/count breakdown shown on the account bar (item 3). */
  queues: QueueValue[];
  /** Count-based, snapshot (window-independent) close rate for this location (item 7). */
  closeRateSnapshot: number;
}

/** Checkpoint round 3, item 4: Average Ticket = (sum contract value / count) for jobs
 * APPROVED within the selected window, computed per segment. */
export interface AverageTicketResult {
  residential: { avgTicket: number; count: number };
  commercial: { avgTicket: number; count: number };
}

/** Checkpoint round 3, item 4: every headline KPI splits Residential vs Commercial. */
export interface SegmentSplit {
  residential: number;
  commercial: number;
}

export interface ExecutivePipelineDashboard {
  status: DashboardStatus;
  generatedAt: string;
  errors: string[];
  filters: Required<DashboardFilters>;
  window: { start: string; end: string; label: string };
  funnel: FunnelStage[];
  /** Checkpoint round 4, item 1: the funnel stages plus their collected/AR split,
   * for the stacked-bar chart. Same stage order/values as `funnel`. */
  funnelWithSplit: FunnelStageWithSplit[];
  closeRate: CloseRateResult;
  newLeadsCount: number;
  marginByRegion: MarginByDimensionRow[];
  marginByOffice: MarginByDimensionRow[];
  marginByCommercialResidential: MarginByDimensionRow[];
  marginByRep: MarginByDimensionRow[];
  leaderboard: LeaderboardRow[];
  /** Checkpoint round 4, item 1: the leaderboard rows plus their collected/AR
   * split, for the stacked-bar chart. Same rep order/values as `leaderboard`. */
  leaderboardWithSplit: LeaderboardRowWithSplit[];
  /** Checkpoint round 4, item 2: fixed trailing-7-calendar-day totals pill row,
   * independent of the selector window; obeys the D-13 filter bar. */
  trailing7d: Trailing7dTotals;
  locationRollup: LocationRollupRow[];
  arTotal: number;
  freshness: FreshnessBadge[];
  /** Headline "pipeline value" KPI = the pre-close pipeline value (item 3). */
  pipelineValueTotal: number;
  /** Checkpoint round 3, item 4: Res/Com splits for every headline KPI. */
  pipelineValueSplit: SegmentSplit;
  soldValueSplit: SegmentSplit;
  jobsSoldSplit: SegmentSplit;
  newLeadsSplit: SegmentSplit;
  closeRateSplit: SegmentSplit;
  marginPctSplit: SegmentSplit;
  averageTicket: AverageTicketResult;
  /** Distinct assigned reps present in the (post-exclusion) data, for the Rep filter
   * dropdown (item 1) — sourced from crm_pipeline.primary_salesperson (item 6). */
  knownReps: string[];
}

/** One job row for the per-location drill-down table (D-09 checkpoint gap). Free-text
 * fields (jobName, salesperson) originate in AccuLynx and MUST be rendered via
 * textContent/attribute-safe paths client-side — never innerHTML (T-07-05). */
export interface JobDrillRow {
  acculynxJobId: string | null;
  jobName: string;
  accountKey: string;
  milestone: string;
  contractAmount: number;
  salesperson: string;
}

/** One row per assigned rep for the leaderboard, reworked in checkpoint round 3 to
 * carry a snapshot (window-independent) close rate keyed on the ASSIGNED rep field
 * (crm_pipeline.primary_salesperson — item 6/item 7 "assigned Close Rate"). */
export interface RepLeaderboardRow extends LeaderboardRow {
  closeRateSnapshot: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;
/** Hourly ingestion SLA (D-12) */
const FRESHNESS_SLA_MS = 60 * 60_000;

const LEAD_MILESTONES = new Set(["unassigned_lead", "assigned_lead", "lead", "prospect"]);
const SOLD_MILESTONES = new Set(["approved", "completed", "invoiced", "closed"]);

/** Checkpoint round 3 (user spec, item 2 — supersedes round 2's closed/paid-in-full
 * exclusion): "dead" and "cancelled" milestone jobs are FULLY EXCLUDED from every
 * number on the dashboard. "closed" is no longer excluded — round 3 reinstates it as
 * its own visible queue (item 3), shown with its AR outstanding. Case-insensitive so
 * it also covers the Title-Case acculynx_jobs vocabulary (`Cancelled`) if it ever
 * leaks into this field. Applied to the BASE row set before every aggregation (funnel,
 * close rate, margin breakdowns, location rollup, leaderboard, AR total, drill-down,
 * queue bucketing). */
export const EXCLUDED_MILESTONES = new Set(["dead", "cancelled"]);

/** Case-insensitive predicate: true when the row's milestone should be excluded from
 * every KPI/chart/table on the executive pipeline dashboard (checkpoint round 3, item 2:
 * dead/cancelled fully excluded). */
export function isExcludedMilestone(row: Pick<PipelineRow, "current_milestone">): boolean {
  const milestone = compact(row.current_milestone, "").toLowerCase();
  return EXCLUDED_MILESTONES.has(milestone);
}

/** Applies isExcludedMilestone to a row set — the single filter point every loader
 * path (dashboard aggregation + per-location drill-down) must call before computing
 * anything, so "dead"/"cancelled" jobs never appear in any KPI, chart, breakdown, or
 * drill-down row. Name retained from round 2 for call-site continuity; semantics now
 * cover dead/cancelled (round 3, item 2) rather than closed/paid-in-full. */
export function excludeClosedAndPaidInFull(rows: PipelineRow[]): PipelineRow[] {
  return rows.filter((row) => !isExcludedMilestone(row));
}

/** The 8 production acculynx_accounts.account_key values (RESEARCH.md, Open Question 3:
 * treat program accounts (insurance_program, multi_family_commercial) as peer location
 * entries for v1's plain global filter bar, per D-13's discretion note). */
export const KNOWN_ACCOUNT_KEYS = [
  "colorado",
  "florida",
  "georgia",
  "kansas_city",
  "texas",
  "wichita",
  "insurance_program",
  "multi_family_commercial",
] as const;

/** Checkpoint round 3 (user spec, item 4): the ONLY commercial account_key.
 * insurance_program + every geo location account are Residential. */
const COMMERCIAL_ACCOUNT_KEY = "multi_family_commercial";

/** Checkpoint round 3 (user spec, item 4): account -> Res/Com segmentation. */
export function segmentForAccountKey(accountKey: string): Segment {
  return accountKey === COMMERCIAL_ACCOUNT_KEY ? "commercial" : "residential";
}

// ---------------------------------------------------------------------------
// Shared helpers (originally copied verbatim / adapted from the now-retired
// weekly snapshot loader — see 07-03-SUMMARY.md for the D-02 cutover)
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compact(value: unknown, fallback = "Unknown") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function amountFor(row: PipelineRow) {
  return Math.max(toNumber(row.contract_amount), toNumber(row.primary_estimate_amount));
}

/** Raw contract amount only (no estimate fallback) — used where the user spec
 * distinguishes "contract value" (Approved/Invoiced/Closed queues, Average Ticket)
 * from "estimate value" (Prospects queue, item 3). */
function contractAmountFor(row: PipelineRow): number {
  return toNumber(row.contract_amount);
}

/** Raw primary estimate amount only — used for the Prospects queue's
 * estimate-required rule (item 3). */
function estimateAmountFor(row: PipelineRow): number {
  return toNumber(row.primary_estimate_amount);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(value: Date) {
  const day = value.getDay();
  return addDays(startOfDay(value), -day);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function startOfQuarter(value: Date) {
  const quarterMonth = Math.floor(value.getMonth() / 3) * 3;
  return new Date(value.getFullYear(), quarterMonth, 1);
}

// ---------------------------------------------------------------------------
// Pure core: compact currency formatting (checkpoint round 3, item 5)
// ---------------------------------------------------------------------------

/** Compact currency for chart ticks/data-labels and secondary big numbers (queue
 * values on account bars) — never full precision, to avoid cognitive overload.
 * Boundaries: <1000 shows a rounded dollar amount ($0-$999); 1000-999999 shows K
 * (rounded to the nearest whole K, e.g. $5K, $50K, $500K); 1,000,000+ shows M with
 * one decimal only when non-zero (e.g. $1M, $1.5M). Negative values keep the sign
 * before the dollar mark (e.g. -$5K). Headline KPI numbers stay full-precision
 * dollars per the user spec (item 5) — this formatter is NOT used there. */
export function formatCompactCurrency(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const rounded = Math.round(millions * 10) / 10;
    const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${sign}$${label}M`;
  }

  if (abs >= 1_000) {
    const thousands = Math.round(abs / 1_000);
    return `${sign}$${thousands}K`;
  }

  return `${sign}$${Math.round(abs)}`;
}

/** Mandatory pagination helper (RESEARCH.md Pattern 3 / Pitfall 3) — copied verbatim
 * from the now-retired weekly snapshot loader's selectAll, since it was not exported
 * from that module (see 07-03-SUMMARY.md for the D-02 cutover). */
async function selectAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  query?: (builder: any) => any,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    let builder = client.from(table).select(columns).range(from, to);
    if (query) builder = query(builder);
    const { data, error } = await builder;
    if (error) throw new Error(`${table}: ${error.message || error.code || "query failed"}`);

    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    from += batch.length;
  }
}

/** Pure pagination-window math (regression guard for the 1000-row silent-truncation
 * pitfall — RESEARCH.md Pitfall 3 / Pattern 3). Returns the [from,to] windows
 * `selectAll`'s .range() loop would issue for a table with `total` rows. */
export function paginateRange(total: number, pageSize: number): Array<[number, number]> {
  const windows: Array<[number, number]> = [];
  let from = 0;
  while (from < total) {
    const to = Math.min(from + pageSize - 1, total - 1);
    windows.push([from, to]);
    from += pageSize;
  }
  return windows;
}

// ---------------------------------------------------------------------------
// Pure core: funnel grouping (uses lowercase crm_pipeline.current_milestone only)
// ---------------------------------------------------------------------------

export function groupPipelineFunnel(rows: PipelineRow[]): FunnelStage[] {
  const groups = new Map<string, { count: number; value: number }>();

  for (const row of rows) {
    // Pitfall 5: always the normalized lowercase crm_pipeline.current_milestone,
    // never acculynx_jobs.current_milestone (Title Case) for stage logic.
    const milestone = compact(row.current_milestone, "unknown").toLowerCase();
    const bucket = groups.get(milestone) ?? { count: 0, value: 0 };
    bucket.count += 1;
    bucket.value += amountFor(row);
    groups.set(milestone, bucket);
  }

  return Array.from(groups.entries())
    .map(([milestone, bucket]) => ({ milestone, count: bucket.count, value: bucket.value }))
    .sort((a, b) => b.value - a.value || a.milestone.localeCompare(b.milestone));
}

// ---------------------------------------------------------------------------
// Pure core: collected/AR split for the stacked funnel + leaderboard charts
// (checkpoint round 4, item 1)
// ---------------------------------------------------------------------------

/** Splits a row set's total value into "collected" (value - balance_due, floored at
 * 0) and "arOutstanding" (summed balance_due, floored at 0 per row so a negative/
 * credit balance_due never produces a negative AR segment). `value` is the same
 * amountFor()-derived total the funnel/leaderboard already chart — this function
 * does not recompute it, callers pass their own summed value so the split always
 * agrees with the bar's total height. */
function splitCollectedAr(rows: PipelineRow[], value: number): CollectedArSplit {
  const arOutstanding = rows.reduce((sum, row) => sum + Math.max(0, toNumber(row.balance_due)), 0);
  const collected = Math.max(0, value - arOutstanding);
  return { collected, arOutstanding };
}

/** One stacked-bar segment for the funnel-by-stage chart: the stage's existing
 * count/value plus the collected/AR split of that same value (checkpoint round 4,
 * item 1). Reuses groupPipelineFunnel's exact milestone bucketing/sort so the
 * stacked chart's stage order and totals never diverge from the existing funnel. */
export interface FunnelStageWithSplit extends FunnelStage {
  collected: number;
  arOutstanding: number;
}

export function computeFunnelStagesWithSplit(rows: PipelineRow[]): FunnelStageWithSplit[] {
  const stages = groupPipelineFunnel(rows);
  const rowsByMilestone = new Map<string, PipelineRow[]>();
  for (const row of rows) {
    const milestone = compact(row.current_milestone, "unknown").toLowerCase();
    const list = rowsByMilestone.get(milestone) ?? [];
    list.push(row);
    rowsByMilestone.set(milestone, list);
  }

  return stages.map((stage) => {
    const split = splitCollectedAr(rowsByMilestone.get(stage.milestone) ?? [], stage.value);
    return { ...stage, ...split };
  });
}

/** One stacked-bar segment for the rep leaderboard chart: the rep's existing
 * soldValue plus its collected/AR split (checkpoint round 4, item 1). Takes the
 * already-built leaderboard rows (soldRows-derived) so the stacked chart's rep
 * order/values never diverge from the existing leaderboard, and the row set used
 * for the AR sum is the caller's own per-rep sold-row grouping. */
export interface LeaderboardRowWithSplit extends LeaderboardRow {
  collected: number;
  arOutstanding: number;
}

export function computeLeaderboardWithSplit(
  leaderboard: LeaderboardRow[],
  soldRowsByRep: Map<string, PipelineRow[]>,
): LeaderboardRowWithSplit[] {
  return leaderboard.map((row) => {
    const split = splitCollectedAr(soldRowsByRep.get(row.salesperson) ?? [], row.soldValue);
    return { ...row, ...split };
  });
}

// ---------------------------------------------------------------------------
// Pure core: queue bucketing (checkpoint round 3, item 3)
// ---------------------------------------------------------------------------

const QUEUE_LEAD_MILESTONES = new Set(["unassigned_lead", "assigned_lead", "lead"]);
const QUEUE_PROSPECT_MILESTONES = new Set(["prospect"]);
/** "completed" FOLDS INTO Approved per the user's explicit decision (item 3). */
const QUEUE_APPROVED_MILESTONES = new Set(["approved", "completed"]);
const QUEUE_INVOICED_MILESTONES = new Set(["invoiced"]);
const QUEUE_CLOSED_MILESTONES = new Set(["closed"]);

/** Maps a (case-insensitive, dead/cancelled-already-excluded) row to its queue, or
 * null when the milestone is unrecognized (never fabricates a queue for unknown
 * values — the row is simply excluded from every queue bucket, matching the funnel's
 * "unknown" behavior elsewhere in this module). */
export function queueForRow(row: Pick<PipelineRow, "current_milestone">): QueueName | null {
  const milestone = compact(row.current_milestone, "").toLowerCase();
  if (QUEUE_LEAD_MILESTONES.has(milestone)) return "leads";
  if (QUEUE_PROSPECT_MILESTONES.has(milestone)) return "prospects";
  if (QUEUE_APPROVED_MILESTONES.has(milestone)) return "approved";
  if (QUEUE_INVOICED_MILESTONES.has(milestone)) return "invoiced";
  if (QUEUE_CLOSED_MILESTONES.has(milestone)) return "closed";
  return null;
}

/** Per-queue count + value for one row set (checkpoint round 3, item 3):
 * - leads: value EXCLUDED entirely (null) — count only.
 * - prospects: counted/valued ONLY when primary_estimate_amount > 0; the summed
 *   estimate value across all rows here IS the pre-close pipeline value.
 * - approved: contract value of approved jobs (completed folds in here).
 * - invoiced: contract/invoiced value of invoiced jobs.
 * - closed: closed contract value; arValue (AR outstanding) is surfaced separately
 *   by the caller via balance_due, since QueueValue only carries count/value.
 * Assumes dead/cancelled rows have ALREADY been excluded from `rows` (item 2). */
export function computeQueueValues(rows: PipelineRow[]): QueueValue[] {
  const buckets: Record<QueueName, { count: number; value: number }> = {
    leads: { count: 0, value: 0 },
    prospects: { count: 0, value: 0 },
    approved: { count: 0, value: 0 },
    invoiced: { count: 0, value: 0 },
    closed: { count: 0, value: 0 },
  };

  for (const row of rows) {
    const queue = queueForRow(row);
    if (!queue) continue;

    if (queue === "leads") {
      buckets.leads.count += 1;
      continue; // value intentionally excluded (item 3)
    }

    if (queue === "prospects") {
      const estimate = estimateAmountFor(row);
      if (estimate > 0) {
        buckets.prospects.count += 1;
        buckets.prospects.value += estimate;
      }
      continue; // prospects with no estimate are not counted/valued in this queue
    }

    // approved / invoiced / closed: contract value.
    buckets[queue].count += 1;
    buckets[queue].value += contractAmountFor(row);
  }

  return (Object.keys(buckets) as QueueName[]).map((queue) => ({
    queue,
    count: buckets[queue].count,
    value: queue === "leads" ? null : buckets[queue].value,
  }));
}

/** The headline "pipeline value" KPI: pre-close pipeline value = summed estimate
 * value of prospects-with-an-estimate (item 3). Pulled out of computeQueueValues'
 * result for callers that already have the queue array. */
export function preClosePipelineValue(queues: QueueValue[]): number {
  return queues.find((q) => q.queue === "prospects")?.value ?? 0;
}

/** Count-based, snapshot (window-independent) close rate — user spec item 7, exact
 * formula: count(Approved + Invoiced + Closed) / count(Leads + Prospects + Approved +
 * Invoiced + Closed). Ignores the time-window filter entirely (a CURRENT SNAPSHOT of
 * the funnel, per the user's explicit decision) and assumes dead/cancelled rows have
 * already been excluded from `rows`. Returns 0 when the denominator is 0 (no rows in
 * any of the five queues). */
export function computeSnapshotCloseRate(rows: PipelineRow[]): number {
  let numerator = 0;
  let denominator = 0;

  for (const row of rows) {
    const queue = queueForRow(row);
    if (!queue) continue;
    denominator += 1;
    if (queue === "approved" || queue === "invoiced" || queue === "closed") {
      numerator += 1;
    }
  }

  return denominator > 0 ? numerator / denominator : 0;
}

// ---------------------------------------------------------------------------
// Pure core: close rate (snapshot-window proxy, Pitfall 4)
// ---------------------------------------------------------------------------

export function computeCloseRate(rows: PipelineRow[], start: Date, end: Date): CloseRateResult {
  const leadRows = rows.filter((row) => {
    const milestone = compact(row.current_milestone, "").toLowerCase();
    if (!LEAD_MILESTONES.has(milestone)) return false;
    const date = toDate(row.lead_date ?? row.created_at);
    return Boolean(date && date >= start && date < addDays(end, 1));
  });

  const soldRows = rows.filter((row) => {
    const milestone = compact(row.current_milestone, "").toLowerCase();
    if (!SOLD_MILESTONES.has(milestone)) return false;
    const date = toDate(row.approved_date ?? row.milestone_date ?? row.updated_at);
    return Boolean(date && date >= start && date < addDays(end, 1));
  });

  const leadCount = leadRows.length;
  const soldCount = soldRows.length;
  const soldValue = soldRows.reduce((sum, row) => sum + amountFor(row), 0);

  return {
    leadCount,
    soldCount,
    closeRate: leadCount > 0 ? soldCount / leadCount : 0,
    soldValue,
    // Mandatory honesty qualifier (Pitfall 4): this is a period-snapshot ratio
    // (sold-milestone rows / lead-milestone rows, both windowed), NOT a cohort
    // conversion rate — acculynx_job_milestone_history is not yet ingested.
    qualifier: "period-snapshot ratio, not a cohort conversion rate",
  };
}

// ---------------------------------------------------------------------------
// Pure core: region/office + commercial-residential derivation (Pitfall 2)
// ---------------------------------------------------------------------------

export function deriveRegionOffice(row: PipelineRow, jobs: AcculynxJobRow[]): RegionOfficeDerived {
  const job = row.acculynx_job_id ? jobs.find((j) => j.id === row.acculynx_job_id) : undefined;

  // NEVER use crm_pipeline.market (a granular county slug) as the location dimension.
  const accountKey = job?.account_key ?? "unknown";
  const commercialResidential = job?.job_category_name ? job.job_category_name : "uncategorized";

  return { accountKey, commercialResidential };
}

/** Checkpoint round 3 (user spec, item 4): a row's segment is derived from its
 * account_key, NOT from job_category_name — only multi_family_commercial is
 * "commercial"; everything else (including insurance_program) is "residential". */
export function deriveSegment(row: PipelineRow, jobs: AcculynxJobRow[]): Segment {
  return segmentForAccountKey(deriveRegionOffice(row, jobs).accountKey);
}

// ---------------------------------------------------------------------------
// Pure core: Average Ticket per segment (checkpoint round 3, item 4)
// ---------------------------------------------------------------------------

/** Average Ticket = (sum of contract value / count) for jobs APPROVED within the
 * selected time window, computed per segment (item 4). "Approved" here means the
 * Approved QUEUE (queueForRow === "approved", which folds in "completed" per item 3),
 * matched on approved_date/milestone_date/updated_at falling in [start, end] — the
 * same windowing convention computeCloseRate uses elsewhere in this module. Assumes
 * dead/cancelled rows have already been excluded from `rows`. */
export function computeAverageTicket(
  rows: PipelineRow[],
  jobs: AcculynxJobRow[],
  start: Date,
  end: Date,
): AverageTicketResult {
  const totals: Record<Segment, { sum: number; count: number }> = {
    residential: { sum: 0, count: 0 },
    commercial: { sum: 0, count: 0 },
  };

  for (const row of rows) {
    if (queueForRow(row) !== "approved") continue;
    const date = toDate(row.approved_date ?? row.milestone_date ?? row.updated_at);
    if (!date || date < start || date >= addDays(end, 1)) continue;

    const segment = deriveSegment(row, jobs);
    totals[segment].sum += contractAmountFor(row);
    totals[segment].count += 1;
  }

  return {
    residential: {
      avgTicket: totals.residential.count > 0 ? totals.residential.sum / totals.residential.count : 0,
      count: totals.residential.count,
    },
    commercial: {
      avgTicket: totals.commercial.count > 0 ? totals.commercial.sum / totals.commercial.count : 0,
      count: totals.commercial.count,
    },
  };
}

// ---------------------------------------------------------------------------
// Pure core: margin-by-dimension with mandatory coverage (Pattern 4 / Pitfall 1)
// ---------------------------------------------------------------------------

export function computeMarginByDimension(
  pipeline: PipelineRow[],
  jobs: AcculynxJobRow[],
  financialsByJobId: Map<string, { grossProfit: number }>,
  invoiceCostByJobId: Map<string, number>,
  dimensionOf: (row: PipelineRow, jobs: AcculynxJobRow[]) => string,
): MarginByDimensionRow[] {
  const groups = new Map<string, PipelineRow[]>();
  for (const row of pipeline) {
    const key = dimensionOf(row, jobs);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const results: MarginByDimensionRow[] = [];

  for (const [dimension, rows] of groups.entries()) {
    let jobsWithCostData = 0;
    let marginSum = 0;
    let dollarProfitSum = 0;

    for (const row of rows) {
      if (!row.acculynx_job_id) continue;
      const contractAmount = amountFor(row);

      // Primary source: job-financials GP value, when present.
      const financials = financialsByJobId.get(row.acculynx_job_id);
      if (financials) {
        jobsWithCostData += 1;
        const profit = financials.grossProfit;
        dollarProfitSum += profit;
        if (contractAmount > 0) marginSum += (profit / contractAmount) * 100;
        continue;
      }

      // Fallback: contract_amount - invoiced cost, via v_invoice_acculynx_match + abc_invoice_lines.
      const invoicedCost = invoiceCostByJobId.get(row.acculynx_job_id);
      if (invoicedCost !== undefined) {
        jobsWithCostData += 1;
        const profit = contractAmount - invoicedCost;
        dollarProfitSum += profit;
        if (contractAmount > 0) marginSum += (profit / contractAmount) * 100;
        continue;
      }

      // No cost data for this job: EXCLUDED from the margin average, but COUNTED
      // in the coverage denominator below (totalJobsInSlice). Never treated as
      // 0 cost / 100% margin (Pitfall 1 honesty guarantee).
    }

    const totalJobsInSlice = rows.length;
    const coveragePct = totalJobsInSlice > 0 ? (jobsWithCostData / totalJobsInSlice) * 100 : 0;
    const marginPct = jobsWithCostData > 0 ? marginSum / jobsWithCostData : 0;
    const avgDollarProfit = jobsWithCostData > 0 ? dollarProfitSum / jobsWithCostData : 0;

    const coverage: MarginCoverage = { jobsWithCostData, totalJobsInSlice, coveragePct };

    const caption =
      jobsWithCostData === 0
        ? "No cost data available for these jobs yet"
        : `${marginPct.toFixed(0)}% avg margin — ${jobsWithCostData} of ${totalJobsInSlice} jobs have cost data (${coveragePct.toFixed(0)}% coverage)`;

    results.push({ dimension, marginPct, avgDollarProfit, coverage, caption });
  }

  return results.sort((a, b) => b.marginPct - a.marginPct || a.dimension.localeCompare(b.dimension));
}

// ---------------------------------------------------------------------------
// Pure core: per-location rollup (D-05 primary breakdown row metrics)
// ---------------------------------------------------------------------------

/** Inline per-location metrics for the expandable-row primary breakdown (checkpoint
 * rework directive 6; reworked in checkpoint round 3 item 3/7 to carry the per-queue
 * value breakdown and a snapshot close rate): pipeline $ (pre-close pipeline value —
 * prospects-with-estimate, item 3), sold $/count (within window), lead count (within
 * window), AR $ (point-in-time), the five-queue value/count array, and the
 * window-independent snapshot close rate — one row per known account_key. Assumes
 * dead/cancelled rows have already been excluded from `pipeline` (item 2). */
export function computeLocationRollup(
  pipeline: PipelineRow[],
  jobs: AcculynxJobRow[],
  accountKeys: readonly string[],
  start: Date,
  end: Date,
): LocationRollupRow[] {
  return accountKeys.map((accountKey) => {
    const rows = pipeline.filter((row) => deriveRegionOffice(row, jobs).accountKey === accountKey);

    const queues = computeQueueValues(rows);
    const pipelineValue = preClosePipelineValue(queues);
    const arValue = rows.reduce((sum, row) => sum + toNumber(row.balance_due), 0);

    const soldRows = rows.filter((row) => {
      const milestone = compact(row.current_milestone, "").toLowerCase();
      const date = toDate(row.approved_date ?? row.milestone_date ?? row.updated_at);
      return SOLD_MILESTONES.has(milestone) && Boolean(date && date >= start && date < addDays(end, 1));
    });
    const soldValue = soldRows.reduce((sum, row) => sum + amountFor(row), 0);

    const leadCount = rows.filter((row) => {
      const milestone = compact(row.current_milestone, "").toLowerCase();
      const date = toDate(row.lead_date ?? row.created_at);
      return LEAD_MILESTONES.has(milestone) && Boolean(date && date >= start && date < addDays(end, 1));
    }).length;

    const closeRateSnapshot = computeSnapshotCloseRate(rows);

    return { accountKey, pipelineValue, soldValue, soldCount: soldRows.length, leadCount, arValue, queues, closeRateSnapshot };
  });
}

// ---------------------------------------------------------------------------
// Pure core: per-job drill-down rows for a location row expansion (D-09)
// ---------------------------------------------------------------------------

/** Builds the job-level rows for one account_key (production location), applying the
 * same account/commercial-residential filters the aggregate KPIs already obey. Reuses
 * deriveRegionOffice + amountFor so the drill-down table is consistent with the
 * aggregates it expands from. Never fabricates rows — only real crm_pipeline rows.
 * Excludes dead/cancelled jobs (checkpoint round 3, item 2 — supersedes round 2's
 * closed/paid-in-full exclusion; closed jobs are now included since Closed is a
 * visible queue, item 3), same filter point as the aggregate dashboard loader. */
export function jobRowsForLocation(
  pipeline: PipelineRow[],
  jobs: AcculynxJobRow[],
  accountKey: string,
  commercialResidential: string | "all" = "all",
  rep: string | "all" = "all",
): JobDrillRow[] {
  return excludeClosedAndPaidInFull(pipeline)
    .filter((row) => {
      const derived = deriveRegionOffice(row, jobs);
      if (derived.accountKey !== accountKey) return false;
      if (commercialResidential !== "all" && derived.commercialResidential !== commercialResidential) return false;
      if (rep !== "all" && compact(row.primary_salesperson, "Unassigned") !== rep) return false;
      return true;
    })
    .map((row) => {
      const derived = deriveRegionOffice(row, jobs);
      return {
        acculynxJobId: row.acculynx_job_id,
        jobName: compact(row.job_name, "Unnamed job"),
        accountKey: derived.accountKey,
        milestone: compact(row.current_milestone, "unknown").toLowerCase(),
        contractAmount: amountFor(row),
        salesperson: compact(row.primary_salesperson, "Unassigned"),
      };
    })
    .sort((a, b) => b.contractAmount - a.contractAmount);
}

// ---------------------------------------------------------------------------
// Pure core: generic window filtering
// ---------------------------------------------------------------------------

export function filterByWindow<T>(
  rows: T[],
  dateOf: (row: T) => string | null | undefined,
  start: Date,
  end: Date,
): T[] {
  return rows.filter((row) => {
    const date = toDate(dateOf(row));
    return Boolean(date && date >= start && date < addDays(end, 1));
  });
}

export function windowRange(token: WindowToken, now: Date): { start: Date; end: Date; label: string } {
  const end = startOfDay(now);
  switch (token) {
    case "this_week":
      return { start: startOfWeek(now), end, label: "This Week" };
    case "mtd":
      return { start: startOfMonth(now), end, label: "Month-to-Date" };
    case "qtd":
      return { start: startOfQuarter(now), end, label: "Quarter-to-Date" };
    case "last_7_days":
    default:
      return { start: addDays(end, -7), end, label: "Last 7 Days" };
  }
}

// ---------------------------------------------------------------------------
// Pure core: trailing-7-day totals pill row (checkpoint round 4, item 2)
// ---------------------------------------------------------------------------

/** ALWAYS a fixed trailing 7-calendar-day window anchored at `now` — deliberately
 * independent of the D-03 window-selector token (that is the entire point of this
 * pill row: an always-current-at-a-glance strip that does not move when the user
 * changes the KPI/chart window). Uses the same [start, end) day-boundary convention
 * as windowRange's last_7_days case so the two stay visually consistent, but this
 * one is NEVER driven by the selector. */
export function trailing7DayRange(now: Date): { start: Date; end: Date } {
  const end = startOfDay(now);
  return { start: addDays(end, -7), end };
}

/** New-Leads count entering the leads queue within the trailing 7 days, keyed on
 * lead_date (falling back to created_at, same convention as every other lead-count
 * KPI in this module). */
export interface Trailing7dPill {
  count: number;
  /** null when the pill has no dollar value (New Leads — count only, mirrors the
   * leads queue's own value-exclusion rule, item 3 continuity). */
  value: number | null;
}

export interface Trailing7dTotals {
  newLeads: Trailing7dPill;
  newPreClose: Trailing7dPill;
  newContracts: Trailing7dPill;
  invoiced: Trailing7dPill;
  closed: Trailing7dPill;
}

export const EMPTY_TRAILING_7D: Trailing7dTotals = {
  newLeads: { count: 0, value: null },
  newPreClose: { count: 0, value: 0 },
  newContracts: { count: 0, value: 0 },
  invoiced: { count: 0, value: 0 },
  closed: { count: 0, value: 0 },
};

/** Trailing-7-day totals across the five queues, each keyed on its own existing date
 * signal (checkpoint round 4, item 2 — user spec): New Leads (lead_date/created_at,
 * count only, no $), New Pre-close (prospects-with-an-estimate entering the queue,
 * keyed on lead_date/created_at since prospect has no dedicated "entered prospect"
 * date column — the row's crm_pipeline lifecycle-entry date), New Contracts (the
 * Approved queue incl. completed-fold, keyed on approved_date/milestone_date/
 * updated_at — same convention as computeAverageTicket/computeLocationRollup's sold
 * window), Invoiced (invoiced queue, same approved/milestone/updated date signal),
 * Closed (closed queue, same date signal). Fixed 7-day window via trailing7DayRange
 * — NEVER the selector window. Assumes dead/cancelled rows already excluded from
 * `rows` (same upstream filter point as every other aggregation in this module). */
export function computeTrailing7dTotals(rows: PipelineRow[], now: Date): Trailing7dTotals {
  const { start, end } = trailing7DayRange(now);
  const inWindow = (date: Date | null) => Boolean(date && date >= start && date < end);

  const totals: Trailing7dTotals = {
    newLeads: { count: 0, value: null },
    newPreClose: { count: 0, value: 0 },
    newContracts: { count: 0, value: 0 },
    invoiced: { count: 0, value: 0 },
    closed: { count: 0, value: 0 },
  };

  for (const row of rows) {
    const queue = queueForRow(row);
    if (!queue) continue;

    if (queue === "leads") {
      if (inWindow(toDate(row.lead_date ?? row.created_at))) {
        totals.newLeads.count += 1;
      }
      continue;
    }

    if (queue === "prospects") {
      const estimate = estimateAmountFor(row);
      if (estimate > 0 && inWindow(toDate(row.lead_date ?? row.created_at))) {
        totals.newPreClose.count += 1;
        totals.newPreClose.value = (totals.newPreClose.value ?? 0) + estimate;
      }
      continue;
    }

    const entryDate = toDate(row.approved_date ?? row.milestone_date ?? row.updated_at);
    if (!inWindow(entryDate)) continue;

    if (queue === "approved") {
      totals.newContracts.count += 1;
      totals.newContracts.value = (totals.newContracts.value ?? 0) + contractAmountFor(row);
    } else if (queue === "invoiced") {
      totals.invoiced.count += 1;
      totals.invoiced.value = (totals.invoiced.value ?? 0) + contractAmountFor(row);
    } else if (queue === "closed") {
      totals.closed.count += 1;
      totals.closed.value = (totals.closed.value ?? 0) + contractAmountFor(row);
    }
  }

  return totals;
}

// ---------------------------------------------------------------------------
// Pure core: freshness badges (D-12)
// ---------------------------------------------------------------------------

export function computeFreshnessBadges(
  inputs: FreshnessInput[],
  now: Date,
  slaMs: number = FRESHNESS_SLA_MS,
): FreshnessBadge[] {
  return inputs.map(({ accountKey, lastSyncAt }) => {
    const syncedAt = toDate(lastSyncAt);

    if (!syncedAt) {
      return {
        accountKey,
        tone: "critical",
        lastSyncAt,
        label: `${accountKey} - no sync recorded`,
      };
    }

    const ageMs = now.getTime() - syncedAt.getTime();
    let tone: FreshnessBadge["tone"];
    if (ageMs <= slaMs) {
      tone = "ready";
    } else if (ageMs <= slaMs * 2) {
      tone = "review";
    } else {
      tone = "critical";
    }

    const label =
      tone === "ready"
        ? `${accountKey} - data as of ${syncedAt.toISOString()}`
        : `${accountKey} - stale - last synced ${syncedAt.toISOString()}`;

    return { accountKey, tone, lastSyncAt, label };
  });
}

// ---------------------------------------------------------------------------
// SSR loader (Supabase-backed; wraps the pure core above)
// ---------------------------------------------------------------------------

interface InvoiceMatchRow {
  invoice_number: string;
  acculynx_job_id: string | null;
  matched: boolean | null;
}

interface AbcInvoiceLineRow {
  invoice_number: string;
  extended_price: number | string | null;
}

interface WatermarkRow {
  account_key: string;
  last_sync_at: string | null;
}

const EMPTY_SEGMENT_SPLIT: SegmentSplit = { residential: 0, commercial: 0 };
const EMPTY_AVERAGE_TICKET: AverageTicketResult = {
  residential: { avgTicket: 0, count: 0 },
  commercial: { avgTicket: 0, count: 0 },
};

function degradedDashboard(status: DashboardStatus, errors: string[], filters: Required<DashboardFilters>, now: Date): ExecutivePipelineDashboard {
  const { start, end, label } = windowRange(filters.window, now);
  return {
    status,
    generatedAt: now.toISOString(),
    errors,
    filters,
    window: { start: start.toISOString(), end: end.toISOString(), label },
    funnel: [],
    funnelWithSplit: [],
    closeRate: { leadCount: 0, soldCount: 0, closeRate: 0, soldValue: 0, qualifier: "period-snapshot ratio, not a cohort conversion rate" },
    newLeadsCount: 0,
    marginByRegion: [],
    marginByOffice: [],
    marginByCommercialResidential: [],
    marginByRep: [],
    leaderboard: [],
    leaderboardWithSplit: [],
    trailing7d: { ...EMPTY_TRAILING_7D },
    locationRollup: [],
    arTotal: 0,
    freshness: [],
    pipelineValueTotal: 0,
    pipelineValueSplit: { ...EMPTY_SEGMENT_SPLIT },
    soldValueSplit: { ...EMPTY_SEGMENT_SPLIT },
    jobsSoldSplit: { ...EMPTY_SEGMENT_SPLIT },
    newLeadsSplit: { ...EMPTY_SEGMENT_SPLIT },
    closeRateSplit: { ...EMPTY_SEGMENT_SPLIT },
    marginPctSplit: { ...EMPTY_SEGMENT_SPLIT },
    averageTicket: { residential: { ...EMPTY_AVERAGE_TICKET.residential }, commercial: { ...EMPTY_AVERAGE_TICKET.commercial } },
    knownReps: [],
  };
}

function resolveFilters(filters?: DashboardFilters): Required<DashboardFilters> {
  return {
    window: filters?.window ?? "last_7_days",
    accountKey: filters?.accountKey ?? "all",
    commercialResidential: filters?.commercialResidential ?? "all",
    rep: filters?.rep ?? "all",
  };
}

export async function loadExecutivePipelineDashboard(
  filters?: DashboardFilters,
  env: RuntimeEnv = getRuntimeEnv(),
  now: Date = new Date(),
): Promise<ExecutivePipelineDashboard> {
  const resolvedFilters = resolveFilters(filters);
  const { client, config } = createServerSupabaseClient(env);

  if (!client) {
    return degradedDashboard("unconfigured", config.missing.map((name) => `Missing ${name}`), resolvedFilters, now);
  }

  try {
    const [pipeline, jobs, financialsRaw, invoiceMatches, invoiceLines, watermarks, accounts] = await Promise.all([
      selectAll<PipelineRow>(
        client,
        "crm_pipeline",
        "id,acculynx_job_id,job_name,location_city,location_state,market,current_milestone,primary_salesperson,contract_amount,primary_estimate_amount,balance_due,lead_date,approved_date,milestone_date,created_at,updated_at,insurance_company,insurance_claim_number,insurance_claim_filed,insurance_claim_filed_date,insurance_date_of_loss,parent_lead_source,sub_lead_source,data_source",
      ),
      selectAll<AcculynxJobRow>(client, "acculynx_jobs", "id,account_key,job_category_name"),
      // acculynx_job_financials has 0% production coverage as of RESEARCH.md (1 archived
      // sandbox row) — try-row-then-fallback per Pitfall 1; re-verified live at
      // implementation time (see SUMMARY.md for the observed numbers).
      selectAll<{ job_id: string; worksheet_total: number | string | null; archived_at: string | null }>(
        client,
        "acculynx_job_financials",
        "job_id,worksheet_total,archived_at",
        (query) => query.is("archived_at", null),
      ),
      selectAll<InvoiceMatchRow>(
        client,
        "v_invoice_acculynx_match",
        "invoice_number,acculynx_job_id,matched",
        (query) => query.eq("matched", true),
      ),
      selectAll<AbcInvoiceLineRow>(client, "abc_invoice_lines", "invoice_number,extended_price"),
      selectAll<WatermarkRow>(client, "acculynx_sync_watermark", "account_key,last_sync_at"),
      selectAll<AcculynxAccountRow>(client, "acculynx_accounts", "account_key,label,program,market,state"),
    ]);

    // Job-financials primary margin source: no true GP field is populated in
    // production (verified live at implementation time — see SUMMARY.md). Model
    // it as a Map keyed by job_id so computeMarginByDimension's primary path
    // is exercised only when a real, non-archived row with cost data exists.
    const financialsByJobId = new Map<string, { grossProfit: number }>();
    for (const row of financialsRaw) {
      const worksheetTotal = toNumber(row.worksheet_total);
      if (worksheetTotal > 0) {
        financialsByJobId.set(row.job_id, { grossProfit: worksheetTotal });
      }
    }

    // Fallback cost path: sum invoice-line extended_price per invoice_number,
    // then attribute to the job via v_invoice_acculynx_match's matched rows.
    const costByInvoiceNumber = new Map<string, number>();
    for (const line of invoiceLines) {
      const current = costByInvoiceNumber.get(line.invoice_number) ?? 0;
      costByInvoiceNumber.set(line.invoice_number, current + toNumber(line.extended_price));
    }

    const invoiceCostByJobId = new Map<string, number>();
    for (const match of invoiceMatches) {
      if (!match.acculynx_job_id) continue;
      const cost = costByInvoiceNumber.get(match.invoice_number) ?? 0;
      const current = invoiceCostByJobId.get(match.acculynx_job_id) ?? 0;
      invoiceCostByJobId.set(match.acculynx_job_id, current + cost);
    }

    const { start, end, label } = windowRange(resolvedFilters.window, now);

    // Checkpoint round 3, item 2 (supersedes round 2's closed/paid-in-full exclusion):
    // exclude dead/cancelled jobs from the ENTIRE dataset before any filter bar or
    // aggregation runs — one filter point upstream of the D-13/rep filters below.
    const activePipeline = excludeClosedAndPaidInFull(pipeline);

    // Item 6: distinct assigned reps present in the (post-exclusion) data, for the
    // Rep filter dropdown. Sourced from crm_pipeline.primary_salesperson — verified
    // live as the only populated assigned-rep-shaped field (see SUMMARY.md for
    // coverage numbers); acculynx_jobs carries no assigned-user field at all.
    const knownReps = Array.from(
      new Set(activePipeline.map((row) => compact(row.primary_salesperson, "")).filter((name) => name.length > 0)),
    ).sort((a, b) => a.localeCompare(b));

    // Apply the D-13 global filter bar (account_key / commercial-residential / rep)
    // before computing any KPI — every KPI, chart, and drill-down obeys the filter bar.
    const filteredPipeline = activePipeline.filter((row) => {
      const derived = deriveRegionOffice(row, jobs);
      if (resolvedFilters.accountKey !== "all" && derived.accountKey !== resolvedFilters.accountKey) return false;
      if (
        resolvedFilters.commercialResidential !== "all" &&
        derived.commercialResidential !== resolvedFilters.commercialResidential
      ) {
        return false;
      }
      if (resolvedFilters.rep !== "all" && compact(row.primary_salesperson, "Unassigned") !== resolvedFilters.rep) {
        return false;
      }
      return true;
    });

    const funnel = groupPipelineFunnel(filteredPipeline);
    const closeRate = computeCloseRate(filteredPipeline, start, end);
    const newLeadsCount = filteredPipeline.filter((row) => {
      const milestone = compact(row.current_milestone, "").toLowerCase();
      const date = toDate(row.lead_date ?? row.created_at);
      return LEAD_MILESTONES.has(milestone) && Boolean(date && date >= start && date < addDays(end, 1));
    }).length;

    // Item 3: the headline "pipeline value" KPI is the pre-close pipeline value
    // (prospects-with-estimate summed value) — NOT amountFor() over the whole
    // filtered set. Point-in-time KPIs (pipeline value, AR) ignore the window per D-03.
    const queuesAll = computeQueueValues(filteredPipeline);
    const pipelineValueTotal = preClosePipelineValue(queuesAll);
    const arTotal = filteredPipeline.reduce((sum, row) => sum + toNumber(row.balance_due), 0);

    // Item 4: every headline KPI splits Residential vs Commercial, segmented BY
    // ACCOUNT (multi_family_commercial = commercial; everything else = residential).
    const residentialRows = filteredPipeline.filter((row) => deriveSegment(row, jobs) === "residential");
    const commercialRows = filteredPipeline.filter((row) => deriveSegment(row, jobs) === "commercial");

    const pipelineValueSplit: SegmentSplit = {
      residential: preClosePipelineValue(computeQueueValues(residentialRows)),
      commercial: preClosePipelineValue(computeQueueValues(commercialRows)),
    };

    const closeRateResidential = computeCloseRate(residentialRows, start, end);
    const closeRateCommercial = computeCloseRate(commercialRows, start, end);
    const soldValueSplit: SegmentSplit = {
      residential: closeRateResidential.soldValue,
      commercial: closeRateCommercial.soldValue,
    };
    const jobsSoldSplit: SegmentSplit = {
      residential: closeRateResidential.soldCount,
      commercial: closeRateCommercial.soldCount,
    };

    const newLeadsSplit: SegmentSplit = {
      residential: residentialRows.filter((row) => {
        const milestone = compact(row.current_milestone, "").toLowerCase();
        const date = toDate(row.lead_date ?? row.created_at);
        return LEAD_MILESTONES.has(milestone) && Boolean(date && date >= start && date < addDays(end, 1));
      }).length,
      commercial: commercialRows.filter((row) => {
        const milestone = compact(row.current_milestone, "").toLowerCase();
        const date = toDate(row.lead_date ?? row.created_at);
        return LEAD_MILESTONES.has(milestone) && Boolean(date && date >= start && date < addDays(end, 1));
      }).length,
    };

    // Item 7: close rate splits are the count-based snapshot formula (window-
    // independent), same as the location/rep close rates.
    const closeRateSplit: SegmentSplit = {
      residential: computeSnapshotCloseRate(residentialRows),
      commercial: computeSnapshotCloseRate(commercialRows),
    };

    const averageTicket = computeAverageTicket(filteredPipeline, jobs, start, end);

    const marginByRegion = computeMarginByDimension(
      filteredPipeline,
      jobs,
      financialsByJobId,
      invoiceCostByJobId,
      (row, jobRows) => deriveRegionOffice(row, jobRows).accountKey,
    );
    const marginByOffice = marginByRegion; // office === account_key for v1 (Open Question 3: peer entries)
    const marginByCommercialResidential = computeMarginByDimension(
      filteredPipeline,
      jobs,
      financialsByJobId,
      invoiceCostByJobId,
      (row, jobRows) => deriveRegionOffice(row, jobRows).commercialResidential,
    );
    const marginByRep = computeMarginByDimension(
      filteredPipeline,
      jobs,
      financialsByJobId,
      invoiceCostByJobId,
      (row) => compact(row.primary_salesperson, "Unassigned"),
    );

    // Item 4: margin % split by segment, weighted the same way the overall/location
    // margin caption is (dollar-weighted average of jobs-with-cost-data).
    const marginPctFor = (rows: PipelineRow[]): number => {
      const byAll = computeMarginByDimension(rows, jobs, financialsByJobId, invoiceCostByJobId, () => "all");
      return byAll[0]?.marginPct ?? 0;
    };
    const marginPctSplit: SegmentSplit = {
      residential: marginPctFor(residentialRows),
      commercial: marginPctFor(commercialRows),
    };

    const soldRows = filteredPipeline.filter((row) => {
      const milestone = compact(row.current_milestone, "").toLowerCase();
      const date = toDate(row.approved_date ?? row.milestone_date ?? row.updated_at);
      return SOLD_MILESTONES.has(milestone) && Boolean(date && date >= start && date < addDays(end, 1));
    });

    const leaderboardMap = new Map<string, LeaderboardRow>();
    // Checkpoint round 4, item 1: soldRows grouped by rep, so the leaderboard's
    // stacked-bar collected/AR split can be computed from the SAME row set that
    // produced each rep's soldValue (never a different window/filter).
    const soldRowsByRep = new Map<string, PipelineRow[]>();
    for (const row of soldRows) {
      const salesperson = compact(row.primary_salesperson, "Unassigned");
      const entry = leaderboardMap.get(salesperson) ?? { salesperson, soldCount: 0, soldValue: 0, arBalance: 0 };
      entry.soldCount += 1;
      entry.soldValue += amountFor(row);
      leaderboardMap.set(salesperson, entry);

      const soldList = soldRowsByRep.get(salesperson) ?? [];
      soldList.push(row);
      soldRowsByRep.set(salesperson, soldList);
    }
    for (const row of filteredPipeline) {
      const balance = toNumber(row.balance_due);
      if (balance <= 0) continue;
      const salesperson = compact(row.primary_salesperson, "Unassigned");
      const entry = leaderboardMap.get(salesperson) ?? { salesperson, soldCount: 0, soldValue: 0, arBalance: 0 };
      entry.arBalance += balance;
      leaderboardMap.set(salesperson, entry);
    }

    // Item 6/7: "assigned Close Rate" per rep — count-based snapshot formula, keyed
    // on the SAME assigned-rep field (primary_salesperson) the leaderboard already
    // groups by, computed over that rep's full (window-independent) row set.
    const rowsByRep = new Map<string, PipelineRow[]>();
    for (const row of filteredPipeline) {
      const salesperson = compact(row.primary_salesperson, "Unassigned");
      const list = rowsByRep.get(salesperson) ?? [];
      list.push(row);
      rowsByRep.set(salesperson, list);
    }
    const leaderboard: RepLeaderboardRow[] = Array.from(leaderboardMap.values())
      .map((row) => ({ ...row, closeRateSnapshot: computeSnapshotCloseRate(rowsByRep.get(row.salesperson) ?? []) }))
      .sort((a, b) => b.soldValue - a.soldValue);

    // Checkpoint round 4, item 1: stacked-chart collected/AR split data, built from
    // the SAME funnel/leaderboard rows above so stage order, rep order, and totals
    // never diverge between the existing charts and the new stacked variants.
    const funnelWithSplit = computeFunnelStagesWithSplit(filteredPipeline);
    const leaderboardWithSplit = computeLeaderboardWithSplit(leaderboard, soldRowsByRep);

    // Checkpoint round 4, item 2: trailing-7-day pill row — fixed window anchored at
    // `now`, computed over filteredPipeline so it obeys the D-13 filter bar but
    // ignores the D-03 window-selector token entirely (user's explicit decision).
    const trailing7d = computeTrailing7dTotals(filteredPipeline, now);

    const locationRollup = computeLocationRollup(filteredPipeline, jobs, KNOWN_ACCOUNT_KEYS, start, end);

    // Freshness badges: use every KNOWN production account so a location with zero jobs
    // still shows an honest (likely critical/no-sync) badge. Excludes any non-production
    // account row (e.g. "sandbox") that may exist in acculynx_accounts but is not one of
    // the 8 real business locations (checkpoint rework directive 3).
    const knownAccountKeySet = new Set<string>(KNOWN_ACCOUNT_KEYS);
    const watermarkByAccount = new Map(watermarks.map((w) => [w.account_key, w.last_sync_at]));
    const freshnessInputs: FreshnessInput[] = accounts
      .filter((account) => knownAccountKeySet.has(account.account_key))
      .map((account) => ({
        accountKey: account.account_key,
        lastSyncAt: watermarkByAccount.get(account.account_key) ?? null,
      }));
    const freshness = computeFreshnessBadges(freshnessInputs, now);

    return {
      status: "live",
      generatedAt: now.toISOString(),
      errors: [],
      filters: resolvedFilters,
      window: { start: start.toISOString(), end: end.toISOString(), label },
      funnel,
      funnelWithSplit,
      closeRate,
      newLeadsCount,
      marginByRegion,
      marginByOffice,
      marginByCommercialResidential,
      marginByRep,
      leaderboard,
      leaderboardWithSplit,
      trailing7d,
      locationRollup,
      arTotal,
      freshness,
      pipelineValueTotal,
      pipelineValueSplit,
      soldValueSplit,
      jobsSoldSplit,
      newLeadsSplit,
      closeRateSplit,
      marginPctSplit,
      averageTicket,
      knownReps,
    };
  } catch (error) {
    return degradedDashboard(
      "degraded",
      [error instanceof Error ? error.message : "Executive pipeline dashboard query failed"],
      resolvedFilters,
      now,
    );
  }
}

// ---------------------------------------------------------------------------
// SSR loader: per-location job drill-down (D-09 checkpoint gap — Task 6 rework)
// ---------------------------------------------------------------------------

/** Loads the job-level rows for ONE production location (account_key), applying the
 * optional commercial/residential and rep filters. `accountKey` MUST already be
 * allowlist-validated by the caller (the API route) against KNOWN_ACCOUNT_KEYS —
 * this function does not re-validate, it trusts the caller per the route's
 * allowlist gate. `rep`, when provided, MUST already be validated by the caller
 * against the dashboard's own knownReps list (item 6/route allowlist discipline). */
export async function loadJobsForLocation(
  accountKey: string,
  commercialResidential: string | "all" = "all",
  env: RuntimeEnv = getRuntimeEnv(),
  rep: string | "all" = "all",
): Promise<{ status: DashboardStatus; jobs: JobDrillRow[]; error: string | null }> {
  const { client, config } = createServerSupabaseClient(env);

  if (!client) {
    return { status: "unconfigured", jobs: [], error: config.missing.map((name) => `Missing ${name}`).join(", ") };
  }

  try {
    const [pipeline, jobs] = await Promise.all([
      selectAll<PipelineRow>(
        client,
        "crm_pipeline",
        "id,acculynx_job_id,job_name,location_city,location_state,market,current_milestone,primary_salesperson,contract_amount,primary_estimate_amount,balance_due,lead_date,approved_date,milestone_date,created_at,updated_at,insurance_company,insurance_claim_number,insurance_claim_filed,insurance_claim_filed_date,insurance_date_of_loss,parent_lead_source,sub_lead_source,data_source",
      ),
      selectAll<AcculynxJobRow>(client, "acculynx_jobs", "id,account_key,job_category_name"),
    ]);

    return { status: "live", jobs: jobRowsForLocation(pipeline, jobs, accountKey, commercialResidential, rep), error: null };
  } catch (error) {
    return { status: "degraded", jobs: [], error: error instanceof Error ? error.message : "Job drill-down query failed" };
  }
}
