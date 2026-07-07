import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardStatus = "live" | "degraded" | "unconfigured";

/** Round 3 (user spec, item A): the unified, calendar-anchored window selector.
 * Replaces the prior {this_week, last_7_days, mtd, qtd} set — "This Week" was a
 * rolling/ambiguous label and "Last 7 Days" is superseded by the always-on
 * trailing-7-day pill row (item C), so neither survives as a selector option.
 * Default is "mtd" (Month-to-Date). All four options are calendar-anchored
 * (start of week/month/quarter/year through "now"), never rolling windows. */
export type WindowToken = "wtd" | "mtd" | "qtd" | "ytd";

export interface DashboardFilters {
  /** Round 3 (user spec, item A): the unified window selector — default "mtd". */
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
  /** Fix round item 3 (2026-07-02): the client-ish name AccuLynx job names parse out
   * (parseJobName's `rest` in the sync's buildPipelineRow) — used as a display-name
   * fallback when job_name itself is empty or purely a numeric job number. */
  client_name: string | null;
  /** Fix round item 3: the AccuLynx job number (may itself be purely numeric) — used
   * for the "Unnamed job (job_number)" display fallback, never shown bare as a name. */
  client_job_number: string | null;
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
  /** Fix round item 4 (2026-07-02): the 7-pill trailing-7-calendar-day row
   * (Lead->Prospect, Prospect->Approved, Approved->Invoiced, Invoiced->Closed, Total
   * Outstanding AR, Highest AR Aging, Total Monies Collected this week) — supersedes
   * the prior 5-pill computeTrailing7dTotals shape. Fixed window, independent of the
   * selector; obeys the D-13 filter bar. */
  trailing7d: Trailing7dPillsV2;
  locationRollup: LocationRollupRow[];
  arTotal: number;
  /** The job behind trailing7d.highestArAgingJobId, resolved to its job number +
   * account_key so the Highest AR Aging pill can deep-link and un-nest to it in the
   * per-office drill-down (2026-07-07). null when there is no oldest open invoice. */
  highestArAgingJob: { jobId: string; jobNumber: string | null; accountKey: string } | null;
  freshness: FreshnessBadge[];
  /** Headline "pipeline value" KPI = the pre-close pipeline value (item 3). */
  pipelineValueTotal: number;
  /** Checkpoint round 3, item 4: Res/Com splits for every headline KPI. */
  pipelineValueSplit: SegmentSplit;
  soldValueSplit: SegmentSplit;
  jobsSoldSplit: SegmentSplit;
  newLeadsSplit: SegmentSplit;
  closeRateSplit: SegmentSplit;
  /** AR-truth fix (2026-07-03, user-approved fix 4): the headline Close Rate is the
   * job-count-weighted overall snapshot rate (computeSnapshotCloseRate over the full
   * filtered — not windowed — pipeline), NOT the unweighted mean of the Res/Com
   * segment rates (one commercial account must not counterweight seven residential). */
  closeRateSnapshotOverall: number;
  marginPctSplit: SegmentSplit;
  /** Per-segment cost-data coverage (jobsWithCostData) for the Margin % split, so the
   * UI can render "—" (not a misleading "0%") for a segment with no cost data at all
   * (2026-07-07). */
  marginCoverageSplit: SegmentSplit;
  averageTicket: AverageTicketResult;
  /** "Signed (7d)": jobs signed (entered Approved) in the trailing 7 days, obeying the
   * filter bar but NOT the window selector (2026-07-07 user request). */
  signed7d: Signed7dResult;
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
  /** Round 3, item E: Outstanding AR column — balance_due, floored at 0 (same
   * convention as outstandingArFor elsewhere in this module). */
  outstandingAr: number;
}

/** Fix round item 2 (2026-07-02, user feedback: "only jobs with value should show"):
 * jobRowsForLocation's result — the visible (positive-value) rows plus an honest count
 * of how many zero-value jobs were hidden from the list, so the drill-down's row count
 * never silently disagrees with the location's queue counts (which stay unchanged —
 * they are queue counts, not "rows visible in this table"). */
export interface JobDrillResult {
  rows: JobDrillRow[];
  /** Count of jobs matching the same location/type/rep filters that were excluded
   * from `rows` for having $0 value (contractAmount <= 0) — never silently dropped,
   * always surfaced so the UI can render "N zero-value jobs hidden". */
  hiddenZeroValueCount: number;
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

/** VERIFICATION gap 8 (07-07): crm_pipeline can carry both a legacy `csv_initial` row
 * and a live `api_sync` row for the same underlying AccuLynx job (e.g. KS-11: a
 * stale-valued csv_initial row plus a $0/unassigned api_sync row). Every KPI must
 * count each job once. Rows sharing a non-null acculynx_job_id are collapsed to a
 * single row, preferring data_source === "api_sync" over any other value (falls back
 * to the first row seen if no api_sync row exists in the group). Rows with a null
 * acculynx_job_id have no join key to merge on and are passed through unchanged —
 * collapsing them together would silently drop distinct legacy jobs. Must run BEFORE
 * any KPI aggregation (funnel counts, pipeline value, close rate, etc.). */
export function dedupePipeline(rows: PipelineRow[]): PipelineRow[] {
  const byJobId = new Map<string, PipelineRow>();
  const unkeyed: PipelineRow[] = [];

  for (const row of rows) {
    if (!row.acculynx_job_id) {
      unkeyed.push(row);
      continue;
    }
    const existing = byJobId.get(row.acculynx_job_id);
    if (!existing) {
      byJobId.set(row.acculynx_job_id, row);
      continue;
    }
    if (row.data_source === "api_sync" && existing.data_source !== "api_sync") {
      byJobId.set(row.acculynx_job_id, row);
    }
    // Otherwise keep `existing` — either it's already api_sync, or neither row is
    // api_sync and the first-seen row wins (fallback per <action> spec).
  }

  return [...unkeyed, ...byJobId.values()];
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

/** True when a trimmed string is entirely digits/dashes (checkpoint fix round item 3
 * live diagnosis: crm_pipeline.job_name falls back to the raw AccuLynx job_number —
 * `job.job_name || job.job_number || "(unnamed)"` in the sync's buildPipelineRow —
 * whenever AccuLynx's own jobName field is empty. AccuLynx job numbers are frequently
 * bare digit strings (e.g. "48213"), which rendered as a "weird number" in place of a
 * job name in the drill-down/leaderboard tables). Matches a purely numeric string, or
 * a numeric string with internal dashes (e.g. "482-13"), so a job number is never
 * mistaken for a real client-ish name. */
function isPureNumericLabel(value: string): boolean {
  return /^[0-9][0-9-]*$/.test(value);
}

/** Fix round item 3 (2026-07-02, user feedback: "what's with the weird numbers for
 * names"): the DISPLAY-layer fallback chain for a job's name, applied AFTER the sync
 * has already written crm_pipeline.job_name (never changes the stored value — this is
 * presentation only, so no backfill/migration is required to fix historical rows).
 *
 * Convention (documented per the fix round's "pick the clean convention" instruction):
 *   1. A real, non-empty, non-purely-numeric job_name is used as-is (the common case).
 *   2. A job_name that IS purely numeric/dash (i.e. AccuLynx's own jobName was empty
 *      and buildPipelineRow's `|| job.job_number` fallback kicked in) is treated the
 *      same as "no name" — never shown bare — and instead renders
 *      "client_name · job_number" when client_name is available, else
 *      "Unnamed job (job_number)".
 *   3. A genuinely empty job_name (should be rare — buildPipelineRow's own fallback
 *      chain ends in "(unnamed)") falls back the same way as case 2.
 */
export function formatJobDisplayName(row: Pick<PipelineRow, "job_name" | "client_name" | "client_job_number">): string {
  const jobName = String(row.job_name ?? "").trim();
  const isRealName = jobName.length > 0 && jobName !== "(unnamed)" && !isPureNumericLabel(jobName);
  if (isRealName) return jobName;

  const clientName = String(row.client_name ?? "").trim();
  const jobNumber = String(row.client_job_number ?? "").trim() || jobName; // job_name IS the number in the fallback case

  if (clientName.length > 0 && !isPureNumericLabel(clientName)) {
    return jobNumber.length > 0 ? `${clientName} · ${jobNumber}` : clientName;
  }
  return jobNumber.length > 0 ? `Unnamed job (${jobNumber})` : "Unnamed job";
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

function startOfYear(value: Date) {
  return new Date(value.getFullYear(), 0, 1);
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

/** Splits a row set's total value into "collected" (value - open-invoice AR, floored
 * at 0) and "arOutstanding" (summed open-invoice AR per row — the acculynx_invoices
 * ledger, per the AR-truth fix; crm_pipeline.balance_due is retired as an AR signal).
 * `value` is the same amountFor()-derived total the funnel/leaderboard already chart —
 * this function does not recompute it, callers pass their own summed value so the
 * split always agrees with the bar's total height. `arByJobId` is optional so
 * chart callers without invoice data render a fully-collected bar (never a
 * crm-balance-derived AR segment). */
function splitCollectedAr(rows: PipelineRow[], value: number, arByJobId?: Map<string, number>): CollectedArSplit {
  const arOutstanding = arByJobId ? rows.reduce((sum, row) => sum + arForRow(row, arByJobId), 0) : 0;
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

export function computeFunnelStagesWithSplit(rows: PipelineRow[], arByJobId?: Map<string, number>): FunnelStageWithSplit[] {
  const stages = groupPipelineFunnel(rows);
  const rowsByMilestone = new Map<string, PipelineRow[]>();
  for (const row of rows) {
    const milestone = compact(row.current_milestone, "unknown").toLowerCase();
    const list = rowsByMilestone.get(milestone) ?? [];
    list.push(row);
    rowsByMilestone.set(milestone, list);
  }

  return stages.map((stage) => {
    const split = splitCollectedAr(rowsByMilestone.get(stage.milestone) ?? [], stage.value, arByJobId);
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
  arByJobId?: Map<string, number>,
): LeaderboardRowWithSplit[] {
  return leaderboard.map((row) => {
    const split = splitCollectedAr(soldRowsByRep.get(row.salesperson) ?? [], row.soldValue, arByJobId);
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

// ---------------------------------------------------------------------------
// Round 3, item A: unified window semantics — one date model shared by every
// KPI, chart, table, and drop-down (except the trailing-7 pills, item C, which
// are intentionally NOT windowed by the selector).
//
// STAGE-DATE MAPPING (documented per the user's instruction to "document the
// mapping in code" — this is the SINGLE source of truth every windowed
// aggregation in this module must call through, so the mapping is never
// silently reimplemented differently in two places):
//   leads      -> lead_date, falling back to created_at (no dedicated lead-
//                 entry column; created_at is the row's own crm_pipeline
//                 ingestion date, the closest available proxy).
//   prospects  -> lead_date, falling back to created_at (crm_pipeline carries
//                 no dedicated "entered prospect" column; same convention
//                 computeTrailing7dTotals already used for the prospects
//                 queue's own date signal).
//   approved   -> approved_date, falling back to milestone_date, falling back
//                 to updated_at (the milestone_date column is the row's most
//                 recent milestone-entry timestamp; updated_at is the final,
//                 always-populated fallback).
//   invoiced   -> milestone_date, falling back to updated_at (crm_pipeline has
//                 no dedicated invoiced_date column; milestone_date already
//                 tracks "date entered current milestone" for whatever the
//                 row's current_milestone is, which for an invoiced row IS the
//                 invoiced-entry date).
//   closed     -> milestone_date, falling back to updated_at (same convention
//                 as invoiced — milestone_date is the closed-entry date for a
//                 row whose current_milestone is "closed").
// ---------------------------------------------------------------------------

/** ORCHESTRATOR INTERPRETATION NOTE (flagged per the user's spec): leads and
 * prospects are windowed by lead_date/created_at (no better signal exists in
 * crm_pipeline); approved/invoiced/closed use approved_date/milestone_date/
 * updated_at per the mapping above. Only closed/invoiced jobs get the AR
 * exception (item A) — leads/prospects/approved are windowed strictly by their
 * own stage date with no exception. */
export function stageDateFor(row: PipelineRow, queue: QueueName): Date | null {
  switch (queue) {
    case "leads":
    case "prospects":
      return toDate(row.lead_date ?? row.created_at);
    case "approved":
      return toDate(row.approved_date ?? row.milestone_date ?? row.updated_at);
    case "invoiced":
    case "closed":
      return toDate(row.milestone_date ?? row.updated_at);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Milestone-history-backed stage dates (2026-07-06 rebuild — user-approved).
//
// ROOT CAUSE THIS REPLACES: stageDateFor above falls back to updated_at/created_at
// (the last-sync timestamp, always "now") whenever a job has no real stage date, so
// every undated job lands inside any calendar window — the exact defect that made
// YTD "sold value" read like all-time. acculynx_job_milestone_history carries the
// REAL, dated stage transitions (Lead/Prospect/Approved/Completed/Invoiced/Closed)
// for ~98% of jobs, so it is the single source of truth for "when did this job enter
// this stage". These helpers window every KPI on that real date and NEVER fall back
// to updated_at/created_at — an undated job is simply excluded from windowed KPIs
// (surfaced via coverage), never dated to the sync clock.
// ---------------------------------------------------------------------------

/** Per job: the earliest real date it entered each queue-stage, from milestone
 * history. `Partial` because a job only has dates for the stages it has reached. */
export type StageEntryDates = Map<string, Partial<Record<QueueName, Date>>>;

/** History milestone_name (case-insensitive) -> the dashboard queue it belongs to.
 * "completed" folds into the approved queue, matching queueForRow's convention. */
const HISTORY_STAGE_TO_QUEUE: Record<QueueName, Set<string>> = {
  leads: new Set(["lead", "unassigned_lead", "assigned_lead"]),
  prospects: new Set(["prospect"]),
  approved: new Set(["approved", "completed"]),
  invoiced: new Set(["invoiced"]),
  closed: new Set(["closed"]),
};

/** Builds the per-job stage-entry-date map from raw milestone-history rows. For each
 * (job, queue) it keeps the EARLIEST dated transition (the date the job first entered
 * that stage). Rows with no job_id, no parseable date, or a milestone_name that maps
 * to no queue (e.g. "Cancelled") are ignored — cancellation is an exclusion, not a
 * windowable stage. */
export function buildStageEntryDates(history: MilestoneHistoryRow[]): StageEntryDates {
  const map: StageEntryDates = new Map();
  for (const h of history) {
    if (!h.job_id) continue;
    const date = toDate(h.milestone_date);
    if (!date) continue;
    const name = compact(h.milestone_name, "").toLowerCase();

    let queue: QueueName | null = null;
    for (const q of Object.keys(HISTORY_STAGE_TO_QUEUE) as QueueName[]) {
      if (HISTORY_STAGE_TO_QUEUE[q].has(name)) {
        queue = q;
        break;
      }
    }
    if (!queue) continue;

    const entry = map.get(h.job_id) ?? {};
    const existing = entry[queue];
    if (!existing || date < existing) entry[queue] = date;
    map.set(h.job_id, entry);
  }
  return map;
}

/** History-aware replacement for stageDateFor: the date a row entered its queue-stage,
 * preferring the real milestone-history date, then a REAL crm column (lead_date /
 * approved_date / milestone_date) — and DELIBERATELY never updated_at or created_at.
 * Returns null when no real date exists (job is "undated" and drops out of windowed
 * KPIs), rather than silently dating it to the last sync. */
export function stageEntryDateFor(row: PipelineRow, queue: QueueName, stageDates?: StageEntryDates): Date | null {
  const jobId = row.acculynx_job_id;
  const fromHistory = jobId ? stageDates?.get(jobId)?.[queue] : undefined;
  if (fromHistory) return fromHistory;

  switch (queue) {
    case "leads":
    case "prospects":
      return toDate(row.lead_date);
    case "approved":
      return toDate(row.approved_date ?? row.milestone_date);
    case "invoiced":
    case "closed":
      return toDate(row.milestone_date);
    default:
      return null;
  }
}

/** Round 3, item A AR exception — REWORKED by the AR-truth fix (2026-07-03,
 * user-approved fix 2). The exception now covers ANY job with an open invoice:
 * - A job with open-invoice AR > 0 (per `arByJobId`, the acculynx_invoices-derived
 *   map) stays visible regardless of its stage date or queue — verified live that
 *   the entire open-invoice AR book sits on approved/completed-milestone jobs, so
 *   the prior invoiced/closed-only exception hid every job that actually owed money.
 * - Every other job is windowed strictly by its own stage date (the round-3
 *   stage-date mapping above) — crm_pipeline.balance_due no longer grants an
 *   exception (retired as an AR signal, fix 1).
 * `arByJobId` is optional so pure date-window callers/tests can omit it (no map =
 * no AR exception, never a fabricated one from crm balance_due).
 * Assumes dead/cancelled rows have already been excluded from `rows` (item 2,
 * unchanged from round 2/3). Rows with an unrecognized/null queue (queueForRow
 * returns null) are excluded — same "never fabricate a bucket" discipline as
 * every other aggregation in this module. */
export function isRowInWindow(
  row: PipelineRow,
  start: Date,
  end: Date,
  arByJobId?: Map<string, number>,
  stageDates?: StageEntryDates,
): boolean {
  const queue = queueForRow(row);
  if (!queue) return false;

  // AR exception (fix 2): money is still owed on an open invoice — the job stays
  // visible in its queue regardless of stage date.
  if (arByJobId && arForRow(row, arByJobId) > 0) return true;

  const inWindow = (date: Date | null) => Boolean(date && date >= start && date < addDays(end, 1));
  // 2026-07-06 rebuild: when a stage-entry-date map is supplied (production always
  // supplies it), window on the REAL milestone-history date with no updated_at
  // fallback. Legacy callers/tests that omit it keep the prior stageDateFor behavior.
  const date = stageDates ? stageEntryDateFor(row, queue, stageDates) : stageDateFor(row, queue);
  return inWindow(date);
}

/** Applies isRowInWindow to a row set — the single windowing filter point every
 * windowed aggregation (funnel, queue values, location rollup, leaderboard,
 * drill-down) calls, so the AR exception and stage-date mapping are never
 * reimplemented ad hoc at a second call site. */
export function filterRowsInWindow(
  rows: PipelineRow[],
  start: Date,
  end: Date,
  arByJobId?: Map<string, number>,
  stageDates?: StageEntryDates,
): PipelineRow[] {
  return rows.filter((row) => isRowInWindow(row, start, end, arByJobId, stageDates));
}

// ---------------------------------------------------------------------------
// Round 3, item B: unassigned + name rules — applies everywhere a rep/account
// bucket is displayed or aggregated (KPIs, leaderboard, rep filter, account
// bars, drill-downs).
// ---------------------------------------------------------------------------

/** True when a trimmed string LOOKS LIKE a real "First Last" human name, per the
 * user's regex-sanity instruction: a digit-run or hex/GUID-dash pattern, or the
 * absence of an alphabetic word pair, disqualifies it. A GUID/numeric-sequence
 * rep value (e.g. "3f9a1c2e-...", "00047213") is never treated as a name. */
export function looksLikeRepName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Disqualify: contains a run of 4+ digits anywhere (GUID segments, numeric IDs),
  // or a hex-dash GUID shape (8-4-4-4-12 or similar dash-separated hex groups).
  if (/\d{4,}/.test(trimmed)) return false;
  if (/^[0-9a-f]{4,}(-[0-9a-f]{2,}){2,}$/i.test(trimmed)) return false;
  // Require at least two alphabetic "words" (a first + last name pair) — a
  // single token (even a real word) is not a display-safe rep name here.
  const alphaWords = trimmed.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  return alphaWords.length >= 2;
}

/** Sentinel display label for a rep value that does not look like a real name
 * (item B: "kills the GUID entries on the leaderboard"). */
export const REP_UNKNOWN_LABEL = "[rep-unknown]";

/** Round 3, item B — the unified rep/account bucket for one row, applied
 * everywhere a rep is displayed or aggregated (KPIs, leaderboard, rep filter,
 * account bars, drill-downs):
 *   - unassigned (no primary_salesperson) AND no value (amountFor <= 0) ->
 *     null (the caller must exclude this row entirely — leads with no rep and
 *     no value are filtered out of view, not bucketed at all).
 *   - unassigned WITH value -> the account_key in brackets style the user
 *     showed (e.g. "colorado", "texas") — the account becomes the rep bucket.
 *   - assigned but the value doesn't look like "First Last" (GUID/numeric
 *     sequence) -> REP_UNKNOWN_LABEL ("[rep-unknown]").
 *   - assigned with a real-looking name -> the name, as-is.
 * `accountKey` is the row's already-derived deriveRegionOffice(...).accountKey
 * (callers already compute this for the location/segment filters, so this
 * function takes it directly rather than re-deriving it from `jobs`). */
export function repBucketFor(row: PipelineRow, accountKey: string): string | null {
  const rawRep = String(row.primary_salesperson ?? "").trim();
  const hasValue = amountFor(row) > 0;

  if (!rawRep) {
    return hasValue ? accountKey : null;
  }

  return looksLikeRepName(rawRep) ? rawRep : REP_UNKNOWN_LABEL;
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

/** Headline "Sold Value" (2026-07-06 rebuild — user decision: measure sales by CLOSE
 * DATE). A job counts as sold-in-window when its current status is Closed AND its real
 * Closed-milestone date (stageEntryDateFor, history-backed, no updated_at fallback)
 * falls in [start, end]. Value is counted ONCE via amountFor, in the Closed bucket
 * only — never cumulatively across approved/invoiced/closed. Approved/invoiced-but-not-
 * yet-closed jobs are in-progress pipeline (shown in the funnel) and are NOT counted as
 * sold until they close. Returns 0/0 when no closed job falls in the window. */
export function computeClosedInWindow(
  rows: PipelineRow[],
  start: Date,
  end: Date,
  stageDates?: StageEntryDates,
): { soldValue: number; soldCount: number } {
  let soldValue = 0;
  let soldCount = 0;
  for (const row of rows) {
    if (queueForRow(row) !== "closed") continue;
    const date = stageEntryDateFor(row, "closed", stageDates);
    if (!date || date < start || date >= addDays(end, 1)) continue;
    soldValue += amountFor(row);
    soldCount += 1;
  }
  return { soldValue, soldCount };
}

/** Result of computeSigned7d — jobs SIGNED (entered Approved) in the trailing 7 days. */
export interface Signed7dResult {
  count: number;
  value: number;
  countSplit: SegmentSplit;
}

/** "Signed (7d)" KPI (2026-07-07, user request): jobs whose contract was SIGNED — i.e.
 * entered the Approved milestone — within the trailing 7 calendar days, regardless of
 * their CURRENT milestone (a job signed 3 days ago that is already invoiced still
 * counts as signed this week). The signed date is the REAL Approved milestone-history
 * date (stageDates, which for the approved queue is the earliest Approved/Completed
 * transition), falling back to crm `approved_date`. milestone_date is deliberately NOT
 * a fallback here — for a job that has moved past Approved, milestone_date is the
 * current-stage date, not the signed date. Obeys the caller's filter set (`rows` =
 * the filter-bar-filtered pipeline) but is a FIXED trailing-7 window, independent of
 * the window selector — same convention as the trailing-7 transition pills. */
export function computeSigned7d(
  rows: PipelineRow[],
  jobs: AcculynxJobRow[],
  stageDates: StageEntryDates,
  now: Date,
): Signed7dResult {
  const { start, end } = trailing7DayRange(now);
  let count = 0;
  let value = 0;
  const countSplit: SegmentSplit = { residential: 0, commercial: 0 };

  for (const row of rows) {
    const jobId = row.acculynx_job_id;
    const signedDate = (jobId ? stageDates.get(jobId)?.approved : undefined) ?? toDate(row.approved_date);
    if (!signedDate || signedDate < start || signedDate >= end) continue;
    count += 1;
    value += contractAmountFor(row);
    if (deriveSegment(row, jobs) === "commercial") countSplit.commercial += 1;
    else countSplit.residential += 1;
  }

  return { count, value, countSplit };
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
 * value breakdown and a snapshot close rate; reworked again in Round 3 item A to trust
 * the caller's window): pipeline $ (pre-close pipeline value — prospects-with-estimate,
 * item 3), sold $/count, lead count, AR $, the five-queue value/count array, and the
 * window-independent snapshot close rate — one row per known account_key.
 *
 * Round 3, item A: `pipeline` is expected to ALREADY be the caller's window-filtered
 * row set (filterRowsInWindow — the AR-exception-aware unified window), so sold/lead
 * counts here are derived purely from queue membership (queueForRow), never a second,
 * independently-filtered date check. `start`/`end` are retained in the signature only
 * for the window-independent closeRateSnapshot's documentation/call-site continuity
 * and are otherwise unused by this function's own filtering. Assumes dead/cancelled
 * rows have already been excluded from `pipeline` (item 2). */
export function computeLocationRollup(
  pipeline: PipelineRow[],
  jobs: AcculynxJobRow[],
  accountKeys: readonly string[],
  _start: Date,
  _end: Date,
  arByJobId?: Map<string, number>,
): LocationRollupRow[] {
  return accountKeys.map((accountKey) => {
    const rows = pipeline.filter((row) => deriveRegionOffice(row, jobs).accountKey === accountKey);

    const queues = computeQueueValues(rows);
    const pipelineValue = preClosePipelineValue(queues);
    // AR-truth fix (2026-07-03): per-location AR is open-invoice AR, never crm balance_due.
    const arValue = arByJobId ? rows.reduce((sum, row) => sum + arForRow(row, arByJobId), 0) : 0;

    // 2026-07-07: per-location sold value = closed-in-window only (close-date
    // definition), consistent with the headline Sold Value KPI / computeClosedInWindow
    // — NOT all sold stages. `rows` is already the caller's window-filtered set, so a
    // "closed" row here is a job whose close date fell in the window.
    const soldRows = rows.filter((row) => queueForRow(row) === "closed");
    const soldValue = soldRows.reduce((sum, row) => sum + amountFor(row), 0);

    const leadCount = rows.filter((row) => queueForRow(row) === "leads").length;

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
 * visible queue, item 3), same filter point as the aggregate dashboard loader.
 *
 * Fix round item 2 (2026-07-02, user feedback: "way too many data gaps, how are jobs
 * with zero value showing, only jobs with value should show"): a job with contractAmount
 * <= 0 (amountFor() — the same max(contract_amount, primary_estimate_amount) fallback
 * used everywhere else in this module) is EXCLUDED from the visible `rows`, but still
 * counted in `hiddenZeroValueCount` so the UI can render an honest "N zero-value jobs
 * hidden" caption rather than silently shrinking the list. Aggregate queue counts
 * (computeQueueValues et al.) are UNCHANGED by this — they are queue-membership counts,
 * not "rows visible in this drill-down table", and the user's spec explicitly says those
 * stay as-is ("values already honest").
 *
 * Round 3, item E: rows now ALSO honor the same window rules as A/B — a job with no
 * outstanding AR whose own stage date falls outside [windowStart, windowEnd] is not
 * listed ("all revenue ever" disappears). `windowStart`/`windowEnd` are optional so
 * existing callers (and the pre-round-3 test suite) that don't pass a window keep the
 * prior window-independent behavior. */
export function jobRowsForLocation(
  pipeline: PipelineRow[],
  jobs: AcculynxJobRow[],
  accountKey: string,
  commercialResidential: string | "all" = "all",
  rep: string | "all" = "all",
  windowStart?: Date,
  windowEnd?: Date,
  arByJobId?: Map<string, number>,
  stageDates?: StageEntryDates,
): JobDrillResult {
  const filtered = excludeClosedAndPaidInFull(dedupePipeline(pipeline)).filter((row) => {
    const derived = deriveRegionOffice(row, jobs);
    if (derived.accountKey !== accountKey) return false;
    if (commercialResidential !== "all" && derived.commercialResidential !== commercialResidential) return false;
    if (windowStart && windowEnd && !isRowInWindow(row, windowStart, windowEnd, arByJobId, stageDates)) return false;

    const repBucket = repBucketFor(row, derived.accountKey);
    if (repBucket === null) return false; // unassigned + no value: filtered out of view entirely (item B)
    if (rep !== "all" && repBucket !== rep) return false;
    return true;
  });

  let hiddenZeroValueCount = 0;
  const rows: JobDrillRow[] = [];

  for (const row of filtered) {
    const contractAmount = amountFor(row);
    const outstandingAr = arByJobId ? arForRow(row, arByJobId) : 0;
    // Zero-value rows stay hidden — UNLESS the job has open-invoice AR (fix 2's
    // intent: the drill-down never hides a job that actually owes money).
    if (contractAmount <= 0 && outstandingAr <= 0) {
      hiddenZeroValueCount += 1;
      continue;
    }
    const derived = deriveRegionOffice(row, jobs);
    rows.push({
      acculynxJobId: row.acculynx_job_id,
      jobName: formatJobDisplayName(row),
      accountKey: derived.accountKey,
      milestone: compact(row.current_milestone, "unknown").toLowerCase(),
      contractAmount,
      salesperson: repBucketFor(row, derived.accountKey) ?? compact(row.primary_salesperson, "Unassigned"),
      // AR-truth fix (2026-07-03): the drill-down's Outstanding AR column is
      // open-invoice AR, never crm balance_due.
      outstandingAr,
    });
  }

  rows.sort((a, b) => b.contractAmount - a.contractAmount);

  return { rows, hiddenZeroValueCount };
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

/** Round 3 (user spec, item A): calendar-anchored window ranges. `end` is always
 * "today" (start-of-day, so the [start, end] convention used everywhere else in this
 * module — via addDays(end, 1) as the exclusive upper bound — includes all of today).
 * Default token (see resolveFilters) is "mtd". */
export function windowRange(token: WindowToken, now: Date): { start: Date; end: Date; label: string } {
  const end = startOfDay(now);
  switch (token) {
    case "wtd":
      return { start: startOfWeek(now), end, label: "Week-to-Date" };
    case "qtd":
      return { start: startOfQuarter(now), end, label: "Current Quarter" };
    case "ytd":
      return { start: startOfYear(now), end, label: "Year-to-Date" };
    case "mtd":
    default:
      return { start: startOfMonth(now), end, label: "Month-to-Date" };
  }
}

// ---------------------------------------------------------------------------
// Pure core: trailing-7-day totals pill row (checkpoint round 4, item 2)
// ---------------------------------------------------------------------------

/** ALWAYS a fixed trailing 7-calendar-day window anchored at `now` — deliberately
 * independent of the D-03/Round-3-item-A window-selector token (that is the entire
 * point of this pill row, and the ONE section item C exempts from the Window
 * selector: an always-current-at-a-glance strip that does not move when the user
 * changes the KPI/chart window). Uses the same [start, end) day-boundary convention
 * windowRange uses, so the two stay visually consistent, but this one is NEVER
 * driven by the selector. */
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
 * `rows` (same upstream filter point as every other aggregation in this module).
 *
 * SUPERSEDED by computeTrailing7dPillsV2 (fix round item 4, 2026-07-02) — retained
 * (unused by the dashboard loader) only because it is still directly unit-tested and
 * is cheap to keep as a documented prior contract; not removed per hard rule 1's
 * "archive or deprecate; never delete" spirit applied to code history/tests. */
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
// Pure core: trailing-7-day PILL ROW V2 (fix round item 4, 2026-07-02) — replaces
// the 5-pill row above with the 7 pills the user explicitly specified, normalized
// to the REAL AccuLynx milestone flow order (lead -> prospect -> approved ->
// invoiced -> closed; the user's own message inverted "approved/closed/invoiced" —
// this implementation uses the real order and documents the normalization here).
// ---------------------------------------------------------------------------

/** One row shape read from acculynx_job_milestone_history for transition detection. */
export interface MilestoneHistoryRow {
  job_id: string;
  milestone_name: string | null;
  milestone_date: string | null;
}

/** One row shape read from acculynx_invoices for AR aging + point-in-time AR total.
 * AR-truth fix (2026-07-03, user-approved fix 1): total_price is loaded alongside
 * balance_due so "monies collected" can be derived from the invoice ledger
 * (billed - outstanding) instead of crm_pipeline.balance_due. */
export interface InvoiceAgingRow {
  job_id: string;
  invoice_date: string | null;
  balance_due: number | string | null;
  total_price: number | string | null;
}

// ---------------------------------------------------------------------------
// AR-truth fix (2026-07-03, user-approved fixes 1+2): acculynx_invoices is the ONE
// AR source for every AR signal on the dashboard. crm_pipeline.balance_due is
// RETIRED as an AR signal — verified live 2026-07-03: it disagrees with the invoice
// ledger job-by-job ($3.19M on active rows incl. $1.94M on approved jobs, plus
// $2.42M on cancelled jobs), while acculynx_invoices matches AccuLynx AR aging
// exactly ($817,694.96 across 54 open invoices at audit time). Every open-invoice
// dollar sat on approved/completed-milestone jobs — none on invoiced/closed — so
// any AR signal keyed on crm balance_due plus an invoiced/closed-only exception
// reads near-zero while real money is outstanding.
// ---------------------------------------------------------------------------

/** Per-job open AR from the invoice ledger: summed balance_due, floored at 0 per
 * invoice (a credit/negative balance never nets down another invoice's open AR). */
export function openInvoiceArByJobId(invoices: InvoiceAgingRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const inv of invoices) {
    const balance = Math.max(0, toNumber(inv.balance_due));
    if (balance <= 0) continue;
    map.set(inv.job_id, (map.get(inv.job_id) ?? 0) + balance);
  }
  return map;
}

/** Per-job collected dollars from the invoice ledger: per-invoice
 * (total_price - balance_due), floored at 0 per invoice. A job with no invoices
 * has collected $0 — nothing billed means nothing collected (supersedes the prior
 * contract_amount - crm balance_due proxy, which inflated "collected" for
 * approved-but-never-invoiced jobs). */
export function collectedByJobId(invoices: InvoiceAgingRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const inv of invoices) {
    const collected = Math.max(0, toNumber(inv.total_price) - toNumber(inv.balance_due));
    if (collected <= 0) continue;
    map.set(inv.job_id, (map.get(inv.job_id) ?? 0) + collected);
  }
  return map;
}

/** A row's open-invoice AR (0 when the job has no open invoices or no job id). */
export function arForRow(row: Pick<PipelineRow, "acculynx_job_id">, arByJobId: Map<string, number>): number {
  return row.acculynx_job_id ? arByJobId.get(row.acculynx_job_id) ?? 0 : 0;
}

/** A transition pill: count + value of jobs that moved INTO the target stage within
 * the trailing 7 days, plus an optional dollar signal specific to that transition
 * (Monies Collected for Prospect->Approved; Outstanding AR for Approved->Invoiced and
 * Invoiced->Closed). `coverageNote` is always populated (never omitted) so the UI can
 * show "based on N of M jobs with history" whenever the milestone-history fallback
 * path was used for any row in this pill — required per the fix round's "Coverage
 * captions where history is sparse" instruction. */
export interface TransitionPill {
  count: number;
  value: number;
  /** Monies Collected (Prospect->Approved) or Outstanding AR (Approved->Invoiced,
   * Invoiced->Closed) for the jobs in this transition — null for Lead->Prospect
   * (the user's spec gives it only a count + value entering prospect, no secondary
   * dollar signal). */
  secondaryValue: number | null;
  /** "history" when every job counted here had a real acculynx_job_milestone_history
   * row for the target stage; "fallback" when at least one job used the
   * milestone_date-entered-current-stage fallback instead (sparse-history case). */
  source: "history" | "fallback" | "none";
  coverageNote: string;
}

export interface Trailing7dPillsV2 {
  leadToProspect: TransitionPill;
  prospectToApproved: TransitionPill;
  approvedToInvoiced: TransitionPill;
  invoicedToClosed: TransitionPill;
  /** Point-in-time (not windowed) total outstanding AR across every open invoice —
   * same convention as the existing headline arTotal KPI, but sourced from
   * acculynx_invoices.balance_due (item 4's own AR definition) rather than
   * crm_pipeline.balance_due, so this pill and the invoices table can never disagree
   * once both are populated. */
  totalOutstandingAr: number;
  /** Oldest open invoice's age in days (from acculynx_invoices.invoice_date, where
   * balance_due > 0) — 0 when there are no open invoices with a usable date. */
  highestArAgingDays: number;
  /** job_id of that oldest open invoice, for deep-linking the pill to the job
   * (2026-07-07) — null when there is no such invoice. */
  highestArAgingJobId: string | null;
  /** Sum of per-job invoice-ledger collected dollars (per-invoice total_price -
   * balance_due, floored — see collectedByJobId) for rows entering their current
   * stage within the SAME trailing-7-day window — "Monies Collected this week".
   * AR-truth fix (2026-07-03): supersedes the prior approvedJobValue - crm
   * balance_due proxy; a job with nothing billed collects $0. */
  totalMoniesCollectedThisWeek: number;
}

const EMPTY_TRANSITION_PILL: TransitionPill = {
  count: 0,
  value: 0,
  secondaryValue: null,
  source: "none",
  coverageNote: "No jobs in this window",
};

export const EMPTY_TRAILING_7D_V2: Trailing7dPillsV2 = {
  leadToProspect: { ...EMPTY_TRANSITION_PILL },
  prospectToApproved: { ...EMPTY_TRANSITION_PILL, secondaryValue: 0 },
  approvedToInvoiced: { ...EMPTY_TRANSITION_PILL, secondaryValue: 0 },
  invoicedToClosed: { ...EMPTY_TRANSITION_PILL, secondaryValue: 0 },
  totalOutstandingAr: 0,
  highestArAgingDays: 0,
  highestArAgingJobId: null,
  totalMoniesCollectedThisWeek: 0,
};

const MILESTONE_NAME_TARGETS: Record<"prospect" | "approved" | "invoiced" | "closed", Set<string>> = {
  prospect: new Set(["prospect"]),
  approved: new Set(["approved", "completed"]), // completed folds into approved, item 3 convention
  invoiced: new Set(["invoiced"]),
  closed: new Set(["closed"]),
};

/** Resolves, per job, the date it entered a target milestone — preferring a REAL
 * acculynx_job_milestone_history row (matched case-insensitively against the target's
 * milestone-name set) within the trailing-7-day window, and falling back to
 * milestone_date-entered-current-stage (the row's OWN crm_pipeline.milestone_date)
 * when no history row exists for that job/target at all. Returns
 * { date, usedFallback } per job so callers can build an honest coverage caption. */
function resolveTransitionDate(
  row: PipelineRow,
  target: "prospect" | "approved" | "invoiced" | "closed",
  historyByJobId: Map<string, MilestoneHistoryRow[]>,
): { date: Date | null; usedFallback: boolean } {
  const jobId = row.acculynx_job_id;
  const historyRows = jobId ? historyByJobId.get(jobId) ?? [] : [];
  const targetNames = MILESTONE_NAME_TARGETS[target];

  const matches = historyRows
    .filter((h) => targetNames.has(compact(h.milestone_name, "").toLowerCase()))
    .map((h) => toDate(h.milestone_date))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (matches.length > 0) {
    // Earliest matching history entry = the date the job FIRST entered this stage.
    return { date: matches[0], usedFallback: false };
  }

  // 2026-07-07 (user decision): HISTORY-ONLY. The trailing-7 pills are a pulse on
  // real worker activity, so a job with no milestone-history transition for this
  // target is NOT counted — the prior milestone_date fallback let a bulk/artifact
  // milestone_date (e.g. 71 jobs stamped 2026-07-04 with no Closed history) fake a
  // spike. No fallback: return null so the caller skips the row. Genuinely-recent
  // transitions appear once the hourly walk ingests them.
  return { date: null, usedFallback: false };
}

function buildCoverageNote(historyCount: number, fallbackCount: number): string {
  const total = historyCount + fallbackCount;
  if (total === 0) return "No jobs in this window";
  if (fallbackCount === 0) return `Based on ${total} of ${total} jobs with history`;
  return `Based on ${historyCount} of ${total} jobs with history`;
}

/** Lead->Prospect: count + value of jobs whose EARLIEST "Prospect" milestone-history
 * entry (or milestone_date fallback) falls in the trailing 7 days. Value = the
 * prospect queue's own valuation rule (estimate-required, item 3 convention) — "value
 * entering prospect" per the user's spec. No secondaryValue (spec gives this pill only
 * count + value). */
function computeLeadToProspectPill(
  rows: PipelineRow[],
  historyByJobId: Map<string, MilestoneHistoryRow[]>,
  start: Date,
  end: Date,
): TransitionPill {
  let count = 0;
  let value = 0;
  let historyHits = 0;
  let fallbackHits = 0;

  for (const row of rows) {
    if (queueForRow(row) !== "prospects") continue;
    const estimate = estimateAmountFor(row);
    if (estimate <= 0) continue; // prospects queue's own valuation rule (item 3)

    const { date, usedFallback } = resolveTransitionDate(row, "prospect", historyByJobId);
    if (!date || date < start || date >= end) continue;

    count += 1;
    value += estimate;
    if (usedFallback) fallbackHits += 1;
    else historyHits += 1;
  }

  return {
    count,
    value,
    secondaryValue: null,
    source: fallbackHits > 0 ? "fallback" : historyHits > 0 ? "history" : "none",
    coverageNote: buildCoverageNote(historyHits, fallbackHits),
  };
}

/** Prospect->Approved / Approved->Invoiced / Invoiced->Closed: shared shape — count +
 * contract value of jobs entering `target` within the trailing 7 days, plus a
 * secondaryValue (Monies Collected for approved, Outstanding AR for invoiced/closed). */
function computeContractTransitionPill(
  rows: PipelineRow[],
  historyByJobId: Map<string, MilestoneHistoryRow[]>,
  target: "approved" | "invoiced" | "closed",
  targetQueue: QueueName,
  start: Date,
  end: Date,
  secondaryValueFor: (row: PipelineRow) => number,
): TransitionPill {
  let count = 0;
  let value = 0;
  let secondaryValue = 0;
  let historyHits = 0;
  let fallbackHits = 0;

  for (const row of rows) {
    if (queueForRow(row) !== targetQueue) continue;

    const { date, usedFallback } = resolveTransitionDate(row, target, historyByJobId);
    if (!date || date < start || date >= end) continue;

    count += 1;
    value += contractAmountFor(row);
    secondaryValue += secondaryValueFor(row);
    if (usedFallback) fallbackHits += 1;
    else historyHits += 1;
  }

  return {
    count,
    value,
    secondaryValue,
    source: fallbackHits > 0 ? "fallback" : historyHits > 0 ? "history" : "none",
    coverageNote: buildCoverageNote(historyHits, fallbackHits),
  };
}

/** Per-job Monies Collected — AR-truth fix (2026-07-03): read from the invoice
 * ledger (per-invoice total_price - balance_due, floored, via collectedByJobId)
 * instead of the prior contract_amount - crm balance_due proxy, which inflated
 * "collected" for approved-but-never-invoiced jobs (nothing billed = nothing
 * collected) and read from the retired crm AR signal. */
function moniesCollectedFor(row: PipelineRow, collectedMap: Map<string, number>): number {
  return row.acculynx_job_id ? collectedMap.get(row.acculynx_job_id) ?? 0 : 0;
}

/** Builds the group-by-jobId map computeTrailing7dPillsV2 and its per-transition
 * helpers share, so a caller with a flat MilestoneHistoryRow[] array (as loaded from
 * acculynx_job_milestone_history) only groups it once. */
export function groupMilestoneHistoryByJobId(rows: MilestoneHistoryRow[]): Map<string, MilestoneHistoryRow[]> {
  const map = new Map<string, MilestoneHistoryRow[]>();
  for (const row of rows) {
    const list = map.get(row.job_id) ?? [];
    list.push(row);
    map.set(row.job_id, list);
  }
  return map;
}

/** Total outstanding AR (point-in-time, all open invoices) from acculynx_invoices —
 * item 4's own AR definition, independent of the trailing-7-day window. */
export function computeTotalOutstandingArFromInvoices(invoices: InvoiceAgingRow[]): number {
  return invoices.reduce((sum, inv) => sum + Math.max(0, toNumber(inv.balance_due)), 0);
}

/** Highest AR aging (days): the oldest open invoice's age from its invoice_date,
 * among invoices with balance_due > 0 and a parseable invoice_date. Returns 0 when
 * there are no such invoices (never a fabricated/negative day count). */
export function computeHighestArAgingDays(invoices: InvoiceAgingRow[], now: Date): number {
  return computeHighestArAgingInvoice(invoices, now).days;
}

/** Like computeHighestArAgingDays but also returns the job_id of the oldest open
 * invoice, so the UI can deep-link the Highest AR Aging pill to that specific job
 * (2026-07-07 user request). jobId is null when there is no open invoice with a
 * usable date. */
export function computeHighestArAgingInvoice(invoices: InvoiceAgingRow[], now: Date): { days: number; jobId: string | null } {
  let oldestDays = 0;
  let jobId: string | null = null;
  for (const inv of invoices) {
    if (toNumber(inv.balance_due) <= 0) continue;
    const invoiceDate = toDate(inv.invoice_date);
    if (!invoiceDate) continue;
    const days = daysBetweenDates(invoiceDate, now);
    if (days > oldestDays) {
      oldestDays = days;
      jobId = inv.job_id;
    }
  }
  return { days: oldestDays, jobId };
}

function daysBetweenDates(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** The full 7-pill trailing-7-day row (fix round item 4). `rows` is the ALREADY
 * filtered/deduped/excluded pipeline slice (same upstream filter point as every other
 * aggregation — obeys the D-13 filter bar via the caller). `historyRows`/`invoices`
 * are NOT filtered by the D-13 filter bar upstream (they carry no location/rep
 * dimension of their own) — this function derives the relevant subset by matching
 * job_id against `rows`, so the pills automatically respect whatever filter produced
 * `rows`. */
export function computeTrailing7dPillsV2(
  rows: PipelineRow[],
  historyRows: MilestoneHistoryRow[],
  invoices: InvoiceAgingRow[],
  now: Date,
): Trailing7dPillsV2 {
  const { start, end } = trailing7DayRange(now);
  const historyByJobId = groupMilestoneHistoryByJobId(historyRows);

  const jobIdSet = new Set(rows.map((r) => r.acculynx_job_id).filter((id): id is string => id !== null));
  const relevantInvoices = invoices.filter((inv) => jobIdSet.has(inv.job_id));

  // AR-truth fix (2026-07-03): both per-row AR and per-row collected read from the
  // invoice ledger (scoped to the filtered pipeline's jobs), never crm balance_due.
  const arByJobId = openInvoiceArByJobId(relevantInvoices);
  const collectedMap = collectedByJobId(relevantInvoices);
  const invoiceArFor = (row: PipelineRow) => arForRow(row, arByJobId);

  const leadToProspect = computeLeadToProspectPill(rows, historyByJobId, start, end);
  const prospectToApproved = computeContractTransitionPill(
    rows,
    historyByJobId,
    "approved",
    "approved",
    start,
    end,
    (row) => moniesCollectedFor(row, collectedMap),
  );
  const approvedToInvoiced = computeContractTransitionPill(
    rows,
    historyByJobId,
    "invoiced",
    "invoiced",
    start,
    end,
    invoiceArFor,
  );
  const invoicedToClosed = computeContractTransitionPill(
    rows,
    historyByJobId,
    "closed",
    "closed",
    start,
    end,
    invoiceArFor,
  );

  const totalOutstandingAr = computeTotalOutstandingArFromInvoices(relevantInvoices);
  const arAging = computeHighestArAgingInvoice(relevantInvoices, now);
  const highestArAgingDays = arAging.days;

  // Monies Collected this week: summed across every row (approved/invoiced/closed
  // queue) whose entry into its CURRENT stage falls in the trailing 7 days and has
  // collected dollars — a superset view across the funnel, not just the
  // Prospect->Approved pill's secondaryValue.
  // 2026-07-07 (user): HISTORY-ONLY, same as the transition pills — the stage-entry
  // date comes from real milestone history (resolveTransitionDate), NOT the
  // approved_date/milestone_date/updated_at fallback that let bulk/artifact dates
  // (e.g. the 2026-07-04 milestone_date cluster) fake a week's collections.
  let totalMoniesCollectedThisWeek = 0;
  for (const row of rows) {
    const queue = queueForRow(row);
    if (!queue || queue === "leads" || queue === "prospects") continue;
    const target = queue === "approved" ? "approved" : queue === "invoiced" ? "invoiced" : "closed";
    const { date } = resolveTransitionDate(row, target, historyByJobId);
    if (!date || date < start || date >= end) continue;
    totalMoniesCollectedThisWeek += moniesCollectedFor(row, collectedMap);
  }

  return {
    leadToProspect,
    prospectToApproved,
    approvedToInvoiced,
    invoicedToClosed,
    totalOutstandingAr,
    highestArAgingDays,
    highestArAgingJobId: arAging.jobId,
    totalMoniesCollectedThisWeek,
  };
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

/** Round 3, item F (live-diagnosed root cause): the watermark table is keyed on
 * (account_key, resource_type) — see supabase/functions/acculynx-sync/lib/watermark.ts.
 * The live column is `resource_type`, NOT `resource`. Every freshness read MUST select
 * it and scope to the "jobs" resource per account (optionally max(jobs, contacts,
 * estimates)) — never a bare min() across every resource_type row, which silently
 * drags every account's badge to "stale" via 5 legacy NULL seed rows (resource_type
 * IN users/invoices/job_financials/job_insurance/job_milestone_history, not
 * account-scoped) and job_walk rows that only advance when a job is actually walked. */
export interface WatermarkRow {
  account_key: string;
  resource_type: string;
  last_sync_at: string | null;
}

/** Round 3, item F: the resource(s) that define "freshness" for an account — the
 * account's own `jobs` resource watermark is authoritative; `contacts`/`estimates`
 * are included (via max) so a fresher contacts/estimates sync can also count, but
 * `jobs` alone already reflects the live-diagnosed truth (jobs watermarks fresh
 * within ~25 min in production at implementation time). NEVER includes job_walk
 * (only advances when a job is actually walked) or any legacy/non-account-scoped
 * resource_type (users, invoices, job_financials, job_insurance,
 * job_milestone_history). */
const FRESHNESS_RESOURCE_TYPES = new Set(["jobs", "contacts", "estimates"]);

/** Per-account freshness basis: the MOST RECENT last_sync_at among this account's
 * jobs/contacts/estimates watermark rows (item F's own "optionally max" instruction).
 * Ignores every other resource_type (legacy NULL seed rows, job_walk, etc.) entirely —
 * they never enter this map, so they can never drag a badge stale. Returns null when
 * the account has no qualifying watermark row at all (never a fabricated date). */
export function freshnessBasisByAccount(watermarks: WatermarkRow[]): Map<string, string | null> {
  const basis = new Map<string, string | null>();
  for (const row of watermarks) {
    if (!FRESHNESS_RESOURCE_TYPES.has(row.resource_type)) continue;
    if (!row.last_sync_at) continue;
    const existing = basis.get(row.account_key);
    if (!existing || new Date(row.last_sync_at) > new Date(existing)) {
      basis.set(row.account_key, row.last_sync_at);
    }
  }
  return basis;
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
    trailing7d: { ...EMPTY_TRAILING_7D_V2 },
    locationRollup: [],
    arTotal: 0,
    highestArAgingJob: null,
    freshness: [],
    pipelineValueTotal: 0,
    pipelineValueSplit: { ...EMPTY_SEGMENT_SPLIT },
    soldValueSplit: { ...EMPTY_SEGMENT_SPLIT },
    jobsSoldSplit: { ...EMPTY_SEGMENT_SPLIT },
    newLeadsSplit: { ...EMPTY_SEGMENT_SPLIT },
    closeRateSplit: { ...EMPTY_SEGMENT_SPLIT },
    closeRateSnapshotOverall: 0,
    marginPctSplit: { ...EMPTY_SEGMENT_SPLIT },
    marginCoverageSplit: { ...EMPTY_SEGMENT_SPLIT },
    averageTicket: { residential: { ...EMPTY_AVERAGE_TICKET.residential }, commercial: { ...EMPTY_AVERAGE_TICKET.commercial } },
    signed7d: { count: 0, value: 0, countSplit: { ...EMPTY_SEGMENT_SPLIT } },
    knownReps: [],
  };
}

function resolveFilters(filters?: DashboardFilters): Required<DashboardFilters> {
  return {
    // Round 3 (user spec, item A): default window is Month-to-Date.
    window: filters?.window ?? "mtd",
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
    const [pipeline, jobs, financialsRaw, invoiceMatches, invoiceLines, watermarks, accounts, milestoneHistory, invoiceAging] =
      await Promise.all([
        selectAll<PipelineRow>(
          client,
          "crm_pipeline",
          "id,acculynx_job_id,job_name,client_name,client_job_number,location_city,location_state,market,current_milestone,primary_salesperson,contract_amount,primary_estimate_amount,balance_due,lead_date,approved_date,milestone_date,created_at,updated_at,insurance_company,insurance_claim_number,insurance_claim_filed,insurance_claim_filed_date,insurance_date_of_loss,parent_lead_source,sub_lead_source,data_source",
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
        selectAll<WatermarkRow>(client, "acculynx_sync_watermark", "account_key,resource_type,last_sync_at"),
        selectAll<AcculynxAccountRow>(client, "acculynx_accounts", "account_key,label,program,market,state"),
        // Fix round item 4 (2026-07-02): milestone-history-backed transition pills.
        // acculynx_job_milestone_history is now being ingested post-fix (item 1's
        // job-walk phase already populates it) — sparse/empty for a while after
        // this ships is expected and handled by the fallback + coverage caption.
        selectAll<MilestoneHistoryRow>(client, "acculynx_job_milestone_history", "job_id,milestone_name,milestone_date"),
        // acculynx_invoices — THE AR source for every AR signal on the dashboard
        // (AR-truth fix 2026-07-03; crm_pipeline.balance_due retired as an AR signal).
        // total_price feeds the invoice-ledger "monies collected" derivation.
        selectAll<InvoiceAgingRow>(client, "acculynx_invoices", "job_id,invoice_date,balance_due,total_price"),
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

    // VERIFICATION gap 8 (07-07): collapse csv_initial/api_sync duplicate rows for the
    // same acculynx_job_id (api_sync wins) BEFORE any exclusion/filter/aggregation, so
    // every downstream KPI counts each underlying job at most once.
    const dedupedPipeline = dedupePipeline(pipeline);

    // Checkpoint round 3, item 2 (supersedes round 2's closed/paid-in-full exclusion):
    // exclude dead/cancelled jobs from the ENTIRE dataset before any filter bar or
    // aggregation runs — one filter point upstream of the D-13/rep filters below.
    const activePipeline = excludeClosedAndPaidInFull(dedupedPipeline);

    // Item 6: distinct assigned reps present in the (post-exclusion) data, for the
    // Rep filter dropdown. Sourced from crm_pipeline.primary_salesperson — verified
    // live as the only populated assigned-rep-shaped field (see SUMMARY.md for
    // coverage numbers); acculynx_jobs carries no assigned-user field at all.
    const knownReps = Array.from(
      new Set(activePipeline.map((row) => compact(row.primary_salesperson, "")).filter((name) => name.length > 0)),
    ).sort((a, b) => a.localeCompare(b));

    // Apply the D-13 global filter bar (account_key / commercial-residential / rep)
    // before computing any KPI — every KPI, chart, and drill-down obeys the filter bar.
    // Round 3, item B: the rep filter matches against the unified rep/account bucket
    // (repBucketFor) — an unassigned-with-value row filters on its account_key bucket,
    // a GUID/numeric rep filters on "[rep-unknown]" — never the raw primary_salesperson
    // string, so the filter dropdown and the displayed bucket never disagree.
    const filteredPipeline = activePipeline.filter((row) => {
      const derived = deriveRegionOffice(row, jobs);
      if (resolvedFilters.accountKey !== "all" && derived.accountKey !== resolvedFilters.accountKey) return false;
      if (
        resolvedFilters.commercialResidential !== "all" &&
        derived.commercialResidential !== resolvedFilters.commercialResidential
      ) {
        return false;
      }

      const repBucket = repBucketFor(row, derived.accountKey);
      if (repBucket === null) return false; // unassigned + no value: filtered out of view entirely (item B)
      if (resolvedFilters.rep !== "all" && repBucket !== resolvedFilters.rep) return false;
      return true;
    });

    // AR-truth fix (2026-07-03): the invoice-ledger AR map — built from the FULL
    // invoice read, then applied per-row everywhere AR is displayed or used as a
    // window exception. crm_pipeline.balance_due is retired as an AR signal.
    const arByJobId = openInvoiceArByJobId(invoiceAging);

    // 2026-07-06 rebuild: the REAL per-stage entry dates from milestone history, used
    // for every windowed KPI below. This retires the updated_at/created_at fallback
    // (the defect that made undated jobs land in every calendar window and inflated
    // YTD sold value ~6-9x).
    const stageDates = buildStageEntryDates(milestoneHistory);

    // Round 3, item A: THE unified window — every windowed KPI/chart/table/drop-down
    // below is computed from this ONE filtered-and-windowed row set (filterRowsInWindow
    // applies the real milestone-history stage date + the any-open-invoice AR exception).
    // Point-in-time KPIs that are explicitly NOT windowed (the trailing-7 pills,
    // item C) intentionally read from `filteredPipeline` instead — see the trailing7d
    // computation below.
    const windowedPipeline = filterRowsInWindow(filteredPipeline, start, end, arByJobId, stageDates);

    const funnel = groupPipelineFunnel(windowedPipeline);
    const closeRate = computeCloseRate(windowedPipeline, start, end);
    const newLeadsCount = windowedPipeline.filter((row) => queueForRow(row) === "leads").length;

    // Item 3: the headline "pipeline value" KPI is the pre-close pipeline value
    // (prospects-with-estimate summed value), now windowed per item A (prospects are
    // windowed by their own stage date, same as every other stage).
    const queuesAll = computeQueueValues(windowedPipeline);
    const pipelineValueTotal = preClosePipelineValue(queuesAll);

    // Item 4: every headline KPI splits Residential vs Commercial, segmented BY
    // ACCOUNT (multi_family_commercial = commercial; everything else = residential).
    const residentialRows = windowedPipeline.filter((row) => deriveSegment(row, jobs) === "residential");
    const commercialRows = windowedPipeline.filter((row) => deriveSegment(row, jobs) === "commercial");

    const pipelineValueSplit: SegmentSplit = {
      residential: preClosePipelineValue(computeQueueValues(residentialRows)),
      commercial: preClosePipelineValue(computeQueueValues(commercialRows)),
    };

    // 2026-07-06 rebuild (user decision: measure sales by CLOSE DATE). The headline
    // Sold Value / Jobs Sold split counts each job ONCE, in the Closed bucket, windowed
    // on its real Closed-milestone date — never the approved-date or the updated_at
    // fallback. Approved/invoiced-but-not-closed jobs are in-progress pipeline (funnel),
    // not counted as sold until they close.
    const soldClosedResidential = computeClosedInWindow(residentialRows, start, end, stageDates);
    const soldClosedCommercial = computeClosedInWindow(commercialRows, start, end, stageDates);
    const soldValueSplit: SegmentSplit = {
      residential: soldClosedResidential.soldValue,
      commercial: soldClosedCommercial.soldValue,
    };
    const jobsSoldSplit: SegmentSplit = {
      residential: soldClosedResidential.soldCount,
      commercial: soldClosedCommercial.soldCount,
    };

    const newLeadsSplit: SegmentSplit = {
      residential: residentialRows.filter((row) => queueForRow(row) === "leads").length,
      commercial: commercialRows.filter((row) => queueForRow(row) === "leads").length,
    };

    // Item 7: close rate splits are the count-based snapshot formula (window-
    // independent, computed over the FULL filtered — not windowed — set per the
    // user's explicit "current snapshot" decision), same as the location/rep close
    // rates below.
    const closeRateSplit: SegmentSplit = {
      residential: computeSnapshotCloseRate(filteredPipeline.filter((row) => deriveSegment(row, jobs) === "residential")),
      commercial: computeSnapshotCloseRate(filteredPipeline.filter((row) => deriveSegment(row, jobs) === "commercial")),
    };

    const averageTicket = computeAverageTicket(windowedPipeline, jobs, start, end);

    const marginByRegion = computeMarginByDimension(
      windowedPipeline,
      jobs,
      financialsByJobId,
      invoiceCostByJobId,
      (row, jobRows) => deriveRegionOffice(row, jobRows).accountKey,
    );
    const marginByOffice = marginByRegion; // office === account_key for v1 (Open Question 3: peer entries)
    const marginByCommercialResidential = computeMarginByDimension(
      windowedPipeline,
      jobs,
      financialsByJobId,
      invoiceCostByJobId,
      (row, jobRows) => deriveRegionOffice(row, jobRows).commercialResidential,
    );
    const marginByRep = computeMarginByDimension(
      windowedPipeline,
      jobs,
      financialsByJobId,
      invoiceCostByJobId,
      (row) => repBucketFor(row, deriveRegionOffice(row, jobs).accountKey) ?? "Unassigned",
    );

    // Item 4: margin % split by segment, weighted the same way the overall/location
    // margin caption is (dollar-weighted average of jobs-with-cost-data). Also returns
    // per-segment coverage (jobsWithCostData) so the UI can render "—" (not a
    // misleading "0%") for a segment with no cost data at all (2026-07-07 fix).
    const marginFor = (rows: PipelineRow[]): { pct: number; coverage: number } => {
      const byAll = computeMarginByDimension(rows, jobs, financialsByJobId, invoiceCostByJobId, () => "all");
      return { pct: byAll[0]?.marginPct ?? 0, coverage: byAll[0]?.coverage.jobsWithCostData ?? 0 };
    };
    const marginResidential = marginFor(residentialRows);
    const marginCommercial = marginFor(commercialRows);
    const marginPctSplit: SegmentSplit = {
      residential: marginResidential.pct,
      commercial: marginCommercial.pct,
    };
    const marginCoverageSplit: SegmentSplit = {
      residential: marginResidential.coverage,
      commercial: marginCommercial.coverage,
    };

    // 2026-07-07: the Rep Leaderboard "sold value" uses the close-date definition
    // (closed-in-window only), consistent with the Sold Value headline / funnel closed
    // bar — NOT all sold stages. A rep is credited when their job CLOSES in the window.
    const soldRows = windowedPipeline.filter((row) => queueForRow(row) === "closed");

    const leaderboardMap = new Map<string, LeaderboardRow>();
    // Checkpoint round 4, item 1: soldRows grouped by rep, so the leaderboard's
    // stacked-bar collected/AR split can be computed from the SAME row set that
    // produced each rep's soldValue (never a different window/filter). Round 3, item
    // B: the rep bucket is the unified repBucketFor value (account-key bucket for
    // unassigned-with-value rows, [rep-unknown] for GUID/numeric values) — this is
    // what "kills the GUID entries on the leaderboard".
    const soldRowsByRep = new Map<string, PipelineRow[]>();
    for (const row of soldRows) {
      const salesperson = repBucketFor(row, deriveRegionOffice(row, jobs).accountKey) ?? "Unassigned";
      const entry = leaderboardMap.get(salesperson) ?? { salesperson, soldCount: 0, soldValue: 0, arBalance: 0 };
      entry.soldCount += 1;
      entry.soldValue += amountFor(row);
      leaderboardMap.set(salesperson, entry);

      const soldList = soldRowsByRep.get(salesperson) ?? [];
      soldList.push(row);
      soldRowsByRep.set(salesperson, soldList);
    }
    for (const row of windowedPipeline) {
      // AR-truth fix (2026-07-03): rep AR is open-invoice AR, never crm balance_due.
      const balance = arForRow(row, arByJobId);
      if (balance <= 0) continue;
      const salesperson = repBucketFor(row, deriveRegionOffice(row, jobs).accountKey) ?? "Unassigned";
      const entry = leaderboardMap.get(salesperson) ?? { salesperson, soldCount: 0, soldValue: 0, arBalance: 0 };
      entry.arBalance += balance;
      leaderboardMap.set(salesperson, entry);
    }

    // Item 6/7: "assigned Close Rate" per rep — count-based snapshot formula, keyed
    // on the SAME unified rep bucket the leaderboard already groups by, computed over
    // that rep's full (window-independent) row set from filteredPipeline.
    const rowsByRep = new Map<string, PipelineRow[]>();
    for (const row of filteredPipeline) {
      const salesperson = repBucketFor(row, deriveRegionOffice(row, jobs).accountKey) ?? "Unassigned";
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
    const funnelWithSplit = computeFunnelStagesWithSplit(windowedPipeline, arByJobId);
    const leaderboardWithSplit = computeLeaderboardWithSplit(leaderboard, soldRowsByRep, arByJobId);

    // Fix round item 4 (2026-07-02): the 7-pill trailing-7-day row — fixed window
    // anchored at `now`, computed over filteredPipeline (NOT windowedPipeline — item C:
    // the trailing-7 pills are the ONE section NOT affected by the Window selector) so
    // it obeys the D-13 filter bar but ignores the D-03 window-selector token entirely.
    // milestoneHistory/invoiceAging are unfiltered reads — computeTrailing7dPillsV2
    // derives the relevant subset by job_id.
    const trailing7d = computeTrailing7dPillsV2(filteredPipeline, milestoneHistory, invoiceAging, now);

    // "Signed (7d)" KPI (2026-07-07 user request): jobs signed (entered Approved) in
    // the trailing 7 days. Like the trailing-7 pills it obeys the filter bar
    // (filteredPipeline) but ignores the window selector; unlike them it keys on the
    // real Approved date (history first, crm approved_date fallback — never
    // milestone_date, which is the current-stage date for a job past approval).
    const signed7d = computeSigned7d(filteredPipeline, jobs, stageDates, now);

    // Highest AR Aging deep-link (2026-07-07): resolve the oldest-open-invoice job to
    // its job number + account_key so the pill links into the per-office drill-down.
    // The invoice's job is always within filteredPipeline (relevantInvoices is scoped
    // to it), so the row lookup resolves.
    const arAgingRow = trailing7d.highestArAgingJobId
      ? filteredPipeline.find((row) => row.acculynx_job_id === trailing7d.highestArAgingJobId)
      : undefined;
    const highestArAgingJob = trailing7d.highestArAgingJobId
      ? {
          jobId: trailing7d.highestArAgingJobId,
          jobNumber: arAgingRow ? compact(arAgingRow.client_job_number, "") || null : null,
          accountKey: arAgingRow ? deriveRegionOffice(arAgingRow, jobs).accountKey : "unknown",
        }
      : null;

    // AR-truth fix (2026-07-03, user-approved fix 1): the headline AR Outstanding KPI
    // is the SAME point-in-time open-invoice number as the trailing-7 "Total
    // Outstanding AR" pill (both: acculynx_invoices scoped to the filter-bar-filtered
    // pipeline's jobs). One AR truth on the page — they can never disagree again.
    const arTotal = trailing7d.totalOutstandingAr;

    // AR-truth fix (2026-07-03, user-approved fix 4): the headline Close Rate is the
    // job-count-weighted overall snapshot rate over the full filtered (window-
    // independent) pipeline — never an unweighted mean of the Res/Com segment rates.
    const closeRateSnapshotOverall = computeSnapshotCloseRate(filteredPipeline);

    const locationRollup = computeLocationRollup(windowedPipeline, jobs, KNOWN_ACCOUNT_KEYS, start, end, arByJobId);

    // Freshness badges: use every KNOWN production account so a location with zero jobs
    // still shows an honest (likely critical/no-sync) badge. Excludes any non-production
    // account row (e.g. "sandbox") that may exist in acculynx_accounts but is not one of
    // the 8 real business locations (checkpoint rework directive 3).
    //
    // Round 3, item F (live-diagnosed root cause): per-account freshness is now the
    // account's `jobs` resource watermark (max'd with contacts/estimates via
    // freshnessBasisByAccount) — NEVER a bare min() across every resource_type row.
    // The prior implementation read a bare `last_sync_at` per account_key with no
    // resource_type filter at all, so a stale/NULL legacy seed row (resource_type IN
    // users/invoices/job_financials/job_insurance/job_milestone_history — none of them
    // account-scoped) or a job_walk row (only advances when a job is actually walked)
    // could silently win the "last sync" slot and mark every location stale, even
    // though the real jobs sync was fresh minutes ago.
    const knownAccountKeySet = new Set<string>(KNOWN_ACCOUNT_KEYS);
    const watermarkByAccount = freshnessBasisByAccount(watermarks);
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
      highestArAgingJob,
      freshness,
      pipelineValueTotal,
      pipelineValueSplit,
      soldValueSplit,
      jobsSoldSplit,
      newLeadsSplit,
      closeRateSplit,
      closeRateSnapshotOverall,
      marginPctSplit,
      marginCoverageSplit,
      averageTicket,
      signed7d,
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
  window: WindowToken = "mtd",
  now: Date = new Date(),
): Promise<{ status: DashboardStatus; jobs: JobDrillRow[]; hiddenZeroValueCount: number; error: string | null }> {
  const { client, config } = createServerSupabaseClient(env);

  if (!client) {
    return {
      status: "unconfigured",
      jobs: [],
      hiddenZeroValueCount: 0,
      error: config.missing.map((name) => `Missing ${name}`).join(", "),
    };
  }

  try {
    const [pipeline, jobs, invoiceAging, milestoneHistory] = await Promise.all([
      selectAll<PipelineRow>(
        client,
        "crm_pipeline",
        "id,acculynx_job_id,job_name,client_name,client_job_number,location_city,location_state,market,current_milestone,primary_salesperson,contract_amount,primary_estimate_amount,balance_due,lead_date,approved_date,milestone_date,created_at,updated_at,insurance_company,insurance_claim_number,insurance_claim_filed,insurance_claim_filed_date,insurance_date_of_loss,parent_lead_source,sub_lead_source,data_source",
      ),
      selectAll<AcculynxJobRow>(client, "acculynx_jobs", "id,account_key,job_category_name"),
      // AR-truth fix (2026-07-03): the drill-down's Outstanding AR column + the
      // any-open-invoice window exception both read the invoice ledger.
      selectAll<InvoiceAgingRow>(client, "acculynx_invoices", "job_id,invoice_date,balance_due,total_price"),
      // 2026-07-06 rebuild: real per-stage dates so the drill-down windows on the same
      // milestone-history basis as the aggregate dashboard (no updated_at fallback).
      selectAll<MilestoneHistoryRow>(client, "acculynx_job_milestone_history", "job_id,milestone_name,milestone_date"),
    ]);

    // Round 3, item E: the drill-down table honors the SAME window rules as the rest
    // of the dashboard (item A) — a job with no outstanding AR outside the window is
    // not listed.
    const { start, end } = windowRange(window, now);
    const arByJobId = openInvoiceArByJobId(invoiceAging);
    const stageDates = buildStageEntryDates(milestoneHistory);
    const { rows, hiddenZeroValueCount } = jobRowsForLocation(pipeline, jobs, accountKey, commercialResidential, rep, start, end, arByJobId, stageDates);
    return { status: "live", jobs: rows, hiddenZeroValueCount, error: null };
  } catch (error) {
    return {
      status: "degraded",
      jobs: [],
      hiddenZeroValueCount: 0,
      error: error instanceof Error ? error.message : "Job drill-down query failed",
    };
  }
}
