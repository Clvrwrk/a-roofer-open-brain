// Accounting → Invoice Audit loader.
// Office → Vendor/Branch → Invoice drill-down (the Estimate-Audit pattern) over
// live ABC invoices, with per-line variance vs negotiated pricing where a price
// agreement covers the item (v_invoice_audit_* views, migration 99). Lines with
// no negotiated match surface as "No Price" — itself the key audit finding.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export interface InvLine {
  lineId: string;
  itemNumber: string;
  itemDescription: string;
  qty: number;
  uom: string;
  unitPrice: number;
  extendedPrice: number;
  negotiatedPrice: number | null;
  variancePct: number | null;
  varianceExt: number | null;
  auditable: boolean; // has resolvable qty + extended price; false → never surfaced "to audit"
  uomMismatch: boolean; // agreement priced in a different UOM than the invoice line (schema 120) → variance not computed
  negotiatedUom: string; // the UOM the agreement price is quoted in
  categoryKey: string; // roof-system segment (schema 114)
  audited: boolean;
  auditStatus: string; // passed | pending | disputed
  auditedBy: string;
  auditNote: string;
  auditSource: string; // auto_match | manual | backfill | ""
  auditedAt: string;
  agreementId: number | null;
  agreementCurrent: boolean | null;
  agreementExpiry: string;
}

export interface Invoice {
  invoiceNumber: string;
  invoiceDate: string;
  orderDate: string;
  totalAmount: number;
  isCreditMemo: boolean;
  salesType: string;
  po: string;
  branchCode: string;
  branchName: string;
  office: string;
  lineCount: number;
  noPriceLines: number;
  flaggedLines: number;
  atRisk: number;
  creditMemoRequested: number;
  worstPct: number;
  auditedLines: number;
  pendingLines: number;
  paid: boolean;
  paidAt: string;
  hasPdf: boolean;
  jobNumber: string;
  clientName: string;
  jobCategory: string;
  lines: InvLine[];
}

export interface InvBranch {
  branchCode: string;
  branchName: string;
  office: string;
  invoiceCount: number;
  creditMemos: number;
  atRisk: number;
  creditMemoRequested: number;
  noPrice: number;
  flagged: number;
  pending: number;
  invoices: Invoice[];
}

export interface InvOffice {
  office: string;
  branchCount: number;
  invoiceCount: number;
  creditMemos: number;
  atRisk: number;
  creditMemoRequested: number;
  noPrice: number;
  flagged: number;
  pending: number;
  branches: InvBranch[];
}

export interface InvoiceAuditData {
  status: "live" | "unconfigured";
  generatedAt: string;
  offices: InvOffice[];
  categories: { key: string; label: string; sortOrder: number }[];
  totals: { invoices: number; creditMemos: number; atRisk: number; creditMemoRequested: number; noPrice: number; flagged: number; audited: number; pending: number; openInvoices: number; paidInvoices: number };
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const cleanOffice = (s: string) => (s || "Unassigned").replace(/^,\s*/, "").replace(/^\s*,/, "").trim() || "Unassigned";

export async function loadInvoiceAudit(env: RuntimeEnv = getRuntimeEnv()): Promise<InvoiceAuditData> {
  const empty: InvoiceAuditData = { status: "unconfigured", generatedAt: new Date().toISOString(), offices: [], categories: [], totals: { invoices: 0, creditMemos: 0, atRisk: 0, creditMemoRequested: 0, noPrice: 0, flagged: 0, audited: 0, pending: 0, openInvoices: 0, paidInvoices: 0 } };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  // PostgREST caps a single response at 1000 rows; lines (2.6k), audit ledger (1.5k) and
  // invoice_documents (2.8k) all exceed that, so page through every table or the audit
  // silently drops >half its lines and shows stale paid/PDF/audit flags.
  const fetchAll = async (make: () => any): Promise<any[]> => {
    const PAGE = 1000;
    let from = 0;
    const rows: any[] = [];
    for (;;) {
      const { data } = await make().range(from, from + PAGE - 1);
      const batch = (data as any[] | null) ?? [];
      rows.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  };

  const [invRows, lineRows, auditRows, docRows, acculynxRows, catRows] = await Promise.all([
    fetchAll(() => client.from("v_invoice_audit_invoice").select("*")),
    fetchAll(() => client.from("v_invoice_audit_line").select("*")),
    fetchAll(() => client.from("v_invoice_line_audit_current").select("invoice_line_id,audit_status,approved_by,approval_note,source,decided_at,price_agreement_id,agreement_current,agreement_expiry_date")),
    fetchAll(() => client.from("invoice_documents").select("invoice_number,payment_status,paid_at,storage_path")),
    fetchAll(() => client.from("v_invoice_acculynx_match").select("invoice_number,pe_job_number,client_name,job_category_name").eq("matched", true)),
    fetchAll(() => client.from("roof_system_category").select("key,label,sort_order").order("sort_order")),
  ]);
  const categories = catRows.map((c) => ({ key: c.key, label: c.label, sortOrder: num(c.sort_order) }));
  if (invRows.length === 0) return empty;

  const auditByLine = new Map<string, any>();
  for (const a of auditRows) auditByLine.set(a.invoice_line_id, a);

  const docByInvoice = new Map<string, any>();
  for (const d of docRows) if (!docByInvoice.has(d.invoice_number)) docByInvoice.set(d.invoice_number, d);

  const acculynxByInvoice = new Map<string, any>();
  for (const a of acculynxRows) acculynxByInvoice.set(a.invoice_number, a);

  const linesByInvoice = new Map<string, InvLine[]>();
  for (const l of lineRows) {
    const a = auditByLine.get(l.line_id);
    const passed = a?.audit_status === "passed";
    const list = linesByInvoice.get(l.invoice_number) ?? [];
    list.push({
      lineId: l.line_id,
      itemNumber: l.item_number ?? "",
      itemDescription: l.item_description ?? "",
      qty: num(l.quantity),
      uom: l.uom ?? "",
      unitPrice: num(l.unit_price),
      extendedPrice: num(l.extended_price),
      negotiatedPrice: l.negotiated_price == null ? null : num(l.negotiated_price),
      variancePct: l.variance_pct == null ? null : num(l.variance_pct),
      varianceExt: l.variance_ext == null ? null : num(l.variance_ext),
      auditable: l.is_auditable !== false, // default true unless the view says otherwise
      uomMismatch: l.uom_mismatch === true,
      negotiatedUom: l.negotiated_uom ?? "",
      categoryKey: l.category_key ?? "uncategorized",
      audited: passed,
      auditStatus: a?.audit_status ?? "pending",
      auditedBy: a?.approved_by ?? "",
      auditNote: a?.approval_note ?? "",
      auditSource: a?.source ?? "",
      auditedAt: a?.decided_at ? String(a.decided_at).slice(0, 10) : "",
      agreementId: a?.price_agreement_id ?? null,
      agreementCurrent: a?.agreement_current ?? null,
      agreementExpiry: a?.agreement_expiry_date ? String(a.agreement_expiry_date).slice(0, 10) : "",
    });
    linesByInvoice.set(l.invoice_number, list);
  }

  const invoices: Invoice[] = invRows.map((i) => ({
    invoiceNumber: i.invoice_number,
    invoiceDate: i.invoice_date ? String(i.invoice_date).slice(0, 10) : "",
    orderDate: i.order_date ? String(i.order_date).slice(0, 10) : "",
    totalAmount: num(i.total_amount),
    isCreditMemo: !!i.is_credit_memo,
    salesType: i.sales_type ?? "",
    po: i.purchase_order_number ?? "",
    branchCode: i.branch_number ?? i.ship_to_number ?? "",
    branchName: i.branch_name ?? "",
    office: cleanOffice(i.office),
    lineCount: num(i.line_count),
    noPriceLines: num(i.no_price_lines),
    flaggedLines: num(i.flagged_lines),
    atRisk: num(i.at_risk),
    creditMemoRequested: num(i.credit_memo_amount),
    worstPct: num(i.worst_pct),
    auditedLines: 0,
    pendingLines: 0,
    paid: docByInvoice.get(i.invoice_number)?.payment_status === "paid",
    paidAt: docByInvoice.get(i.invoice_number)?.paid_at ? String(docByInvoice.get(i.invoice_number).paid_at).slice(0, 10) : "",
    hasPdf: !!docByInvoice.get(i.invoice_number)?.storage_path,
    jobNumber: acculynxByInvoice.get(i.invoice_number)?.pe_job_number ?? "",
    clientName: acculynxByInvoice.get(i.invoice_number)?.client_name ?? "",
    jobCategory: acculynxByInvoice.get(i.invoice_number)?.job_category_name ?? "",
    lines: (linesByInvoice.get(i.invoice_number) ?? []).sort((a, b) => (Math.abs(b.variancePct ?? 0) - Math.abs(a.variancePct ?? 0))),
  })).map((inv) => {
    inv.auditedLines = inv.lines.filter((l) => l.audited).length;
    // Only auditable lines (resolvable qty + price) can be "pending review" — a line
    // with no qty/price must never surface to audit (Item 6 guard).
    inv.pendingLines = inv.lines.filter((l) => l.auditable && !l.audited).length;
    return inv;
  });

  // Group invoice → branch → office.
  const branchMap = new Map<string, InvBranch>();
  for (const inv of invoices) {
    const key = `${inv.office}|${inv.branchCode}`;
    let br = branchMap.get(key);
    if (!br) {
      br = { branchCode: inv.branchCode, branchName: inv.branchName, office: inv.office, invoiceCount: 0, creditMemos: 0, atRisk: 0, creditMemoRequested: 0, noPrice: 0, flagged: 0, pending: 0, invoices: [] };
      branchMap.set(key, br);
    }
    br.invoices.push(inv);
    br.invoiceCount++;
    if (inv.isCreditMemo) br.creditMemos++;
    br.atRisk += inv.atRisk;
    br.creditMemoRequested += inv.creditMemoRequested;
    br.noPrice += inv.noPriceLines;
    br.flagged += inv.flaggedLines;
    br.pending += inv.pendingLines;
  }

  const officeMap = new Map<string, InvOffice>();
  for (const br of branchMap.values()) {
    br.invoices.sort((a, b) => (b.invoiceDate || "").localeCompare(a.invoiceDate || "") || b.atRisk - a.atRisk);
    let off = officeMap.get(br.office);
    if (!off) {
      off = { office: br.office, branchCount: 0, invoiceCount: 0, creditMemos: 0, atRisk: 0, creditMemoRequested: 0, noPrice: 0, flagged: 0, pending: 0, branches: [] };
      officeMap.set(br.office, off);
    }
    off.branches.push(br);
    off.branchCount++;
    off.invoiceCount += br.invoiceCount;
    off.creditMemos += br.creditMemos;
    off.atRisk += br.atRisk;
    off.creditMemoRequested += br.creditMemoRequested;
    off.noPrice += br.noPrice;
    off.flagged += br.flagged;
    off.pending += br.pending;
  }

  const offices = Array.from(officeMap.values())
    .map((o) => ({ ...o, atRisk: Math.round(o.atRisk), creditMemoRequested: Math.round(o.creditMemoRequested), branches: o.branches.sort((a, b) => b.atRisk - a.atRisk) }))
    .sort((a, b) => b.atRisk - a.atRisk);

  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    offices,
    categories,
    totals: {
      invoices: invoices.length,
      creditMemos: invoices.filter((i) => i.isCreditMemo).length,
      atRisk: Math.round(offices.reduce((s, o) => s + o.atRisk, 0)),
      creditMemoRequested: Math.round(offices.reduce((s, o) => s + o.creditMemoRequested, 0)),
      noPrice: offices.reduce((s, o) => s + o.noPrice, 0),
      flagged: offices.reduce((s, o) => s + o.flagged, 0),
      audited: invoices.reduce((s, i) => s + i.auditedLines, 0),
      pending: invoices.reduce((s, i) => s + i.pendingLines, 0),
      openInvoices: invoices.filter((i) => !i.paid).length,
      paidInvoices: invoices.filter((i) => i.paid).length,
    },
  };
}
