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

export interface ExecutivePipelineDashboard {
  status: DashboardStatus;
  generatedAt: string;
  errors: string[];
  filters: Required<DashboardFilters>;
  window: { start: string; end: string; label: string };
  funnel: FunnelStage[];
  closeRate: CloseRateResult;
  newLeadsCount: number;
  marginByRegion: MarginByDimensionRow[];
  marginByOffice: MarginByDimensionRow[];
  marginByCommercialResidential: MarginByDimensionRow[];
  marginByRep: MarginByDimensionRow[];
  leaderboard: LeaderboardRow[];
  arTotal: number;
  freshness: FreshnessBadge[];
  pipelineValueTotal: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;
/** Hourly ingestion SLA (D-12) */
const FRESHNESS_SLA_MS = 60 * 60_000;

const LEAD_MILESTONES = new Set(["unassigned_lead", "assigned_lead", "lead", "prospect"]);
const SOLD_MILESTONES = new Set(["approved", "completed", "invoiced", "closed"]);

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

// ---------------------------------------------------------------------------
// Shared helpers (copied verbatim / adapted from weekly-snapshot.ts)
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

/** Mandatory pagination helper (RESEARCH.md Pattern 3 / Pitfall 3) — copied verbatim
 * from weekly-snapshot.ts's selectAll, since it is not exported from that module. */
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

function degradedDashboard(status: DashboardStatus, errors: string[], filters: Required<DashboardFilters>, now: Date): ExecutivePipelineDashboard {
  const { start, end, label } = windowRange(filters.window, now);
  return {
    status,
    generatedAt: now.toISOString(),
    errors,
    filters,
    window: { start: start.toISOString(), end: end.toISOString(), label },
    funnel: [],
    closeRate: { leadCount: 0, soldCount: 0, closeRate: 0, soldValue: 0, qualifier: "period-snapshot ratio, not a cohort conversion rate" },
    newLeadsCount: 0,
    marginByRegion: [],
    marginByOffice: [],
    marginByCommercialResidential: [],
    marginByRep: [],
    leaderboard: [],
    arTotal: 0,
    freshness: [],
    pipelineValueTotal: 0,
  };
}

function resolveFilters(filters?: DashboardFilters): Required<DashboardFilters> {
  return {
    window: filters?.window ?? "last_7_days",
    accountKey: filters?.accountKey ?? "all",
    commercialResidential: filters?.commercialResidential ?? "all",
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

    // Apply the D-13 global filter bar (account_key / commercial-residential) before
    // computing any KPI — every KPI, chart, and drill-down obeys the filter bar.
    const filteredPipeline = pipeline.filter((row) => {
      const derived = deriveRegionOffice(row, jobs);
      if (resolvedFilters.accountKey !== "all" && derived.accountKey !== resolvedFilters.accountKey) return false;
      if (
        resolvedFilters.commercialResidential !== "all" &&
        derived.commercialResidential !== resolvedFilters.commercialResidential
      ) {
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

    // Point-in-time KPIs (pipeline value, AR) ignore the window per D-03.
    const pipelineValueTotal = filteredPipeline.reduce((sum, row) => sum + amountFor(row), 0);
    const arTotal = filteredPipeline.reduce((sum, row) => sum + toNumber(row.balance_due), 0);

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

    const soldRows = filteredPipeline.filter((row) => {
      const milestone = compact(row.current_milestone, "").toLowerCase();
      const date = toDate(row.approved_date ?? row.milestone_date ?? row.updated_at);
      return SOLD_MILESTONES.has(milestone) && Boolean(date && date >= start && date < addDays(end, 1));
    });

    const leaderboardMap = new Map<string, LeaderboardRow>();
    for (const row of soldRows) {
      const salesperson = compact(row.primary_salesperson, "Unassigned");
      const entry = leaderboardMap.get(salesperson) ?? { salesperson, soldCount: 0, soldValue: 0, arBalance: 0 };
      entry.soldCount += 1;
      entry.soldValue += amountFor(row);
      leaderboardMap.set(salesperson, entry);
    }
    for (const row of filteredPipeline) {
      const balance = toNumber(row.balance_due);
      if (balance <= 0) continue;
      const salesperson = compact(row.primary_salesperson, "Unassigned");
      const entry = leaderboardMap.get(salesperson) ?? { salesperson, soldCount: 0, soldValue: 0, arBalance: 0 };
      entry.arBalance += balance;
      leaderboardMap.set(salesperson, entry);
    }
    const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => b.soldValue - a.soldValue);

    // Freshness badges: use every account in the registry so a location with
    // zero jobs still shows an honest (likely critical/no-sync) badge.
    const watermarkByAccount = new Map(watermarks.map((w) => [w.account_key, w.last_sync_at]));
    const freshnessInputs: FreshnessInput[] = accounts.map((account) => ({
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
      closeRate,
      newLeadsCount,
      marginByRegion,
      marginByOffice,
      marginByCommercialResidential,
      marginByRep,
      leaderboard,
      arTotal,
      freshness,
      pipelineValueTotal,
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
