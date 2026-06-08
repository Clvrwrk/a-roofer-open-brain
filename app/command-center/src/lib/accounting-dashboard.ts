import { formatCurrency, formatNumber, loadAgreementGapSurface, type AgreementGapRow, type GapSeverity } from "@lib/abc-price-gaps";

export type AccountingDashboardSlug =
  | "vendor-intake"
  | "review-queue"
  | "invoices"
  | "price-agreement-gaps"
  | "credit-memos"
  | "product-matches"
  | "vendor-regions"
  | "ar-aging"
  | "insurance-proceeds"
  | "change-orders"
  | "job-costing"
  | "close"
  | "audit-log";

export type DashboardReadiness = "live" | "partial";

export interface AccountingDashboardDefinition {
  slug: AccountingDashboardSlug;
  title: string;
  owner: string;
  decision: string;
  action: string;
  hidden: string;
  readiness: DashboardReadiness;
  route: string;
  source: string;
  description: string;
}

export interface CreditMemoCandidate {
  id: string;
  invoiceNumber: string;
  href: string;
  severity: GapSeverity;
  lineCount: number;
  expectedCredit: number;
  absoluteVariance: number;
  branchLabels: string[];
  gapReasonLabels: string[];
  paymentStatus: string;
  lines: AgreementGapRow[];
}

export interface InvoiceGateCandidate {
  invoiceNumber: string;
  href: string;
  paymentStatus: string;
  lineCount: number;
  criticalRows: number;
  blockedRows: number;
  reviewRows: number;
  expectedCredit: number;
  absoluteVariance: number;
  primaryAction: string;
}

export interface AccountingSurface {
  generatedAt: string;
  status: "live" | "degraded" | "unconfigured";
  errors: string[];
  gapRows: AgreementGapRow[];
  creditMemoCandidates: CreditMemoCandidate[];
  invoiceGateCandidates: InvoiceGateCandidate[];
  metrics: {
    gapRows: number;
    criticalRows: number;
    openInvoices: number;
    expectedCredit: number;
    missingSkuRows: number;
    missingBranchRows: number;
    varianceRows: number;
    absoluteVariance: number;
  };
}

const severityRank: Record<GapSeverity, number> = {
  critical: 0,
  blocked: 1,
  review: 2,
};

export const accountingDashboards: AccountingDashboardDefinition[] = [
  {
    slug: "vendor-intake",
    title: "Vendor Invoice Intake",
    owner: "Lucinda",
    decision: "Is this vendor batch complete enough to audit?",
    action: "Retry import, request the missing file, or start audit.",
    hidden: "Line-level price math until the batch import passes.",
    readiness: "live",
    route: "/accounting/vendor-intake",
    source: "ABC invoice mirror and ABC review queue.",
    description: "Tracks portal exports, CSV/ZIP/PDF imports, failed extraction, and batch ownership.",
  },
  {
    slug: "review-queue",
    title: "ABC Review Queue",
    owner: "Lucinda",
    decision: "Which invoice/order row needs accounting attention first?",
    action: "Resolve, assign, or request more evidence from the source row.",
    hidden: "Resolved review rows and healthy invoice lines.",
    readiness: "live",
    route: "/accounting/review-queue",
    source: "abc_review_queue, dashboard_action_log.",
    description: "Open ABC review rows sorted by value at risk and wired to durable dashboard decisions.",
  },
  {
    slug: "invoices",
    title: "Invoice Payment Gate",
    owner: "Lucinda",
    decision: "Can this invoice be paid without eroding margin?",
    action: "Approve to pay, keep blocked, or route an override escalation.",
    hidden: "Product catalog browse and paid/healthy rows that do not need action.",
    readiness: "live",
    route: "/accounting/invoices",
    source: "invoice_documents, v_invoice_pricing_gate, ABC invoice mirror.",
    description: "Invoice-level queue backed by current ABC gap rows and payment status.",
  },
  {
    slug: "price-agreement-gaps",
    title: "Price Agreement Gap Queue",
    owner: "Roberto / Chris",
    decision: "What pricing fix unblocks this invoice line?",
    action: "Approve product/UOM/branch fix, then verify final agreement authority.",
    hidden: "Invoices with no pricing issue.",
    readiness: "live",
    route: "/accounting/price-agreement-gaps",
    source: "abc_price_agreements, abc_price_list_items, ABC invoice/order mirror.",
    description: "Line-level guardrail queue for missing SKU lines, branch mappings, date windows, and variance.",
  },
  {
    slug: "credit-memos",
    title: "Credit Memo Packets",
    owner: "Lucinda",
    decision: "Is this one-invoice credit memo packet ready for human external send?",
    action: "Approve, request changes, reject, mark sent, or mark received.",
    hidden: "Unrelated invoices and vendor history unless the packet escalates.",
    readiness: "live",
    route: "/accounting/credit-memos",
    source: "ABC price gap rows, credit_memo_requests, dashboard_action_log.",
    description: "Supabase-backed candidate packets grouped by invoice with durable packet/action state.",
  },
  {
    slug: "product-matches",
    title: "Product Match and UOM Stewardship",
    owner: "Roberto",
    decision: "Is this product/UOM mapping safe to promote to instruction-grade?",
    action: "Approve, reject, or request evidence.",
    hidden: "Whole-catalog browse outside affected packet rows.",
    readiness: "live",
    route: "/accounting/product-matches",
    source: "ABC invoice lines, ABC price list items, and dashboard action log.",
    description: "Shows SKU and UOM blockers that prevent credit memo packets from going external.",
  },
  {
    slug: "vendor-regions",
    title: "Vendor Region and Branch Mapping",
    owner: "Roberto",
    decision: "Which vendor branch or region agreement covers this Ship-To account?",
    action: "Approve mapping, flag exception, or escalate for agreement verification.",
    hidden: "Map decoration unless it explains a blocked invoice line.",
    readiness: "live",
    route: "/accounting/vendor-regions",
    source: "abc_regions, abc_vendor_branches, branch matches, Ship-To access.",
    description: "Branch and agreement coverage queue for the pricing zone decisions that protect invoice math.",
  },
  {
    slug: "ar-aging",
    title: "AR Aging and Collections Readiness",
    owner: "Lucinda",
    decision: "What AR follow-up is safe now?",
    action: "Ask Lucinda for QB facts, then route the collections checklist.",
    hidden: "Paid or healthy balances by default.",
    readiness: "live",
    route: "/accounting/ar-aging",
    source: "crm_pipeline.balance_due; QuickBooks remains isolated and Lucinda-controlled.",
    description: "Standard Accounting work lane; dashboard asks and records Lucinda-confirmed answers.",
  },
  {
    slug: "insurance-proceeds",
    title: "Insurance Proceeds and Depreciation Recovery",
    owner: "Lucinda / PM",
    decision: "What claim money is still recoverable?",
    action: "Route supplement, RCV holdback, or certificate-of-completion task.",
    hidden: "Non-insurance jobs.",
    readiness: "live",
    route: "/accounting/insurance-proceeds",
    source: "crm_pipeline insurance fields and AccuLynx job insurance mirror when hydrated.",
    description: "Standard process lane for ACV, RCV, supplements, and depreciation recovery.",
  },
  {
    slug: "change-orders",
    title: "Change Order Financial Review",
    owner: "PM / Lucinda",
    decision: "Can this performed-work amount enter revenue?",
    action: "Attach signature, reject, or hold from final invoice.",
    hidden: "Ops logs unrelated to cost or authorization.",
    readiness: "live",
    route: "/accounting/change-orders",
    source: "acculynx_job_financials.change_order_total and dashboard evidence actions.",
    description: "Prevents unsigned work from entering invoices or close packets.",
  },
  {
    slug: "job-costing",
    title: "Job Costing and Margin Risk",
    owner: "Lucinda",
    decision: "Is this job financially at risk?",
    action: "Investigate variance, ask Lucinda for QB facts, or route close blocker.",
    hidden: "Healthy closed jobs by default.",
    readiness: "live",
    route: "/accounting/job-costing",
    source: "crm_pipeline, AccuLynx financials, ABC orders/lines; QB facts stay Lucinda-controlled.",
    description: "Material-cost confidence and margin risk without direct QuickBooks control.",
  },
  {
    slug: "close",
    title: "Financial Close and Month-End Close",
    owner: "Lucinda",
    decision: "Can this job or period close?",
    action: "Clear blocker, record Lucinda-confirmed QB reference, or escalate.",
    hidden: "Everything already reconciled.",
    readiness: "live",
    route: "/accounting/close",
    source: "crm_pipeline completed/invoiced rows and dashboard_work_items close states.",
    description: "Blocker list with evidence links and final close packet readiness.",
  },
  {
    slug: "audit-log",
    title: "Accounting Audit Log and Vendor QC",
    owner: "Chris / QC",
    decision: "Is this a process problem or a one-off packet issue?",
    action: "Open DMAIC, update standard, or inspect escalation packet.",
    hidden: "Routine pass events unless sampled or repeated.",
    readiness: "live",
    route: "/accounting/audit-log",
    source: "dashboard_action_log and dashboard_work_items.",
    description: "Pattern dashboard for overrides, math checks, rejected packets, and vendor repeat misses.",
  },
];

export function getAccountingDashboard(slug: string | undefined) {
  return accountingDashboards.find((dashboard) => dashboard.slug === slug);
}

function groupByInvoice(rows: AgreementGapRow[]) {
  const groups = new Map<string, AgreementGapRow[]>();
  for (const row of rows) {
    const list = groups.get(row.invoiceNumber) ?? [];
    list.push(row);
    groups.set(row.invoiceNumber, list);
  }
  return groups;
}

function expectedCreditForRow(row: AgreementGapRow) {
  const variance = row.variance ?? 0;
  const quantity = row.quantity ?? 1;
  return variance > 0 ? variance * quantity : 0;
}

function highestSeverity(rows: AgreementGapRow[]): GapSeverity {
  return rows
    .map((row) => row.severity)
    .sort((a, b) => severityRank[a] - severityRank[b])[0] ?? "review";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export async function loadAccountingSurface(): Promise<AccountingSurface> {
  const gaps = await loadAgreementGapSurface();
  const byInvoice = groupByInvoice(gaps.rows);

  const creditMemoCandidates: CreditMemoCandidate[] = Array.from(byInvoice.entries())
    .map(([invoiceNumber, lines]) => {
      const expectedCredit = lines.reduce((sum, row) => sum + expectedCreditForRow(row), 0);
      const absoluteVariance = lines.reduce((sum, row) => sum + Math.abs(row.variance ?? 0) * (row.quantity ?? 1), 0);
      const severity = highestSeverity(lines);
      const first = lines[0];

      return {
        id: invoiceNumber,
        invoiceNumber,
        href: `/accounting/credit-memos/${encodeURIComponent(invoiceNumber)}`,
        severity,
        lineCount: lines.length,
        expectedCredit,
        absoluteVariance,
        branchLabels: unique(lines.map((row) => row.branchName)),
        gapReasonLabels: unique(lines.flatMap((row) => row.gapReasons.map((reason) => reason.label))),
        paymentStatus: first?.paymentStatus ?? "unknown",
        lines,
      };
    })
    .filter((candidate) => candidate.expectedCredit > 0 || candidate.severity !== "review")
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.expectedCredit - a.expectedCredit || b.absoluteVariance - a.absoluteVariance);

  const invoiceGateCandidates: InvoiceGateCandidate[] = Array.from(byInvoice.entries())
    .map(([invoiceNumber, lines]) => {
      const criticalRows = lines.filter((row) => row.severity === "critical").length;
      const blockedRows = lines.filter((row) => row.severity === "blocked").length;
      const reviewRows = lines.filter((row) => row.severity === "review").length;
      const expectedCredit = lines.reduce((sum, row) => sum + expectedCreditForRow(row), 0);
      const absoluteVariance = lines.reduce((sum, row) => sum + Math.abs(row.variance ?? 0) * (row.quantity ?? 1), 0);
      const first = lines[0];

      return {
        invoiceNumber,
        href: `/accounting/invoices?invoice=${encodeURIComponent(invoiceNumber)}`,
        paymentStatus: first?.paymentStatus ?? "unknown",
        lineCount: lines.length,
        criticalRows,
        blockedRows,
        reviewRows,
        expectedCredit,
        absoluteVariance,
        primaryAction: criticalRows > 0 ? "Keep blocked" : blockedRows > 0 ? "Resolve agreement" : expectedCredit > 0 ? "Draft credit memo" : "Review",
      };
    })
    .sort((a, b) => b.criticalRows - a.criticalRows || b.blockedRows - a.blockedRows || b.expectedCredit - a.expectedCredit);

  return {
    generatedAt: gaps.generatedAt,
    status: gaps.status,
    errors: gaps.errors,
    gapRows: gaps.rows,
    creditMemoCandidates,
    invoiceGateCandidates,
    metrics: {
      gapRows: gaps.totals.gapRows,
      criticalRows: gaps.totals.criticalRows,
      openInvoices: invoiceGateCandidates.filter((candidate) => candidate.paymentStatus === "unpaid").length,
      expectedCredit: creditMemoCandidates.reduce((sum, candidate) => sum + candidate.expectedCredit, 0),
      missingSkuRows: gaps.totals.missingPriceListItems,
      missingBranchRows: gaps.totals.missingBranchAgreements,
      varianceRows: gaps.totals.varianceRows,
      absoluteVariance: gaps.totals.absoluteVariance,
    },
  };
}

export { formatCurrency, formatNumber };
