// KPI pill data — the approved task-first 7-pill set (PEC-198) + realtime refresh
// (PEC-197). ONE loader feeds both the server-rendered cards on
// /accounting/invoice-audit and GET /api/accounting/kpi-pills (the client
// re-fetches after every mutating action and on a 60s visible-tab poll).
//
// Principle (Chris, approved 2026-08-09): every pill is a work queue with a count
// and a button. Numbers that never change what the human does next are context —
// they live in subtext, not pills.

import { CM_VENDORS } from "@lib/cm-vendor-roster";
import { loadInvoiceAuditSummary } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";
import type { RuntimeEnv } from "@lib/runtime-env";
import { getRuntimeEnv } from "@lib/runtime-env";

export interface KpiVendorCm {
  slug: string;
  acronym: string;
  label: string;
  cmStatus: string; // "live" | "coming_soon"
  count: number;
  total: number;
}

export interface KpiPillData {
  generatedAt: string;
  // 1 · Claims to Review (human review gate; $ at risk folded into subtext)
  claimsUnreviewed: number;
  claimsTotal: number;
  atRisk: number;
  // 2 · CM Requests — Approve & Send (merges old Credit Memo Requested + Invoice Audit Pending)
  cmDraftCount: number;
  cmDraftTotal: number;
  cmApprovedCount: number;
  cmApprovedTotal: number;
  auditPendingCount: number;
  cmByVendor: KpiVendorCm[];
  // 3 · CMs Awaiting Vendor Credit (sent, not yet received; overdue past follow_up_due_at)
  awaitingCount: number;
  awaitingTotal: number;
  awaitingOverdue: number;
  // 4 · Due Now — Pay
  dueNow: number;
  // 5 · Paid — Pending Verification
  pendingVerification: number;
  // 6 · QB Export Pending (per vendor ledger, mig 228)
  qbPendingByVendor: { slug: string; pending: number }[];
  qbPendingTotal: number;
  // 7 · Agreement Gaps (Alex queue) — lands with PEC-195; raw no-price is its context
  noPriceLines: number;
  // header subtext context (demoted from pills)
  openInvoices: number;
  paidInvoices: number;
  creditMemosOpen: number;
}

export async function loadKpiPills(env: RuntimeEnv = getRuntimeEnv()): Promise<KpiPillData> {
  const data = await loadInvoiceAuditSummary(env); // 30s in-process cache — cheap to poll
  const out: KpiPillData = {
    generatedAt: new Date().toISOString(),
    claimsUnreviewed: 0,
    claimsTotal: 0,
    atRisk: data.totals.atRisk,
    cmDraftCount: 0,
    cmDraftTotal: 0,
    cmApprovedCount: 0,
    cmApprovedTotal: 0,
    auditPendingCount: 0,
    cmByVendor: CM_VENDORS.map((v) => ({ slug: v.slug, acronym: v.acronym, label: v.label, cmStatus: v.cmStatus, count: 0, total: 0 })),
    awaitingCount: 0,
    awaitingTotal: 0,
    awaitingOverdue: 0,
    dueNow: data.totals.dueNow,
    pendingVerification: 0,
    qbPendingByVendor: [],
    qbPendingTotal: 0,
    noPriceLines: data.totals.noPrice,
    openInvoices: data.totals.openInvoices,
    paidInvoices: data.totals.paidInvoices,
    creditMemosOpen: data.totals.creditMemos,
  };

  const { client } = createServerSupabaseClient(env);
  if (!client) return out;

  const nowIso = new Date().toISOString();
  const [pipe, pay, cms, sent, qbPend] = await Promise.all([
    client.from("invoice_pipeline_status").select("id", { count: "exact", head: true }).eq("pipeline_status", "invoice_audit_pending"),
    client.from("invoice_payment_processed").select("id", { count: "exact", head: true }).eq("status", "paid_pending_verification"),
    client.from("credit_memo_requests").select("invoice_number, vendor_slug, status, expected_credit").eq("request_kind", "requested").in("status", ["draft", "approved"]).limit(1000),
    client.from("credit_memo_requests").select("expected_credit, follow_up_due_at").eq("request_kind", "requested").eq("status", "sent").limit(2000),
    client.from("v_qb_export_pending").select("vendor_slug, pending_rows"),
  ]);

  out.auditPendingCount = pipe.count ?? 0;
  out.pendingVerification = pay.count ?? 0;

  const byVendor = new Map(out.cmByVendor.map((v) => [v.slug, v]));
  for (const r of cms.data ?? []) {
    const credit = Number(r.expected_credit ?? 0);
    if (r.status === "approved") { out.cmApprovedTotal += credit; out.cmApprovedCount += 1; }
    else { out.cmDraftTotal += credit; out.cmDraftCount += 1; }
    const v = byVendor.get(String((r as any).vendor_slug ?? "abc-supply"));
    if (v) { v.count += 1; v.total += credit; }
  }

  for (const r of sent.data ?? []) {
    out.awaitingCount += 1;
    out.awaitingTotal += Number(r.expected_credit ?? 0);
    if (r.follow_up_due_at && String(r.follow_up_due_at) < nowIso) out.awaitingOverdue += 1;
  }

  out.qbPendingByVendor = ((qbPend.data as any[] | null) ?? []).map((r) => ({ slug: String(r.vendor_slug), pending: Number(r.pending_rows ?? 0) }));
  out.qbPendingTotal = out.qbPendingByVendor.reduce((s, r) => s + r.pending, 0);

  // Claims To Review (docs/82 R5): unacknowledged claim lines of each CM invoice's
  // LATEST re-audit run — same math as /api/credit-memos/pending, so the pill always
  // agrees with the checkboxes.
  const cmInvoices = (cms.data ?? []).map((r) => r.invoice_number);
  if (cmInvoices.length) {
    const { data: lines } = await client
      .from("invoice_line_reaudit")
      .select("run_label, invoice_number, variance_ext, reviewed_at, created_at")
      .in("invoice_number", cmInvoices.slice(0, 500))
      .eq("classification", "discrepancy")
      .order("created_at", { ascending: false })
      .limit(2000);
    const latestRun = new Map<string, string>();
    for (const l of lines ?? []) if (!latestRun.has(l.invoice_number)) latestRun.set(l.invoice_number, l.run_label);
    for (const l of lines ?? []) {
      if (latestRun.get(l.invoice_number) !== l.run_label) continue;
      if (Number(l.variance_ext ?? 0) < 0.05) continue;
      out.claimsTotal += 1;
      if (!l.reviewed_at) out.claimsUnreviewed += 1;
    }
  }

  return out;
}
