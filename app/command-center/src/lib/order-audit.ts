// Operations → Order Audit loader.
// PE Office → Vendor/Branch → Order → Line drill-down over live ABC orders
// (v_order_audit_* + v_order_acculynx_match, migration 106). ABC order LINES
// carry no price (orders are pre-pricing), so this is a VERIFICATION + COVERAGE
// audit, not a variance audit:
//   • AcuLynx verification — does the order PO map to a PE job? (matched flag)
//   • Negotiated coverage — is each ordered item covered by a current price
//     agreement for that ship-to? Uncovered lines are the audit finding.
// Paginated reads: orders (~3.2k) and lines (~18.6k) both exceed PostgREST's
// 1000-row default, so selectAll() ranges through every page.

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
  negotiatedPrice: number | null;
  covered: boolean;
}

export interface Order {
  orderNumber: string;
  po: string;
  orderedOn: string;
  deliveryRequestedFor: string;
  orderStatus: string;
  orderType: string;
  orderTotal: number;
  branchCode: string;
  branchName: string;
  office: string;
  lineCount: number;
  coveredLines: number;
  uncoveredLines: number;
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
  matched: number;
  orderTotal: number;
  coveredLines: number;
  uncoveredLines: number;
  orders: Order[];
}

export interface OrdOffice {
  office: string;
  branchCount: number;
  orderCount: number;
  matched: number;
  orderTotal: number;
  coveredLines: number;
  uncoveredLines: number;
  branches: OrdBranch[];
}

export interface OrderAuditData {
  status: "live" | "unconfigured";
  generatedAt: string;
  offices: OrdOffice[];
  totals: {
    orders: number;
    matched: number;
    unmatched: number;
    orderTotal: number;
    lineCount: number;
    coveredLines: number;
    uncoveredLines: number;
  };
}

const PAGE_SIZE = 1000;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const cleanOffice = (s: string) => (s || "Unassigned").replace(/^,\s*/, "").replace(/^\s*,/, "").trim() || "Unassigned";

async function selectAll<T = any>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    from += batch.length;
  }
}

export async function loadOrderAudit(env: RuntimeEnv = getRuntimeEnv()): Promise<OrderAuditData> {
  const empty: OrderAuditData = {
    status: "unconfigured",
    generatedAt: new Date().toISOString(),
    offices: [],
    totals: { orders: 0, matched: 0, unmatched: 0, orderTotal: 0, lineCount: 0, coveredLines: 0, uncoveredLines: 0 },
  };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  const [ordRows, lineRows, matchRows] = await Promise.all([
    selectAll<any>(client, "v_order_audit_order", "*"),
    selectAll<any>(client, "v_order_audit_line", "*"),
    selectAll<any>(client, "v_order_acculynx_match", "order_number,pe_job_number,client_name,job_category_name,matched"),
  ]);
  if (ordRows.length === 0) return empty;

  const matchByOrder = new Map<string, any>();
  for (const m of matchRows) matchByOrder.set(m.order_number, m);

  const linesByOrder = new Map<string, OrdLine[]>();
  for (const l of lineRows) {
    const list = linesByOrder.get(l.order_number) ?? [];
    list.push({
      lineId: l.line_id,
      lineKey: l.line_key ?? "",
      itemNumber: l.item_number ?? "",
      itemDescription: l.item_description ?? "",
      qty: num(l.quantity),
      uom: l.uom ?? "",
      negotiatedPrice: l.negotiated_price == null ? null : num(l.negotiated_price),
      covered: !!l.covered,
    });
    linesByOrder.set(l.order_number, list);
  }

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
      branchCode: o.branch_number ?? "",
      branchName: o.branch_name ?? "",
      office: cleanOffice(o.office),
      lineCount: num(o.line_count),
      coveredLines: num(o.covered_lines),
      uncoveredLines: num(o.uncovered_lines),
      matched,
      jobNumber: matched ? m?.pe_job_number ?? "" : "",
      clientName: matched ? m?.client_name ?? "" : "",
      jobCategory: matched ? m?.job_category_name ?? "" : "",
      lines: (linesByOrder.get(o.order_number) ?? []).sort((a, b) => Number(a.covered) - Number(b.covered)),
    };
  });

  // Group order → branch → office.
  const branchMap = new Map<string, OrdBranch>();
  for (const ord of orders) {
    const key = `${ord.office}|${ord.branchCode}`;
    let br = branchMap.get(key);
    if (!br) {
      br = { branchCode: ord.branchCode, branchName: ord.branchName, office: ord.office, orderCount: 0, matched: 0, orderTotal: 0, coveredLines: 0, uncoveredLines: 0, orders: [] };
      branchMap.set(key, br);
    }
    br.orders.push(ord);
    br.orderCount++;
    if (ord.matched) br.matched++;
    br.orderTotal += ord.orderTotal;
    br.coveredLines += ord.coveredLines;
    br.uncoveredLines += ord.uncoveredLines;
  }

  const officeMap = new Map<string, OrdOffice>();
  for (const br of branchMap.values()) {
    br.orders.sort((a, b) => (b.orderedOn || "").localeCompare(a.orderedOn || "") || b.orderTotal - a.orderTotal);
    let off = officeMap.get(br.office);
    if (!off) {
      off = { office: br.office, branchCount: 0, orderCount: 0, matched: 0, orderTotal: 0, coveredLines: 0, uncoveredLines: 0, branches: [] };
      officeMap.set(br.office, off);
    }
    off.branches.push(br);
    off.branchCount++;
    off.orderCount += br.orderCount;
    off.matched += br.matched;
    off.orderTotal += br.orderTotal;
    off.coveredLines += br.coveredLines;
    off.uncoveredLines += br.uncoveredLines;
  }

  const offices = Array.from(officeMap.values())
    .map((o) => ({ ...o, orderTotal: Math.round(o.orderTotal), branches: o.branches.sort((a, b) => b.orderTotal - a.orderTotal) }))
    .sort((a, b) => b.orderTotal - a.orderTotal);

  const matched = orders.filter((o) => o.matched).length;
  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    offices,
    totals: {
      orders: orders.length,
      matched,
      unmatched: orders.length - matched,
      orderTotal: Math.round(orders.reduce((s, o) => s + o.orderTotal, 0)),
      lineCount: orders.reduce((s, o) => s + o.lineCount, 0),
      coveredLines: orders.reduce((s, o) => s + o.coveredLines, 0),
      uncoveredLines: orders.reduce((s, o) => s + o.uncoveredLines, 0),
    },
  };
}
