/* Payload types + live loader for the Invoice-Audit drill-down worklists.
   The only remaining queue here is the LIVE Credit Memos queue
   (audit/credit-memos.astro); the former sample-fixture queues were retired. */

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export type AuditCol = {
  key: string;
  label: string;
  align?: "num";
  sort?: boolean;
  render?:
    | "text" | "mono" | "money" | "moneyShort" | "pct"
    | "pill" | "pillPct" | "pillMoney" | "num" | "days" | "daysDecimal" | "action";
  clsKey?: string;
  subKey?: string;
  hrefKey?: string;
  toneKey?: string;
};
export type AuditFilter = { id: string; label: string; col: string; options: { value: string; label: string }[] };
export type AuditKpi = { lab: string; val: string; go?: string; filterCol?: string; filterVal?: string; href?: string };
export type AuditQueuePayload = {
  searchKeys: string[];
  filters: AuditFilter[];
  kpis: AuditKpi[];
  columns: AuditCol[];
  rows: Record<string, any>[];
  countNoun: string;
  defaultSort?: { key: string; dir: number };
  themeKey?: string;
  years?: number[];
};

export const AUDIT_YEARS = [2024, 2025, 2026];

const uniq = (xs: string[]) => Array.from(new Set(xs)).sort();
const opts = (xs: string[]) => uniq(xs).map((v) => ({ value: v, label: v }));

const ageTone = (a: number) => (a >= 8 ? "age-danger" : a >= 4 ? "age-warn" : "age-ok");

/* ============ LIVE Credit Memos queue (v_credit_memo_audit, schema 115) ============ */
const cmMatchMeta: Record<string, { reason: string; status: string; cls: string }> = {
  matches: { reason: "Matches original — ready to approve", status: "Matches", cls: "pill-green" },
  mismatch: { reason: "Price differs from original — review", status: "Mismatch", cls: "pill-red" },
  partial: { reason: "Some items not on original invoice", status: "Partial", cls: "pill-yellow" },
  no_reference: { reason: "No original invoice reference", status: "No reference", cls: "pill-grey" },
};

const cmDispMeta: Record<string, { status: string; cls: string }> = {
  approved: { status: "Approved", cls: "pill-green" },
  needs_more_evidence: { status: "Needs review", cls: "pill-yellow" },
  rejected: { status: "Rejected", cls: "pill-red" },
  draft: { status: "Draft", cls: "pill-new" },
  sent: { status: "Sent to vendor", cls: "pill-review" },
  received: { status: "Received", cls: "pill-new" },
  closed: { status: "Closed", cls: "pill-grey" },
};

// Live credit-memo worklist. Two kinds in one queue:
//  • Received — a CM the vendor issued (v_credit_memo_audit), audited vs its original invoice.
//  • Requested — a credit WE asked for from an Invoice-Audit overcharge disposition
//    (credit_memo_requests, request_kind='requested'); the dispute tracker (draft→sent→received).
export async function loadCreditMemoQueue(env: RuntimeEnv = getRuntimeEnv()): Promise<AuditQueuePayload> {
  const { client } = createServerSupabaseClient(env);
  let received: any[] = [];
  let requests: any[] = [];
  if (client) {
    const [{ data }, { data: req }] = await Promise.all([
      client.from("v_credit_memo_audit").select("*").order("invoice_date", { ascending: false }),
      client.from("credit_memo_requests").select("invoice_number,request_kind,status,approved_by,expected_credit,line_count,external_credit_memo_number,created_at"),
    ]);
    received = (data as any[] | null) ?? [];
    requests = (req as any[] | null) ?? [];
  }
  const now = Date.now();
  const ageOf = (iso: string | null) => (iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 864e5)) : 0);
  const receivedDisp = new Map(requests.filter((r) => r.request_kind === "received").map((r) => [r.invoice_number, r]));

  const receivedRows = received.map((r) => {
    const meta = cmMatchMeta[r.match_status] ?? cmMatchMeta.no_reference;
    const d = receivedDisp.get(r.invoice_number);
    const dm = d ? cmDispMeta[(d as any).status] : null;
    const age = ageOf(r.invoice_date);
    return {
      type: "Received", typeCls: "pill-grey",
      memo: r.invoice_number,
      invoice: r.original_invoice_number ?? r.original_invoice_reference ?? "—",
      branch: r.branch_name ?? "", account: r.ship_to_number ?? "",
      amount: Math.abs(Number(r.credit_amount) || 0),
      lines: `${r.matched_lines ?? 0}/${r.line_count ?? 0} match`,
      reason: meta.reason,
      status: dm ? dm.status : meta.status,
      statusCls: dm ? dm.cls : meta.cls,
      amountCls: meta.cls,
      age, ageTone: ageTone(age),
      auditHref: `/accounting/credit-memos/${encodeURIComponent(r.invoice_number)}`,
    };
  });

  const requestedRows = requests.filter((r) => r.request_kind === "requested").map((r) => {
    const dm = cmDispMeta[r.status] ?? { status: r.status, cls: "pill-grey" };
    const age = ageOf(r.created_at);
    return {
      type: "Requested", typeCls: "pill-brand",
      memo: r.external_credit_memo_number ?? "—",
      invoice: r.invoice_number,
      branch: "", account: "",
      amount: Number(r.expected_credit) || 0,
      lines: `${r.line_count ?? 0} lines`,
      reason: "Credit requested from vendor",
      status: dm.status, statusCls: dm.cls, amountCls: "pill-yellow",
      age, ageTone: ageTone(age),
      auditHref: `/accounting/credit-memos/${encodeURIComponent(r.invoice_number)}`,
    };
  });

  const rows = [...requestedRows, ...receivedRows];
  const moneyK = (n: number) => "$" + (n / 1000).toFixed(1) + "k";
  return {
    searchKeys: ["type", "memo", "invoice", "branch", "account", "reason", "status"],
    filters: [
      { id: "type", label: "All types", col: "type", options: [{ value: "Requested", label: "Requested" }, { value: "Received", label: "Received" }] },
      { id: "status", label: "All statuses", col: "status", options: ["Matches", "Mismatch", "Partial", "No reference", "Draft", "Sent to vendor", "Received", "Approved", "Needs review", "Rejected", "Closed"].map((v) => ({ value: v, label: v })) },
      { id: "branch", label: "All branches", col: "branch", options: opts(receivedRows.map((r) => r.branch)) },
    ],
    kpis: [
      { lab: "Received CMs", val: String(receivedRows.length), go: "Received →", filterCol: "type", filterVal: "Received" },
      { lab: "Matches Original", val: String(receivedRows.filter((r) => r.status === "Matches").length), go: "Approve →", filterCol: "status", filterVal: "Matches" },
      { lab: "Needs Review", val: String(receivedRows.filter((r) => r.status === "Mismatch").length), go: "Review →", filterCol: "status", filterVal: "Mismatch" },
      { lab: "Requested", val: String(requestedRows.length), go: "Requested →", filterCol: "type", filterVal: "Requested" },
      { lab: "$ Requested", val: moneyK(requestedRows.reduce((s, r) => s + r.amount, 0)), go: "Tracking →" },
      { lab: "Awaiting Vendor", val: String(requestedRows.filter((r) => r.status === "Sent to vendor").length), go: "Chase →", filterCol: "status", filterVal: "Sent to vendor" },
    ],
    columns: [
      { key: "type", label: "Type", sort: true, render: "pill", clsKey: "typeCls" },
      { key: "memo", label: "Credit Memo #", render: "mono", sort: true },
      { key: "invoice", label: "Invoice", render: "mono", sort: true },
      { key: "branch", label: "Branch", subKey: "account", sort: true },
      { key: "amount", label: "Credit", align: "num", sort: true, render: "pillMoney", clsKey: "amountCls" },
      { key: "lines", label: "Lines", sort: true },
      { key: "reason", label: "Detail", sort: true },
      { key: "age", label: "Age", align: "num", sort: true, render: "days", toneKey: "ageTone" },
      { key: "status", label: "Status", sort: true, render: "pill", clsKey: "statusCls" },
      { key: "_a", label: "", sort: false, render: "action" },
    ],
    rows,
    countNoun: "memos",
    defaultSort: { key: "age", dir: -1 },
    themeKey: "aqCreditMemoTheme",
  };
}
