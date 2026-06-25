// Operations → Order Audit loader.
// PE Office → Vendor/Branch → Order → Line drill-down over live ABC orders
// (v_order_audit_* + v_order_acculynx_match, migrations 106/107).
//
// ABC order lines ARE priced (source of truth: apidocs.abcsupply.com/get-orders):
//   qty = raw.orderedQty.value · uom = raw.orderedQty.uom ·
//   unit price = raw.unitPrice.value · line total = raw.amount ·
//   description = abc_product_catalog by item_number (lines carry no description).
// So this is a VARIANCE audit (order unit price vs negotiated) — catching pricing
// issues BEFORE they reach Invoice Audit. Orders auto-ARCHIVE via 'system' once
// invoiced or older than 60 days (by salesOrder.createdDate); the dashboard
// defaults to ACTIVE orders — the still-catchable window.
// Paginated reads: orders (~3.2k) and lines (~18.6k) exceed PostgREST's 1000 cap.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrdLine {
  lineId: string;
  lineKey: string;
  itemNumber: string;
  itemDescription: string;
  qty: number;
  uom: string;
  unitPrice: number;
  extendedPrice: number;
  negotiatedPrice: number | null;
  variancePct: number | null;
  varianceExt: number | null;
  covered: boolean;
  categoryKey: string; // roof-system segment (schema 114)
}

export interface Order {
  orderNumber: string;
  po: string;
  orderedOn: string;
  deliveryRequestedFor: string;
  orderStatus: string;
  orderType: string;
  orderTotal: number;
  lineTotal: number;
  disposition: "active" | "archived";
  archiveReason: string;
  branchCode: string;
  branchName: string;
  office: string;
  lineCount: number;
  coveredLines: number;
  uncoveredLines: number;
  flaggedLines: number;
  atRisk: number;
  worstPct: number;
  matched: boolean;
  jobNumber: string;
  clientName: string;
  jobCategory: string;
  lines: OrdLine[];
}

export interface OrdBranch {
  branchCode: string;
  branchName: string;
  office: string;
  orderCount: number;
  activeCount: number;
  matched: number;
  orderTotal: number;
  atRisk: number;
  flaggedLines: number;
  uncoveredLines: number;
  orders: Order[];
}

export interface OrdOffice {
  office: string;
  branchCount: number;
  orderCount: number;
  activeCount: number;
  matched: number;
  orderTotal: number;
  atRisk: number;
  flaggedLines: number;
  uncoveredLines: number;
  branches: OrdBranch[];
}

export interface OrderAuditData {
  status: "live" | "unconfigured";
  generatedAt: string;
  offices: OrdOffice[];
  categories: { key: string; label: string; sortOrder: number }[];
  totals: {
    orders: number;
    active: number;
    archived: number;
    matched: number;
    orderTotal: number;
    atRisk: number;
    flaggedLines: number;
    uncoveredLines: number;
  };
}

const PAGE_SIZE = 1000;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const cleanOffice = (s: string) => (s || "Unassigned").replace(/^,\s*/, "").replace(/^\s*,/, "").trim() || "Unassigned";

async function selectAll<T = any>(client: SupabaseClient, table: string, columns: string, modify?: (q: any) => any): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    let q = client.from(table).select(columns);
    if (modify) q = modify(q);
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    from += batch.length;
  }
}

// scope "active" (default) loads only the catchable window — 181 orders + their lines —
// which is the page default and keeps load fast. "all" pulls archived too (heavier; only
// when the user explicitly opens archived/all). Lines are scoped to the loaded orders so we
// never fetch the full 18.6k-line set just to render a summary tree.
async function loadFreshOrderAudit(env: RuntimeEnv = getRuntimeEnv(), scope: "active" | "all" = "active"): Promise<OrderAuditData> {
  const empty: OrderAuditData = {
    status: "unconfigured",
    generatedAt: new Date().toISOString(),
    offices: [],
    categories: [],
    totals: { orders: 0, active: 0, archived: 0, matched: 0, orderTotal: 0, atRisk: 0, flaggedLines: 0, uncoveredLines: 0 },
  };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  const activeOnly = scope !== "all";
  const [ordRows, matchRows, catRows, archivedCountRes] = await Promise.all([
    selectAll<any>(client, "v_order_audit_order", "*", activeOnly ? (q) => q.eq("disposition", "active") : undefined),
    selectAll<any>(client, "v_order_acculynx_match", "order_number,pe_job_number,client_name,job_category_name,matched"),
    selectAll<any>(client, "roof_system_category", "key,label,sort_order"),
    // archived count for the KPI sub-line (active scope doesn't load archived orders)
    activeOnly ? client.from("v_order_audit_order").select("order_number", { count: "exact", head: true }).eq("disposition", "archived") : Promise.resolve({ count: 0 } as any),
  ]);
  const categories = catRows
    .map((c) => ({ key: c.key, label: c.label, sortOrder: num(c.sort_order) }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (ordRows.length === 0) return empty;
  const archivedCount = num((archivedCountRes as any)?.count);

  const matchByOrder = new Map<string, any>();
  for (const m of matchRows) matchByOrder.set(m.order_number, m);

  // Lines are NOT loaded here — the tree lazy-fetches them per order via
  // /api/order-audit/lines on expand, so the summary tree renders fast without the
  // full 18.6k-line set. Per-order rollups (line_count, at_risk, flagged) come from
  // v_order_audit_order, so the summary + KPIs are complete.
  const orders: Order[] = ordRows.map((o) => {
    const m = matchByOrder.get(o.order_number);
    const matched = !!m?.matched;
    return {
      orderNumber: o.order_number,
      po: o.purchase_order_number ?? "",
      orderedOn: o.ordered_on ? String(o.ordered_on).slice(0, 10) : "",
      deliveryRequestedFor: o.delivery_requested_for ? String(o.delivery_requested_for).slice(0, 10) : "",
      orderStatus: o.order_status ?? "",
      orderType: o.order_type ?? "",
      orderTotal: num(o.order_total),
      lineTotal: num(o.line_total),
      disposition: o.disposition === "archived" ? "archived" : "active",
      archiveReason: o.archive_reason ?? "",
      branchCode: o.branch_number ?? "",
      branchName: o.branch_name ?? "",
      office: cleanOffice(o.office),
      lineCount: num(o.line_count),
      coveredLines: num(o.covered_lines),
      uncoveredLines: num(o.uncovered_lines),
      flaggedLines: num(o.flagged_lines),
      atRisk: num(o.at_risk),
      worstPct: num(o.worst_pct),
      matched,
      jobNumber: matched ? m?.pe_job_number ?? "" : "",
      clientName: matched ? m?.client_name ?? "" : "",
      jobCategory: matched ? m?.job_category_name ?? "" : "",
      lines: [], // lazy-loaded on expand via /api/order-audit/lines
    };
  });

  // Group order → branch → office.
  const branchMap = new Map<string, OrdBranch>();
  for (const ord of orders) {
    const key = `${ord.office}|${ord.branchCode}`;
    let br = branchMap.get(key);
    if (!br) {
      br = { branchCode: ord.branchCode, branchName: ord.branchName, office: ord.office, orderCount: 0, activeCount: 0, matched: 0, orderTotal: 0, atRisk: 0, flaggedLines: 0, uncoveredLines: 0, orders: [] };
      branchMap.set(key, br);
    }
    br.orders.push(ord);
    br.orderCount++;
    if (ord.disposition === "active") br.activeCount++;
    if (ord.matched) br.matched++;
    br.orderTotal += ord.orderTotal;
    br.atRisk += ord.atRisk;
    br.flaggedLines += ord.flaggedLines;
    br.uncoveredLines += ord.uncoveredLines;
  }

  const officeMap = new Map<string, OrdOffice>();
  for (const br of branchMap.values()) {
    // Active first, then worst variance, then newest.
    br.orders.sort((a, b) =>
      Number(b.disposition === "active") - Number(a.disposition === "active") ||
      b.atRisk - a.atRisk ||
      (b.orderedOn || "").localeCompare(a.orderedOn || ""));
    let off = officeMap.get(br.office);
    if (!off) {
      off = { office: br.office, branchCount: 0, orderCount: 0, activeCount: 0, matched: 0, orderTotal: 0, atRisk: 0, flaggedLines: 0, uncoveredLines: 0, branches: [] };
      officeMap.set(br.office, off);
    }
    off.branches.push(br);
    off.branchCount++;
    off.orderCount += br.orderCount;
    off.activeCount += br.activeCount;
    off.matched += br.matched;
    off.orderTotal += br.orderTotal;
    off.atRisk += br.atRisk;
    off.flaggedLines += br.flaggedLines;
    off.uncoveredLines += br.uncoveredLines;
  }

  const offices = Array.from(officeMap.values())
    .map((o) => ({ ...o, atRisk: Math.round(o.atRisk), orderTotal: Math.round(o.orderTotal), branches: o.branches.sort((a, b) => b.atRisk - a.atRisk || b.activeCount - a.activeCount) }))
    .sort((a, b) => b.atRisk - a.atRisk || b.activeCount - a.activeCount);

  // Headline totals are scoped to the ACTIVE window (the catchable orders, which
  // is also the page's default filter) so the KPIs match what's shown. Archived
  // orders have already flowed past toward invoicing.
  const active = orders.filter((o) => o.disposition === "active");
  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    offices,
    categories,
    totals: {
      orders: activeOnly ? active.length + archivedCount : orders.length,
      active: active.length,
      archived: activeOnly ? archivedCount : orders.length - active.length,
      matched: active.filter((o) => o.matched).length,
      orderTotal: Math.round(active.reduce((s, o) => s + o.orderTotal, 0)),
      atRisk: Math.round(active.reduce((s, o) => s + o.atRisk, 0)),
      flaggedLines: active.reduce((s, o) => s + o.flaggedLines, 0),
      uncoveredLines: active.reduce((s, o) => s + o.uncoveredLines, 0),
    },
  };
}

const ORDERAUDIT_CACHE_TTL_MS = 5 * 60_000;
const ORDERAUDIT_MAX_STALE_MS = 24 * 60 * 60_000;
const loadOrderAuditCache = new Map<string, { expiresAt: number; data: Awaited<ReturnType<typeof loadFreshOrderAudit>> }>();
const loadOrderAuditInflight = new Map<string, ReturnType<typeof loadFreshOrderAudit> | Promise<Awaited<ReturnType<typeof loadFreshOrderAudit>>>>();

export function invalidateOrderAuditCache() {
  loadOrderAuditCache.clear();
  loadOrderAuditInflight.clear();
}

export async function loadOrderAudit(...args: Parameters<typeof loadFreshOrderAudit>): ReturnType<typeof loadFreshOrderAudit> {
  const cacheKey = String(args[1] ?? "active");
  const now = Date.now();
  const cached = loadOrderAuditCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data as Awaited<ReturnType<typeof loadFreshOrderAudit>>;
  let inflight = loadOrderAuditInflight.get(cacheKey) as ReturnType<typeof loadFreshOrderAudit> | undefined;
  if (!inflight) {
    inflight = loadFreshOrderAudit(...args)
      .then((data) => {
        loadOrderAuditCache.set(cacheKey, { expiresAt: Date.now() + ORDERAUDIT_CACHE_TTL_MS, data });
        return data;
      })
      .finally(() => {
        loadOrderAuditInflight.delete(cacheKey);
      }) as ReturnType<typeof loadFreshOrderAudit>;
    loadOrderAuditInflight.set(cacheKey, inflight);
    (inflight as Promise<unknown>).catch(() => undefined);
  }
  if (cached && cached.expiresAt + ORDERAUDIT_MAX_STALE_MS > now) return cached.data as Awaited<ReturnType<typeof loadFreshOrderAudit>>;
  return inflight;
}

