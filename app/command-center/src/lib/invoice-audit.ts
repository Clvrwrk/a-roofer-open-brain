// Accounting → Invoice Audit loader.
// Office → Vendor/Branch → Invoice drill-down (the Estimate-Audit pattern) over
// live ABC invoices, with per-line variance vs negotiated pricing where a price
// agreement covers the item (v_invoice_audit_* views, migration 99). Lines with
// no negotiated match surface as "No Price" — itself the key audit finding.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import { loadItemUomMap, convertPrice } from "@lib/uom";

export interface InvLine {
  lineId: string;
  itemNumber: string;
  itemDescription: string;
  qty: number;
  uom: string;
  unitPrice: number;
  extendedPrice: number;
  negotiatedPrice: number | null;
  apiPrice: number | null; // current ABC API price for this item at the invoice's branch (seed)
  apiUom: string;
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

async function loadFreshInvoiceAudit(env: RuntimeEnv = getRuntimeEnv()): Promise<InvoiceAuditData> {
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

  const [invRows, lineRows, auditRows, docRows, acculynxRows, catRows, arRows, apiPriceRows] = await Promise.all([
    fetchAll(() => client.from("v_invoice_audit_invoice").select("*")),
    fetchAll(() => client.from("v_invoice_audit_line").select("*")),
    fetchAll(() => client.from("v_invoice_line_audit_current").select("invoice_line_id,audit_status,approved_by,approval_note,source,decided_at,price_agreement_id,agreement_current,agreement_expiry_date")),
    fetchAll(() => client.from("invoice_documents").select("invoice_number,payment_status,paid_at,storage_path")),
    fetchAll(() => client.from("v_invoice_acculynx_match").select("invoice_number,pe_job_number,client_name,job_category_name").eq("matched", true)),
    fetchAll(() => client.from("roof_system_category").select("key,label,sort_order").order("sort_order")),
    // ABC open/closed report is the source of truth for open vs paid (docs/47-48). The
    // invoice_documents gate is a secondary internal signal we reconcile to this.
    fetchAll(() => client.from("abc_invoices").select("invoice_number,ar_status,date_paid")),
    // Current ABC API price per item per branch (monthly seed, migration 134).
    fetchAll(() => client.from("v_branch_item_api_price").select("item_number,branch_number_norm,api_price,api_uom")),
  ]);
  const categories = catRows.map((c) => ({ key: c.key, label: c.label, sortOrder: num(c.sort_order) }));
  if (invRows.length === 0) return empty;

  // Canonical UOM map so the ABC API price (seeded in its stocking UOM, e.g. BD) is converted
  // to each line's pricing UOM (e.g. SQ) before it's shown next to the invoice unit price.
  // Without this the API PRICE column compares across units (docs/46, migrations 119–122).
  const uomMap = await loadItemUomMap(fetchAll, client);

  // API price keyed by item|branch (leading zeros stripped); branch comes from the invoice.
  const normBranch = (b: unknown) => String(b ?? "").replace(/^0+/, "");
  const apiByKey = new Map<string, { price: number; uom: string }>();
  for (const r of apiPriceRows) apiByKey.set(`${r.item_number}|${r.branch_number_norm}`, { price: num(r.api_price), uom: r.api_uom ?? "" });
  const branchByInvoice = new Map<string, string>();
  for (const i of invRows) branchByInvoice.set(i.invoice_number, normBranch(i.branch_number ?? i.ship_to_number));

  const auditByLine = new Map<string, any>();
  for (const a of auditRows) auditByLine.set(a.invoice_line_id, a);

  const docByInvoice = new Map<string, any>();
  for (const d of docRows) if (!docByInvoice.has(d.invoice_number)) docByInvoice.set(d.invoice_number, d);

  // ABC AR report: ar_status drives open/paid (source of truth); date_paid is the report due date proxy.
  const arByInvoice = new Map<string, any>();
  for (const a of arRows) arByInvoice.set(a.invoice_number, a);

  const acculynxByInvoice = new Map<string, any>();
  for (const a of acculynxRows) acculynxByInvoice.set(a.invoice_number, a);

  const linesByInvoice = new Map<string, InvLine[]>();
  for (const l of lineRows) {
    const a = auditByLine.get(l.line_id);
    const passed = a?.audit_status === "passed";
    const list = linesByInvoice.get(l.invoice_number) ?? [];
    const api = apiByKey.get(`${l.item_number ?? ""}|${branchByInvoice.get(l.invoice_number) ?? ""}`);
    // Normalize the API price into the line's pricing UOM. Aligned → show it in the line's UOM
    // (apples-to-apples with unitPrice); not alignable → null so we render "—" rather than a
    // misleading cross-unit number (matches the Price Agreement Audit contract).
    const apiConv = api ? convertPrice(api.price, api.uom, l.uom ?? "", l.item_number ?? "", uomMap) : { value: null, aligned: true };
    list.push({
      lineId: l.line_id,
      itemNumber: l.item_number ?? "",
      itemDescription: l.item_description ?? "",
      qty: num(l.quantity),
      uom: l.uom ?? "",
      unitPrice: num(l.unit_price),
      extendedPrice: num(l.extended_price),
      negotiatedPrice: l.negotiated_price == null ? null : num(l.negotiated_price),
      apiPrice: null,
      apiUom: "",
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
    // Open vs paid = ABC AR report (ar_status). Falls back to the internal gate only when an
    // invoice has no AR-report coverage (e.g. brand-new, pre-reconcile).
    paid: arByInvoice.has(i.invoice_number)
      ? arByInvoice.get(i.invoice_number)?.ar_status === "paid"
      : docByInvoice.get(i.invoice_number)?.payment_status === "paid",
    paidAt: arByInvoice.get(i.invoice_number)?.date_paid
      ? String(arByInvoice.get(i.invoice_number).date_paid).slice(0, 10)
      : docByInvoice.get(i.invoice_number)?.paid_at
        ? String(docByInvoice.get(i.invoice_number).paid_at).slice(0, 10)
        : "",
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
    // Oldest invoice first (FIFO) — pricing/payment is time-sensitive, so the oldest
    // open invoices need attention first (Chris, 2026-06-20).
    br.invoices.sort((a, b) => (a.invoiceDate || "").localeCompare(b.invoiceDate || "") || b.atRisk - a.atRisk);
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
    // KPI cards reflect OPEN (unpaid per the ABC AR report) invoices only — the actionable
    // set for go-live. Paid/closed invoices remain a browsable historical record below the
    // cards (via the office tree + the "All invoices" filter), but don't inflate the headline.
    totals: (() => {
      const openInv = invoices.filter((i) => !i.paid);
      return {
        invoices: invoices.length, // total (drives the empty-state guard, not a card)
        creditMemos: openInv.filter((i) => i.isCreditMemo).length,
        atRisk: Math.round(openInv.reduce((s, i) => s + i.atRisk, 0)),
        creditMemoRequested: Math.round(openInv.reduce((s, i) => s + i.creditMemoRequested, 0)),
        noPrice: openInv.reduce((s, i) => s + i.noPriceLines, 0),
        flagged: openInv.reduce((s, i) => s + i.flaggedLines, 0),
        audited: openInv.reduce((s, i) => s + i.auditedLines, 0),
        pending: openInv.reduce((s, i) => s + i.pendingLines, 0),
        openInvoices: openInv.length,
        paidInvoices: invoices.filter((i) => i.paid).length,
      };
    })(),
  };
}

const INVOICE_AUDIT_CACHE_TTL_MS = 30_000;
let invoiceAuditCache: { expiresAt: number; data: InvoiceAuditData } | null = null;
let invoiceAuditInflight: Promise<InvoiceAuditData> | null = null;

export function invalidateInvoiceAuditCache() {
  invoiceAuditCache = null;
  invoiceAuditInflight = null;
}

export async function loadInvoiceAudit(env: RuntimeEnv = getRuntimeEnv()): Promise<InvoiceAuditData> {
  const now = Date.now();
  if (invoiceAuditCache && invoiceAuditCache.expiresAt > now) return invoiceAuditCache.data;
  if (!invoiceAuditInflight) {
    invoiceAuditInflight = loadFreshInvoiceAudit(env)
      .then((data) => {
        invoiceAuditCache = { expiresAt: Date.now() + INVOICE_AUDIT_CACHE_TTL_MS, data };
        return data;
      })
      .finally(() => {
        invoiceAuditInflight = null;
      });
    invoiceAuditInflight.catch(() => undefined);
  }
  return invoiceAuditInflight;
}

export function findInvoiceAuditInvoice(data: InvoiceAuditData, invoiceNumber: string): Invoice | null {
  const wanted = invoiceNumber.trim();
  if (!wanted) return null;
  for (const office of data.offices) {
    for (const branch of office.branches) {
      const invoice = branch.invoices.find((item) => item.invoiceNumber === wanted);
      if (invoice) return invoice;
    }
  }
  return null;
}

export function compactInvoiceAuditForInitialPayload(data: InvoiceAuditData): InvoiceAuditData {
  return {
    ...data,
    offices: data.offices.map((office) => ({
      ...office,
      branches: office.branches.map((branch) => {
        const hasPriceList = branch.invoices.some((invoice) => invoice.lines.some((line) => line.negotiatedPrice != null));
        return {
          ...branch,
          invoices: branch.invoices.map((invoice) => ({
            ...invoice,
            hasPriceList,
            searchText: [
              invoice.invoiceNumber,
              invoice.po,
              invoice.jobNumber,
              invoice.clientName,
              invoice.jobCategory,
              invoice.branchCode,
              invoice.branchName,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase(),
            lines: [],
          } as Invoice & { hasPriceList: boolean; searchText: string })),
        } as InvBranch & { invoices: Array<Invoice & { hasPriceList: boolean; searchText: string }> };
      }),
    })),
  };
}

const INVOICE_AUDIT_SUMMARY_CACHE_TTL_MS = 5 * 60_000;
let invoiceAuditSummaryCache: { expiresAt: number; data: InvoiceAuditData } | null = null;
let invoiceAuditSummaryInflight: Promise<InvoiceAuditData> | null = null;

function emptyInvoiceAuditData(): InvoiceAuditData {
  return {
    status: "unconfigured",
    generatedAt: new Date().toISOString(),
    offices: [],
    categories: [],
    totals: {
      invoices: 0,
      creditMemos: 0,
      atRisk: 0,
      creditMemoRequested: 0,
      noPrice: 0,
      flagged: 0,
      audited: 0,
      pending: 0,
      openInvoices: 0,
      paidInvoices: 0,
    },
  };
}

function summarizeInvoiceRows(rows: any[], docRows: any[], acculynxRows: any[], catRows: any[], arRows: any[]): InvoiceAuditData {
  const categories = catRows.map((c) => ({ key: c.key, label: c.label, sortOrder: num(c.sort_order) }));
  const docByInvoice = new Map<string, any>();
  for (const d of docRows) if (!docByInvoice.has(d.invoice_number)) docByInvoice.set(d.invoice_number, d);
  const arByInvoice = new Map<string, any>();
  for (const a of arRows) arByInvoice.set(a.invoice_number, a);
  const acculynxByInvoice = new Map<string, any>();
  for (const a of acculynxRows) acculynxByInvoice.set(a.invoice_number, a);

  const invoices: Array<Invoice & { hasPriceList: boolean; searchText: string }> = rows.map((i) => {
    const auditedLines = num(i.audited_lines ?? i.passed_lines ?? 0);
    const pendingLines = Math.max(0, num(i.pending_lines ?? i.flagged_lines) + num(i.no_price_lines) - auditedLines);
    const paid = arByInvoice.has(i.invoice_number)
      ? arByInvoice.get(i.invoice_number)?.ar_status === "paid"
      : docByInvoice.get(i.invoice_number)?.payment_status === "paid";
    const invoice: Invoice & { hasPriceList: boolean; searchText: string } = {
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
      auditedLines,
      pendingLines,
      paid,
      paidAt: arByInvoice.get(i.invoice_number)?.date_paid
        ? String(arByInvoice.get(i.invoice_number).date_paid).slice(0, 10)
        : docByInvoice.get(i.invoice_number)?.paid_at
          ? String(docByInvoice.get(i.invoice_number).paid_at).slice(0, 10)
          : "",
      hasPdf: !!docByInvoice.get(i.invoice_number)?.storage_path,
      jobNumber: acculynxByInvoice.get(i.invoice_number)?.pe_job_number ?? "",
      clientName: acculynxByInvoice.get(i.invoice_number)?.client_name ?? "",
      jobCategory: acculynxByInvoice.get(i.invoice_number)?.job_category_name ?? "",
      lines: [],
      hasPriceList: true,
      searchText: [i.invoice_number, i.purchase_order_number, i.branch_number, i.ship_to_number, i.branch_name, cleanOffice(i.office), acculynxByInvoice.get(i.invoice_number)?.pe_job_number, acculynxByInvoice.get(i.invoice_number)?.client_name, acculynxByInvoice.get(i.invoice_number)?.job_category_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
    return invoice;
  });

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
    br.invoices.sort((a, b) => (a.invoiceDate || "").localeCompare(b.invoiceDate || "") || b.atRisk - a.atRisk);
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
  const openInv = invoices.filter((i) => !i.paid);

  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    offices,
    categories,
    totals: {
      invoices: invoices.length,
      creditMemos: openInv.filter((i) => i.isCreditMemo).length,
      atRisk: Math.round(openInv.reduce((sum, inv) => sum + inv.atRisk, 0)),
      creditMemoRequested: Math.round(openInv.reduce((sum, inv) => sum + inv.creditMemoRequested, 0)),
      noPrice: openInv.reduce((sum, inv) => sum + inv.noPriceLines, 0),
      flagged: openInv.reduce((sum, inv) => sum + inv.flaggedLines, 0),
      audited: openInv.reduce((sum, inv) => sum + inv.auditedLines, 0),
      pending: openInv.reduce((sum, inv) => sum + inv.pendingLines, 0),
      openInvoices: openInv.length,
      paidInvoices: invoices.filter((i) => i.paid).length,
    },
  };
}

async function fetchAllForInvoiceAudit(make: () => any): Promise<any[]> {
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
}

async function loadFreshInvoiceAuditSummary(env: RuntimeEnv = getRuntimeEnv()): Promise<InvoiceAuditData> {
  const empty = emptyInvoiceAuditData();
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;
  const invoiceColumns = [
    "invoice_number",
    "invoice_date",
    "order_date",
    "total_amount",
    "is_credit_memo",
    "sales_type",
    "purchase_order_number",
    "branch_number",
    "ship_to_number",
    "branch_name",
    "office",
    "line_count",
    "no_price_lines",
    "flagged_lines",
    "at_risk",
    "credit_memo_amount",
    "worst_pct",
  ].join(",");
  const [invRows, catRows] = await Promise.all([
    fetchAllForInvoiceAudit(() => client.from("v_invoice_audit_invoice").select(invoiceColumns)),
    fetchAllForInvoiceAudit(() => client.from("roof_system_category").select("key,label,sort_order").order("sort_order")),
  ]);
  if (invRows.length === 0) return empty;
  return summarizeInvoiceRows(invRows, [], [], catRows, []);
}

export async function loadInvoiceAuditSummary(env: RuntimeEnv = getRuntimeEnv()): Promise<InvoiceAuditData> {
  const now = Date.now();
  if (invoiceAuditSummaryCache && invoiceAuditSummaryCache.expiresAt > now) return invoiceAuditSummaryCache.data;
  if (!invoiceAuditSummaryInflight) {
    invoiceAuditSummaryInflight = loadFreshInvoiceAuditSummary(env)
      .then((data) => {
        invoiceAuditSummaryCache = { expiresAt: Date.now() + INVOICE_AUDIT_SUMMARY_CACHE_TTL_MS, data };
        return data;
      })
      .finally(() => {
        invoiceAuditSummaryInflight = null;
      });
    invoiceAuditSummaryInflight.catch(() => undefined);
  }
  return invoiceAuditSummaryInflight;
}

export async function loadInvoiceAuditInvoiceDetail(invoiceNumber: string, env: RuntimeEnv = getRuntimeEnv()): Promise<Invoice | null> {
  const wanted = invoiceNumber.trim();
  if (!wanted) return null;
  const { client } = createServerSupabaseClient(env);
  if (!client) return null;

  const invoiceResult = await client.from("v_invoice_audit_invoice").select("*").eq("invoice_number", wanted).maybeSingle();
  const i = invoiceResult.data as any | null;
  if (!i) return null;

  const lineRows = await fetchAllForInvoiceAudit(() => client.from("v_invoice_audit_line").select("*").eq("invoice_number", wanted));
  const lineIds = lineRows.map((line) => line.line_id).filter(Boolean);
  const [auditRows, docRows, acculynxRows, arRows] = await Promise.all([
    lineIds.length
      ? fetchAllForInvoiceAudit(() => client.from("v_invoice_line_audit_current").select("invoice_line_id,audit_status,approved_by,approval_note,source,decided_at,price_agreement_id,agreement_current,agreement_expiry_date").in("invoice_line_id", lineIds))
      : Promise.resolve([]),
    fetchAllForInvoiceAudit(() => client.from("invoice_documents").select("invoice_number,payment_status,paid_at,storage_path").eq("invoice_number", wanted)),
    fetchAllForInvoiceAudit(() => client.from("v_invoice_acculynx_match").select("invoice_number,pe_job_number,client_name,job_category_name").eq("matched", true).eq("invoice_number", wanted)),
    fetchAllForInvoiceAudit(() => client.from("abc_invoices").select("invoice_number,ar_status,date_paid").eq("invoice_number", wanted)),
  ]);
  const auditByLine = new Map<string, any>();
  for (const a of auditRows) auditByLine.set(a.invoice_line_id, a);
  const doc = docRows[0] ?? null;
  const ar = arRows[0] ?? null;
  const ax = acculynxRows[0] ?? null;

  const lines: InvLine[] = lineRows.map((l) => {
    const a = auditByLine.get(l.line_id);
    const passed = a?.audit_status === "passed";
    return {
      lineId: l.line_id,
      itemNumber: l.item_number ?? "",
      itemDescription: l.item_description ?? "",
      qty: num(l.quantity),
      uom: l.uom ?? "",
      unitPrice: num(l.unit_price),
      extendedPrice: num(l.extended_price),
      negotiatedPrice: l.negotiated_price == null ? null : num(l.negotiated_price),
      apiPrice: null,
      apiUom: "",
      variancePct: l.variance_pct == null ? null : num(l.variance_pct),
      varianceExt: l.variance_ext == null ? null : num(l.variance_ext),
      auditable: l.is_auditable !== false,
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
    };
  }).sort((a, b) => Math.abs(b.variancePct ?? 0) - Math.abs(a.variancePct ?? 0));

  const paid = ar ? ar.ar_status === "paid" : doc?.payment_status === "paid";
  const invoice: Invoice = {
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
    auditedLines: lines.filter((line) => line.audited).length,
    pendingLines: lines.filter((line) => line.auditable && !line.audited).length,
    paid,
    paidAt: ar?.date_paid ? String(ar.date_paid).slice(0, 10) : doc?.paid_at ? String(doc.paid_at).slice(0, 10) : "",
    hasPdf: !!doc?.storage_path,
    jobNumber: ax?.pe_job_number ?? "",
    clientName: ax?.client_name ?? "",
    jobCategory: ax?.job_category_name ?? "",
    lines,
  };
  return invoice;
}

