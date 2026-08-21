// Friday WIP/AR live board (docs/85) — loader over wip_ar_master.
//
// wip_ar_master is rebuilt nightly (pg_cron `wip-ar-master-nightly`, mig 215)
// from the AccuLynx mirror + QBO job-cost views; the meeting-editable columns
// (expected dates, collected?, notes) persist across refreshes. This loader
// only READS — edits go through /api/accounting/friday-wip/update.

import { createServerSupabaseClient } from "@lib/supabase.server";

export interface FridayWipJob {
  jobId: string;
  location: string;
  jobNumber: string;
  client: string;
  milestone: string;
  bucket: string;
  salesperson: string;
  collectionStatus: string;
  contractAmount: number;
  billedTotal: number;
  collectedRevenue: number;
  outstandingAr: number;
  billedAr: number;
  unbilled: number;
  daysInStatus: number | null;
  action: string;
  acculynxUrl: string | null;
  costsIncurred: number | null;
  expenseOutstanding: number | null;
  changeOrderTotal: number | null;
  expectedInvoiceCashDate: string | null;
  expectedPaidFullDate: string | null;
  expectedCashAmount: number | null;
  priorExpectedPaidDate: string | null;
  collectedSince: string | null;
  hitMiss: string | null;
  notes: string | null;
  computedAt: string | null;
  /** Why this job is on the board — 'ar_balance' | 'signed_contract' | 'both' (mig 258). */
  populationReason: string | null;
  /**
   * Which KPI pills / cash-map cells this row is counted in. The board's
   * filters are driven off exactly these keys, so a pill can never select a
   * different set of rows than the number on it was summed from.
   */
  kpiKeys: string[];
}

export interface FridayWipGroup {
  location: string;
  jobs: FridayWipJob[];
  totalAr: number;
  totalBilledAr: number;
  totalUnbilled: number;
}

export interface FridayWipKpis {
  ledgerJobs: number;
  totalBalance: number; // Σ N
  billedAr: number; // Σ Q — the receivable
  unbilled: number; // Σ N−Q — backlog, never AR
  criticalArTier1: number; // delivered + billed + unpaid
  tier2NeverInvoiced: number; // delivered + unbilled
  billedArNoDate: number; // billed AR without an expected-paid date
  week1: number;
  week2: number;
  week3: number;
  beyond: number;
  datedShare: number; // share of billed AR carrying a date
  costsIncurredTotal: number;
  arJobs: number; // jobs admitted by an AR balance
  signedContractJobs: number; // signed contracts carrying no AR yet (mig 258)
}

export interface FridayWipBoard {
  status: "live" | "unconfigured";
  generatedAt: string;
  kpis: FridayWipKpis;
  groups: FridayWipGroup[];
  error: string | null;
}

const DELIVERED_BUCKETS = new Set([
  "Approved – work complete → final sign-off",
  "Invoiced",
  "Closed w/AR",
]);

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function emptyBoard(error: string): FridayWipBoard {
  return {
    status: "unconfigured",
    generatedAt: new Date().toISOString(),
    kpis: {
      ledgerJobs: 0, totalBalance: 0, billedAr: 0, unbilled: 0,
      criticalArTier1: 0, tier2NeverInvoiced: 0, billedArNoDate: 0,
      week1: 0, week2: 0, week3: 0, beyond: 0, datedShare: 0,
      costsIncurredTotal: 0, arJobs: 0, signedContractJobs: 0,
    },
    groups: [],
    error,
  };
}

export async function loadFridayWipBoard(): Promise<FridayWipBoard> {
  const { client, config } = createServerSupabaseClient();
  if (!client) return emptyBoard(`Supabase unconfigured: ${config.missing.join(", ")}`);

  const { data, error } = await client
    .from("wip_ar_master")
    .select(
      "acculynx_job_id,location,job_number,client,milestone,bucket,salesperson,collection_status," +
        "contract_amount,billed_total,collected_revenue,outstanding_ar,billed_ar,unbilled," +
        "days_in_status,action,acculynx_url,costs_incurred_to_date,expense_outstanding," +
        "change_order_total,expected_invoice_cash_date,expected_paid_full_date,expected_cash_amount," +
        "prior_expected_paid_date,collected_since,hit_miss,notes,computed_at,population_reason",
    )
    .eq("in_ar_population", true)
    .order("location", { ascending: true })
    .order("outstanding_ar", { ascending: false })
    .limit(2000);

  if (error) return emptyBoard(error.message);

  const jobs: FridayWipJob[] = (data ?? []).map((r: Record<string, unknown>) => ({
    jobId: String(r.acculynx_job_id),
    location: String(r.location ?? "unknown"),
    jobNumber: String(r.job_number ?? ""),
    client: String(r.client ?? ""),
    milestone: String(r.milestone ?? ""),
    bucket: String(r.bucket ?? ""),
    salesperson: String(r.salesperson ?? ""),
    collectionStatus: String(r.collection_status ?? ""),
    contractAmount: num(r.contract_amount),
    billedTotal: num(r.billed_total),
    collectedRevenue: num(r.collected_revenue),
    outstandingAr: num(r.outstanding_ar),
    billedAr: num(r.billed_ar),
    unbilled: num(r.unbilled),
    daysInStatus: r.days_in_status == null ? null : num(r.days_in_status),
    action: String(r.action ?? "-"),
    acculynxUrl: (r.acculynx_url as string) ?? null,
    costsIncurred: r.costs_incurred_to_date == null ? null : num(r.costs_incurred_to_date),
    expenseOutstanding: r.expense_outstanding == null ? null : num(r.expense_outstanding),
    changeOrderTotal: r.change_order_total == null ? null : num(r.change_order_total),
    expectedInvoiceCashDate: (r.expected_invoice_cash_date as string) ?? null,
    expectedPaidFullDate: (r.expected_paid_full_date as string) ?? null,
    expectedCashAmount: r.expected_cash_amount == null ? null : num(r.expected_cash_amount),
    priorExpectedPaidDate: (r.prior_expected_paid_date as string) ?? null,
    collectedSince: (r.collected_since as string) ?? null,
    hitMiss: (r.hit_miss as string) ?? null,
    notes: (r.notes as string) ?? null,
    computedAt: (r.computed_at as string) ?? null,
    populationReason: (r.population_reason as string) ?? null,
    kpiKeys: [],
  }));

  // 3-week cash map runs on BILLED AR only — you cannot collect what was
  // never invoiced (workbook sheet 11 doctrine).
  const today = new Date();
  const dayMs = 86_400_000;
  const kpis: FridayWipKpis = {
    ledgerJobs: jobs.length,
    totalBalance: 0, billedAr: 0, unbilled: 0,
    criticalArTier1: 0, tier2NeverInvoiced: 0, billedArNoDate: 0,
    week1: 0, week2: 0, week3: 0, beyond: 0, datedShare: 0,
    costsIncurredTotal: 0, arJobs: 0, signedContractJobs: 0,
  };
  // Every KPI is accumulated and TAGGED in the same pass. `mark` is the only
  // place a job is counted, so a pill's filter and the number printed on it
  // are derived from one decision and cannot drift apart.
  for (const j of jobs) {
    const mark = (key: string) => { if (!j.kpiKeys.includes(key)) j.kpiKeys.push(key); };

    kpis.totalBalance += j.outstandingAr;
    mark("totalBalance"); // every ledger job — this pill doubles as "clear"

    kpis.billedAr += j.billedAr;
    if (j.billedAr > 0) mark("billedAr");

    kpis.unbilled += j.unbilled;
    if (j.unbilled > 0) mark("unbilled");

    if (j.costsIncurred != null) {
      kpis.costsIncurredTotal += j.costsIncurred;
      if (j.costsIncurred !== 0) mark("costsIncurred");
    }

    if (j.populationReason === "signed_contract") { kpis.signedContractJobs += 1; mark("signedContract"); }
    else { kpis.arJobs += 1; mark("arBalance"); }

    if (DELIVERED_BUCKETS.has(j.bucket)) {
      if (j.billedAr > 0) { kpis.criticalArTier1 += j.billedAr; mark("criticalArTier1"); }
      if (j.unbilled > 0) { kpis.tier2NeverInvoiced += j.unbilled; mark("tier2NeverInvoiced"); }
    }

    if (j.billedAr > 0) {
      const addToWeek = (dateStr: string, amount: number) => {
        const days = Math.floor((new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / dayMs);
        if (days <= 6) { kpis.week1 += amount; mark("week1"); }
        else if (days <= 13) { kpis.week2 += amount; mark("week2"); }
        else if (days <= 20) { kpis.week3 += amount; mark("week3"); }
        else { kpis.beyond += amount; mark("beyond"); }
      };
      // Estimated $ at the invoice/cash date is near-term cash; the remainder
      // of the billed balance lands at the paid-in-full date. Undated = the
      // meeting's job. A job can land in two weeks, so kpiKeys is a set.
      const estCash =
        j.expectedInvoiceCashDate && j.expectedCashAmount != null
          ? Math.min(Math.max(j.expectedCashAmount, 0), j.billedAr)
          : 0;
      if (estCash > 0 && j.expectedInvoiceCashDate) addToWeek(j.expectedInvoiceCashDate, estCash);
      const remainder = j.billedAr - estCash;
      if (remainder > 0) {
        if (j.expectedPaidFullDate) addToWeek(j.expectedPaidFullDate, remainder);
        else { kpis.billedArNoDate += remainder; mark("billedArNoDate"); }
      }
    }
  }
  kpis.datedShare = kpis.billedAr > 0 ? (kpis.billedAr - kpis.billedArNoDate) / kpis.billedAr : 0;
  for (const k of Object.keys(kpis) as (keyof FridayWipKpis)[]) {
    if (typeof kpis[k] === "number") kpis[k] = Math.round((kpis[k] as number) * 100) / 100 as never;
  }

  const byLocation = new Map<string, FridayWipJob[]>();
  for (const j of jobs) {
    const list = byLocation.get(j.location) ?? [];
    list.push(j);
    byLocation.set(j.location, list);
  }
  const groups: FridayWipGroup[] = [...byLocation.entries()]
    .map(([location, list]) => ({
      location,
      jobs: list,
      totalAr: Math.round(list.reduce((s, j) => s + j.outstandingAr, 0) * 100) / 100,
      totalBilledAr: Math.round(list.reduce((s, j) => s + j.billedAr, 0) * 100) / 100,
      totalUnbilled: Math.round(list.reduce((s, j) => s + j.unbilled, 0) * 100) / 100,
    }))
    .sort((a, b) => b.totalAr - a.totalAr);

  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    kpis,
    groups,
    error: null,
  };
}
