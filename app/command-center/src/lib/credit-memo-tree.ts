// Credit-memo work surface, nested PE Office → Vendor Branch → Credit Memo — the same
// shape every other audit surface uses (docs/95). Reads v_credit_memo_match (migration
// 236), which carries the original-invoice matching protocol, the office/branch, and the
// AccuLynx job.
//
// Every memo gets three documents a human needs side by side: the memo PDF itself, the
// original invoice it credits, and the job (Customer PO#) the money belongs to.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

const ACCULYNX_JOB_BASE_URL = "https://my.acculynx.com/jobs";

export type MatchConfidence = "exact" | "confident" | "probable" | "weak" | "none";

export interface CreditMemoRow {
  invoiceNumber: string;
  date: string;
  creditAmount: number;
  poNumber: string;
  reason: string;
  ingestSource: string;
  // matching protocol
  originalInvoiceNumber: string | null;
  originalInvoiceDate: string;
  originalInvoiceAmount: number | null;
  matchTier: string;
  confidence: MatchConfidence;
  // the three links
  memoPdfUrl: string;
  originalInvoiceHref: string | null;
  originalInvoicePdfUrl: string | null;
  jobNumber: string;
  jobHref: string | null;
  jobSource: string | null;
  clientName: string;
  // disposition, when a human has recorded one
  disposition: string;
}

export interface CreditMemoBranch {
  branchNumber: string;
  branchName: string;
  memos: CreditMemoRow[];
  creditTotal: number;
  unmatched: number;
}

export interface CreditMemoOffice {
  office: string;
  branches: CreditMemoBranch[];
  memoCount: number;
  creditTotal: number;
  unmatched: number;
}

export interface CreditMemoTree {
  generatedAt: string;
  status: "live" | "unconfigured";
  offices: CreditMemoOffice[];
  totals: {
    memos: number;
    creditTotal: number;
    byConfidence: Record<MatchConfidence, number>;
    matched: number;
    withJob: number;
  };
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const PAGE = 1000;

async function fetchAllRows(make: () => any): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw new Error(`credit memo tree query failed: ${error.message}`);
    const batch = (data as any[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

const emptyTotals = (): CreditMemoTree["totals"] => ({
  memos: 0,
  creditTotal: 0,
  byConfidence: { exact: 0, confident: 0, probable: 0, weak: 0, none: 0 },
  matched: 0,
  withJob: 0,
});

export async function loadCreditMemoTree(env: RuntimeEnv = getRuntimeEnv()): Promise<CreditMemoTree> {
  const { client } = createServerSupabaseClient(env);
  if (!client) {
    return { generatedAt: new Date().toISOString(), status: "unconfigured", offices: [], totals: emptyTotals() };
  }

  const [rows, dispRows] = await Promise.all([
    fetchAllRows(() => client.from("v_credit_memo_match").select("*").order("cm_date", { ascending: false })),
    fetchAllRows(() => client.from("credit_memo_requests").select("invoice_number,status,request_kind").eq("request_kind", "received")),
  ]);

  const dispByInvoice = new Map<string, string>();
  for (const d of dispRows) dispByInvoice.set(String(d.invoice_number), String(d.status ?? ""));

  const totals = emptyTotals();
  const officeMap = new Map<string, CreditMemoOffice>();

  for (const r of rows) {
    const confidence = (String(r.match_confidence ?? "none") as MatchConfidence);
    const original: string | null = r.original_invoice_number ?? null;
    const jobId: string | null = r.acculynx_job_id ?? null;
    const memo: CreditMemoRow = {
      invoiceNumber: String(r.invoice_number),
      date: r.cm_date ? String(r.cm_date).slice(0, 10) : "",
      creditAmount: num(r.credit_amount),
      poNumber: r.po_number ?? "",
      reason: r.credit_reason ?? "",
      ingestSource: r.ingest_source ?? "",
      originalInvoiceNumber: original,
      originalInvoiceDate: r.original_invoice_date ? String(r.original_invoice_date).slice(0, 10) : "",
      originalInvoiceAmount: r.original_invoice_amount == null ? null : num(r.original_invoice_amount),
      matchTier: String(r.match_tier ?? "none"),
      confidence,
      memoPdfUrl: `/api/invoice-audit/pdf/${encodeURIComponent(String(r.invoice_number))}`,
      originalInvoiceHref: original ? `/accounting/invoice-audit?invoice=${encodeURIComponent(original)}` : null,
      originalInvoicePdfUrl: original ? `/api/invoice-audit/pdf/${encodeURIComponent(original)}` : null,
      jobNumber: r.job_number ?? "",
      // Only a real AccuLynx id produces a link; a bare job number stays text rather than
      // a dead href (my.acculynx.com/jobs/<pe number> is not a route).
      jobHref: jobId ? `${ACCULYNX_JOB_BASE_URL}/${encodeURIComponent(jobId)}` : null,
      jobSource: r.job_source ?? null,
      clientName: r.client_name ?? "",
      disposition: dispByInvoice.get(String(r.invoice_number)) ?? "",
    };

    totals.memos += 1;
    totals.creditTotal += memo.creditAmount;
    totals.byConfidence[confidence] += 1;
    if (original) totals.matched += 1;
    if (memo.jobNumber) totals.withJob += 1;

    const officeName = String(r.office ?? "Unassigned");
    let office = officeMap.get(officeName);
    if (!office) {
      office = { office: officeName, branches: [], memoCount: 0, creditTotal: 0, unmatched: 0 };
      officeMap.set(officeName, office);
    }
    const branchNumber = String(r.branch_number ?? r.ship_to_number ?? "");
    const branchName = String(r.branch_name ?? `Branch ${branchNumber || "?"}`);
    let branch = office.branches.find((b) => b.branchNumber === branchNumber && b.branchName === branchName);
    if (!branch) {
      branch = { branchNumber, branchName, memos: [], creditTotal: 0, unmatched: 0 };
      office.branches.push(branch);
    }
    branch.memos.push(memo);
    branch.creditTotal += memo.creditAmount;
    office.memoCount += 1;
    office.creditTotal += memo.creditAmount;
    if (!original) {
      branch.unmatched += 1;
      office.unmatched += 1;
    }
  }

  const offices = [...officeMap.values()]
    .map((o) => ({ ...o, branches: o.branches.sort((a, b) => b.creditTotal - a.creditTotal) }))
    .sort((a, b) => b.creditTotal - a.creditTotal);

  return { generatedAt: new Date().toISOString(), status: "live", offices, totals };
}
