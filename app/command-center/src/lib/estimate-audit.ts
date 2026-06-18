// Operations → Estimate Audit loader.
// Shapes the live estimate pipeline (schema 90, via the v_estimate_audit_*
// views in 98) into a PE Office → Job → Estimate → Line tree.
//
// Honest gaps (flagged in the UI, not invented):
//  - Job Type Commercial/Residential/Service: schema only has retail/insurance
//    → shown as the retail/insurance pill; C/R/S is a TBD pill.
//  - PE Sales Rep contact: not on the job; branch sales rep name shown when
//    present, else placeholder.
//  - Office: derived (selected branch → office, with a "<city, ST> area"
//    fallback) since jobs carry no office_id.
//  - Tier good/better/best: live scenarios are all `custom`; tierLabel is
//    derived by price rank within the job (real package_tier shown when set).

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export interface EstimateLine {
  lineId: string;
  description: string;
  qty: number;
  uom: string;
  unitCost: number;
  lineCost: number;
  linePrice: number;
}

export interface EstimateOption {
  estimateId: string;
  tier: string; // raw package_tier
  tierLabel: string; // display: Good/Better/Best/Other N
  customName: string | null;
  productCost: number;
  laborCost: number;
  feeCost: number;
  totalCost: number;
  totalPrice: number;
  marginPct: number;
  marginRevenue: number;
  selected: boolean;
  approved: boolean;
  status: string;
  lineCount: number;
  lines: EstimateLine[];
}

export interface EstimateJob {
  runId: string;
  street: string;
  addressFull: string;
  office: string;
  jobType: string; // retail | insurance
  insurance: boolean;
  status: string;
  prospecting: boolean;
  clientName: string;
  salesRep: string;
  managerName: string;
  managerEmail: string;
  branchName: string;
  branchCode: string;
  driveMinutes: number | null;
  negotiatedPricing: boolean;
  estimatedValue: number;
  estimatedMargin: number;
  estimateApproved: boolean;
  approvedBy: string;
  approvedAt: string;
  hasMeasurement: boolean;
  hasProposal: boolean;
  scenarioCount: number;
  selectedCount: number;
  estimates: EstimateOption[];
}

export interface EstimateOffice {
  office: string;
  jobCount: number;
  jobsProspecting: number;
  estimateYes: number;
  proposalYes: number;
  measurementYes: number;
  jobs: EstimateJob[];
}

export interface EstimateAuditData {
  status: "live" | "sample" | "unconfigured";
  generatedAt: string;
  offices: EstimateOffice[];
  totals: { jobs: number; estimates: number; lines: number; proposals: number };
}

const PROSPECTING = new Set(["intake", "extracting", "packaging", "pricing", "scenarios", "proposal_draft", "awaiting_approval"]);
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

function tierLabels(options: EstimateOption[]): void {
  // Live scenarios are all `custom`; derive Good/Better/Best by price rank,
  // extras → "Other N". Honor a real package_tier when it isn't custom.
  const customs = options.filter((o) => o.tier === "custom").sort((a, b) => a.totalPrice - b.totalPrice);
  const RANK = ["Good", "Better", "Best"];
  customs.forEach((o, i) => {
    o.tierLabel = o.customName || (i < RANK.length ? RANK[i] : `Other ${i - RANK.length + 1}`);
  });
  options.forEach((o) => {
    if (o.tier !== "custom") o.tierLabel = o.tier.charAt(0).toUpperCase() + o.tier.slice(1);
  });
}

export async function loadEstimateAudit(env: RuntimeEnv = getRuntimeEnv()): Promise<EstimateAuditData> {
  const { client } = createServerSupabaseClient(env);
  if (!client) return { status: "unconfigured", generatedAt: new Date().toISOString(), offices: [], totals: { jobs: 0, estimates: 0, lines: 0, proposals: 0 } };

  const [jobRes, estRes, lineRes] = await Promise.all([
    client.from("v_estimate_audit_job").select("*"),
    client.from("v_estimate_audit_estimate").select("*"),
    client.from("v_estimate_audit_line").select("*"),
  ]);

  const jobRows = (jobRes.data as any[] | null) ?? [];
  if (jobRows.length === 0) {
    return { status: "unconfigured", generatedAt: new Date().toISOString(), offices: [], totals: { jobs: 0, estimates: 0, lines: 0, proposals: 0 } };
  }

  const linesByOption = new Map<string, EstimateLine[]>();
  for (const l of (lineRes.data as any[] | null) ?? []) {
    const list = linesByOption.get(l.option_id) ?? [];
    list.push({
      lineId: l.line_id,
      description: l.description ?? "",
      qty: num(l.rounded_quantity ?? l.required_quantity),
      uom: l.sell_uom ?? "",
      unitCost: num(l.unit_cost),
      lineCost: num(l.line_cost),
      linePrice: num(l.line_price),
    });
    linesByOption.set(l.option_id, list);
  }

  const estByRun = new Map<string, EstimateOption[]>();
  for (const e of (estRes.data as any[] | null) ?? []) {
    const opt: EstimateOption = {
      estimateId: e.estimate_id,
      tier: e.package_tier ?? "custom",
      tierLabel: e.package_tier ?? "custom",
      customName: e.custom_name ?? null,
      productCost: num(e.product_cost),
      laborCost: num(e.labor_cost),
      feeCost: num(e.fee_cost),
      totalCost: num(e.total_cost),
      totalPrice: num(e.total_price),
      marginPct: num(e.gross_margin_pct),
      marginRevenue: num(e.margin_revenue),
      selected: !!e.client_selected,
      approved: !!e.approved,
      status: e.status ?? "draft",
      lineCount: num(e.line_count),
      lines: linesByOption.get(e.estimate_id) ?? [],
    };
    const list = estByRun.get(e.run_id) ?? [];
    list.push(opt);
    estByRun.set(e.run_id, list);
  }

  const jobs: EstimateJob[] = jobRows.map((j) => {
    const estimates = estByRun.get(j.run_id) ?? [];
    tierLabels(estimates);
    estimates.sort((a, b) => a.totalPrice - b.totalPrice);
    return {
      runId: j.run_id,
      street: j.street || j.address_full || "Unknown address",
      addressFull: j.address_full || "",
      office: j.office || "Unassigned",
      jobType: j.job_type || "retail",
      insurance: j.job_type === "insurance",
      status: j.status || "intake",
      prospecting: PROSPECTING.has(j.status),
      clientName: j.client_name || "",
      salesRep: j.branch_sales_rep || "",
      managerName: j.branch_manager_name || "",
      managerEmail: j.branch_manager_email || "",
      branchName: j.branch_name || "",
      branchCode: j.branch_code || "",
      driveMinutes: j.drive_time_minutes == null ? null : Number(j.drive_time_minutes),
      negotiatedPricing: !!j.negotiated_pricing,
      estimatedValue: num(j.estimated_job_value),
      estimatedMargin: num(j.estimated_margin),
      estimateApproved: !!j.estimate_approved,
      approvedBy: j.approved_by || "",
      approvedAt: j.approved_at ? String(j.approved_at).slice(0, 10) : "",
      hasMeasurement: !!j.has_measurement,
      hasProposal: !!j.has_proposal,
      scenarioCount: num(j.scenario_count),
      selectedCount: num(j.selected_count),
      estimates,
    };
  });

  // Group into offices.
  const officeMap = new Map<string, EstimateJob[]>();
  for (const job of jobs) {
    const list = officeMap.get(job.office) ?? [];
    list.push(job);
    officeMap.set(job.office, list);
  }
  const offices: EstimateOffice[] = Array.from(officeMap, ([office, list]) => ({
    office,
    jobCount: list.length,
    jobsProspecting: list.filter((j) => j.prospecting).length,
    estimateYes: list.filter((j) => j.scenarioCount > 0).length,
    proposalYes: list.filter((j) => j.hasProposal).length,
    measurementYes: list.filter((j) => j.hasMeasurement).length,
    jobs: list.sort((a, b) => a.street.localeCompare(b.street)),
  })).sort((a, b) => a.office.localeCompare(b.office));

  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    offices,
    totals: {
      jobs: jobs.length,
      estimates: jobs.reduce((s, j) => s + j.estimates.length, 0),
      lines: jobs.reduce((s, j) => s + j.estimates.reduce((t, e) => t + e.lines.length, 0), 0),
      proposals: jobs.filter((j) => j.hasProposal).length,
    },
  };
}
