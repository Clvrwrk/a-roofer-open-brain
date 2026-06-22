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
import { loadItemUomMap, convertPrice } from "@lib/uom";

export interface EstimateLine {
  lineId: string;
  description: string;
  qty: number;
  uom: string;
  unitCost: number;
  lineCost: number;
  linePrice: number;
  categoryKey: string; // roof-system segment (schema 114)
  abcItemNumber: string; // mapped ABC item (estimate_product_mappings, view mig 140)
  apiPrice: number | null; // current ABC API price at the estimate's branch (seed, mig 134)
  apiUom: string;
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
  categories: { key: string; label: string; sortOrder: number }[];
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
  if (!client) return { status: "unconfigured", generatedAt: new Date().toISOString(), offices: [], categories: [], totals: { jobs: 0, estimates: 0, lines: 0, proposals: 0 } };

  // PostgREST caps a single response at 1000 rows; the line view alone can exceed
  // that, so page through every list query or lines silently drop past row 1000.
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

  const [jobRows, estRows, lineRows, editRows, catRows, apiPriceRows] = await Promise.all([
    fetchAll(() => client.from("v_estimate_audit_job").select("*")),
    fetchAll(() => client.from("v_estimate_audit_estimate").select("*")),
    fetchAll(() => client.from("v_estimate_audit_line").select("*")),
    fetchAll(() => client.from("estimate_audit_edits").select("*")),
    fetchAll(() => client.from("roof_system_category").select("key,label,sort_order").order("sort_order")),
    // Current ABC API price per item per branch (monthly seed, migration 134).
    fetchAll(() => client.from("v_branch_item_api_price").select("item_number,branch_number_norm,api_price,api_uom")),
  ]);
  const categories = catRows.map((c) => ({ key: c.key, label: c.label, sortOrder: num(c.sort_order) }));

  // Canonical UOM map — used to convert the ABC API price into each estimate line's own
  // display unit so the row never shows the API price in a different unit (see @lib/uom, docs/46).
  const uomMap = await loadItemUomMap(fetchAll, client);

  // Operator edit overlay (schema 112): estimate-level margin + line edits/adds/deletes.
  const marginEdit = new Map<string, number>();
  const lineEdit = new Map<string, Map<string, any>>(); // estimate_id → line_id → edit
  const deletedLines = new Map<string, Set<string>>();   // estimate_id → deleted line_ids
  const addedLines = new Map<string, any[]>();           // estimate_id → added line edits
  const editedEstimates = new Set<string>();
  for (const ed of editRows) {
    editedEstimates.add(ed.estimate_id);
    if (ed.scope === "estimate") { if (ed.margin_pct != null) marginEdit.set(ed.estimate_id, num(ed.margin_pct)); continue; }
    if (ed.line_action === "deleted") {
      const s = deletedLines.get(ed.estimate_id) ?? new Set<string>(); s.add(ed.line_id); deletedLines.set(ed.estimate_id, s);
    } else if (ed.line_action === "added") {
      const a = addedLines.get(ed.estimate_id) ?? []; a.push(ed); addedLines.set(ed.estimate_id, a);
    } else {
      const m = lineEdit.get(ed.estimate_id) ?? new Map<string, any>(); m.set(ed.line_id, ed); lineEdit.set(ed.estimate_id, m);
    }
  }
  function recompute(opt: EstimateOption) {
    const material = opt.lines.reduce((s, l) => s + (l.lineCost = Math.round(l.qty * l.unitCost * 100) / 100), 0);
    opt.productCost = Math.round(material * 100) / 100;
    opt.totalCost = Math.round((opt.productCost + opt.laborCost + opt.feeCost) * 100) / 100;
    const m = Math.min(Math.max(opt.marginPct, 0), 99.9) / 100;
    opt.totalPrice = Math.round((opt.totalCost / (1 - m)) * 100) / 100;
    opt.marginRevenue = Math.round((opt.totalPrice - opt.totalCost) * 100) / 100;
    opt.lines.forEach((l) => (l.linePrice = Math.round((l.lineCost / (1 - m)) * 100) / 100));
    opt.lineCount = opt.lines.length;
  }

  if (jobRows.length === 0) {
    return { status: "unconfigured", generatedAt: new Date().toISOString(), offices: [], categories, totals: { jobs: 0, estimates: 0, lines: 0, proposals: 0 } };
  }

  // API price keyed by item|branch (leading zeros stripped); branch is the estimate's job branch.
  const normBranch = (b: unknown) => String(b ?? "").replace(/^0+/, "");
  const apiByKey = new Map<string, { price: number; uom: string }>();
  for (const r of apiPriceRows) apiByKey.set(`${r.item_number}|${r.branch_number_norm}`, { price: num(r.api_price), uom: r.api_uom ?? "" });

  const linesByOption = new Map<string, EstimateLine[]>();
  for (const l of lineRows) {
    const list = linesByOption.get(l.option_id) ?? [];
    list.push({
      lineId: l.line_id,
      description: l.description ?? "",
      qty: num(l.rounded_quantity ?? l.required_quantity),
      uom: l.sell_uom ?? "",
      unitCost: num(l.unit_cost),
      lineCost: num(l.line_cost),
      linePrice: num(l.line_price),
      categoryKey: l.category_key ?? "uncategorized",
      abcItemNumber: l.abc_item_number ?? "",
      apiPrice: null,
      apiUom: "",
    });
    linesByOption.set(l.option_id, list);
  }

  const estByRun = new Map<string, EstimateOption[]>();
  for (const e of estRows) {
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
    // Apply the operator edit overlay, then recompute totals so a reload shows the edits.
    if (editedEstimates.has(opt.estimateId)) {
      const del = deletedLines.get(opt.estimateId);
      const le = lineEdit.get(opt.estimateId);
      opt.lines = opt.lines
        .filter((l) => !del?.has(l.lineId))
        .map((l) => {
          const ed = le?.get(l.lineId);
          if (!ed) return l;
          return { ...l, qty: ed.qty != null ? num(ed.qty) : l.qty, unitCost: ed.unit_cost != null ? num(ed.unit_cost) : l.unitCost };
        });
      for (const ad of addedLines.get(opt.estimateId) ?? []) {
        opt.lines.push({ lineId: ad.line_id, description: ad.description ?? "", qty: num(ad.qty), uom: ad.uom ?? "EA", unitCost: num(ad.unit_cost), lineCost: 0, linePrice: 0, categoryKey: "uncategorized", abcItemNumber: "", apiPrice: null, apiUom: "" });
      }
      if (marginEdit.has(opt.estimateId)) opt.marginPct = marginEdit.get(opt.estimateId)!;
      recompute(opt);
    }
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

  // Attach the branch-tied API price to each line (mapped ABC item × the job's branch).
  for (const job of jobs) {
    const bn = normBranch(job.branchCode);
    for (const opt of job.estimates) for (const line of opt.lines) {
      if (!line.abcItemNumber) continue;
      const api = apiByKey.get(`${line.abcItemNumber}|${bn}`);
      if (!api) continue;
      // Normalize the API price into THIS line's display unit so the row shows ONE unit.
      // If the units can't be aligned, keep the API's own unit rather than fabricate a number.
      const conv = convertPrice(api.price, api.uom, line.uom, line.abcItemNumber, uomMap);
      if (conv.aligned && conv.value != null) {
        line.apiPrice = conv.value;
        line.apiUom = line.uom;
      } else {
        line.apiPrice = api.price;
        line.apiUom = api.uom;
      }
    }
  }

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
    categories,
    totals: {
      jobs: jobs.length,
      estimates: jobs.reduce((s, j) => s + j.estimates.length, 0),
      lines: jobs.reduce((s, j) => s + j.estimates.reduce((t, e) => t + e.lines.length, 0), 0),
      proposals: jobs.filter((j) => j.hasProposal).length,
    },
  };
}
