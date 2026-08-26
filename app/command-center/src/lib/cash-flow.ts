// 13-week cash flow forecast (13WCF) — the live board behind
// /accounting/cash-flow and /executive/cash-runway (mig 281).
//
// The receipts side links DYNAMICALLY to the WIP/AR board: dated jobs come from
// v_13wcf_receipts_week (wip_ar_master.expected_invoice_cash_date), the undated
// remainder from v_13wcf_undated_pool. The moment a job gets an expected date on
// the Friday board it moves out of the assumption-spread pool and into its real
// week here — no copy, no sync step.
//
// All drivers live in wcf_assumptions (editable on the accounting surface,
// audit-logged to wcf_assumption_updates). Projection math is a pure function
// (computeProjection) so it is unit-testable and identical between the JSON
// board and the XLSX export.

import { createServerSupabaseClient } from "@lib/supabase.server";

export interface WcfAssumption {
  key: string;
  value: number;
  label: string;
  note: string | null;
  minValue: number;
  maxValue: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface WcfWeek {
  weekStart: string; // ISO Monday
  datedReceipts: number;
  undatedReceipts: number;
  newBillings: number;
  totalReceipts: number;
  materials: number;
  subs: number;
  commissions: number;
  /** Materials + subs + commissions — the direct (COGS) side of the outflows. */
  totalDirect: number;
  payroll: number;
  fixedOverhead: number;
  oneTime: number;
  /** Payroll + register overhead + one-time — the overhead side of the outflows. */
  totalOverhead: number;
  totalDisbursements: number;
  net: number;
  beginningCash: number;
  endingCash: number;
  weeksOfCash: number;
  belowFloor: boolean;
}

export interface UndatedJob {
  jobId: string;
  jobNumber: string;
  client: string;
  location: string;
  outstanding: number;
  hasInsurance: boolean;
}

export interface CashFlowBoard {
  status: "live" | "unconfigured";
  generatedAt: string;
  beginningCash: number;
  bankAccounts: { name: string; balance: number }[];
  assumptions: WcfAssumption[];
  weeks: WcfWeek[];
  minCashFloor: number;
  minEndingCash: number;
  minEndingWeek: string | null;
  floorBreached: boolean;
  datedCash: number;
  datedJobs: number;
  pastExpectedCash: number;
  undatedCash: number;
  undatedJobs: number;
  undatedInsuranceCash: number;
  /** Share of AR cash value carrying an expected date — the board's health metric. */
  datedShare: number;
  undatedTopJobs: UndatedJob[];
  provisionalNote: string;
  error: string | null;
}

interface DatedWeekRow {
  week_start: string;
  past_expected: boolean;
  has_insurance: boolean;
  jobs: number;
  expected_cash: number;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Monday of the week AFTER the as-of date — forecasts always start next week. */
export function nextMonday(asOf: Date): Date {
  const d = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const add = day === 0 ? 1 : 8 - day;
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface ProjectionInputs {
  asOf: Date;
  beginningCash: number;
  /** week_start (ISO Monday) → expected cash from dated jobs. Weeks before the
   *  forecast start (incl. past-expected) are folded into week 1. */
  datedByWeek: Map<string, number>;
  undatedPool: number;
  assumptions: Record<string, number>;
}

/** Pure 13-week projection — identical math to the reviewed Excel template. */
export function computeProjection(inputs: ProjectionInputs): WcfWeek[] {
  const a = inputs.assumptions;
  const start = nextMonday(inputs.asOf);
  const weeklyFixed = Math.round((num(a.fixed_overhead_monthly) * 12) / 52);
  const avgDisbEstimate: number[] = [];

  // Fold every dated week earlier than the forecast start into week 1.
  let week1Catchup = 0;
  for (const [wk, cash] of inputs.datedByWeek) {
    if (wk < iso(start)) week1Catchup += cash;
  }

  let cash = inputs.beginningCash;
  let undatedRemaining = inputs.undatedPool;
  const weeks: WcfWeek[] = [];

  for (let i = 0; i < 13; i++) {
    const wkDate = new Date(start);
    wkDate.setUTCDate(wkDate.getUTCDate() + i * 7);
    const wk = iso(wkDate);

    const dated = num(inputs.datedByWeek.get(wk)) + (i === 0 ? week1Catchup : 0);
    const undated = Math.round(undatedRemaining * num(a.undated_collection_pct));
    undatedRemaining -= undated;
    const newBillings = i + 1 >= num(a.new_billings_ramp_week) ? num(a.new_billings_weekly) : 0;
    const totalReceipts = dated + undated + newBillings;

    const payroll = i % 2 === 0 ? num(a.payroll_per_run) : 0; // biweekly, run in week 1
    const oneTime = i === 0 ? num(a.one_time_outflow_week1) : 0;
    const materials = num(a.materials_weekly);
    const subs = num(a.subs_weekly);
    const commissions = num(a.commissions_weekly);
    const totalDirect = materials + subs + commissions;
    const totalOverhead = payroll + weeklyFixed + oneTime;
    const totalDisbursements = totalDirect + totalOverhead;
    avgDisbEstimate.push(totalDisbursements);

    const net = totalReceipts - totalDisbursements;
    const beginningCash = cash;
    cash += net;

    weeks.push({
      weekStart: wk,
      datedReceipts: dated,
      undatedReceipts: undated,
      newBillings,
      totalReceipts,
      materials,
      subs,
      commissions,
      totalDirect,
      payroll,
      fixedOverhead: weeklyFixed,
      oneTime,
      totalOverhead,
      totalDisbursements,
      net,
      beginningCash,
      endingCash: cash,
      weeksOfCash: 0, // filled below once the 13-week average is known
      belowFloor: cash < num(a.min_cash_floor),
    });
  }

  const avgDisb = avgDisbEstimate.reduce((s, v) => s + v, 0) / avgDisbEstimate.length || 1;
  for (const w of weeks) w.weeksOfCash = Math.round((w.endingCash / avgDisb) * 10) / 10;
  return weeks;
}

function emptyBoard(error: string): CashFlowBoard {
  return {
    status: "unconfigured",
    generatedAt: new Date().toISOString(),
    beginningCash: 0,
    bankAccounts: [],
    assumptions: [],
    weeks: [],
    minCashFloor: 0,
    minEndingCash: 0,
    minEndingWeek: null,
    floorBreached: false,
    datedCash: 0,
    datedJobs: 0,
    pastExpectedCash: 0,
    undatedCash: 0,
    undatedJobs: 0,
    undatedInsuranceCash: 0,
    datedShare: 0,
    undatedTopJobs: [],
    provisionalNote: "",
    error,
  };
}

export async function loadCashFlowBoard(): Promise<CashFlowBoard> {
  const { client, config } = createServerSupabaseClient();
  if (!client) return emptyBoard(`Supabase unconfigured: ${config.missing.join(", ")}`);

  const [assumptionsRes, cashRes, datedRes, undatedRes, topJobsRes] = await Promise.all([
    client.from("wcf_assumptions").select("*").order("key"),
    client.from("v_cash_position").select("account_name, balance"),
    client.from("v_13wcf_receipts_week").select("*"),
    client.from("v_13wcf_undated_pool").select("*").maybeSingle(),
    client
      .from("wip_ar_master")
      .select("acculynx_job_id, job_number, client, location, outstanding_ar, expected_cash_amount, has_insurance")
      .eq("in_ar_population", true)
      .is("expected_invoice_cash_date", null)
      .gt("outstanding_ar", 0)
      .order("outstanding_ar", { ascending: false })
      .limit(500),
  ]);

  const firstError =
    assumptionsRes.error ?? cashRes.error ?? datedRes.error ?? undatedRes.error ?? topJobsRes.error;
  if (firstError) return emptyBoard(firstError.message);

  const assumptions: WcfAssumption[] = (assumptionsRes.data ?? []).map((r) => ({
    key: String(r.key),
    value: num(r.value),
    label: String(r.label ?? r.key),
    note: r.note == null ? null : String(r.note),
    minValue: num(r.min_value),
    maxValue: num(r.max_value),
    updatedBy: r.updated_by == null ? null : String(r.updated_by),
    updatedAt: r.updated_at == null ? null : String(r.updated_at),
  }));
  const assumptionMap: Record<string, number> = {};
  for (const a of assumptions) assumptionMap[a.key] = a.value;

  const bankAccounts = (cashRes.data ?? []).map((r) => ({
    name: String(r.account_name),
    balance: num(r.balance),
  }));
  const beginningCash = bankAccounts.reduce((s, b) => s + b.balance, 0);

  const datedRows = (datedRes.data ?? []) as unknown as DatedWeekRow[];
  const datedByWeek = new Map<string, number>();
  let datedCash = 0;
  let datedJobs = 0;
  let pastExpectedCash = 0;
  for (const r of datedRows) {
    const cashVal = num(r.expected_cash);
    datedCash += cashVal;
    datedJobs += num(r.jobs);
    if (r.past_expected) pastExpectedCash += cashVal;
    const wk = String(r.week_start).slice(0, 10);
    datedByWeek.set(wk, num(datedByWeek.get(wk)) + cashVal);
  }

  const undatedCash = num(undatedRes.data?.expected_cash);
  const undatedJobs = num(undatedRes.data?.jobs);
  const undatedInsuranceCash = num(undatedRes.data?.insurance_cash);

  const asOf = new Date();
  const weeks = computeProjection({
    asOf,
    beginningCash,
    datedByWeek,
    undatedPool: undatedCash,
    assumptions: assumptionMap,
  });

  let minEnding = Number.POSITIVE_INFINITY;
  let minWeek: string | null = null;
  for (const w of weeks) {
    if (w.endingCash < minEnding) {
      minEnding = w.endingCash;
      minWeek = w.weekStart;
    }
  }

  const totalAr = datedCash + undatedCash;
  return {
    status: "live",
    generatedAt: asOf.toISOString(),
    beginningCash,
    bankAccounts,
    assumptions,
    weeks,
    minCashFloor: num(assumptionMap.min_cash_floor),
    minEndingCash: Number.isFinite(minEnding) ? minEnding : 0,
    minEndingWeek: minWeek,
    floorBreached: weeks.some((w) => w.belowFloor),
    datedCash,
    datedJobs,
    pastExpectedCash,
    undatedCash,
    undatedJobs,
    undatedInsuranceCash,
    datedShare: totalAr > 0 ? datedCash / totalAr : 0,
    undatedTopJobs: (topJobsRes.data ?? []).map((r) => ({
      jobId: String(r.acculynx_job_id),
      jobNumber: String(r.job_number ?? ""),
      client: String(r.client ?? ""),
      location: String(r.location ?? ""),
      outstanding: num(r.expected_cash_amount ?? r.outstanding_ar),
      hasInsurance: Boolean(r.has_insurance),
    })),
    provisionalNote:
      "Assumption-driven weeks are provisional (basis_version 0, CPA rulings pending). Dated receipts are live from the WIP/AR board.",
    error: null,
  };
}
