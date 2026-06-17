import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

/**
 * Price Foundation — Migration Review surface.
 *
 * The three review queues are DERIVED LIVE from the source tables that the Phase 1
 * price-foundation migration quarantines:
 *   - SKU Review Queue ......... abc_price_list_items with no catalog SKU identity
 *   - Business Rule Queue ...... abc_price_list_items pending approval (identity OK)
 *   - Branch Review Queue ...... abc_price_agreement_branch_matches auto-generated /
 *                                low-confidence matches that need human confirmation
 *
 * Human/agent resolution state is stored in the additive overlay table
 * `price_foundation_review_actions`, joined back here by a deterministic review_key.
 * Source rows stay canonical; nothing is copied or mutated.
 */

export type PriceFoundationStatus = "live" | "degraded" | "unconfigured";
export type QueueType = "sku" | "branch" | "business_rule";
export type ResolutionStatus = "open" | "resolved" | "rejected" | "deferred";
export type Tone = "critical" | "review" | "ready" | "info";

export const SKU_SOURCE_TABLE = "abc_price_list_items";
export const BRANCH_SOURCE_TABLE = "abc_price_agreement_branch_matches";
export const BUSINESS_RULE_SOURCE_TABLE = "abc_price_list_items";

export const QUEUE_LABELS: Record<QueueType, string> = {
  sku: "SKU Review Queue",
  branch: "Branch Review Queue",
  business_rule: "Business Rule Review Queue",
};

export const RESOLUTION_STATUSES: ResolutionStatus[] = ["open", "resolved", "rejected", "deferred"];

// How many detail rows to hydrate per queue. Counts/summaries use exact totals;
// the detail tables filter client-side over this hydrated window and surface the
// true total so nothing reads as "all covered" when it is not.
const DETAIL_LIMIT = 150;

export interface SummaryCard {
  key: string;
  label: string;
  value: number;
  percent: number | null;
  detail: string;
  tone: Tone;
}

export interface QueueSummary {
  queue: QueueType;
  label: string;
  total: number;
  open: number;
  resolved: number;
  rejected: number;
  deferred: number;
  oldestOpenDays: number | null;
  priority: "high" | "medium" | "low";
}

export interface ReviewRow {
  reviewKey: string;
  queue: QueueType;
  sourceTable: string;
  sourcePk: string;
  rawItemNumber: string | null;
  rawDescription: string | null;
  rawBranchNumber: string | null;
  ruleName: string | null;
  problemCategory: string;
  candidate: string | null;
  proposedResolution: string;
  unitPrice: number | null;
  resolutionStatus: ResolutionStatus;
  resolution: string | null;
  note: string | null;
  proposedByAgent: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
}

export interface ReusableHealth {
  totalAgreementItems: number;
  reusableItems: number;
  reusablePct: number | null;
  needsReview: number;
  exactMatches: number;
  unmatched: number;
  leakage: number; // approved-but-needs-review; must be 0
  oneOffModeled: boolean;
}

export interface PriceFoundationOverview {
  status: PriceFoundationStatus;
  generatedAt: string;
  runLabel: string;
  lastRunAt: string | null;
  totalSourceRecords: number;
  cards: SummaryCard[];
  queues: QueueSummary[];
  health: ReusableHealth;
  errors: string[];
}

export interface PriceFoundationQueues {
  status: PriceFoundationStatus;
  generatedAt: string;
  rows: Record<QueueType, ReviewRow[]>;
  totals: Record<QueueType, number>;
  summaries: QueueSummary[];
  problemCategories: Record<QueueType, string[]>;
  errors: string[];
}

interface OverlayRow {
  review_key: string;
  queue_type: QueueType;
  resolution_status: ResolutionStatus;
  resolution: string | null;
  note: string | null;
  proposed_by_agent: boolean | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface SkuRow {
  id: number;
  item_number: string | null;
  description: string | null;
  unit_price: number | string | null;
  has_sku: boolean | null;
  approval_status: string | null;
  created_at: string | null;
}

interface BranchRow {
  id: string;
  branch_number: string | null;
  abc_price_agreement_id: number | null;
  match_type: string | null;
  confidence_score: number | null;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function textOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export function reviewKey(queue: QueueType, sourceTable: string, sourcePk: string) {
  return `${queue}:${sourceTable}:${sourcePk}`;
}

async function safeCount(client: SupabaseClient, table: string, query?: (builder: any) => any) {
  let builder = client.from(table).select("*", { count: "exact", head: true });
  if (query) builder = query(builder);
  const { count, error } = await builder;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function safeRows<T>(client: SupabaseClient, table: string, columns: string, query?: (builder: any) => any) {
  let builder = client.from(table).select(columns);
  if (query) builder = query(builder);
  const { data, error } = await builder;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

// Filter builders shared by counts and detail fetches so totals and rows agree.
const skuFilter = (b: any) => b.eq("has_sku", false);
const businessRuleFilter = (b: any) => b.eq("has_sku", true).neq("approval_status", "approved");
const branchFilter = (b: any) => b.eq("match_type", "generated_api_new");

function classifySku(row: SkuRow): { category: string; proposed: string } {
  if (!textOrNull(row.item_number)) {
    return {
      category: "missing_item_number",
      proposed: "Map to a catalog SKU or mark as non-catalog (description-only) pricing.",
    };
  }
  return {
    category: "sku_not_in_catalog",
    proposed: "Confirm the catalog product this item number maps to, or reject.",
  };
}

function buildSkuRows(rows: SkuRow[], overlay: Map<string, OverlayRow>): ReviewRow[] {
  return rows.map((row) => {
    const pk = String(row.id);
    const key = reviewKey("sku", SKU_SOURCE_TABLE, pk);
    const { category, proposed } = classifySku(row);
    return mergeOverlay(
      {
        reviewKey: key,
        queue: "sku",
        sourceTable: SKU_SOURCE_TABLE,
        sourcePk: pk,
        rawItemNumber: textOrNull(row.item_number),
        rawDescription: textOrNull(row.description),
        rawBranchNumber: null,
        ruleName: null,
        problemCategory: category,
        candidate: null,
        proposedResolution: proposed,
        unitPrice: toNumber(row.unit_price),
        resolutionStatus: "open",
        resolution: null,
        note: null,
        proposedByAgent: false,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: row.created_at,
      },
      overlay.get(key),
    );
  });
}

function buildBusinessRuleRows(rows: SkuRow[], overlay: Map<string, OverlayRow>): ReviewRow[] {
  return rows.map((row) => {
    const pk = String(row.id);
    const key = reviewKey("business_rule", BUSINESS_RULE_SOURCE_TABLE, pk);
    return mergeOverlay(
      {
        reviewKey: key,
        queue: "business_rule",
        sourceTable: BUSINESS_RULE_SOURCE_TABLE,
        sourcePk: pk,
        rawItemNumber: textOrNull(row.item_number),
        rawDescription: textOrNull(row.description),
        rawBranchNumber: null,
        ruleName: "pending_approval",
        problemCategory: "pending_approval",
        candidate: null,
        proposedResolution: "Approve for reusable pricing, or reject / hold for more evidence.",
        unitPrice: toNumber(row.unit_price),
        resolutionStatus: "open",
        resolution: null,
        note: null,
        proposedByAgent: false,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: row.created_at,
      },
      overlay.get(key),
    );
  });
}

function buildBranchRows(rows: BranchRow[], overlay: Map<string, OverlayRow>): ReviewRow[] {
  return rows.map((row) => {
    const pk = String(row.id);
    const key = reviewKey("branch", BRANCH_SOURCE_TABLE, pk);
    const branch = textOrNull(row.branch_number);
    const conf = toNumber(row.confidence_score);
    return mergeOverlay(
      {
        reviewKey: key,
        queue: "branch",
        sourceTable: BRANCH_SOURCE_TABLE,
        sourcePk: pk,
        rawItemNumber: null,
        rawDescription: null,
        rawBranchNumber: branch,
        ruleName: null,
        problemCategory: "unverified_branch_match",
        candidate: row.abc_price_agreement_id ? `Agreement #${row.abc_price_agreement_id}` : null,
        proposedResolution: `Confirm branch ${branch ?? "?"} → agreement mapping (auto-generated, confidence ${conf ?? "?"}).`,
        unitPrice: null,
        resolutionStatus: "open",
        resolution: null,
        note: null,
        proposedByAgent: false,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: row.created_at,
      },
      overlay.get(key),
    );
  });
}

function mergeOverlay(base: ReviewRow, overlay?: OverlayRow): ReviewRow {
  if (!overlay) return base;
  return {
    ...base,
    resolutionStatus: overlay.resolution_status ?? base.resolutionStatus,
    resolution: overlay.resolution ?? base.resolution,
    note: overlay.note ?? base.note,
    proposedByAgent: overlay.proposed_by_agent ?? base.proposedByAgent,
    reviewedBy: overlay.reviewed_by ?? base.reviewedBy,
    reviewedAt: overlay.reviewed_at ?? base.reviewedAt,
  };
}

async function loadOverlay(client: SupabaseClient): Promise<Map<string, OverlayRow>> {
  const rows = await safeRows<OverlayRow>(
    client,
    "price_foundation_review_actions",
    "review_key,queue_type,resolution_status,resolution,note,proposed_by_agent,reviewed_by,reviewed_at",
  );
  const map = new Map<string, OverlayRow>();
  for (const row of rows) map.set(row.review_key, row);
  return map;
}

function overlayCounts(overlay: Map<string, OverlayRow>, queue: QueueType) {
  let resolved = 0;
  let rejected = 0;
  let deferred = 0;
  for (const row of overlay.values()) {
    if (row.queue_type !== queue) continue;
    if (row.resolution_status === "resolved") resolved += 1;
    else if (row.resolution_status === "rejected") rejected += 1;
    else if (row.resolution_status === "deferred") deferred += 1;
  }
  return { resolved, rejected, deferred };
}

function queuePriority(queue: QueueType): QueueSummary["priority"] {
  if (queue === "sku") return "high";
  return "medium";
}

function buildQueueSummary(
  queue: QueueType,
  total: number,
  overlay: Map<string, OverlayRow>,
  oldestCreatedAt: string | null,
): QueueSummary {
  const { resolved, rejected, deferred } = overlayCounts(overlay, queue);
  const open = Math.max(0, total - resolved - rejected - deferred);
  return {
    queue,
    label: QUEUE_LABELS[queue],
    total,
    open,
    resolved,
    rejected,
    deferred,
    oldestOpenDays: open > 0 ? daysSince(oldestCreatedAt) : null,
    priority: queuePriority(queue),
  };
}

function unconfiguredOverview(missing: string[]): PriceFoundationOverview {
  return {
    status: "unconfigured",
    generatedAt: new Date().toISOString(),
    runLabel: "phase1-abc-price-foundation",
    lastRunAt: null,
    totalSourceRecords: 0,
    cards: [],
    queues: [],
    health: {
      totalAgreementItems: 0,
      reusableItems: 0,
      reusablePct: null,
      needsReview: 0,
      exactMatches: 0,
      unmatched: 0,
      leakage: 0,
      oneOffModeled: false,
    },
    errors: [`Supabase not configured: ${missing.join(", ")}`],
  };
}

// ---------------------------------------------------------------------------
// loaders
// ---------------------------------------------------------------------------

export async function loadPriceFoundationOverview(
  env: RuntimeEnv = getRuntimeEnv(),
): Promise<PriceFoundationOverview> {
  const { client, config } = createServerSupabaseClient(env);
  if (!client) return unconfiguredOverview(config.missing);

  const errors: string[] = [];
  const generatedAt = new Date().toISOString();

  try {
    const [
      total,
      reusable,
      quarantined,
      reviewGated,
      skuTotal,
      branchTotal,
      businessTotal,
      overlay,
      lastRunRow,
      skuOldest,
      branchOldest,
      businessOldest,
      agreementItemsTotal,
      agreementNeedsReview,
      agreementExact,
      agreementUnmatched,
      agreementReusable,
      agreementLeakage,
    ] = await Promise.all([
      safeCount(client, SKU_SOURCE_TABLE),
      safeCount(client, SKU_SOURCE_TABLE, (b) =>
        b.eq("has_sku", true).neq("item_number", "").not("item_number", "is", null).eq("approval_status", "approved"),
      ),
      safeCount(client, SKU_SOURCE_TABLE, skuFilter),
      safeCount(client, SKU_SOURCE_TABLE, businessRuleFilter),
      safeCount(client, SKU_SOURCE_TABLE, skuFilter),
      safeCount(client, BRANCH_SOURCE_TABLE, branchFilter),
      safeCount(client, SKU_SOURCE_TABLE, businessRuleFilter),
      loadOverlay(client),
      safeRows<{ created_at: string | null }>(client, SKU_SOURCE_TABLE, "created_at", (b) =>
        b.order("created_at", { ascending: false, nullsFirst: false }).limit(1),
      ),
      safeRows<{ created_at: string | null }>(client, SKU_SOURCE_TABLE, "created_at", (b) =>
        skuFilter(b).order("created_at", { ascending: true, nullsFirst: false }).limit(1),
      ),
      safeRows<{ created_at: string | null }>(client, BRANCH_SOURCE_TABLE, "created_at", (b) =>
        branchFilter(b).order("created_at", { ascending: true, nullsFirst: false }).limit(1),
      ),
      safeRows<{ created_at: string | null }>(client, SKU_SOURCE_TABLE, "created_at", (b) =>
        businessRuleFilter(b).order("created_at", { ascending: true, nullsFirst: false }).limit(1),
      ),
      safeCount(client, "price_agreement_items"),
      safeCount(client, "price_agreement_items", (b) => b.eq("needs_review", true)),
      safeCount(client, "price_agreement_items", (b) => b.eq("match_type", "exact")),
      safeCount(client, "price_agreement_items", (b) => b.eq("match_type", "unmatched")),
      safeCount(client, "price_agreement_items", (b) =>
        b.eq("approval_status", "approved").eq("needs_review", false).not("product_id", "is", null),
      ),
      safeCount(client, "price_agreement_items", (b) => b.eq("approval_status", "approved").eq("needs_review", true)),
    ]);

    const lastRunAt = lastRunRow[0]?.created_at ?? null;
    const cards: SummaryCard[] = [
      {
        key: "total",
        label: "Total Source Records",
        value: total,
        percent: null,
        detail: `${SKU_SOURCE_TABLE} processed`,
        tone: "info",
      },
      {
        key: "reusable",
        label: "Immediately Reusable",
        value: reusable,
        percent: pct(reusable, total),
        detail: "Approved · has SKU · item number present",
        tone: "ready",
      },
      {
        key: "review_gated",
        label: "Review Gated",
        value: reviewGated,
        percent: pct(reviewGated, total),
        detail: "Has identity, pending approval",
        tone: "review",
      },
      {
        key: "quarantined",
        label: "Quarantined",
        value: quarantined,
        percent: pct(quarantined, total),
        detail: "No catalog SKU identity",
        tone: "critical",
      },
    ];

    const queues: QueueSummary[] = [
      buildQueueSummary("sku", skuTotal, overlay, skuOldest[0]?.created_at ?? null),
      buildQueueSummary("branch", branchTotal, overlay, branchOldest[0]?.created_at ?? null),
      buildQueueSummary("business_rule", businessTotal, overlay, businessOldest[0]?.created_at ?? null),
    ];

    const health: ReusableHealth = {
      totalAgreementItems: agreementItemsTotal,
      reusableItems: agreementReusable,
      reusablePct: pct(agreementReusable, agreementItemsTotal),
      needsReview: agreementNeedsReview,
      exactMatches: agreementExact,
      unmatched: agreementUnmatched,
      leakage: agreementLeakage,
      oneOffModeled: false,
    };

    return {
      status: "live",
      generatedAt,
      runLabel: "phase1-abc-price-foundation",
      lastRunAt,
      totalSourceRecords: total,
      cards,
      queues,
      health,
      errors,
    };
  } catch (error) {
    const overview = unconfiguredOverview([]);
    return {
      ...overview,
      status: "degraded",
      errors: [error instanceof Error ? error.message : "Failed to load price foundation overview"],
    };
  }
}

export async function loadPriceFoundationQueues(
  env: RuntimeEnv = getRuntimeEnv(),
): Promise<PriceFoundationQueues> {
  const { client, config } = createServerSupabaseClient(env);
  const generatedAt = new Date().toISOString();
  const empty: Record<QueueType, ReviewRow[]> = { sku: [], branch: [], business_rule: [] };

  if (!client) {
    return {
      status: "unconfigured",
      generatedAt,
      rows: empty,
      totals: { sku: 0, branch: 0, business_rule: 0 },
      summaries: [],
      problemCategories: { sku: [], branch: [], business_rule: [] },
      errors: [`Supabase not configured: ${config.missing.join(", ")}`],
    };
  }

  try {
    const [overlay, skuTotal, branchTotal, businessTotal, skuSource, branchSource, businessSource] =
      await Promise.all([
        loadOverlay(client),
        safeCount(client, SKU_SOURCE_TABLE, skuFilter),
        safeCount(client, BRANCH_SOURCE_TABLE, branchFilter),
        safeCount(client, SKU_SOURCE_TABLE, businessRuleFilter),
        safeRows<SkuRow>(client, SKU_SOURCE_TABLE, "id,item_number,description,unit_price,has_sku,approval_status,created_at", (b) =>
          skuFilter(b).order("created_at", { ascending: false, nullsFirst: false }).limit(DETAIL_LIMIT),
        ),
        safeRows<BranchRow>(
          client,
          BRANCH_SOURCE_TABLE,
          "id,branch_number,abc_price_agreement_id,match_type,confidence_score,created_at",
          (b) => branchFilter(b).order("created_at", { ascending: false, nullsFirst: false }).limit(DETAIL_LIMIT),
        ),
        safeRows<SkuRow>(client, BUSINESS_RULE_SOURCE_TABLE, "id,item_number,description,unit_price,has_sku,approval_status,created_at", (b) =>
          businessRuleFilter(b).order("created_at", { ascending: false, nullsFirst: false }).limit(DETAIL_LIMIT),
        ),
      ]);

    const rows: Record<QueueType, ReviewRow[]> = {
      sku: buildSkuRows(skuSource, overlay),
      branch: buildBranchRows(branchSource, overlay),
      business_rule: buildBusinessRuleRows(businessSource, overlay),
    };

    const summaries: QueueSummary[] = [
      buildQueueSummary("sku", skuTotal, overlay, lastCreatedAt(rows.sku)),
      buildQueueSummary("branch", branchTotal, overlay, lastCreatedAt(rows.branch)),
      buildQueueSummary("business_rule", businessTotal, overlay, lastCreatedAt(rows.business_rule)),
    ];

    return {
      status: "live",
      generatedAt,
      rows,
      totals: { sku: skuTotal, branch: branchTotal, business_rule: businessTotal },
      summaries,
      problemCategories: {
        sku: uniqueCategories(rows.sku),
        branch: uniqueCategories(rows.branch),
        business_rule: uniqueCategories(rows.business_rule),
      },
      errors: [],
    };
  } catch (error) {
    return {
      status: "degraded",
      generatedAt,
      rows: empty,
      totals: { sku: 0, branch: 0, business_rule: 0 },
      summaries: [],
      problemCategories: { sku: [], branch: [], business_rule: [] },
      errors: [error instanceof Error ? error.message : "Failed to load price foundation queues"],
    };
  }
}

function lastCreatedAt(rows: ReviewRow[]): string | null {
  // rows are ordered newest-first; the oldest hydrated row approximates queue age.
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].createdAt) return rows[i].createdAt;
  }
  return null;
}

function uniqueCategories(rows: ReviewRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.problemCategory))).sort();
}
