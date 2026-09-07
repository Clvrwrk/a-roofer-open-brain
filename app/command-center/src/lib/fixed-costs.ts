// Fixed-Cost dashboard loader — /executive/fixed-costs (mig 281).
//
// The register (fixed_cost_register, basis_version 0) is the classification
// layer; actuals come from mv_overhead_account_month (nightly refresh, never a
// live jsonb explode — playbook #9). Every surface reading this MUST show the
// provisional banner while rows carry provisional=true: the R1–R11 rulings are
// pending the CPA strategy meeting.
//
// Allocation preview: corporate-attributed budget spread across offices by each
// office's billed share of the CURRENT WIP/AR population. This is an explicitly
// labeled placeholder — real location P&L arrives with the Jan 1 GL conversion
// (QBO Locations + Classes, tag-at-entry).

import { readCompleteFinancialRows } from "./financial-read";
import { isFinancialNumber } from "./cash-flow-inputs";
import { createServerSupabaseClient } from "@lib/supabase.server";

export interface RegisterRow {
  accountFqn: string;
  costPool: string;
  costBehavior: string;
  attribution: string;
  attributionRule: string | null;
  allocationBasis: string;
  ttmAmount: number;
  monthlyBudget: number;
  needsRuling: boolean;
  rulingRef: string | null;
  notes: string | null;
  /** Actual spend, last complete calendar month. */
  lastMonthActual: number;
  /** Trailing-3-full-month average actual. */
  avg3moActual: number;
}

export interface PoolSummary {
  pool: string;
  label: string;
  monthlyBudget: number;
  ttmAmount: number;
  lastMonthActual: number;
  avg3moActual: number;
  accounts: number;
  rulingsOpen: number;
}

export interface OfficeAllocation {
  location: string;
  billedShare: number | null;
  corporateAllocated: number | null;
}

/** Direct-cost (COGS) account actuals from the matview — context beside the
 *  overhead register, never part of it (CM docs/81: COGS attributes to jobs). */
export interface CogsRow {
  accountFqn: string;
  ttmAmount: number;
  lastMonthActual: number;
  avg3moActual: number;
}

export interface FixedCostBoard {
  status: "live" | "unconfigured";
  generatedAt: string;
  comparisonPeriod: {start:string;endExclusive:string} | null;
  basisNote: string;
  basisVersion: number;
  provisional: boolean;
  monthlyNut: number;
  ttmOverhead: number;
  ttmRevenue: number;
  overheadPctOfRevenue: number | null;
  fixedShare: number | null;
  rulingsOpen: number;
  pools: PoolSummary[];
  rows: RegisterRow[];
  officeAllocations: OfficeAllocation[];
  /** COGS vs overhead split (Chris 2026-08-26): direct-cost actuals + the
   *  cost-structure ladder Revenue → COGS → gross margin → overhead → operating. */
  cogsRows: CogsRow[];
  cogsTtm: number;
  grossMarginTtm: number;
  grossMarginPct: number | null;
  variableOverheadTtm: number;
  fixedOverheadTtm: number;
  lastFullMonth: string | null;
  error: string | null;
}

export const POOL_LABELS: Record<string, string> = {
  people: "People",
  facilities: "Facilities",
  fleet: "Fleet",
  technology: "Technology",
  marketing: "Marketing",
  insurance_risk: "Insurance & Risk",
  professional_services: "Professional Services",
  travel_meals: "Travel & Meals",
  office_admin: "Office & Admin",
  compliance_tax: "Compliance, Tax & Fees",
  financial: "Financial",
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function isoMonthStart(d: Date, offsetMonths: number): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1)).toISOString().slice(0, 10);
}

function emptyBoard(error: string): FixedCostBoard {
  return {
    status: "unconfigured",
    generatedAt: new Date().toISOString(),
    comparisonPeriod: null,
    basisNote: "Financial inputs are unavailable.",
    basisVersion: 0,
    provisional: true,
    monthlyNut: 0,
    ttmOverhead: 0,
    ttmRevenue: 0,
    overheadPctOfRevenue: 0,
    fixedShare: 0,
    rulingsOpen: 0,
    pools: [],
    rows: [],
    officeAllocations: [],
    cogsRows: [],
    cogsTtm: 0,
    grossMarginTtm: 0,
    grossMarginPct: 0,
    variableOverheadTtm: 0,
    fixedOverheadTtm: 0,
    lastFullMonth: null,
    error,
  };
}

/** The legacy ttmRevenue wire field is invoice value, not reconciled ledger revenue. */
async function loadTtmRevenue(client: NonNullable<ReturnType<typeof createServerSupabaseClient>["client"]>,start:string,end:string): Promise<number> {
  const rows=await readCompleteFinancialRows("Invoice values",(from,to)=>client.from("qbo_invoices")
    .select("qbo_id,total_amt",{count:"exact"}).gte("txn_date",start).lt("txn_date",end)
    .order("qbo_id",{ascending:true}).range(from,to),r=>String(r.qbo_id ?? ""));
  if(rows.some(r=>!isFinancialNumber(r.total_amt)))throw Error("Invoice amounts are missing or invalid.");
  const total=rows.reduce((sum,r)=>sum+Number(r.total_amt),0);
  if(!Number.isFinite(total))throw Error("Invoice totals cannot be represented safely.");
  return total;
}

export async function loadFixedCostBoard(): Promise<FixedCostBoard> {
  try {return await loadFixedCostInputs();}
  catch {return emptyBoard("Financial inputs could not be read completely. Try again.");}
}

async function loadFixedCostInputs(): Promise<FixedCostBoard> {
  const { client, config } = createServerSupabaseClient();
  if (!client) return emptyBoard(`Supabase unconfigured: ${config.missing.join(", ")}`);

  const now = new Date();
  const lastFullMonth = isoMonthStart(now, -1);
  const threeMonthsBack = isoMonthStart(now, -3);

  const ttmStart = isoMonthStart(now, -12);
  const currentMonth = isoMonthStart(now, 0);
  const [registerData,actualsData,cogsData,wipData,ttmRevenue] = await Promise.all([
    readCompleteFinancialRows("Cost register",(from,to)=>client.from("fixed_cost_register").select("*",{count:"exact"}).eq("basis_version",0).order("id").range(from,to),r=>String(r.id ?? "")),
    readCompleteFinancialRows("Overhead actuals",(from,to)=>client.from("mv_overhead_account_month").select("account_fqn,month,amount",{count:"exact"}).gte("month",threeMonthsBack).lt("month",currentMonth).order("account_fqn").order("month").range(from,to),r=>r.account_fqn && r.month ? JSON.stringify([r.account_fqn,r.month]):""),
    readCompleteFinancialRows("Direct costs",(from,to)=>client.from("mv_overhead_account_month").select("account_fqn,month,amount",{count:"exact"}).eq("account_type","Cost of Goods Sold").gte("month",ttmStart).lt("month",currentMonth).order("account_fqn").order("month").range(from,to),r=>r.account_fqn && r.month ? JSON.stringify([r.account_fqn,r.month]):""),
    readCompleteFinancialRows("Office allocation population",(from,to)=>client.from("wip_ar_master").select("acculynx_job_id,location,billed_total",{count:"exact"}).eq("in_ar_population",true).order("acculynx_job_id").range(from,to),r=>String(r.acculynx_job_id ?? "")),
    loadTtmRevenue(client,ttmStart,currentMonth),
  ]);
  if(!registerData.length || registerData.some(r=>!isFinancialNumber(r.ttm_amount)||!isFinancialNumber(r.monthly_budget)))return emptyBoard("Cost register amounts are missing or invalid.");
  if([...actualsData,...cogsData].some(r=>!isFinancialNumber(r.amount)) || wipData.some(r=>!isFinancialNumber(r.billed_total)))return emptyBoard("Cost or allocation amounts are missing or invalid.");

  // account → { lastMonth, threeMoTotal } from the matview (months are complete
  // calendar months; the current partial month is excluded from both figures).
  const lastMonthByAccount = new Map<string, number>();
  const threeMoByAccount = new Map<string, number>();
  for (const r of actualsData) {
    const month = String(r.month).slice(0, 10);
    if (month >= currentMonth) continue;
    const fqn = String(r.account_fqn);
    const amt = num(r.amount);
    threeMoByAccount.set(fqn, num(threeMoByAccount.get(fqn)) + amt);
    if (month === lastFullMonth) lastMonthByAccount.set(fqn, num(lastMonthByAccount.get(fqn)) + amt);
  }

  const rows: RegisterRow[] = (registerData).map((r) => ({
    accountFqn: String(r.account_fqn),
    costPool: String(r.cost_pool),
    costBehavior: String(r.cost_behavior),
    attribution: String(r.attribution),
    attributionRule: r.attribution_rule == null ? null : String(r.attribution_rule),
    allocationBasis: String(r.allocation_basis),
    ttmAmount: num(r.ttm_amount),
    monthlyBudget: num(r.monthly_budget),
    needsRuling: Boolean(r.needs_ruling),
    rulingRef: r.ruling_ref == null ? null : String(r.ruling_ref),
    notes: r.notes == null ? null : String(r.notes),
    lastMonthActual: num(lastMonthByAccount.get(String(r.account_fqn))),
    avg3moActual: Math.round(num(threeMoByAccount.get(String(r.account_fqn))) / 3),
  }));

  const poolMap = new Map<string, PoolSummary>();
  for (const row of rows) {
    const p = poolMap.get(row.costPool) ?? {
      pool: row.costPool,
      label: POOL_LABELS[row.costPool] ?? row.costPool,
      monthlyBudget: 0,
      ttmAmount: 0,
      lastMonthActual: 0,
      avg3moActual: 0,
      accounts: 0,
      rulingsOpen: 0,
    };
    p.monthlyBudget += row.monthlyBudget;
    p.ttmAmount += row.ttmAmount;
    p.lastMonthActual += row.lastMonthActual;
    p.avg3moActual += row.avg3moActual;
    p.accounts += 1;
    if (row.needsRuling) p.rulingsOpen += 1;
    poolMap.set(row.costPool, p);
  }
  const pools = [...poolMap.values()].sort((a, b) => b.monthlyBudget - a.monthlyBudget);

  const monthlyNut = rows.reduce((s, r) => s + r.monthlyBudget, 0);
  const ttmOverhead = rows.reduce((s, r) => s + r.ttmAmount, 0);
  const fixedTtm = rows
    .filter((r) => r.costBehavior === "fixed" || r.costBehavior === "step_fixed")
    .reduce((s, r) => s + r.ttmAmount, 0);

  // Allocation preview: corporate budget by office billed share (placeholder
  // basis until the Jan 1 GL conversion gives real location P&L).
  const billedByLocation = new Map<string, number>();
  let billedTotal = 0;
  for (const r of wipData) {
    const loc = String(r.location ?? "unassigned");
    const billed = num(r.billed_total);
    billedByLocation.set(loc, num(billedByLocation.get(loc)) + billed);
    billedTotal += billed;
  }
  const corporateBudget = rows
    .filter((r) => r.attribution === "corporate")
    .reduce((s, r) => s + r.monthlyBudget, 0);
  const officeAllocations: OfficeAllocation[] = [...billedByLocation.entries()]
    .map(([location, billed]) => ({
      location,
      billedShare: billedTotal > 0 ? billed / billedTotal : null,
      corporateAllocated: billedTotal > 0 ? Math.round((billed / billedTotal) * corporateBudget) : null,
    }))
    .sort((a, b) => (b.billedShare ?? 0) - (a.billedShare ?? 0));

  // COGS split: per-account TTM / last-full-month / trailing-3-month average
  // (the current partial month is excluded, mirroring the overhead figures).
  const cogsByAccount = new Map<string, { ttm: number; lastMonth: number; threeMo: number }>();
  for (const r of cogsData) {
    const month = String(r.month).slice(0, 10);
    if (month >= currentMonth) continue;
    const fqn = String(r.account_fqn);
    const amt = num(r.amount);
    const acc = cogsByAccount.get(fqn) ?? { ttm: 0, lastMonth: 0, threeMo: 0 };
    acc.ttm += amt;
    if (month === lastFullMonth) acc.lastMonth += amt;
    if (month >= threeMonthsBack) acc.threeMo += amt;
    cogsByAccount.set(fqn, acc);
  }
  const cogsRows: CogsRow[] = [...cogsByAccount.entries()]
    .map(([accountFqn, v]) => ({
      accountFqn,
      ttmAmount: v.ttm,
      lastMonthActual: v.lastMonth,
      avg3moActual: Math.round(v.threeMo / 3),
    }))
    .sort((a, b) => b.ttmAmount - a.ttmAmount);
  const cogsTtm = cogsRows.reduce((s, r) => s + r.ttmAmount, 0);
  const grossMarginTtm = ttmRevenue - cogsTtm;

  if(![monthlyNut,ttmOverhead,fixedTtm,billedTotal,corporateBudget,cogsTtm,grossMarginTtm].every(Number.isFinite))return emptyBoard("Financial totals cannot be represented safely.");
  return {
    status: "live",
    generatedAt: now.toISOString(),
    comparisonPeriod: {start:ttmStart,endExclusive:currentMonth},
    basisNote: "Invoice values exclude credit/ledger reconciliation. Direct costs use the same closed-month window; overhead TTM values are stored register figures with an unverified period. Comparisons are provisional, not a closed P&L or verified margin.",
    basisVersion: 0,
    provisional: (registerData).some((r) => Boolean(r.provisional)),
    monthlyNut,
    ttmOverhead,
    ttmRevenue,
    overheadPctOfRevenue: ttmRevenue > 0 ? ttmOverhead / ttmRevenue : null,
    fixedShare: ttmOverhead > 0 ? fixedTtm / ttmOverhead : null,
    rulingsOpen: rows.filter((r) => r.needsRuling).length,
    pools,
    rows,
    officeAllocations,
    cogsRows,
    cogsTtm,
    grossMarginTtm,
    grossMarginPct: ttmRevenue > 0 ? grossMarginTtm / ttmRevenue : null,
    variableOverheadTtm: ttmOverhead - fixedTtm,
    fixedOverheadTtm: fixedTtm,
    lastFullMonth,
    error: null,
  };
}
