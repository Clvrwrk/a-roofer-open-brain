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
  bucket: string;
  salesperson: string;
  collectionStatus: string;
  outstandingAr: number;
  billedAr: number;
  unbilled: number;
  action: string;
  acculynxUrl: string | null;
  costsIncurred: number | null;
  changeOrderTotal: number | null;
  expectedInvoiceCashDate: string | null;
  expectedPaidFullDate: string | null;
  priorExpectedPaidDate: string | null;
  collectedSince: string | null;
  hitMiss: string | null;
  notes: string | null;
  computedAt: string | null;
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
      costsIncurredTotal: 0,
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
      "acculynx_job_id,location,job_number,client,bucket,salesperson,collection_status," +
        "outstanding_ar,billed_ar,unbilled,action,acculynx_url,costs_incurred_to_date," +
        "change_order_total,expected_invoice_cash_date,expected_paid_full_date," +
        "prior_expected_paid_date,collected_since,hit_miss,notes,computed_at",
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
    bucket: String(r.bucket ?? ""),
    salesperson: String(r.salesperson ?? ""),
    collectionStatus: String(r.collection_status ?? ""),
    outstandingAr: num(r.outstanding_ar),
    billedAr: num(r.billed_ar),
    unbilled: num(r.unbilled),
    action: String(r.action ?? "-"),
    acculynxUrl: (r.acculynx_url as string) ?? null,
    costsIncurred: r.costs_incurred_to_date == null ? null : num(r.costs_incurred_to_date),
    changeOrderTotal: r.change_order_total == null ? null : num(r.change_order_total),
    expectedInvoiceCashDate: (r.expected_invoice_cash_date as string) ?? null,
    expectedPaidFullDate: (r.expected_paid_full_date as string) ?? null,
    priorExpectedPaidDate: (r.prior_expected_paid_date as string) ?? null,
    collectedSince: (r.collected_since as string) ?? null,
    hitMiss: (r.hit_miss as string) ?? null,
    notes: (r.notes as string) ?? null,
    computedAt: (r.computed_at as string) ?? null,
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
    costsIncurredTotal: 0,
  };
  for (const j of jobs) {
    kpis.totalBalance += j.outstandingAr;
    kpis.billedAr += j.billedAr;
    kpis.unbilled += j.unbilled;
    if (j.costsIncurred != null) kpis.costsIncurredTotal += j.costsIncurred;
    if (DELIVERED_BUCKETS.has(j.bucket)) {
      if (j.billedAr > 0) kpis.criticalArTier1 += j.billedAr;
      if (j.unbilled > 0) kpis.tier2NeverInvoiced += j.unbilled;
    }
    if (j.billedAr > 0) {
      const dateStr = j.expectedPaidFullDate;
      if (!dateStr) {
        kpis.billedArNoDate += j.billedAr;
      } else {
        const days = Math.floor((new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / dayMs);
        if (days <= 6) kpis.week1 += j.billedAr;
        else if (days <= 13) kpis.week2 += j.billedAr;
        else if (days <= 20) kpis.week3 += j.billedAr;
        else kpis.beyond += j.billedAr;
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
