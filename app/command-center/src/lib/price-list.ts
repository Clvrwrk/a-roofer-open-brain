/* Price List Audit — coverage of our purchased catalog by pricing authority.
   Row grain = item × branch. Goal: a negotiated price on >=80% of SPEND.
   Precursor to invoice audits. Sample data for now; it is keyed to the real
   vendor branches on the territory map so map clicks resolve to filters.
   Swap buildBaseRows for a live loader later — payload config can stay. */

import type { AuditQueuePayload } from "@lib/audit-queues";
import { AUDIT_YEARS } from "@lib/audit-queues";
import type { VendorTerritorySurface } from "@lib/vendor-territories";

export type PricingSource = "Negotiated" | "Invoice Mean" | "API Generated" | "One-Off Project" | "No Pricing";
export type BranchSlot = { vendor: string; branchNo: string; branchName: string; office: string; state: string };

/* pricing-source pill classes (5 categories) */
export const sourceCls = (s: string): string =>
  (({ Negotiated: "pill-green", "Invoice Mean": "pill-yellow", "API Generated": "pill-orange", "One-Off Project": "pill-review", "No Pricing": "pill-red" } as Record<string, string>)[s] || "pill-grey");

/* a "covered toward 80%" item is one with a standing Negotiated price */
export const isCovered = (s: PricingSource) => s === "Negotiated";

/* sample SKU catalog — unit cost + base annual qty + the typical pricing authority we have today */
const SKUS = [
  { sku: "GAF-THD-CHAR", desc: "GAF Timberline HDZ — Charcoal", uom: "BD", unitCost: 39.5, baseQty: 1800, base: "Negotiated" },
  { sku: "IKO-DYN-WW", desc: "IKO Dynasty — Weathered Wood", uom: "BD", unitCost: 41.0, baseQty: 1200, base: "Negotiated" },
  { sku: "ABC-SYN-UND", desc: "ABC Synthetic Underlayment 10sq", uom: "RL", unitCost: 95.2, baseQty: 380, base: "Invoice Mean" },
  { sku: "ICE-WATER-36", desc: "Ice & Water Shield 36in", uom: "RL", unitCost: 109.9, baseQty: 240, base: "Negotiated" },
  { sku: "GAF-PRO-START", desc: "GAF ProStart Starter Strip", uom: "BD", unitCost: 60.1, baseQty: 420, base: "API Generated" },
  { sku: "VENT-RIDGE-4", desc: "Ridge Vent 4ft Shingle-Over", uom: "PC", unitCost: 15.1, baseQty: 900, base: "API Generated" },
  { sku: "GAF-SEAL-AB", desc: "GAF Seal-A-Ridge Antique Slate", uom: "BD", unitCost: 63.1, baseQty: 300, base: "One-Off Project" },
  { sku: "DRIP-EDGE-10", desc: "Drip Edge 2x2 10ft White", uom: "PC", unitCost: 9.6, baseQty: 1500, base: "Negotiated" },
  { sku: "COIL-NAIL-114", desc: 'Coil Roofing Nails 1-1/4"', uom: "BX", unitCost: 61.5, baseQty: 260, base: "No Pricing" },
  { sku: "PIPE-BOOT-3", desc: "Pipe Boot 3in Lead", uom: "EA", unitCost: 12.2, baseQty: 700, base: "No Pricing" },
] as const;

/* fallback branches (used when the live territory surface is empty/unconfigured) */
export const FALLBACK_BRANCHES: BranchSlot[] = [
  { vendor: "ABC Supply", branchNo: "0412", branchName: "Wichita W", office: "Wichita", state: "KS" },
  { vendor: "ABC Supply", branchNo: "0418", branchName: "Wichita NE", office: "Wichita", state: "KS" },
  { vendor: "ABC Supply", branchNo: "0455", branchName: "Derby", office: "Derby", state: "KS" },
  { vendor: "ABC Supply", branchNo: "0473", branchName: "Hutchinson", office: "Wichita", state: "KS" },
  { vendor: "ABC Supply", branchNo: "0501", branchName: "Salina", office: "Wichita", state: "KS" },
  { vendor: "SRS Distribution", branchNo: "KS-21", branchName: "Wichita S", office: "Wichita", state: "KS" },
  { vendor: "SRS Distribution", branchNo: "OK-08", branchName: "Ponca City", office: "Derby", state: "OK" },
  { vendor: "ABC Supply", branchNo: "0560", branchName: "Enid", office: "Derby", state: "OK" },
];

/* derive branch slots from the live territory surface so map clicks resolve */
export function branchSlotsFromSurface(surface: VendorTerritorySurface | null): BranchSlot[] {
  const branches = surface?.branches ?? [];
  const slots: BranchSlot[] = [];
  for (const b of branches) {
    const office = b.assignedOfficeName && b.assignedOfficeName !== "Unassigned" ? b.assignedOfficeName : "";
    if (!office) continue;
    const loc = (b as any).location ?? "";
    const m = /,\s*([A-Z]{2})\b/.exec(String(loc));
    slots.push({
      vendor: b.vendorName || "ABC Supply",
      branchNo: b.branchNumber || "—",
      branchName: b.branchName || "",
      office,
      state: m ? m[1] : "KS",
    });
    if (slots.length >= 16) break;
  }
  return slots.length ? slots : FALLBACK_BRANCHES;
}

/* deterministic source variation so coverage lands realistically below the 80% target */
function sourceFor(base: string, bi: number, ki: number): PricingSource {
  const r = (bi * 7 + ki * 3) % 10;
  if (base === "Negotiated") return r < 2 ? (r === 0 ? "Invoice Mean" : "One-Off Project") : "Negotiated";
  if (base === "Invoice Mean") return r < 3 ? "Negotiated" : "Invoice Mean";
  if (base === "API Generated") return r < 2 ? "Negotiated" : r > 7 ? "No Pricing" : "API Generated";
  if (base === "One-Off Project") return r < 3 ? "Negotiated" : "One-Off Project";
  return r < 2 ? "Invoice Mean" : "No Pricing"; // base No Pricing
}

export type BaseRow = {
  vendor: string; branchNo: string; branchName: string; office: string; state: string;
  sku: string; desc: string; uom: string; annualQty: number; annualSpend: number; source: PricingSource;
};

/* the canonical sample dataset: a deterministic subset of SKUs per branch slot */
export function buildBaseRows(slots: BranchSlot[]): BaseRow[] {
  const rows: BaseRow[] = [];
  slots.forEach((slot, bi) => {
    SKUS.forEach((s, ki) => {
      if ((bi + ki) % 3 === 2) return; // ~2/3 of SKUs carried per branch
      const annualQty = Math.round(s.baseQty * (1 + ((bi * 2 + ki) % 6) / 10) / slots.length * 4);
      const annualSpend = Math.round(s.unitCost * annualQty * 100) / 100;
      rows.push({
        vendor: slot.vendor, branchNo: slot.branchNo, branchName: slot.branchName, office: slot.office, state: slot.state,
        sku: s.sku, desc: s.desc, uom: s.uom, annualQty, annualSpend, source: sourceFor(s.base, bi, ki),
      });
    });
  });
  return rows;
}

const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();
const opt = (xs: string[]) => uniq(xs).map((v) => ({ value: v, label: v }));

/* ---- the Price List Audit worklist payload (item × branch) ---- */
export function buildPriceListPayload(slots: BranchSlot[]): AuditQueuePayload {
  const rows = buildBaseRows(slots);
  const totalSpend = rows.reduce((s, r) => s + r.annualSpend, 0) || 1;
  const negSpend = rows.filter((r) => isCovered(r.source)).reduce((s, r) => s + r.annualSpend, 0);
  const coverage = Math.round((negSpend / totalSpend) * 100);
  const count = (src: PricingSource) => rows.filter((r) => r.source === src).length;

  const FY: Record<number, number> = { 2024: 0.82, 2025: 0.91, 2026: 1.0 };
  const yearRows = AUDIT_YEARS.flatMap((y) =>
    rows.map((r) => ({
      ...r,
      year: y,
      annualQty: Math.round(r.annualQty * (FY[y] ?? 1)),
      annualSpend: Math.round(r.annualSpend * (FY[y] ?? 1) * 100) / 100,
    }))
  );

  return {
    searchKeys: ["sku", "desc", "vendor", "branchNo", "branchName", "office", "state", "source"],
    filters: [
      { id: "vendor", label: "All vendors", col: "vendor", options: opt(rows.map((r) => r.vendor)) },
      { id: "office", label: "All PE offices", col: "office", options: opt(rows.map((r) => r.office)) },
      { id: "branchNo", label: "All branches", col: "branchNo", options: opt(rows.map((r) => r.branchNo)) },
      { id: "state", label: "All states", col: "state", options: opt(rows.map((r) => r.state)) },
      { id: "source", label: "All pricing sources", col: "source", options: ["Negotiated", "Invoice Mean", "API Generated", "One-Off Project", "No Pricing"].map((v) => ({ value: v, label: v })) },
    ],
    kpis: [
      { lab: "Spend Coverage", val: coverage + "%", go: "target 80%" },
      { lab: "Negotiated", val: String(count("Negotiated")), go: "Covered →", filterCol: "source", filterVal: "Negotiated" },
      { lab: "Invoice Mean", val: String(count("Invoice Mean")), go: "Weak →", filterCol: "source", filterVal: "Invoice Mean" },
      { lab: "API Generated", val: String(count("API Generated")), go: "Weak →", filterCol: "source", filterVal: "API Generated" },
      { lab: "No Pricing", val: String(count("No Pricing")), go: "Gap →", filterCol: "source", filterVal: "No Pricing" },
      { lab: "Negotiated Catalog", val: "Top 200", go: "Open catalog →", href: "/accounting/price-list/catalog" },
    ],
    columns: [
      { key: "vendor", label: "Vendor", sort: true },
      { key: "branchNo", label: "Branch", subKey: "branchName", sort: true },
      { key: "office", label: "PE Office", sort: true },
      { key: "sku", label: "Item ID / SKU", render: "mono", sort: true },
      { key: "desc", label: "Description", sort: true },
      { key: "uom", label: "UOM" },
      { key: "annualQty", label: "Annual Qty", align: "num", sort: true, render: "num" },
      { key: "annualSpend", label: "Annual Spend", align: "num", sort: true, render: "money" },
      { key: "source", label: "Pricing Source", sort: true, render: "pill", clsKey: "sourceCls" },
      { key: "marginImpact", label: "Margin Impact (TBD)", render: "pill", clsKey: "miCls" },
    ],
    rows: yearRows.map((r) => ({ ...r, sourceCls: sourceCls(r.source), marginImpact: "TBD", miCls: "pill-grey" })),
    countNoun: "item-branch lines",
    defaultSort: { key: "annualSpend", dir: -1 },
    themeKey: "aqPriceListTheme",
    years: AUDIT_YEARS,
  };
}

/* ---- Negotiated Item Catalog: year-aware raw rows the client segments + scales ----
   The client aggregates by SKU (top 200 by spend) and renders the by-state / by-office
   bars segmented by Vendor (no filter) or Vendor Branch (when a vendor is selected). */
export type CatalogRow = {
  sku: string; desc: string; vendor: string; branchNo: string; branchName: string;
  office: string; state: string; year: number; spend: number; qty: number; source: PricingSource; covered: boolean;
};
export type CatalogData = { rows: CatalogRow[]; vendors: string[]; states: string[]; offices: string[]; years: number[] };

/* deterministic year scaling (sample data) — modest YoY growth toward the current year */
const YEAR_FACTOR: Record<number, number> = { 2024: 0.82, 2025: 0.91, 2026: 1.0 };

export function buildCatalog(slots: BranchSlot[]): CatalogData {
  const base = buildBaseRows(slots);
  const years = Object.keys(YEAR_FACTOR).map(Number).sort();
  const rows: CatalogRow[] = [];
  for (const y of years) {
    const f = YEAR_FACTOR[y];
    for (const r of base) {
      rows.push({
        sku: r.sku, desc: r.desc, vendor: r.vendor, branchNo: r.branchNo, branchName: r.branchName,
        office: r.office, state: r.state, year: y,
        spend: Math.round(r.annualSpend * f * 100) / 100,
        qty: Math.round(r.annualQty * f),
        source: r.source, covered: isCovered(r.source),
      });
    }
  }
  return {
    rows,
    vendors: uniq(base.map((r) => r.vendor)),
    states: uniq(base.map((r) => r.state)),
    offices: uniq(base.map((r) => r.office)),
    years,
  };
}
