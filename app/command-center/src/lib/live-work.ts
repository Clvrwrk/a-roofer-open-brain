import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDecisionAuditEvent } from "@lib/agent-api";
import {
  cadences,
  departments,
  formatApproval,
  formatStatus,
  type ApprovalState,
  type CadenceId,
  type DepartmentId,
  type WorkStatus,
} from "@lib/cadence";
import { loadAgreementGapSurface } from "@lib/abc-price-gaps";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import type { CommandCenterActor, WorkQueueDecision } from "@lib/access-control";

export type LiveWorkPriority = "critical" | "high" | "normal" | "low";
export type LiveDataStatus = "live" | "degraded" | "unconfigured";

export interface LiveMetric {
  label: string;
  value: string;
  detail: string;
  href?: string;
  tone: "critical" | "review" | "ready" | "info";
}

export interface LiveWorkItem {
  id: string;
  workKey: string;
  title: string;
  department: DepartmentId;
  workflow: string;
  cadence: CadenceId;
  owner: string;
  primaryHuman: string;
  nextRun: string;
  status: WorkStatus;
  priority: LiveWorkPriority;
  approval: ApprovalState;
  auditorRequired: boolean;
  evidence: string;
  action: string;
  detail: string;
  href: string;
  sourceLabel: string;
  sourceTable: string;
  sourcePk: string;
  valueAtRisk: number;
  auditTrail: string[];
}

export interface LiveDepartmentSurface {
  status: LiveDataStatus;
  generatedAt: string;
  department: DepartmentId;
  title: string;
  subtitle: string;
  primaryHuman: string;
  sourceSummary: string;
  metrics: LiveMetric[];
  items: LiveWorkItem[];
  errors: string[];
}

export interface LiveCommandCenterSurface {
  status: LiveDataStatus;
  generatedAt: string;
  metrics: LiveMetric[];
  items: LiveWorkItem[];
  errors: string[];
}

interface AbcReviewRow {
  id: number;
  queue_type: string;
  invoice_number: string | null;
  invoice_date: string | null;
  customer_po: string | null;
  job_name: string | null;
  ext_price: number | string | null;
  issue_description: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  resolved: boolean | null;
  created_at: string | null;
}

interface CrmPipelineRow {
  id: number | string;
  acculynx_job_id: string | null;
  job_name: string | null;
  current_milestone: string | null;
  primary_salesperson: string | null;
  contract_amount: number | string | null;
  primary_estimate_amount: number | string | null;
  lead_date: string | null;
  assigned_date: string | null;
  last_touched_days: number | string | null;
  location_city: string | null;
  location_state: string | null;
  parent_lead_source: string | null;
  sub_lead_source: string | null;
  insurance_company: string | null;
  initial_appointment_start: string | null;
}

interface AccuLynxJobRow {
  id: string;
  job_name: string | null;
  job_number: string | null;
  priority: string | null;
  current_milestone: string | null;
  milestone_date: string | null;
  modified_date: string | null;
  location_city: string | null;
  location_state_abbrev: string | null;
  lead_source_name: string | null;
  initial_appointment_start: string | null;
  synced_at: string | null;
}

interface FleetDataGapRow {
  gap_type: string;
  entity: string | null;
  detail: string | null;
}

interface FleetVarianceRow {
  id: string | number;
  status: string | null;
  severity: string | null;
  alert_type: string | null;
  detail: string | null;
  baseline_value: number | string | null;
  actual_value: number | string | null;
  created_at: string | null;
}

interface CallPriorityRow {
  geoid: string | null;
  layer: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  priority: string | null;
  lead_score: number | string | null;
  calls_7d: number | string | null;
  est_job_value_usd: number | string | null;
  profit_score: number | string | null;
  data_completeness: string | null;
}

interface HeatZoneRow {
  zcta_geoid: string | null;
  state: string | null;
  priority_tier: string | null;
  action: string | null;
  events_last_12mo: number | string | null;
  risk_score: number | string | null;
  tracked_props: number | string | null;
  last_event_date: string | null;
}

interface CronOutcomeRow {
  log_id: number | string;
  fired_at: string | null;
  notes: string | null;
  status_code: number | string | null;
  timed_out: boolean | null;
  error_msg: string | null;
  outcome: string | null;
}

interface DashboardActionInsert {
  work_item_id?: string | null;
  work_key: string;
  department: DepartmentId;
  workflow: string;
  action_type: string;
  decision: WorkQueueDecision;
  actor_id: string;
  actor_type: string;
  actor_display_name: string;
  note: string | null;
  payload: Record<string, unknown>;
  source_table: string;
  source_pk: string;
}

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" });
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });
const LIVE_SURFACE_CACHE_TTL_MS = 30_000;
const DEGRADED_SURFACE_CACHE_TTL_MS = 5_000;
const DEPARTMENT_META: Record<DepartmentId, Pick<LiveDepartmentSurface, "primaryHuman" | "sourceSummary" | "subtitle" | "title">> = {
  accounting: {
    primaryHuman: "Lucinda",
    sourceSummary: "ABC invoice/order/price mirrors, ABC review queue, credit memo packet state, and dashboard action logs.",
    subtitle: "Margin protection, invoice gates, credit recovery, AR facts, and close blockers.",
    title: "Accounting",
  },
  executive: {
    primaryHuman: "Chris",
    sourceSummary: "CRM pipeline, AccuLynx job mirror, ABC exposure, source freshness, and cross-department queues.",
    subtitle: "Capacity, cash risk, revenue movement, and system health without department noise.",
    title: "Executive",
  },
  marketing: {
    primaryHuman: "Marketing owner",
    sourceSummary: "Marketing dashboard, hail heat-zone coverage, call priority, property enrichment, and proof assets.",
    subtitle: "Where to activate demand, what proof is safe to publish, and which markets need better data.",
    title: "Marketing",
  },
  operations: {
    primaryHuman: "Operations lead",
    sourceSummary: "AccuLynx job mirror, fleet compliance, variance alerts, maintenance, and job readiness records.",
    subtitle: "Job readiness, crew/fleet blockers, material confidence, and daily execution risk.",
    title: "Operations",
  },
  sales: {
    primaryHuman: "Sales manager",
    sourceSummary: "CRM pipeline, call priority, AccuLynx leads/prospects, hail demand signals, and insurance context.",
    subtitle: "Hot leads, stale opportunities, claim follow-up, and high-value call priorities.",
    title: "Sales",
  },
  system: {
    primaryHuman: "Conductor / Auditor",
    sourceSummary: "Sync logs, webhook queues, dashboard action logs, runtime health, and review queues.",
    subtitle: "Data freshness, workflow integrity, audit gates, and agent runtime exceptions.",
    title: "System",
  },
};

let commandCenterSurfaceCache:
  | {
      expiresAt: number;
      surface: LiveCommandCenterSurface;
    }
  | null = null;
let commandCenterSurfaceInflight: Promise<LiveCommandCenterSurface> | null = null;

function surfaceCacheTtl(status: LiveDataStatus) {
  return status === "live" ? LIVE_SURFACE_CACHE_TTL_MS : DEGRADED_SURFACE_CACHE_TTL_MS;
}

export function invalidateCommandCenterSurfaceCache() {
  commandCenterSurfaceCache = null;
  commandCenterSurfaceInflight = null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function compact(value: unknown, fallback = "Unknown") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function maybeDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMoney(value: number) {
  return MONEY_FORMATTER.format(value);
}

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatShortDate(value: string | null | undefined, fallback = "Event driven") {
  const date = maybeDate(value);
  return date ? DATE_FORMATTER.format(date) : fallback;
}

function priorityFromValue(value: number, high = 25_000, critical = 100_000): LiveWorkPriority {
  if (value >= critical) return "critical";
  if (value >= high) return "high";
  return "normal";
}

function statusFromPriority(priority: LiveWorkPriority): WorkStatus {
  return priority === "critical" ? "blocked" : priority === "high" ? "needs_review" : "queued";
}

function metric(label: string, value: string, detail: string, tone: LiveMetric["tone"], href?: string): LiveMetric {
  return { label, value, detail, tone, href };
}

function slackChannelFor(work: LiveWorkItem, env: RuntimeEnv) {
  if (work.workflow === "credit-memo") return env.SLACK_ACCOUNTING_CREDIT_MEMOS_CHANNEL_ID;
  if (work.workflow === "abc-review" || work.workflow === "price-agreement-gap") {
    return env.SLACK_ACCOUNTING_VENDOR_INTAKE_CHANNEL_ID ?? env.SLACK_ACCOUNTING_CREDIT_MEMOS_CHANNEL_ID;
  }
  if (work.department === "system") return env.SLACK_OB_AGENT_AUDIT_LOG_CHANNEL_ID ?? env.SLACK_OB_CONDUCTOR_DIGEST_CHANNEL_ID;
  if (work.department === "executive") return env.SLACK_OB_CONDUCTOR_DIGEST_CHANNEL_ID;
  if (work.department === "accounting") return env.SLACK_ACCOUNTING_CREDIT_MEMOS_CHANNEL_ID;
  return env.SLACK_OB_CONDUCTOR_DIGEST_CHANNEL_ID;
}

function item(input: Omit<LiveWorkItem, "id">): LiveWorkItem {
  return {
    id: input.workKey,
    ...input,
  };
}

async function safeCount(client: SupabaseClient, table: string, query?: (builder: any) => any) {
  let builder = client.from(table).select("*", { count: "exact", head: true });
  if (query) builder = query(builder);
  const { count, error } = await builder;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function safeRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  query?: (builder: any) => any,
) {
  let builder = client.from(table).select(columns);
  if (query) builder = query(builder);
  const { data, error } = await builder;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

function buildAccountingItems(reviewRows: AbcReviewRow[]) {
  return reviewRows.map((row) => {
    const value = toNumber(row.ext_price);
    const priority = priorityFromValue(value, 5_000, 25_000);
    const invoice = compact(row.invoice_number, `review-${row.id}`);
    return item({
      action: "Resolve review",
      approval: "before_write",
      auditTrail: [
        "Source row is live in abc_review_queue.",
        "Human resolution writes to dashboard_action_log and the review queue resolution path.",
        "Slack mirror uses the dashboard action id after write succeeds.",
      ],
      auditorRequired: priority !== "normal",
      cadence: "daily",
      department: "accounting",
      detail: compact(row.issue_description, "ABC review queue item requires a human pricing or assignment decision."),
      evidence: `${compact(row.queue_type)} / ${invoice} / ${formatMoney(value)}`,
      href: `/accounting/review-queue?item=${encodeURIComponent(String(row.id))}`,
      nextRun: formatShortDate(row.created_at, "Ready now"),
      owner: "@ob-accounting",
      primaryHuman: "Lucinda",
      priority,
      sourceLabel: "ABC review queue",
      sourcePk: String(row.id),
      sourceTable: "abc_review_queue",
      status: statusFromPriority(priority),
      title: `${compact(row.queue_type)} / ${invoice}`,
      valueAtRisk: value,
      workflow: "abc-review",
      workKey: `accounting:abc-review:${row.id}`,
    });
  });
}

async function loadAccountingSurface(client: SupabaseClient): Promise<LiveDepartmentSurface> {
  const [reviewCount, openReviewCount, actionCount, creditMemoCount, reviewRows, gapSurface] = await Promise.all([
    safeCount(client, "abc_review_queue"),
    safeCount(client, "abc_review_queue", (query) => query.eq("resolved", false)),
    safeCount(client, "dashboard_action_log", (query) => query.eq("department", "accounting")),
    safeCount(client, "credit_memo_requests"),
    safeRows<AbcReviewRow>(
      client,
      "abc_review_queue",
      "id,queue_type,invoice_number,invoice_date,customer_po,job_name,ext_price,issue_description,shipping_city,shipping_state,resolved,created_at",
      (query) => query.eq("resolved", false).order("ext_price", { ascending: false, nullsFirst: false }).limit(50),
    ),
    loadAgreementGapSurface(),
  ]);
  const reviewValue = reviewRows.reduce((total, row) => total + toNumber(row.ext_price), 0);
  const gapValue = gapSurface.totals.absoluteVariance;
  const items = [
    ...buildAccountingItems(reviewRows),
    ...gapSurface.rows.slice(0, 25).map((row) => {
      const value = Math.abs(row.variance ?? 0) * Math.max(row.quantity ?? 1, 1);
      const priority = row.severity === "critical" ? "critical" : row.severity === "blocked" ? "high" : "normal";
      return item({
        action: "Open price gap",
        approval: "before_write",
        auditTrail: [
          "Source row is live from ABC invoice/order/price mirrors.",
          "Roberto owns product/UOM/branch decisions.",
          "Chris verifies final agreement authority on escalations.",
        ],
        auditorRequired: priority !== "normal",
        cadence: "daily",
        department: "accounting",
        detail: row.humanAction,
        evidence: `${row.branchName} / ${row.itemNumber} / ${row.invoiceUom}`,
        href: "/accounting/price-agreement-gaps",
        nextRun: formatShortDate(row.invoiceDate, "Ready now"),
        owner: "@ob-accounting",
        primaryHuman: "Lucinda",
        priority,
        sourceLabel: "ABC price gap",
        sourcePk: row.id,
        sourceTable: "abc_invoice_lines",
        status: statusFromPriority(priority),
        title: `Price gap / ${row.invoiceNumber}`,
        valueAtRisk: value,
        workflow: "price-agreement-gap",
        workKey: `accounting:price-gap:${row.id}`,
      });
    }),
  ].sort((a, b) => b.valueAtRisk - a.valueAtRisk);

  return {
    ...DEPARTMENT_META.accounting,
    department: "accounting",
    errors: gapSurface.errors,
    generatedAt: new Date().toISOString(),
    items,
    metrics: [
      metric("Open ABC review rows", formatNumber(openReviewCount), `${formatNumber(reviewCount)} total rows`, openReviewCount ? "review" : "ready", "/accounting/review-queue"),
      metric("Review value in first 50", formatMoney(reviewValue), "Open rows sorted by value at risk", reviewValue ? "critical" : "ready"),
      metric("Price gap rows", formatNumber(gapSurface.totals.gapRows), `${formatMoney(gapValue)} absolute variance`, gapSurface.totals.gapRows ? "review" : "ready", "/accounting/price-agreement-gaps"),
      metric("Accounting actions logged", formatNumber(actionCount), `${formatNumber(creditMemoCount)} credit memo packets`, "info", "/accounting/audit-log"),
    ],
    status: gapSurface.status === "degraded" ? "degraded" : "live",
  };
}

function buildSalesItems(pipelineRows: CrmPipelineRow[], callRows: CallPriorityRow[]) {
  const pipelineItems = pipelineRows.map((row) => {
    const value = Math.max(toNumber(row.contract_amount), toNumber(row.primary_estimate_amount));
    const staleDays = toNumber(row.last_touched_days);
    const priority: LiveWorkPriority = staleDays >= 14 || value >= 50_000 ? "high" : "normal";
    return item({
      action: "Open follow-up",
      approval: "before_external",
      auditTrail: [
        "Source row is live in crm_pipeline.",
        "Customer outreach must be human approved before external send.",
        "Conductor mirrors approved follow-up packets to Slack.",
      ],
      auditorRequired: Boolean(row.insurance_company),
      cadence: "daily",
      department: "sales",
      detail: `${compact(row.current_milestone, "pipeline")} lead last touched ${formatNumber(staleDays)} days ago.`,
      evidence: `${compact(row.primary_salesperson, "Unassigned")} / ${compact(row.parent_lead_source, "source pending")} / ${formatMoney(value)}`,
      href: `/sales/pipeline?job=${encodeURIComponent(String(row.acculynx_job_id ?? row.id))}`,
      nextRun: staleDays >= 7 ? "Today" : formatShortDate(row.initial_appointment_start, "Next follow-up"),
      owner: "@ob-sales",
      primaryHuman: "Sales manager",
      priority,
      sourceLabel: "CRM pipeline",
      sourcePk: String(row.id),
      sourceTable: "crm_pipeline",
      status: statusFromPriority(priority),
      title: compact(row.job_name, `Pipeline ${row.id}`),
      valueAtRisk: value,
      workflow: "sales-follow-up",
      workKey: `sales:pipeline:${row.id}`,
    });
  });

  const callItems = callRows.map((row) => {
    const value = toNumber(row.est_job_value_usd);
    const leadScore = toNumber(row.lead_score);
    const priority: LiveWorkPriority = leadScore >= 80 || value >= 25_000 ? "high" : "normal";
    return item({
      action: "Call / assign",
      approval: "before_external",
      auditTrail: [
        "Source row is live in vw_call_priority.",
        "Call list is prioritized by hail/property/CRM signals.",
        "Human confirms outreach before customer contact.",
      ],
      auditorRequired: false,
      cadence: "daily",
      department: "sales",
      detail: `${compact(row.priority, "priority")} call candidate with ${formatNumber(leadScore)} lead score and ${formatNumber(toNumber(row.calls_7d))} calls in the last 7 days.`,
      evidence: `${compact(row.city, "city pending")}, ${compact(row.state, "state")} / ${formatMoney(value)} est.`,
      href: `/sales/call-priority?geoid=${encodeURIComponent(compact(row.geoid, ""))}`,
      nextRun: "Today",
      owner: "@ob-sales",
      primaryHuman: "Sales manager",
      priority,
      sourceLabel: "Call priority",
      sourcePk: compact(row.geoid, compact(row.address, "unknown")),
      sourceTable: "vw_call_priority",
      status: statusFromPriority(priority),
      title: `Call priority / ${compact(row.address, compact(row.geoid, "property"))}`,
      valueAtRisk: value,
      workflow: "call-priority",
      workKey: `sales:call-priority:${compact(row.geoid, compact(row.address, "unknown"))}`,
    });
  });

  return [...pipelineItems, ...callItems].sort((a, b) => b.valueAtRisk - a.valueAtRisk);
}

async function loadSalesSurface(client: SupabaseClient): Promise<LiveDepartmentSurface> {
  const [pipelineOpenCount, pipelineRows, actionCount] = await Promise.all([
    safeCount(client, "crm_pipeline", (query) => query.in("current_milestone", ["unassigned_lead", "assigned_lead", "prospect"])),
    safeRows<CrmPipelineRow>(
      client,
      "crm_pipeline",
      "id,acculynx_job_id,job_name,current_milestone,primary_salesperson,contract_amount,primary_estimate_amount,lead_date,assigned_date,last_touched_days,location_city,location_state,parent_lead_source,sub_lead_source,insurance_company,initial_appointment_start",
      (query) => query.in("current_milestone", ["unassigned_lead", "assigned_lead", "prospect"]).order("last_touched_days", { ascending: false, nullsFirst: false }).limit(50),
    ),
    safeCount(client, "dashboard_action_log", (query) => query.eq("department", "sales")),
  ]);
  const items = buildSalesItems(pipelineRows, []);
  const valueAtRisk = items.reduce((total, row) => total + row.valueAtRisk, 0);
  const highPriority = items.filter((row) => row.priority !== "normal").length;

  return {
    ...DEPARTMENT_META.sales,
    department: "sales",
    errors: [],
    generatedAt: new Date().toISOString(),
    items,
    metrics: [
      metric("Open CRM opportunities", formatNumber(pipelineOpenCount), "Unassigned, assigned, and prospect milestones", "review", "/sales/pipeline"),
      metric("Value in visible queue", formatMoney(valueAtRisk), `${formatNumber(items.length)} live work items`, valueAtRisk ? "critical" : "ready"),
      metric("High-priority touches", formatNumber(highPriority), "Stale or high-value items", highPriority ? "review" : "ready"),
      metric("Sales actions logged", formatNumber(actionCount), "Durable dashboard decisions", "info"),
    ],
    status: "live",
  };
}

function buildOperationsItems(jobRows: AccuLynxJobRow[], dataGaps: FleetDataGapRow[], varianceRows: FleetVarianceRow[]) {
  const jobItems = jobRows.map((row) => {
    const milestone = compact(row.current_milestone, "milestone");
    const priority: LiveWorkPriority = /approved|completed/i.test(milestone) ? "high" : "normal";
    return item({
      action: "Check readiness",
      approval: "before_write",
      auditTrail: [
        "Source row is live in acculynx_jobs.",
        "Operations writes only after crew/material/job readiness is human confirmed.",
        "Conductor escalates blocked readiness items.",
      ],
      auditorRequired: false,
      cadence: "daily",
      department: "operations",
      detail: `${milestone} job modified ${formatShortDate(row.modified_date, "recently")}. Confirm schedule, materials, and field blocker status.`,
      evidence: `${compact(row.location_city, "city pending")}, ${compact(row.location_state_abbrev, "state")} / ${compact(row.lead_source_name, "source pending")}`,
      href: `/operations/jobs?job=${encodeURIComponent(row.id)}`,
      nextRun: formatShortDate(row.initial_appointment_start, "Today"),
      owner: "@ob-ops",
      primaryHuman: "Operations lead",
      priority,
      sourceLabel: "AccuLynx jobs",
      sourcePk: row.id,
      sourceTable: "acculynx_jobs",
      status: statusFromPriority(priority),
      title: compact(row.job_name, compact(row.job_number, row.id)),
      valueAtRisk: 0,
      workflow: "job-readiness",
      workKey: `operations:job:${row.id}`,
    });
  });

  const gapItems = dataGaps.map((row) => item({
    action: "Clear data gap",
    approval: "before_write",
    auditTrail: [
      "Source row is live in fleet_data_gaps.",
      "Fleet and compliance fixes require human confirmation.",
      "Resolved gaps become audit evidence for Operations.",
    ],
    auditorRequired: true,
    cadence: "weekly",
    department: "operations",
    detail: compact(row.detail, "Fleet data gap needs review."),
    evidence: compact(row.gap_type, "fleet gap"),
    href: `/operations/fleet?gap=${encodeURIComponent(compact(row.entity, ""))}`,
    nextRun: "This week",
    owner: "@ob-ops",
    primaryHuman: "Operations lead",
    priority: "high" as const,
    sourceLabel: "Fleet data gaps",
    sourcePk: compact(row.entity, compact(row.gap_type, "gap")),
    sourceTable: "fleet_data_gaps",
    status: "needs_review" as const,
    title: `${compact(row.gap_type)} / ${compact(row.entity, "entity pending")}`,
    valueAtRisk: 0,
    workflow: "fleet-data-gap",
    workKey: `operations:fleet-gap:${compact(row.gap_type)}:${compact(row.entity, "entity")}`,
  }));

  const varianceItems = varianceRows.map((row) => {
    const priority: LiveWorkPriority = /critical|high/i.test(compact(row.severity, "")) ? "critical" : "high";
    return item({
      action: "Review variance",
      approval: "before_write",
      auditTrail: [
        "Source row is live in fleet_variance_alerts.",
        "Human determines whether this is an exception, training issue, or data issue.",
        "Resolution is logged before any external or payroll-facing action.",
      ],
      auditorRequired: true,
      cadence: "daily",
      department: "operations",
      detail: compact(row.detail, compact(row.alert_type, "Fleet variance alert")),
      evidence: `${compact(row.status, "open")} / ${compact(row.severity, "severity pending")}`,
      href: `/operations/fleet?alert=${encodeURIComponent(String(row.id))}`,
      nextRun: formatShortDate(row.created_at, "Today"),
      owner: "@ob-ops",
      primaryHuman: "Operations lead",
      priority,
      sourceLabel: "Fleet variance alerts",
      sourcePk: String(row.id),
      sourceTable: "fleet_variance_alerts",
      status: statusFromPriority(priority),
      title: `${compact(row.alert_type, "Fleet variance")} / ${row.id}`,
      valueAtRisk: Math.abs(toNumber(row.actual_value) - toNumber(row.baseline_value)),
      workflow: "fleet-variance",
      workKey: `operations:fleet-variance:${row.id}`,
    });
  });

  return [...jobItems, ...gapItems, ...varianceItems];
}

async function loadOperationsSurface(client: SupabaseClient): Promise<LiveDepartmentSurface> {
  const [activeJobsCount, fleetGapCount, openVarianceCount, jobRows, dataGaps, varianceRows] = await Promise.all([
    safeCount(client, "acculynx_jobs", (query) => query.in("current_milestone", ["Approved", "Completed", "Prospect", "Lead"])),
    safeCount(client, "fleet_data_gaps"),
    safeCount(client, "fleet_variance_alerts", (query) => query.eq("status", "open")),
    safeRows<AccuLynxJobRow>(
      client,
      "acculynx_jobs",
      "id,job_name,job_number,priority,current_milestone,milestone_date,modified_date,location_city,location_state_abbrev,lead_source_name,initial_appointment_start,synced_at",
      (query) => query.in("current_milestone", ["Approved", "Completed", "Prospect", "Lead"]).order("modified_date", { ascending: false, nullsFirst: false }).limit(50),
    ),
    safeRows<FleetDataGapRow>(client, "fleet_data_gaps", "gap_type,entity,detail", (query) => query.limit(50)),
    safeRows<FleetVarianceRow>(
      client,
      "fleet_variance_alerts",
      "id,status,severity,alert_type,detail,baseline_value,actual_value,created_at",
      (query) => query.eq("status", "open").order("created_at", { ascending: false, nullsFirst: false }).limit(50),
    ),
  ]);
  const items = buildOperationsItems(jobRows, dataGaps, varianceRows);
  const blockers = items.filter((row) => row.status === "blocked" || row.status === "needs_review").length;

  return {
    ...DEPARTMENT_META.operations,
    department: "operations",
    errors: [],
    generatedAt: new Date().toISOString(),
    items,
    metrics: [
      metric("Active job rows", formatNumber(activeJobsCount), "Lead, prospect, approved, completed", "review", "/operations/jobs"),
      metric("Fleet data gaps", formatNumber(fleetGapCount), "Missing compliance or mapping facts", fleetGapCount ? "critical" : "ready", "/operations/fleet"),
      metric("Open variance alerts", formatNumber(openVarianceCount), "Fuel, odometer, or driver exceptions", openVarianceCount ? "review" : "ready", "/operations/fleet"),
      metric("Operations blockers", formatNumber(blockers), "Visible queue items needing action", blockers ? "critical" : "ready"),
    ],
    status: "live",
  };
}

function buildMarketingItems(heatRows: HeatZoneRow[]) {
  const heatItems = heatRows.map((row) => {
    const risk = toNumber(row.risk_score);
    const priority: LiveWorkPriority = /ACTIVATE|ACQUIRE/.test(compact(row.action, "")) && risk >= 70 ? "high" : "normal";
    return item({
      action: "Plan activation",
      approval: "before_external",
      auditTrail: [
        "Source row is live in vw_hail_heatzone_coverage.",
        "Campaign activation requires human market approval.",
        "Researcher can enrich external market facts without reading the brain.",
      ],
      auditorRequired: false,
      cadence: "weekly",
      department: "marketing",
      detail: `${compact(row.action, "monitor")} / ${formatNumber(toNumber(row.events_last_12mo))} hail events in last 12 months.`,
      evidence: `${compact(row.priority_tier, "tier")} / risk ${formatNumber(risk)} / tracked ${formatNumber(toNumber(row.tracked_props))}`,
      href: `/marketing/hail-zones?zip=${encodeURIComponent(compact(row.zcta_geoid, ""))}`,
      nextRun: formatShortDate(row.last_event_date, "This week"),
      owner: "@ob-marketing",
      primaryHuman: "Marketing owner",
      priority,
      sourceLabel: "Hail heat-zone coverage",
      sourcePk: compact(row.zcta_geoid, "unknown"),
      sourceTable: "vw_hail_heatzone_coverage",
      status: statusFromPriority(priority),
      title: `Heat zone / ${compact(row.zcta_geoid, "ZIP pending")}`,
      valueAtRisk: 0,
      workflow: "hail-market-activation",
      workKey: `marketing:heat-zone:${compact(row.zcta_geoid, "unknown")}`,
    });
  });

  return heatItems;
}

async function loadMarketingSurface(client: SupabaseClient): Promise<LiveDepartmentSurface> {
  const [activateZoneCount, trackedZoneCount, heatRows, actionCount] = await Promise.all([
    safeCount(client, "vw_hail_heatzone_coverage", (query) => query.neq("action", "MONITOR")),
    safeCount(client, "vw_hail_heatzone_coverage", (query) => query.eq("is_tracked", true)),
    safeRows<HeatZoneRow>(
      client,
      "vw_hail_heatzone_coverage",
      "zcta_geoid,state,priority_tier,action,events_last_12mo,risk_score,tracked_props,last_event_date",
      (query) => query.neq("action", "MONITOR").order("risk_score", { ascending: false, nullsFirst: false }).limit(50),
    ),
    safeCount(client, "dashboard_action_log", (query) => query.eq("department", "marketing")),
  ]);
  const items = buildMarketingItems(heatRows);
  const publishReview = items.filter((row) => row.auditorRequired).length;

  return {
    ...DEPARTMENT_META.marketing,
    department: "marketing",
    errors: [],
    generatedAt: new Date().toISOString(),
    items,
    metrics: [
      metric("Tracked hail zones", formatNumber(trackedZoneCount), "Live source-backed market coverage rows", "info", "/marketing/hail-zones"),
      metric("Activation zones", formatNumber(activateZoneCount), "Hail zones marked ACTIVATE or ACQUIRE", activateZoneCount ? "review" : "ready", "/marketing/hail-zones"),
      metric("Campaign approvals", formatNumber(publishReview), "Activation items needing human approval before external work", publishReview ? "critical" : "ready"),
      metric("Marketing actions logged", formatNumber(actionCount), "Durable dashboard decisions", "info"),
    ],
    status: "live",
  };
}

async function loadExecutiveSurface(client: SupabaseClient): Promise<LiveDepartmentSurface> {
  const [approvedCount, completedCount, invoicedCount, reviewCount, actionCount, pipelineRows, cronRows] = await Promise.all([
    safeCount(client, "crm_pipeline", (query) => query.eq("current_milestone", "approved")),
    safeCount(client, "crm_pipeline", (query) => query.eq("current_milestone", "completed")),
    safeCount(client, "crm_pipeline", (query) => query.eq("current_milestone", "invoiced")),
    safeCount(client, "abc_review_queue", (query) => query.eq("resolved", false)),
    safeCount(client, "dashboard_action_log"),
    safeRows<CrmPipelineRow>(
      client,
      "crm_pipeline",
      "id,acculynx_job_id,job_name,current_milestone,primary_salesperson,contract_amount,primary_estimate_amount,lead_date,assigned_date,last_touched_days,location_city,location_state,parent_lead_source,sub_lead_source,insurance_company,initial_appointment_start",
      (query) => query.in("current_milestone", ["approved", "completed", "invoiced"]).order("contract_amount", { ascending: false, nullsFirst: false }).limit(50),
    ),
    safeRows<CronOutcomeRow>(
      client,
      "v_acculynx_cron_outcomes",
      "log_id,fired_at,notes,status_code,timed_out,error_msg,outcome",
      (query) => query.order("fired_at", { ascending: false, nullsFirst: false }).limit(25),
    ),
  ]);
  const revenue = pipelineRows.reduce((total, row) => total + Math.max(toNumber(row.contract_amount), toNumber(row.primary_estimate_amount)), 0);
  const syncFailures = cronRows.filter((row) => row.outcome && row.outcome !== "success").length;
  const items = pipelineRows.slice(0, 25).map((row) => {
    const value = Math.max(toNumber(row.contract_amount), toNumber(row.primary_estimate_amount));
    const priority = priorityFromValue(value, 50_000, 150_000);
    return item({
      action: "Review constraint",
      approval: "none",
      auditTrail: [
        "Source row is live in crm_pipeline.",
        "Executive sees constraints; department owners execute workflow actions.",
        "Auditor checks KPI provenance for weekly readouts.",
      ],
      auditorRequired: true,
      cadence: "weekly",
      department: "executive",
      detail: `${compact(row.current_milestone, "pipeline")} job owned by ${compact(row.primary_salesperson, "unassigned")}.`,
      evidence: `${compact(row.location_city, "city pending")}, ${compact(row.location_state, "state")} / ${formatMoney(value)}`,
      href: `/executive/pipeline?job=${encodeURIComponent(String(row.acculynx_job_id ?? row.id))}`,
      nextRun: "Weekly readout",
      owner: "@ob-exec",
      primaryHuman: "Chris",
      priority,
      sourceLabel: "CRM pipeline",
      sourcePk: String(row.id),
      sourceTable: "crm_pipeline",
      status: statusFromPriority(priority),
      title: compact(row.job_name, `Pipeline ${row.id}`),
      valueAtRisk: value,
      workflow: "executive-pipeline-readout",
      workKey: `executive:pipeline:${row.id}`,
    });
  });

  if (syncFailures > 0) {
    items.unshift(item({
      action: "Inspect sync",
      approval: "always",
      auditTrail: [
        "Source row is live in v_acculynx_cron_outcomes.",
        "Conductor routes failed runtime checks before stale data reaches department decisions.",
        "Human verifies whether source data can be trusted.",
      ],
      auditorRequired: true,
      cadence: "daily",
      department: "executive",
      detail: `${formatNumber(syncFailures)} recent AccuLynx sync outcomes are not successful.`,
      evidence: "Runtime reliability affects every department dashboard.",
      href: "/system/sync-health",
      nextRun: "Now",
      owner: "@ob-exec",
      primaryHuman: "Chris",
      priority: "critical",
      sourceLabel: "AccuLynx cron outcomes",
      sourcePk: "recent-failures",
      sourceTable: "v_acculynx_cron_outcomes",
      status: "blocked",
      title: "AccuLynx sync needs executive visibility",
      valueAtRisk: revenue,
      workflow: "runtime-escalation",
      workKey: "executive:runtime:acculynx-sync",
    }));
  }

  return {
    ...DEPARTMENT_META.executive,
    department: "executive",
    errors: [],
    generatedAt: new Date().toISOString(),
    items,
    metrics: [
      metric("Approved jobs", formatNumber(approvedCount), "CRM approved milestone", "review", "/executive/pipeline"),
      metric("Completed / invoiced", formatNumber(completedCount + invoicedCount), `${formatNumber(completedCount)} completed, ${formatNumber(invoicedCount)} invoiced`, "info"),
      metric("ABC open review rows", formatNumber(reviewCount), "Margin/assignment work not resolved", reviewCount ? "critical" : "ready", "/accounting/review-queue"),
      metric("Dashboard actions", formatNumber(actionCount), "Cross-department durable decisions", "info", "/system/actions"),
    ],
    status: "live",
  };
}

async function loadSystemSurface(client: SupabaseClient): Promise<LiveDepartmentSurface> {
  const [actionCount, workStateCount, mirrorQueuedCount, abcSyncCount, acculynxWatermarks, cronRows] = await Promise.all([
    safeCount(client, "dashboard_action_log"),
    safeCount(client, "dashboard_work_items"),
    safeCount(client, "slack_mirror_events", (query) => query.eq("status", "queued")),
    safeCount(client, "abc_api_sync_runs"),
    safeRows<Record<string, unknown>>(client, "acculynx_sync_watermark", "*", (query) => query.limit(20)),
    safeRows<CronOutcomeRow>(
      client,
      "v_acculynx_cron_outcomes",
      "log_id,fired_at,notes,status_code,timed_out,error_msg,outcome",
      (query) => query.order("fired_at", { ascending: false, nullsFirst: false }).limit(50),
    ),
  ]);
  const badCronRows = cronRows.filter((row) => row.outcome !== "success");
  const items = badCronRows.map((row) => {
    const priority: LiveWorkPriority = row.timed_out || row.outcome === "http_error" ? "critical" : "high";
    return item({
      action: "Triage runtime",
      approval: "always",
      auditTrail: [
        "Source row is live in v_acculynx_cron_outcomes.",
        "Conductor owns routing and escalation.",
        "Auditor verifies stale-data risk before dependent dashboards are trusted.",
      ],
      auditorRequired: true,
      cadence: "daily",
      department: "system",
      detail: compact(row.error_msg ?? row.notes, "Runtime sync outcome requires review."),
      evidence: `${compact(row.outcome, "pending")} / HTTP ${compact(row.status_code, "n/a")}`,
      href: `/system/sync-health?log=${encodeURIComponent(String(row.log_id))}`,
      nextRun: formatShortDate(row.fired_at, "Now"),
      owner: "Conductor",
      primaryHuman: "Conductor / Auditor",
      priority,
      sourceLabel: "AccuLynx cron outcomes",
      sourcePk: String(row.log_id),
      sourceTable: "v_acculynx_cron_outcomes",
      status: statusFromPriority(priority),
      title: `Sync outcome / ${row.log_id}`,
      valueAtRisk: 0,
      workflow: "sync-health",
      workKey: `system:sync:${row.log_id}`,
    });
  });

  return {
    ...DEPARTMENT_META.system,
    department: "system",
    errors: [],
    generatedAt: new Date().toISOString(),
    items,
    metrics: [
      metric("Dashboard actions", formatNumber(actionCount), "Human and agent decisions logged", "info", "/system/actions"),
      metric("Workflow state rows", formatNumber(workStateCount), "Durable per-work-item state", "info"),
      metric("Queued Slack mirrors", formatNumber(mirrorQueuedCount), "Dashboard remains source of truth", mirrorQueuedCount ? "review" : "ready"),
      metric("Sync monitors", formatNumber(abcSyncCount + acculynxWatermarks.length), "ABC runs plus AccuLynx watermarks", "info", "/system/sync-health"),
    ],
    status: "live",
  };
}

export async function loadDepartmentSurface(department: DepartmentId, env: RuntimeEnv = getRuntimeEnv()): Promise<LiveDepartmentSurface> {
  const { client, config } = createServerSupabaseClient(env);
  if (!client) {
    return {
      ...DEPARTMENT_META[department],
      department,
      errors: config.missing,
      generatedAt: new Date().toISOString(),
      items: [],
      metrics: [],
      status: "unconfigured",
    };
  }

  try {
    if (department === "accounting") return await loadAccountingSurface(client);
    if (department === "operations") return await loadOperationsSurface(client);
    if (department === "sales") return await loadSalesSurface(client);
    if (department === "marketing") return await loadMarketingSurface(client);
    if (department === "executive") return await loadExecutiveSurface(client);
    return await loadSystemSurface(client);
  } catch (error) {
    return {
      ...DEPARTMENT_META[department],
      department,
      errors: [error instanceof Error ? error.message : "Live department query failed"],
      generatedAt: new Date().toISOString(),
      items: [],
      metrics: [],
      status: "degraded",
    };
  }
}

async function loadFreshCommandCenterSurface(env: RuntimeEnv): Promise<LiveCommandCenterSurface> {
  const surfaces = await Promise.all(departments.map((department) => loadDepartmentSurface(department.id, env)));
  const items = surfaces.flatMap((surface) => surface.items).sort((a, b) => {
    const priorityRank: Record<LiveWorkPriority, number> = { critical: 4, high: 3, normal: 2, low: 1 };
    return priorityRank[b.priority] - priorityRank[a.priority] || b.valueAtRisk - a.valueAtRisk;
  });
  const errors = surfaces.flatMap((surface) => surface.errors.map((error) => `${surface.department}: ${error}`));
  const blocked = items.filter((row) => row.status === "blocked").length;
  const needsReview = items.filter((row) => row.status === "needs_review").length;
  const totalValue = items.reduce((total, row) => total + row.valueAtRisk, 0);

  return {
    errors,
    generatedAt: new Date().toISOString(),
    items,
    metrics: [
      metric("Live work items", formatNumber(items.length), "Derived from Supabase source rows", "info"),
      metric("Need review", formatNumber(needsReview), "Human decisions ready now", needsReview ? "review" : "ready"),
      metric("Blocked", formatNumber(blocked), "Critical decisions or runtime failures", blocked ? "critical" : "ready"),
      metric("Value surfaced", formatMoney(totalValue), "Visible source-backed value at risk", totalValue ? "critical" : "ready"),
    ],
    status: errors.length ? "degraded" : "live",
  };
}

export async function loadCommandCenterSurface(env: RuntimeEnv = getRuntimeEnv()): Promise<LiveCommandCenterSurface> {
  const now = Date.now();
  if (commandCenterSurfaceCache && commandCenterSurfaceCache.expiresAt > now) {
    return commandCenterSurfaceCache.surface;
  }

  if (!commandCenterSurfaceInflight) {
    commandCenterSurfaceInflight = loadFreshCommandCenterSurface(env)
      .then((surface) => {
        commandCenterSurfaceCache = {
          expiresAt: Date.now() + surfaceCacheTtl(surface.status),
          surface,
        };
        return surface;
      })
      .finally(() => {
        commandCenterSurfaceInflight = null;
      });
  }

  return commandCenterSurfaceInflight;
}

export function serializeLiveWorkQueueItem(work: LiveWorkItem, actor: CommandCenterActor) {
  const department = departments.find((item) => item.id === work.department);
  const cadence = cadences.find((item) => item.id === work.cadence);

  return {
    id: work.id,
    workKey: work.workKey,
    title: work.title,
    department: work.department,
    departmentLabel: department?.label ?? work.department,
    workflow: work.workflow,
    cadence: work.cadence,
    cadenceLabel: cadence?.label ?? work.cadence,
    owner: work.owner,
    primaryHuman: work.primaryHuman,
    nextRun: work.nextRun,
    status: work.status,
    statusLabel: formatStatus(work.status),
    priority: work.priority,
    approval: work.approval,
    approvalLabel: formatApproval(work.approval),
    auditorRequired: work.auditorRequired,
    evidence: work.evidence,
    action: work.action,
    detail: work.detail,
    auditTrail: work.auditTrail,
    href: work.href,
    sourceLabel: work.sourceLabel,
    sourceTable: work.sourceTable,
    sourcePk: work.sourcePk,
    valueAtRisk: work.valueAtRisk,
    allowedDecisions: actor.permissions.includes("approval.decide")
      ? ["approve", "reject", "needs_more_evidence", "resume_agent"]
      : ["needs_more_evidence", "resume_agent"],
    requiresHumanApproval: work.approval !== "none",
  };
}

export async function recordLiveWorkDecision(
  work: LiveWorkItem,
  actor: CommandCenterActor,
  decision: WorkQueueDecision,
  note: string | null,
  env: RuntimeEnv = getRuntimeEnv(),
) {
  const { client, config } = createServerSupabaseClient(env);
  if (!client) throw new Error(`Supabase is not configured: ${config.missing.join(", ")}`);

  const { data: workItem, error: workError } = await client
    .from("dashboard_work_items")
    .upsert(
      {
        approval_required: work.approval !== "none",
        assigned_to: work.owner,
        department: work.department,
        evidence: work.auditTrail.map((entry) => ({ text: entry })),
        primary_human: work.primaryHuman,
        priority: work.priority,
        source_data: {
          evidence: work.evidence,
          href: work.href,
          sourceLabel: work.sourceLabel,
        },
        source_pk: work.sourcePk,
        source_system: work.sourceLabel,
        source_table: work.sourceTable,
        status: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : decision,
        summary: work.detail,
        title: work.title,
        value_at_risk: work.valueAtRisk,
        workflow: work.workflow,
        work_key: work.workKey,
      },
      { onConflict: "work_key" },
    )
    .select("id")
    .single();

  if (workError) throw new Error(`dashboard_work_items: ${workError.message}`);

  const insert: DashboardActionInsert = {
    action_type: "human_decision",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision,
    department: work.department,
    note,
    payload: {
      auditEvent: buildDecisionAuditEvent(
        {
          ...work,
          cron: "",
          detail: work.detail,
          evidence: work.evidence,
        },
        actor,
        decision,
        note,
      ),
      href: work.href,
      priority: work.priority,
      valueAtRisk: work.valueAtRisk,
    },
    source_pk: work.sourcePk,
    source_table: work.sourceTable,
    work_item_id: workItem?.id ?? null,
    work_key: work.workKey,
    workflow: work.workflow,
  };

  const { data: action, error: actionError } = await client
    .from("dashboard_action_log")
    .insert(insert)
    .select("id,created_at")
    .single();

  if (actionError) throw new Error(`dashboard_action_log: ${actionError.message}`);

  if (workItem?.id && action?.id) {
    await client
      .from("dashboard_work_items")
      .update({
        last_action_id: action.id,
        resolved_at: decision === "approve" || decision === "reject" ? new Date().toISOString() : null,
        resolved_by: decision === "approve" || decision === "reject" ? actor.id : null,
      })
      .eq("id", workItem.id);
  }

  if (action?.id) {
    const channelId = slackChannelFor(work, env) ?? null;
    await client
      .from("slack_mirror_events")
      .insert({
        action_log_id: action.id,
        channel_id: channelId,
        error_message: channelId ? null : "No Slack mirror channel configured for this department/workflow.",
        payload: {
          actor: actor.displayName,
          decision,
          department: work.department,
          href: work.href,
          note,
          priority: work.priority,
          source: work.sourceLabel,
          text: `${actor.displayName} recorded ${decision} for ${work.title}. ${note ? `Note: ${note}` : ""}`.trim(),
          title: work.title,
          valueAtRisk: work.valueAtRisk,
          workflow: work.workflow,
        },
        status: channelId ? "queued" : "skipped",
        work_key: work.workKey,
      });
  }

  invalidateCommandCenterSurfaceCache();

  return { action, workItem };
}

export { cadences, departments, formatApproval, formatMoney, formatNumber, formatStatus };
