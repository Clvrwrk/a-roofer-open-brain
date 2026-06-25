import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export type WeeklySnapshotStatus = "live" | "degraded" | "unconfigured";
export type SnapshotRecordType = "job" | "claim" | "activity" | "location" | "sales" | "receivable";

export interface SnapshotRecord {
  id: string;
  type: SnapshotRecordType;
  label: string;
  sublabel: string;
  value: string;
  status: string;
  href: string;
}

export interface SnapshotMetric {
  id: string;
  label: string;
  value: string;
  caption: string;
  tone: "sales" | "receivable" | "payment" | "activity";
  href: string;
  records: SnapshotRecord[];
}

export interface SnapshotRow {
  id: string;
  rank?: number;
  label: string;
  value: string;
  secondary: string;
  href: string;
  records: SnapshotRecord[];
}

export interface SnapshotHealth {
  label: string;
  status: WeeklySnapshotStatus;
  detail: string;
}

export interface WeeklySnapshot {
  status: WeeklySnapshotStatus;
  generatedAt: string;
  window: {
    start: string;
    end: string;
    label: string;
  };
  health: SnapshotHealth[];
  errors: string[];
  metrics: SnapshotMetric[];
  sections: {
    newLeads: SnapshotRow[];
    jobsSold: SnapshotRow[];
    salesLeaderboard: SnapshotRow[];
    accountsReceivable: SnapshotRow[];
    claims: SnapshotRow[];
    activity: SnapshotRow[];
  };
}

interface PipelineRow {
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

interface AbcInvoiceRow {
  invoice_number: string;
  invoice_date: string | null;
  order_name: string | null;
  purchase_order_number: string | null;
  total_amount: number | string | null;
  is_credit_memo: boolean | null;
  abc_fetched_at: string | null;
  updated_at: string | null;
}

interface AbcReviewRow {
  id: number;
  queue_type: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  job_name: string | null;
  ext_price: number | string | null;
  issue_description: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  resolved: boolean | null;
  created_at: string | null;
}

interface DashboardActionRow {
  id: string;
  department: string | null;
  workflow: string | null;
  decision: string | null;
  actor_display_name: string | null;
  source_table: string | null;
  source_pk: string | null;
  created_at: string | null;
}

interface MirrorStats {
  acculynxJobs: number;
  acculynxLatestSync: string | null;
  abcInvoices: number;
  abcLatestFetch: string | null;
}

interface LiveSnapshotData {
  status: WeeklySnapshotStatus;
  errors: string[];
  pipeline: PipelineRow[];
  invoices: AbcInvoiceRow[];
  reviewRows: AbcReviewRow[];
  actions: DashboardActionRow[];
  stats: MirrorStats;
}

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" });
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" });
const PAGE_SIZE = 1000;
const SNAPSHOT_CACHE_TTL_MS = 60_000;
const DEGRADED_SNAPSHOT_CACHE_TTL_MS = 5_000;
const SNAPSHOT_MAX_STALE_MS = 24 * 60 * 60_000;

let weeklySnapshotCache:
  | {
      expiresAt: number;
      key: string;
      snapshot: WeeklySnapshot;
    }
  | null = null;
let weeklySnapshotInflight:
  | {
      key: string;
      promise: Promise<WeeklySnapshot>;
    }
  | null = null;

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function toNumber(value: unknown) {
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

function inWindow(value: string | null | undefined, start: Date, end: Date) {
  const date = toDate(value);
  if (!date) return false;
  return date >= start && date < addDays(end, 1);
}

function compact(value: unknown, fallback = "Unknown") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatMoney(value: number) {
  return MONEY_FORMATTER.format(value);
}

export function formatSnapshotNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

export function formatSnapshotCurrency(value: number) {
  return formatMoney(value);
}

function formatDateRange(start: Date, end: Date) {
  return `${SHORT_DATE.format(start)} - ${SHORT_DATE.format(end)}`;
}

function snapshotCacheKey(env: RuntimeEnv, start: Date, end: Date) {
  const projectUrl = env.SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL ?? "unconfigured";
  return `${projectUrl}:${start.toISOString()}:${end.toISOString()}`;
}

function snapshotCacheTtl(status: WeeklySnapshotStatus) {
  return status === "live" ? SNAPSHOT_CACHE_TTL_MS : DEGRADED_SNAPSHOT_CACHE_TTL_MS;
}

function formatShortDate(value: string | null | undefined) {
  const date = toDate(value);
  return date ? SHORT_DATE.format(date) : "No date";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "snapshot";
}

function snapshotGroupHref(type: string, label: string) {
  const slug = slugify(label);
  if (type === "sales") return `/weekly-snapshot/rep/${encodeURIComponent(slug)}`;

  const sliceByType: Record<string, string> = {
    "accounts-receivable": "ar",
    activity: "activity",
    claims: "claims",
    "jobs-sold": "jobs-sold",
    "new-leads": "leads",
  };
  const slice = sliceByType[type] ?? type;
  return `/weekly-snapshot/${slice}?group=${encodeURIComponent(slug)}`;
}

function snapshotRecordHref(recordType: SnapshotRecordType, id: string) {
  return `/weekly-snapshot/records/${encodeURIComponent(`${recordType}-${id}`)}`;
}

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

async function countRows(client: SupabaseClient, table: string, query?: (builder: any) => any) {
  let builder = client.from(table).select("*", { count: "exact", head: true });
  if (query) builder = query(builder);
  const { count, error } = await builder;
  if (error) throw new Error(`${table}: ${error.message || error.code || "count failed"}`);
  return count ?? 0;
}

async function latestValue(client: SupabaseClient, table: string, column: string) {
  const { data, error } = await client
    .from(table)
    .select(column)
    .not(column, "is", null)
    .order(column, { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw new Error(`${table}: ${error.message || error.code || "latest failed"}`);
  return compact((data?.[0] as Record<string, unknown> | undefined)?.[column], "");
}

async function loadLiveData(env: RuntimeEnv): Promise<LiveSnapshotData> {
  const { client, config } = createServerSupabaseClient(env);

  if (!client) {
    return {
      actions: [],
      errors: config.missing.map((name) => `Missing ${name}`),
      invoices: [],
      pipeline: [],
      reviewRows: [],
      stats: {
        abcInvoices: 0,
        abcLatestFetch: null,
        acculynxJobs: 0,
        acculynxLatestSync: null,
      },
      status: "unconfigured",
    };
  }

  try {
    const [pipeline, invoices, reviewRows, actions, acculynxJobs, acculynxLatestSync, abcInvoices, abcLatestFetch] =
      await Promise.all([
        selectAll<PipelineRow>(
          client,
          "crm_pipeline",
          "id,acculynx_job_id,job_name,location_city,location_state,market,current_milestone,primary_salesperson,contract_amount,primary_estimate_amount,balance_due,lead_date,approved_date,milestone_date,created_at,updated_at,insurance_company,insurance_claim_number,insurance_claim_filed,insurance_claim_filed_date,insurance_date_of_loss,parent_lead_source,sub_lead_source,data_source",
        ),
        selectAll<AbcInvoiceRow>(
          client,
          "abc_invoices",
          "invoice_number,invoice_date,order_name,purchase_order_number,total_amount,is_credit_memo,abc_fetched_at,updated_at",
        ),
        selectAll<AbcReviewRow>(
          client,
          "abc_review_queue",
          "id,queue_type,invoice_number,invoice_date,job_name,ext_price,issue_description,shipping_city,shipping_state,resolved,created_at",
          (query) => query.eq("resolved", false),
        ),
        selectAll<DashboardActionRow>(
          client,
          "dashboard_action_log",
          "id,department,workflow,decision,actor_display_name,source_table,source_pk,created_at",
          (query) => query.order("created_at", { ascending: false, nullsFirst: false }).limit(250),
        ),
        countRows(client, "acculynx_jobs"),
        latestValue(client, "acculynx_jobs", "synced_at"),
        countRows(client, "abc_invoices"),
        latestValue(client, "abc_invoices", "abc_fetched_at"),
      ]);

    return {
      actions,
      errors: [],
      invoices,
      pipeline,
      reviewRows,
      stats: {
        abcInvoices,
        abcLatestFetch: abcLatestFetch || null,
        acculynxJobs,
        acculynxLatestSync: acculynxLatestSync || null,
      },
      status: "live",
    };
  } catch (error) {
    return {
      actions: [],
      errors: [error instanceof Error ? error.message : "Weekly snapshot live query failed"],
      invoices: [],
      pipeline: [],
      reviewRows: [],
      stats: {
        abcInvoices: 0,
        abcLatestFetch: null,
        acculynxJobs: 0,
        acculynxLatestSync: null,
      },
      status: "degraded",
    };
  }
}

function locationFor(row: PipelineRow) {
  if (row.market) return row.market;
  const city = compact(row.location_city, "");
  const state = compact(row.location_state, "");
  return city || state ? `${city}${city && state ? ", " : ""}${state}` : "Location pending";
}

function salesRepFor(row: PipelineRow) {
  return compact(row.primary_salesperson, "Unassigned");
}

function amountFor(row: PipelineRow) {
  return Math.max(toNumber(row.contract_amount), toNumber(row.primary_estimate_amount));
}

function milestoneFor(row: PipelineRow) {
  return compact(row.current_milestone, "unknown milestone");
}

function sourceFor(row: PipelineRow) {
  const parts = [row.parent_lead_source, row.sub_lead_source].map((part) => compact(part, "")).filter(Boolean);
  return parts.length ? parts.join(" / ") : compact(row.data_source, "source pending");
}

function recordForPipeline(row: PipelineRow, type: SnapshotRecordType = "job"): SnapshotRecord {
  const id = String(row.acculynx_job_id ?? row.id);
  const amount = amountFor(row);
  return {
    href: snapshotRecordHref(type, id),
    id,
    label: compact(row.job_name, `Pipeline ${row.id}`),
    status: milestoneFor(row),
    sublabel: `${locationFor(row)} / ${salesRepFor(row)} / ${sourceFor(row)}`,
    type,
    value: amount > 0 ? formatMoney(amount) : "No amount",
  };
}

function recordForReceivable(row: PipelineRow): SnapshotRecord {
  const id = String(row.acculynx_job_id ?? row.id);
  return {
    href: snapshotRecordHref("receivable", id),
    id,
    label: compact(row.job_name, `Pipeline ${row.id}`),
    status: milestoneFor(row),
    sublabel: `${locationFor(row)} / ${salesRepFor(row)} / ${formatShortDate(row.updated_at)}`,
    type: "receivable",
    value: formatMoney(toNumber(row.balance_due)),
  };
}

function recordForClaim(row: PipelineRow): SnapshotRecord {
  const id = String(row.acculynx_job_id ?? row.id);
  return {
    href: snapshotRecordHref("claim", id),
    id,
    label: compact(row.insurance_claim_number ?? row.insurance_company, "Insurance claim"),
    status: row.insurance_claim_filed ? "claim filed" : "claim evidence",
    sublabel: `${compact(row.insurance_company, "carrier pending")} / ${compact(row.job_name, `Pipeline ${row.id}`)} / ${formatShortDate(row.insurance_claim_filed_date ?? row.insurance_date_of_loss)}`,
    type: "claim",
    value: amountFor(row) > 0 ? formatMoney(amountFor(row)) : "No amount",
  };
}

function groupRows<T>(
  rows: T[],
  groupKey: (row: T) => string,
  toRecord: (row: T) => SnapshotRecord,
  value: (groupRows: T[]) => number,
  valueFormat: (value: number) => string,
  secondary: (groupRows: T[]) => string,
  type: string,
) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return Array.from(groups.entries())
    .map(([label, list]) => ({
      href: snapshotGroupHref(type, label),
      id: `${type}-${slugify(label)}`,
      label,
      records: list.map(toRecord),
      secondary: secondary(list),
      value: valueFormat(value(list)),
    }))
    .sort((a, b) => {
      const aValue = value(groups.get(a.label) ?? []);
      const bValue = value(groups.get(b.label) ?? []);
      return bValue - aValue || a.label.localeCompare(b.label);
    });
}

function activityRows(
  invoices: AbcInvoiceRow[],
  reviews: AbcReviewRow[],
  actions: DashboardActionRow[],
  start: Date,
  end: Date,
) {
  const rows: SnapshotRecord[] = [];

  for (const invoice of invoices.filter((row) => inWindow(row.abc_fetched_at ?? row.updated_at ?? row.invoice_date, start, end))) {
    rows.push({
      href: snapshotRecordHref("activity", `abc-invoice-${invoice.invoice_number}`),
      id: `abc-invoice-${invoice.invoice_number}`,
      label: compact(invoice.order_name ?? invoice.invoice_number, "ABC invoice"),
      status: invoice.is_credit_memo ? "credit memo" : "invoice",
      sublabel: `${compact(invoice.purchase_order_number, "PO pending")} / ${formatShortDate(invoice.invoice_date)}`,
      type: "activity",
      value: formatMoney(toNumber(invoice.total_amount)),
    });
  }

  for (const review of reviews.filter((row) => inWindow(row.created_at, start, end))) {
    rows.push({
      href: snapshotRecordHref("activity", `abc-review-${review.id}`),
      id: `abc-review-${review.id}`,
      label: compact(review.issue_description, compact(review.queue_type, "ABC review")),
      status: "review queue",
      sublabel: `${compact(review.invoice_number, "invoice pending")} / ${compact(review.shipping_city, "city pending")}, ${compact(review.shipping_state, "state")}`,
      type: "activity",
      value: formatMoney(toNumber(review.ext_price)),
    });
  }

  for (const action of actions.filter((row) => inWindow(row.created_at, start, end))) {
    rows.push({
      href: snapshotRecordHref("activity", `dashboard-action-${action.id}`),
      id: `dashboard-action-${action.id}`,
      label: compact(action.workflow, "Dashboard decision"),
      status: compact(action.decision, "action logged"),
      sublabel: `${compact(action.department, "department")} / ${compact(action.actor_display_name, "actor")} / ${formatShortDate(action.created_at)}`,
      type: "activity",
      value: "1 action",
    });
  }

  return rows;
}

function groupedActivity(records: SnapshotRecord[]) {
  const groups = new Map<string, SnapshotRecord[]>();
  for (const record of records) {
    const key = record.status === "invoice" || record.status === "credit memo" ? "ABC documents" : record.status === "review queue" ? "ABC review rows" : "Dashboard decisions";
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }

  return Array.from(groups.entries())
    .map(([label, list]) => ({
      href: snapshotGroupHref("activity", label),
      id: `activity-${slugify(label)}`,
      label,
      records: list,
      secondary: `${formatSnapshotNumber(list.length)} ${list.length === 1 ? "record" : "records"}`,
      value: formatSnapshotNumber(list.length),
    }))
    .sort((a, b) => b.records.length - a.records.length);
}

async function loadFreshWeeklySnapshot(env: RuntimeEnv, now: Date): Promise<WeeklySnapshot> {
  const end = startOfDay(now);
  const start = addDays(end, -14);
  const live = await loadLiveData(env);

  const leadMilestones = new Set(["unassigned_lead", "assigned_lead", "lead", "prospect"]);
  const soldMilestones = new Set(["approved", "completed", "invoiced", "closed"]);
  const leadRows = live.pipeline.filter((row) => {
    const milestone = compact(row.current_milestone, "").toLowerCase();
    return leadMilestones.has(milestone) && inWindow(row.lead_date ?? row.created_at, start, end);
  });
  const soldRows = live.pipeline.filter((row) => {
    const milestone = compact(row.current_milestone, "").toLowerCase();
    return soldMilestones.has(milestone) && inWindow(row.approved_date ?? row.milestone_date ?? row.updated_at, start, end);
  });
  const arRows = live.pipeline.filter((row) => toNumber(row.balance_due) > 0);
  const claimRows = live.pipeline.filter((row) => {
    const hasClaim = Boolean(row.insurance_claim_number || row.insurance_company || row.insurance_claim_filed);
    const claimDate = row.insurance_claim_filed_date ?? row.insurance_date_of_loss ?? row.updated_at;
    return hasClaim && inWindow(claimDate, start, end);
  });
  const activityRecords = activityRows(live.invoices, live.reviewRows, live.actions, start, end);

  const newLeads = groupRows(
    leadRows,
    locationFor,
    (row) => recordForPipeline(row, "location"),
    (rows) => rows.length,
    formatSnapshotNumber,
    (rows) => `${formatSnapshotNumber(rows.length)} ${rows.length === 1 ? "lead" : "leads"}`,
    "new-leads",
  );
  const jobsSold = groupRows(
    soldRows,
    locationFor,
    (row) => recordForPipeline(row, "location"),
    (rows) => rows.reduce((sum, row) => sum + amountFor(row), 0),
    formatMoney,
    (rows) => `${formatSnapshotNumber(rows.length)} ${rows.length === 1 ? "job" : "jobs"}`,
    "jobs-sold",
  );
  const salesLeaderboard = groupRows(
    soldRows,
    salesRepFor,
    (row) => recordForPipeline(row, "sales"),
    (rows) => rows.reduce((sum, row) => sum + amountFor(row), 0),
    formatMoney,
    (rows) => `${formatSnapshotNumber(rows.length)} ${rows.length === 1 ? "job" : "jobs"}`,
    "sales",
  ).map((row, index) => ({ ...row, rank: index + 1 }));
  const accountsReceivable = groupRows(
    arRows,
    locationFor,
    recordForReceivable,
    (rows) => rows.reduce((sum, row) => sum + toNumber(row.balance_due), 0),
    formatMoney,
    (rows) => `${formatSnapshotNumber(rows.length)} ${rows.length === 1 ? "open item" : "open items"}`,
    "accounts-receivable",
  );
  const claims = groupRows(
    claimRows,
    (row) => compact(row.insurance_company, "Carrier pending"),
    recordForClaim,
    (rows) => rows.length,
    formatSnapshotNumber,
    (rows) => `${formatSnapshotNumber(rows.length)} ${rows.length === 1 ? "claim path" : "claim paths"}`,
    "claims",
  );
  const activity = groupedActivity(activityRecords);
  const totalSales = soldRows.reduce((sum, row) => sum + amountFor(row), 0);
  const currentAr = arRows.reduce((sum, row) => sum + toNumber(row.balance_due), 0);

  const health: SnapshotHealth[] = [
    {
      detail:
        live.status === "live"
          ? `${formatSnapshotNumber(live.pipeline.length)} CRM pipeline rows`
          : live.errors[0] ?? "Supabase is not configured",
      label: "Supabase CRM mirror",
      status: live.status,
    },
    {
      detail: `${formatSnapshotNumber(live.stats.acculynxJobs)} jobs mirrored${live.stats.acculynxLatestSync ? `; latest sync ${formatShortDate(live.stats.acculynxLatestSync)}` : ""}`,
      label: "AccuLynx job mirror",
      status: live.stats.acculynxJobs > 0 ? "live" : live.status,
    },
    {
      detail: `${formatSnapshotNumber(live.stats.abcInvoices)} invoices mirrored${live.stats.abcLatestFetch ? `; latest fetch ${formatShortDate(live.stats.abcLatestFetch)}` : ""}`,
      label: "ABC invoice mirror",
      status: live.stats.abcInvoices > 0 ? "live" : live.status,
    },
    {
      detail: "No QuickBooks/payment receipt mirror is connected; Lucinda-controlled QB facts stay isolated.",
      label: "Payment mirror",
      status: "degraded",
    },
  ];

  const metrics: SnapshotMetric[] = [
    {
      caption: `${formatSnapshotNumber(soldRows.length)} sold jobs in window`,
      href: "/weekly-snapshot/jobs-sold",
      id: "total-sales",
      label: "Total Sales",
      records: soldRows.map((row) => recordForPipeline(row, "job")),
      tone: "sales",
      value: formatMoney(totalSales),
    },
    {
      caption: `${formatSnapshotNumber(arRows.length)} open balances`,
      href: "/weekly-snapshot/ar",
      id: "current-ar",
      label: "Current AR",
      records: arRows.map(recordForReceivable),
      tone: "receivable",
      value: formatMoney(currentAr),
    },
    {
      caption: "Payment source not mirrored",
      href: "/weekly-snapshot/payments",
      id: "payments-received",
      label: "Payments Received",
      records: [],
      tone: "payment",
      value: formatMoney(0),
    },
  ];

  return {
    errors: live.errors,
    generatedAt: now.toISOString(),
    health,
    metrics,
    sections: {
      accountsReceivable,
      activity,
      claims,
      jobsSold,
      newLeads,
      salesLeaderboard,
    },
    status: live.status,
    window: {
      end: end.toISOString(),
      label: formatDateRange(start, end),
      start: start.toISOString(),
    },
  };
}

export async function loadWeeklySnapshot(env: RuntimeEnv = getRuntimeEnv(), now = new Date()): Promise<WeeklySnapshot> {
  const end = startOfDay(now);
  const start = addDays(end, -14);
  const key = snapshotCacheKey(env, start, end);
  const currentTime = Date.now();

  const cached = weeklySnapshotCache && weeklySnapshotCache.key === key ? weeklySnapshotCache : null;
  if (cached && cached.expiresAt > currentTime) {
    return cached.snapshot;
  }

  if (!weeklySnapshotInflight || weeklySnapshotInflight.key !== key) {
    weeklySnapshotInflight = {
      key,
      promise: loadFreshWeeklySnapshot(env, now)
        .then((snapshot) => {
          weeklySnapshotCache = {
            expiresAt: Date.now() + snapshotCacheTtl(snapshot.status),
            key,
            snapshot,
          };
          return snapshot;
        })
        .finally(() => {
          weeklySnapshotInflight = null;
        }),
    };
    weeklySnapshotInflight.promise.catch(() => undefined);
  }

  // Stale-while-revalidate: serve the previous snapshot while the refresh runs.
  if (cached && cached.expiresAt + SNAPSHOT_MAX_STALE_MS > currentTime) {
    return cached.snapshot;
  }

  return weeklySnapshotInflight.promise;
}
