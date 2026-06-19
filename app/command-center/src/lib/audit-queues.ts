/* Data + payload builders for the six Invoice-Audit KPI drill-down worklists.
   Sample data for now; swap the raw arrays for a live loader (Supabase
   price-foundation review surface) later — the column/kpi config can stay.
   Invoice numbers bias toward the four present in the invoice-audit screen
   so the "Open audit →" deep-links round-trip and auto-open the invoice. */

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export type AuditCol = {
  key: string;
  label: string;
  align?: "num";
  sort?: boolean;
  render?:
    | "text" | "mono" | "money" | "moneyShort" | "pct"
    | "pill" | "pillPct" | "pillMoney" | "num" | "days" | "daysDecimal" | "action";
  clsKey?: string;
  subKey?: string;
  hrefKey?: string;
  toneKey?: string;
};
export type AuditFilter = { id: string; label: string; col: string; options: { value: string; label: string }[] };
export type AuditKpi = { lab: string; val: string; go?: string; filterCol?: string; filterVal?: string; href?: string };
export type AuditQueuePayload = {
  searchKeys: string[];
  filters: AuditFilter[];
  kpis: AuditKpi[];
  columns: AuditCol[];
  rows: Record<string, any>[];
  countNoun: string;
  defaultSort?: { key: string; dir: number };
  themeKey?: string;
  years?: number[];
};

const HREF = (inv: string) => `/accounting/invoice-audit?invoice=${encodeURIComponent(inv)}`;

/* ---- shared Year filtering: replicate sample rows across fiscal years, scaling $ / qty ---- */
export const AUDIT_YEARS = [2024, 2025, 2026];
const AUDIT_YEAR_FACTOR: Record<number, number> = { 2024: 0.82, 2025: 0.91, 2026: 1.0 };
function withYears<T extends Record<string, any>>(rows: T[], scaleKeys: string[]): (T & { year: number })[] {
  const out: (T & { year: number })[] = [];
  for (const y of AUDIT_YEARS) {
    const f = AUDIT_YEAR_FACTOR[y];
    for (const r of rows) {
      const copy: any = { ...r, year: y };
      for (const k of scaleKeys) if (typeof copy[k] === "number") copy[k] = Math.round(copy[k] * f * 100) / 100;
      out.push(copy);
    }
  }
  return out;
}
const uniq = (xs: string[]) => Array.from(new Set(xs)).sort();
const opts = (xs: string[]) => uniq(xs).map((v) => ({ value: v, label: v }));

/* ---- classifiers ---- */
const worstCls = (w: number) => (!w ? "pill-grey" : w > 6 ? "pill-red" : w > 3 ? "pill-orange" : "pill-yellow");
const bandCls = (b: string) => ({ Minor: "pill-yellow", Moderate: "pill-orange", Major: "pill-red" } as any)[b] || "pill-grey";
const srcCls = (s: string) => ({ Negotiated: "pill-green", "Past Invoices Mean": "pill-yellow", "API Derived": "pill-orange", "No Price": "pill-red" } as any)[s] || "pill-grey";
const statusCls = (s: string) => ({ New: "pill-new", "In Review": "pill-review", "On Hold": "pill-hold", Escalated: "pill-escalated" } as any)[s] || "pill-grey";
const priorityCls = (p: string) => ({ High: "pill-red", Med: "pill-yellow", Low: "pill-grey" } as any)[p] || "pill-grey";
const ageTone = (a: number) => (a >= 8 ? "age-danger" : a >= 4 ? "age-warn" : "age-ok");
const riskCls = (d: number) => (d >= 1000 ? "pill-red" : d >= 400 ? "pill-orange" : d > 0 ? "pill-yellow" : "pill-grey");
const npStatusCls = (s: string) => ({ "Needs source": "pill-yellow", "API match pending": "pill-new", Escalated: "pill-escalated" } as any)[s] || "pill-grey";
const suggestionCls = (s: string) => ({ "API match found": "pill-orange", "Past invoices ≥3": "pill-yellow", None: "pill-red" } as any)[s] || "pill-grey";
const memoStatusCls = (s: string) => ({ Requested: "pill-new", "Sent to Vendor": "pill-review", Acknowledged: "pill-hold", Credited: "pill-green", Disputed: "pill-red" } as any)[s] || "pill-grey";
const dispCls = (d: string) =>
  d.includes("Flagged") ? "pill-red" : d.includes("Unflagged") ? "pill-orange" : d.includes("Negotiated") && d.includes("To Be") ? "pill-new" : "pill-green";
const speedTone = (n: number) => (n <= 1 ? "age-ok" : n <= 3 ? "age-warn" : "age-danger");

/* ============================ 1 · PENDING AUDIT ============================ */
const pendingRaw = [
  { invoice: "INV-557980", office: "PE-DERBY-02", account: "4419002", received: "2026-06-06", age: 11, total: 12880.25, lines: 20, flagged: 5, worst: 7.8, atRisk: 980.0, status: "On Hold", assignee: "Lucinda", priority: "High" },
  { invoice: "INV-558455", office: "PE-DERBY-02", account: "4419002", received: "2026-06-11", age: 6, total: 7640.0, lines: 13, flagged: 4, worst: 5.1, atRisk: 412.0, status: "Escalated", assignee: "Chris", priority: "High" },
  { invoice: "INV-558760", office: "PE-WICH-01", account: "4421887", received: "2026-06-10", age: 7, total: 3320.1, lines: 8, flagged: 1, worst: 3.4, atRisk: 96.0, status: "In Review", assignee: "Lucinda", priority: "Med" },
  { invoice: "INV-558890", office: "PE-DERBY-02", account: "4419002", received: "2026-06-09", age: 8, total: 4560.75, lines: 10, flagged: 2, worst: 4.2, atRisk: 188.0, status: "In Review", assignee: "Lucinda", priority: "Med" },
  { invoice: "INV-558201", office: "PE-WICH-01", account: "4421887", received: "2026-06-12", age: 5, total: 9820.4, lines: 14, flagged: 3, worst: 6.6, atRisk: 442.7, status: "In Review", assignee: "Lucinda", priority: "High" },
  { invoice: "INV-558244", office: "PE-WICH-01", account: "4421887", received: "2026-06-13", age: 4, total: 4410.8, lines: 9, flagged: 2, worst: 2.9, atRisk: 44.8, status: "On Hold", assignee: "Lucinda", priority: "Med" },
  { invoice: "INV-559010", office: "PE-DERBY-02", account: "4419002", received: "2026-06-14", age: 3, total: 6890.0, lines: 11, flagged: 2, worst: 9.5, atRisk: 386.9, status: "Escalated", assignee: "Chris", priority: "High" },
  { invoice: "INV-559066", office: "PE-WICH-01", account: "4421887", received: "2026-06-15", age: 2, total: 990.0, lines: 4, flagged: 1, worst: 1.8, atRisk: 17.8, status: "New", assignee: "Unassigned", priority: "Low" },
  { invoice: "INV-559088", office: "PE-DERBY-02", account: "4419002", received: "2026-06-15", age: 2, total: 5134.6, lines: 12, flagged: 3, worst: 20.5, atRisk: 134.6, status: "In Review", assignee: "Lucinda", priority: "High" },
  { invoice: "INV-559140", office: "PE-WICH-01", account: "4421887", received: "2026-06-16", age: 1, total: 2210.0, lines: 6, flagged: 0, worst: 0, atRisk: 0, status: "New", assignee: "Unassigned", priority: "Low" },
  { invoice: "INV-559199", office: "PE-WICH-01", account: "4421887", received: "2026-06-16", age: 1, total: 3015.0, lines: 7, flagged: 1, worst: 2.2, atRisk: 66.3, status: "New", assignee: "Unassigned", priority: "Low" },
  { invoice: "INV-559201", office: "PE-WICH-01", account: "4421887", received: "2026-06-16", age: 1, total: 1875.5, lines: 5, flagged: 0, worst: 0, atRisk: 0, status: "New", assignee: "Unassigned", priority: "Low" },
];
export const pendingPayload: AuditQueuePayload = {
  searchKeys: ["invoice", "office", "account", "assignee", "status", "priority"],
  filters: [
    { id: "office", label: "All offices", col: "office", options: opts(pendingRaw.map((r) => r.office)) },
    { id: "status", label: "All statuses", col: "status", options: opts(pendingRaw.map((r) => r.status)) },
    { id: "assignee", label: "All assignees", col: "assignee", options: opts(pendingRaw.map((r) => r.assignee)) },
  ],
  kpis: [
    { lab: "In Queue", val: String(pendingRaw.length), go: "All pending" },
    { lab: "New (24h)", val: String(pendingRaw.filter((r) => r.status === "New").length), go: "Triage →", filterCol: "status", filterVal: "New" },
    { lab: "In Review", val: String(pendingRaw.filter((r) => r.status === "In Review").length), go: "View →", filterCol: "status", filterVal: "In Review" },
    { lab: "On Hold", val: String(pendingRaw.filter((r) => r.status === "On Hold").length), go: "Docs →", filterCol: "status", filterVal: "On Hold" },
    { lab: "Escalated", val: String(pendingRaw.filter((r) => r.status === "Escalated").length), go: "View →", filterCol: "status", filterVal: "Escalated" },
    { lab: "Oldest", val: Math.max(...pendingRaw.map((r) => r.age)) + " d", go: "Aging →" },
  ],
  columns: [
    { key: "office", label: "Office / Acct", subKey: "account", sort: true },
    { key: "invoice", label: "Invoice #", render: "mono", sort: true },
    { key: "received", label: "Received", sort: true },
    { key: "age", label: "Age", align: "num", sort: true, render: "days", toneKey: "ageTone" },
    { key: "total", label: "Total $", align: "num", sort: true, render: "money" },
    { key: "lines", label: "Lines", align: "num", sort: true, render: "num" },
    { key: "flagged", label: "Flagged", align: "num", sort: true, render: "num" },
    { key: "worst", label: "Worst", align: "num", sort: true, render: "pillPct", clsKey: "worstCls" },
    { key: "atRisk", label: "$ At Risk", align: "num", sort: true, render: "pillMoney", clsKey: "worstCls" },
    { key: "status", label: "Status", sort: true, render: "pill", clsKey: "statusCls" },
    { key: "assignee", label: "Assignee", sort: true },
    { key: "priority", label: "Priority", sort: true, render: "pill", clsKey: "priorityCls" },
    { key: "_a", label: "", sort: false, render: "action" },
  ],
  rows: withYears(pendingRaw, ["total", "atRisk"]).map((r) => ({ ...r, worstCls: worstCls(r.worst), statusCls: statusCls(r.status), priorityCls: priorityCls(r.priority), ageTone: ageTone(r.age), auditHref: HREF(r.invoice) })),
  countNoun: "invoices",
  defaultSort: { key: "age", dir: -1 },
  themeKey: "aqPendingTheme",
  years: AUDIT_YEARS,
};

/* ======================= 2 · OUT-OF-TOLERANCE LINES ======================= */
const otRaw = [
  { invoice: "INV-558201", office: "PE-WICH-01", account: "4421887", sku: "GAF-THD-CHAR", desc: "GAF Timberline HDZ — Charcoal", uom: "BD", qty: 120, invPrice: 42.1, paPrice: 39.5, source: "Negotiated", varPct: 6.6, atRisk: 312.0, band: "Major" },
  { invoice: "INV-558201", office: "PE-WICH-01", account: "4421887", sku: "GAF-PRO-START", desc: "GAF ProStart Starter Strip", uom: "BD", qty: 22, invPrice: 63.75, paPrice: 60.1, source: "API Derived", varPct: 6.1, atRisk: 80.3, band: "Major" },
  { invoice: "INV-559010", office: "PE-DERBY-02", account: "4419002", sku: "IKO-DYN-WW", desc: "IKO Dynasty — Weathered Wood", uom: "BD", qty: 96, invPrice: 44.9, paPrice: 41.0, source: "Negotiated", varPct: 9.5, atRisk: 374.4, band: "Major" },
  { invoice: "INV-559088", office: "PE-DERBY-02", account: "4419002", sku: "VENT-RIDGE-4", desc: "Ridge Vent 4ft Shingle-Over", uom: "PC", qty: 30, invPrice: 18.2, paPrice: 15.1, source: "API Derived", varPct: 20.5, atRisk: 93.0, band: "Major" },
  { invoice: "INV-558455", office: "PE-DERBY-02", account: "4419002", sku: "ABC-SYN-UND", desc: "ABC Synthetic Underlayment 10sq", uom: "RL", qty: 24, invPrice: 99.4, paPrice: 95.2, source: "Past Invoices Mean", varPct: 4.4, atRisk: 100.8, band: "Moderate" },
  { invoice: "INV-558760", office: "PE-WICH-01", account: "4421887", sku: "ICE-WATER-36", desc: "Ice & Water Shield 36in", uom: "RL", qty: 16, invPrice: 112.5, paPrice: 109.9, source: "Negotiated", varPct: 2.4, atRisk: 41.6, band: "Minor" },
  { invoice: "INV-558890", office: "PE-DERBY-02", account: "4419002", sku: "CDX-OSB-716", desc: 'OSB Sheathing 7/16"', uom: "SHT", qty: 64, invPrice: 24.8, paPrice: 24.1, source: "Past Invoices Mean", varPct: 2.9, atRisk: 44.8, band: "Minor" },
  { invoice: "INV-558201", office: "PE-WICH-01", account: "4421887", sku: "DRIP-EDGE-10", desc: "Drip Edge 2x2 10ft White", uom: "PC", qty: 50, invPrice: 9.85, paPrice: 9.6, source: "API Derived", varPct: 2.6, atRisk: 12.5, band: "Minor" },
  { invoice: "INV-559010", office: "PE-DERBY-02", account: "4419002", sku: "GAF-CAP-NAIL", desc: "GAF ProStart Cap Nails 1-1/4in", uom: "BX", qty: 18, invPrice: 58.4, paPrice: 54.2, source: "API Derived", varPct: 7.7, atRisk: 75.6, band: "Major" },
  { invoice: "INV-558455", office: "PE-DERBY-02", account: "4419002", sku: "IKO-DYN-DR", desc: "IKO Dynasty — Driftwood", uom: "BD", qty: 80, invPrice: 45.6, paPrice: 43.4, source: "Negotiated", varPct: 5.1, atRisk: 176.0, band: "Moderate" },
  { invoice: "INV-559088", office: "PE-DERBY-02", account: "4419002", sku: "PIPE-BOOT-2", desc: "Pipe Boot 2in Lead", uom: "EA", qty: 24, invPrice: 14.7, paPrice: 14.2, source: "Past Invoices Mean", varPct: 3.5, atRisk: 12.0, band: "Moderate" },
  { invoice: "INV-558760", office: "PE-WICH-01", account: "4421887", sku: "STEP-FLASH", desc: "Step Flashing 4x4x8 Galv", uom: "BX", qty: 12, invPrice: 38.9, paPrice: 37.8, source: "Past Invoices Mean", varPct: 2.9, atRisk: 13.2, band: "Minor" },
  { invoice: "INV-558890", office: "PE-DERBY-02", account: "4419002", sku: "GAF-SEAL-AB", desc: "GAF Seal-A-Ridge Antique Slate", uom: "BD", qty: 28, invPrice: 67.5, paPrice: 63.1, source: "API Derived", varPct: 7.0, atRisk: 123.2, band: "Major" },
  { invoice: "INV-558201", office: "PE-WICH-01", account: "4421887", sku: "COIL-NAIL-114", desc: 'Coil Roofing Nails 1-1/4"', uom: "BX", qty: 10, invPrice: 64.0, paPrice: 61.5, source: "Negotiated", varPct: 4.1, atRisk: 25.0, band: "Moderate" },
  { invoice: "INV-559010", office: "PE-DERBY-02", account: "4419002", sku: "RIDGE-VENT-20", desc: "Ridge Vent 20ft Roll", uom: "RL", qty: 8, invPrice: 96.2, paPrice: 93.7, source: "Past Invoices Mean", varPct: 2.7, atRisk: 20.0, band: "Minor" },
  { invoice: "INV-559088", office: "PE-DERBY-02", account: "4419002", sku: "GAF-TIM-PEW", desc: "GAF Timberline HDZ — Pewter Gray", uom: "BD", qty: 110, invPrice: 41.9, paPrice: 39.3, source: "Negotiated", varPct: 6.6, atRisk: 286.0, band: "Major" },
];
export const outOfTolerancePayload: AuditQueuePayload = {
  searchKeys: ["invoice", "office", "sku", "desc", "source", "band"],
  filters: [
    { id: "office", label: "All offices", col: "office", options: opts(otRaw.map((r) => r.office)) },
    { id: "source", label: "All sources", col: "source", options: opts(otRaw.map((r) => r.source)) },
    { id: "band", label: "All bands", col: "band", options: [{ value: "Minor", label: "Minor" }, { value: "Moderate", label: "Moderate" }, { value: "Major", label: "Major" }] },
  ],
  kpis: [
    { lab: "Out of Tolerance", val: String(otRaw.length), go: "All lines" },
    { lab: "Minor", val: String(otRaw.filter((r) => r.band === "Minor").length), go: "0.01–3% →", filterCol: "band", filterVal: "Minor" },
    { lab: "Moderate", val: String(otRaw.filter((r) => r.band === "Moderate").length), go: "3–6% →", filterCol: "band", filterVal: "Moderate" },
    { lab: "Major", val: String(otRaw.filter((r) => r.band === "Major").length), go: "6%+ →", filterCol: "band", filterVal: "Major" },
    { lab: "$ Exposure", val: "$" + (otRaw.reduce((s, r) => s + r.atRisk, 0) / 1000).toFixed(1) + "k", go: "Total →" },
    { lab: "Top SKU $", val: "$374", go: "IKO Dynasty →" },
  ],
  columns: [
    { key: "office", label: "Office / Acct", subKey: "account", sort: true },
    { key: "invoice", label: "Invoice #", render: "mono", sort: true },
    { key: "sku", label: "SKU", render: "mono", sort: true },
    { key: "desc", label: "Description", sort: true },
    { key: "uom", label: "UOM" },
    { key: "qty", label: "Qty", align: "num", sort: true, render: "num" },
    { key: "invPrice", label: "Inv Price", align: "num", sort: true, render: "money" },
    { key: "paPrice", label: "PA Price", align: "num", sort: true, render: "money" },
    { key: "source", label: "Source", sort: true, render: "pill", clsKey: "srcCls" },
    { key: "varPct", label: "Var %", align: "num", sort: true, render: "pct" },
    { key: "atRisk", label: "$ At Risk", align: "num", sort: true, render: "pillMoney", clsKey: "bandCls" },
    { key: "band", label: "Band", sort: true, render: "pill", clsKey: "bandCls" },
    { key: "_a", label: "", sort: false, render: "action" },
  ],
  rows: withYears(otRaw, ["qty", "atRisk"]).map((r) => ({ ...r, srcCls: srcCls(r.source), bandCls: bandCls(r.band), auditHref: HREF(r.invoice) })),
  countNoun: "line items",
  defaultSort: { key: "atRisk", dir: -1 },
  themeKey: "aqOtTheme",
  years: AUDIT_YEARS,
};

/* ============================ 3 · $ AT RISK (by SKU) ====================== */
const arRaw = [
  { sku: "IKO-DYN-WW", desc: "IKO Dynasty — Weathered Wood", invoices: 6, repInvoice: "INV-559010", office: "PE-DERBY-02", totalQty: 540, avgVarPct: 8.9, dollarAtRisk: 2140.0, source: "Negotiated", disposition: "Open" },
  { sku: "GAF-THD-CHAR", desc: "GAF Timberline HDZ — Charcoal", invoices: 9, repInvoice: "INV-558201", office: "PE-WICH-01", totalQty: 1080, avgVarPct: 6.4, dollarAtRisk: 1880.5, source: "Negotiated", disposition: "Credit-memo eligible" },
  { sku: "GAF-SEAL-AB", desc: "GAF Seal-A-Ridge Antique Slate", invoices: 4, repInvoice: "INV-558890", office: "PE-DERBY-02", totalQty: 210, avgVarPct: 7.0, dollarAtRisk: 1320.0, source: "API Derived", disposition: "Open" },
  { sku: "ABC-SYN-UND", desc: "ABC Synthetic Underlayment 10sq", invoices: 7, repInvoice: "INV-558455", office: "PE-DERBY-02", totalQty: 168, avgVarPct: 4.4, dollarAtRisk: 980.0, source: "Past Invoices Mean", disposition: "Open" },
  { sku: "VENT-RIDGE-4", desc: "Ridge Vent 4ft Shingle-Over", invoices: 5, repInvoice: "INV-559088", office: "PE-DERBY-02", totalQty: 150, avgVarPct: 11.2, dollarAtRisk: 820.0, source: "API Derived", disposition: "Credit-memo eligible" },
  { sku: "GAF-PRO-START", desc: "GAF ProStart Starter Strip", invoices: 6, repInvoice: "INV-558201", office: "PE-WICH-01", totalQty: 132, avgVarPct: 6.1, dollarAtRisk: 610.0, source: "API Derived", disposition: "Open" },
  { sku: "ICE-WATER-36", desc: "Ice & Water Shield 36in", invoices: 4, repInvoice: "INV-558760", office: "PE-WICH-01", totalQty: 64, avgVarPct: 2.4, dollarAtRisk: 480.0, source: "Negotiated", disposition: "Accepted" },
  { sku: "GAF-CAP-NAIL", desc: "GAF ProStart Cap Nails 1-1/4in", invoices: 3, repInvoice: "INV-559010", office: "PE-DERBY-02", totalQty: 54, avgVarPct: 7.7, dollarAtRisk: 412.0, source: "API Derived", disposition: "Credit-memo eligible" },
  { sku: "CDX-OSB-716", desc: 'OSB Sheathing 7/16"', invoices: 5, repInvoice: "INV-558890", office: "PE-DERBY-02", totalQty: 320, avgVarPct: 2.9, dollarAtRisk: 360.0, source: "Past Invoices Mean", disposition: "Open" },
  { sku: "GAF-TIM-PEW", desc: "GAF Timberline HDZ — Pewter Gray", invoices: 3, repInvoice: "INV-559088", office: "PE-DERBY-02", totalQty: 330, avgVarPct: 6.6, dollarAtRisk: 286.0, source: "Negotiated", disposition: "Open" },
  { sku: "IKO-DYN-DR", desc: "IKO Dynasty — Driftwood", invoices: 2, repInvoice: "INV-558455", office: "PE-DERBY-02", totalQty: 160, avgVarPct: 5.1, dollarAtRisk: 230.0, source: "Negotiated", disposition: "Accepted" },
  { sku: "DRIP-EDGE-10", desc: "Drip Edge 2x2 10ft White", invoices: 4, repInvoice: "INV-558201", office: "PE-WICH-01", totalQty: 200, avgVarPct: 2.6, dollarAtRisk: 110.0, source: "API Derived", disposition: "Open" },
  { sku: "STEP-FLASH", desc: "Step Flashing 4x4x8 Galv", invoices: 2, repInvoice: "INV-558760", office: "PE-WICH-01", totalQty: 24, avgVarPct: 2.9, dollarAtRisk: 64.0, source: "Past Invoices Mean", disposition: "Accepted" },
  { sku: "PIPE-BOOT-2", desc: "Pipe Boot 2in Lead", invoices: 2, repInvoice: "INV-559088", office: "PE-DERBY-02", totalQty: 48, avgVarPct: 3.5, dollarAtRisk: 38.0, source: "Past Invoices Mean", disposition: "Open" },
];
export const atRiskPayload: AuditQueuePayload = {
  searchKeys: ["sku", "desc", "office", "source", "disposition"],
  filters: [
    { id: "office", label: "All offices", col: "office", options: opts(arRaw.map((r) => r.office)) },
    { id: "source", label: "All sources", col: "source", options: opts(arRaw.map((r) => r.source)) },
    { id: "disposition", label: "All dispositions", col: "disposition", options: opts(arRaw.map((r) => r.disposition)) },
  ],
  kpis: [
    { lab: "$ At Risk", val: "$" + (arRaw.reduce((s, r) => s + r.dollarAtRisk, 0) / 1000).toFixed(1) + "k", go: "Total →" },
    { lab: "Recoverable $", val: "$" + (arRaw.filter((r) => r.disposition === "Credit-memo eligible").reduce((s, r) => s + r.dollarAtRisk, 0) / 1000).toFixed(1) + "k", go: "Eligible →", filterCol: "disposition", filterVal: "Credit-memo eligible" },
    { lab: "Accepted $", val: "$" + arRaw.filter((r) => r.disposition === "Accepted").reduce((s, r) => s + r.dollarAtRisk, 0).toFixed(0), go: "Accepted →", filterCol: "disposition", filterVal: "Accepted" },
    { lab: "Top SKU $", val: "$2.1k", go: "IKO Dynasty →" },
    { lab: "By Negotiated", val: "$" + (arRaw.filter((r) => r.source === "Negotiated").reduce((s, r) => s + r.dollarAtRisk, 0) / 1000).toFixed(1) + "k", go: "Source →", filterCol: "source", filterVal: "Negotiated" },
    { lab: "By API-Derived", val: "$" + (arRaw.filter((r) => r.source === "API Derived").reduce((s, r) => s + r.dollarAtRisk, 0) / 1000).toFixed(1) + "k", go: "Source →", filterCol: "source", filterVal: "API Derived" },
  ],
  columns: [
    { key: "sku", label: "SKU", render: "mono", sort: true },
    { key: "desc", label: "Description", sort: true },
    { key: "invoices", label: "# Invoices", align: "num", sort: true, render: "num" },
    { key: "office", label: "Office", sort: true },
    { key: "totalQty", label: "Total Qty", align: "num", sort: true, render: "num" },
    { key: "avgVarPct", label: "Avg Var %", align: "num", sort: true, render: "pct" },
    { key: "dollarAtRisk", label: "$ At Risk", align: "num", sort: true, render: "pillMoney", clsKey: "riskCls" },
    { key: "source", label: "Source", sort: true, render: "pill", clsKey: "srcCls" },
    { key: "disposition", label: "Disposition", sort: true, render: "pill", clsKey: "dispCls" },
    { key: "_a", label: "", sort: false, render: "action", hrefKey: "auditHref" },
  ],
  rows: withYears(arRaw, ["dollarAtRisk", "totalQty"]).map((r) => ({
    ...r,
    riskCls: riskCls(r.dollarAtRisk),
    srcCls: srcCls(r.source),
    dispCls: r.disposition === "Accepted" ? "pill-green" : r.disposition === "Credit-memo eligible" ? "pill-orange" : "pill-new",
    auditHref: HREF(r.repInvoice),
  })),
  countNoun: "SKUs",
  defaultSort: { key: "dollarAtRisk", dir: -1 },
  themeKey: "aqAtRiskTheme",
  years: AUDIT_YEARS,
};

/* ============================ 4 · NO-PRICE LINES ========================== */
const npRaw = [
  { invoice: "INV-558244", office: "PE-WICH-01", account: "4421887", sku: "LEAD-PIPE-3", desc: "Lead Pipe Boot 3in", uom: "EA", qty: 40, invPrice: 12.4, extValue: 496.0, suggestedSource: "API match found", age: 4, status: "API match pending" },
  { invoice: "INV-559088", office: "PE-DERBY-02", account: "4419002", sku: "NAIL-COIL-114", desc: 'Coil Roofing Nails 1-1/4"', uom: "BX", qty: 12, invPrice: 64.0, extValue: 768.0, suggestedSource: "Past invoices ≥3", age: 2, status: "Needs source" },
  { invoice: "INV-557980", office: "PE-DERBY-02", account: "4419002", sku: "FELT-30-PRO", desc: "30# Felt Underlayment Roll", uom: "RL", qty: 22, invPrice: 31.5, extValue: 693.0, suggestedSource: "None", age: 11, status: "Escalated" },
  { invoice: "INV-558455", office: "PE-DERBY-02", account: "4419002", sku: "VALLEY-W-26", desc: "Valley Metal W 26ga 10ft", uom: "PC", qty: 18, invPrice: 27.8, extValue: 500.4, suggestedSource: "API match found", age: 6, status: "API match pending" },
  { invoice: "INV-558533", office: "PE-WICH-01", account: "4421887", sku: "CAULK-NP1", desc: "NP1 Sealant Bronze 10oz", uom: "EA", qty: 36, invPrice: 8.9, extValue: 320.4, suggestedSource: "Past invoices ≥3", age: 3, status: "Needs source" },
  { invoice: "INV-558760", office: "PE-WICH-01", account: "4421887", sku: "BOOT-HVAC-6", desc: "HVAC Roof Boot 6in", uom: "EA", qty: 10, invPrice: 42.5, extValue: 425.0, suggestedSource: "None", age: 7, status: "Escalated" },
  { invoice: "INV-558890", office: "PE-DERBY-02", account: "4419002", sku: "RIVET-POP-18", desc: "Pop Rivets 1/8in (500)", uom: "BX", qty: 6, invPrice: 19.9, extValue: 119.4, suggestedSource: "API match found", age: 8, status: "API match pending" },
  { invoice: "INV-559010", office: "PE-DERBY-02", account: "4419002", sku: "SCREW-WD-2", desc: "Wood Screws #9 x 2in (lb)", uom: "LB", qty: 24, invPrice: 6.4, extValue: 153.6, suggestedSource: "Past invoices ≥3", age: 3, status: "Needs source" },
  { invoice: "INV-558533", office: "PE-WICH-01", account: "4421887", sku: "TAPE-SEAM-4", desc: "Seam Tape 4in x 75ft", uom: "RL", qty: 14, invPrice: 17.2, extValue: 240.8, suggestedSource: "None", age: 5, status: "Escalated" },
  { invoice: "INV-558201", office: "PE-WICH-01", account: "4421887", sku: "BOOT-SOLAR-2", desc: "Solar Mount Flashing 2in", uom: "EA", qty: 20, invPrice: 23.4, extValue: 468.0, suggestedSource: "API match found", age: 5, status: "API match pending" },
  { invoice: "INV-557980", office: "PE-DERBY-02", account: "4419002", sku: "MASTIC-1G", desc: "Roof Mastic 1 Gallon", uom: "EA", qty: 8, invPrice: 28.6, extValue: 228.8, suggestedSource: "Past invoices ≥3", age: 11, status: "Needs source" },
  { invoice: "INV-559088", office: "PE-DERBY-02", account: "4419002", sku: "EDGE-VENT-4", desc: "Edge Vent 4ft Intake", uom: "PC", qty: 16, invPrice: 14.1, extValue: 225.6, suggestedSource: "API match found", age: 2, status: "API match pending" },
  { invoice: "INV-558455", office: "PE-DERBY-02", account: "4419002", sku: "CEMENT-PL-5", desc: "Plastic Roof Cement 5gal", uom: "EA", qty: 4, invPrice: 64.9, extValue: 259.6, suggestedSource: "None", age: 6, status: "Escalated" },
  { invoice: "INV-558760", office: "PE-WICH-01", account: "4421887", sku: "FLASH-ROLL-14", desc: "Aluminum Flashing Roll 14in", uom: "RL", qty: 9, invPrice: 33.7, extValue: 303.3, suggestedSource: "Past invoices ≥3", age: 7, status: "Needs source" },
  { invoice: "INV-558244", office: "PE-WICH-01", account: "4421887", sku: "STAPLE-916", desc: 'Roofing Staples 9/16" (box)', uom: "BX", qty: 18, invPrice: 11.4, extValue: 205.2, suggestedSource: "API match found", age: 4, status: "API match pending" },
];
export const noPricePayload: AuditQueuePayload = {
  searchKeys: ["invoice", "office", "sku", "desc", "suggestedSource", "status"],
  filters: [
    { id: "office", label: "All offices", col: "office", options: opts(npRaw.map((r) => r.office)) },
    { id: "status", label: "All statuses", col: "status", options: opts(npRaw.map((r) => r.status)) },
    { id: "suggestedSource", label: "All suggestions", col: "suggestedSource", options: opts(npRaw.map((r) => r.suggestedSource)) },
  ],
  kpis: [
    { lab: "No-Price Lines", val: String(npRaw.length), go: "All lines" },
    { lab: "API Match Avail.", val: String(npRaw.filter((r) => r.suggestedSource === "API match found").length), go: "Resolve →", filterCol: "suggestedSource", filterVal: "API match found" },
    { lab: "No Source", val: String(npRaw.filter((r) => r.suggestedSource === "None").length), go: "Escalate →", filterCol: "suggestedSource", filterVal: "None" },
    { lab: "$ Unverified", val: "$" + (npRaw.reduce((s, r) => s + r.extValue, 0) / 1000).toFixed(1) + "k", go: "Total →" },
    { lab: "Oldest", val: Math.max(...npRaw.map((r) => r.age)) + " d", go: "Aging →" },
    { lab: "Escalated", val: String(npRaw.filter((r) => r.status === "Escalated").length), go: "View →", filterCol: "status", filterVal: "Escalated" },
  ],
  columns: [
    { key: "office", label: "Office / Acct", subKey: "account", sort: true },
    { key: "invoice", label: "Invoice #", render: "mono", sort: true },
    { key: "sku", label: "SKU", render: "mono", sort: true },
    { key: "desc", label: "Description", sort: true },
    { key: "uom", label: "UOM" },
    { key: "qty", label: "Qty", align: "num", sort: true, render: "num" },
    { key: "invPrice", label: "Inv Price", align: "num", sort: true, render: "money" },
    { key: "extValue", label: "Unverified $", align: "num", sort: true, render: "pillMoney", clsKey: "suggestionCls" },
    { key: "suggestedSource", label: "Suggested Source", sort: true, render: "pill", clsKey: "suggestionCls" },
    { key: "age", label: "Age", align: "num", sort: true, render: "days", toneKey: "ageTone" },
    { key: "status", label: "Status", sort: true, render: "pill", clsKey: "statusCls" },
    { key: "_a", label: "", sort: false, render: "action" },
  ],
  rows: withYears(npRaw, ["qty", "extValue"]).map((r) => ({ ...r, suggestionCls: suggestionCls(r.suggestedSource), statusCls: npStatusCls(r.status), ageTone: ageTone(r.age), auditHref: HREF(r.invoice) })),
  countNoun: "lines",
  defaultSort: { key: "age", dir: -1 },
  themeKey: "aqNoPriceTheme",
  years: AUDIT_YEARS,
};

/* ============================ 5 · CREDIT MEMOS ============================ */
const cmRaw = [
  { memo: "CM-2026-031", invoice: "INV-559010", office: "PE-DERBY-02", account: "4419002", vendor: "ABC Supply", amount: 374.4, reason: "IKO Dynasty overbilled 9.5%", status: "Sent to Vendor", flagNonPayment: true, age: 3, assignee: "Chris" },
  { memo: "CM-2026-030", invoice: "INV-558201", office: "PE-WICH-01", account: "4421887", vendor: "ABC Supply", amount: 312.0, reason: "GAF HDZ overbilled 6.6%", status: "Requested", flagNonPayment: true, age: 5, assignee: "Lucinda" },
  { memo: "CM-2026-029", invoice: "INV-557980", office: "PE-DERBY-02", account: "4419002", vendor: "ABC Supply", amount: 980.0, reason: "Multiple lines, agreement lapse", status: "Disputed", flagNonPayment: true, age: 11, assignee: "Chris" },
  { memo: "CM-2026-028", invoice: "INV-558455", office: "PE-DERBY-02", account: "4419002", vendor: "ABC Supply", amount: 176.0, reason: "IKO Driftwood 5.1% over", status: "Acknowledged", flagNonPayment: false, age: 6, assignee: "Lucinda" },
  { memo: "CM-2026-027", invoice: "INV-559088", office: "PE-DERBY-02", account: "4419002", vendor: "ABC Supply", amount: 93.0, reason: "Ridge vent 20.5% over", status: "Sent to Vendor", flagNonPayment: false, age: 2, assignee: "Lucinda" },
  { memo: "CM-2026-026", invoice: "INV-558890", office: "PE-DERBY-02", account: "4419002", vendor: "ABC Supply", amount: 123.2, reason: "Seal-A-Ridge 7.0% over", status: "Requested", flagNonPayment: false, age: 8, assignee: "Lucinda" },
  { memo: "CM-2026-025", invoice: "INV-558201", office: "PE-WICH-01", account: "4421887", vendor: "ABC Supply", amount: 80.3, reason: "ProStart 6.1% over", status: "Credited", flagNonPayment: false, age: 9, assignee: "Lucinda" },
  { memo: "CM-2026-024", invoice: "INV-559010", office: "PE-DERBY-02", account: "4419002", vendor: "ABC Supply", amount: 75.6, reason: "Cap nails 7.7% over", status: "Acknowledged", flagNonPayment: false, age: 4, assignee: "Chris" },
  { memo: "CM-2026-023", invoice: "INV-558760", office: "PE-WICH-01", account: "4421887", vendor: "ABC Supply", amount: 41.6, reason: "Ice & Water 2.4% over", status: "Credited", flagNonPayment: false, age: 7, assignee: "Lucinda" },
  { memo: "CM-2026-022", invoice: "INV-559088", office: "PE-DERBY-02", account: "4419002", vendor: "ABC Supply", amount: 286.0, reason: "GAF Pewter 6.6% over", status: "Sent to Vendor", flagNonPayment: true, age: 2, assignee: "Lucinda" },
  { memo: "CM-2026-021", invoice: "INV-558455", office: "PE-DERBY-02", account: "4419002", vendor: "ABC Supply", amount: 100.8, reason: "Synthetic underlayment 4.4%", status: "Requested", flagNonPayment: false, age: 6, assignee: "Lucinda" },
  { memo: "CM-2026-020", invoice: "INV-558244", office: "PE-WICH-01", account: "4421887", vendor: "ABC Supply", amount: 44.8, reason: "OSB 2.9% over", status: "Credited", flagNonPayment: false, age: 4, assignee: "Lucinda" },
];
export const creditMemosPayload: AuditQueuePayload = {
  searchKeys: ["memo", "invoice", "office", "vendor", "reason", "status", "assignee"],
  filters: [
    { id: "office", label: "All offices", col: "office", options: opts(cmRaw.map((r) => r.office)) },
    { id: "status", label: "All statuses", col: "status", options: ["Requested", "Sent to Vendor", "Acknowledged", "Credited", "Disputed"].map((v) => ({ value: v, label: v })) },
    { id: "assignee", label: "All assignees", col: "assignee", options: opts(cmRaw.map((r) => r.assignee)) },
  ],
  kpis: [
    { lab: "Credit Memos", val: String(cmRaw.length), go: "All memos" },
    { lab: "$ Requested", val: "$" + (cmRaw.reduce((s, r) => s + r.amount, 0) / 1000).toFixed(1) + "k", go: "Total →" },
    { lab: "Awaiting Vendor", val: String(cmRaw.filter((r) => r.status === "Sent to Vendor").length), go: "Chase →", filterCol: "status", filterVal: "Sent to Vendor" },
    { lab: "Credited $", val: "$" + cmRaw.filter((r) => r.status === "Credited").reduce((s, r) => s + r.amount, 0).toFixed(0), go: "Closed →", filterCol: "status", filterVal: "Credited" },
    { lab: "Payment-Held", val: String(cmRaw.filter((r) => r.flagNonPayment).length), go: "On hold →" },
    { lab: "Oldest", val: Math.max(...cmRaw.map((r) => r.age)) + " d", go: "Aging →" },
  ],
  columns: [
    { key: "memo", label: "Memo #", render: "mono", sort: true },
    { key: "invoice", label: "Invoice", render: "mono", sort: true },
    { key: "office", label: "Office / Acct", subKey: "account", sort: true },
    { key: "vendor", label: "Vendor", sort: true },
    { key: "amount", label: "Amount", align: "num", sort: true, render: "pillMoney", clsKey: "amountCls" },
    { key: "reason", label: "Reason", sort: true },
    { key: "age", label: "Age", align: "num", sort: true, render: "days", toneKey: "ageTone" },
    { key: "flagLabel", label: "Flag", sort: true, render: "pill", clsKey: "flagCls" },
    { key: "status", label: "Status", sort: true, render: "pill", clsKey: "statusCls" },
    { key: "assignee", label: "Assignee", sort: true },
    { key: "_a", label: "", sort: false, render: "action" },
  ],
  rows: withYears(cmRaw, ["amount"]).map((r) => ({
    ...r,
    statusCls: memoStatusCls(r.status),
    amountCls: memoStatusCls(r.status),
    ageTone: ageTone(r.age),
    flagLabel: r.flagNonPayment ? "Payment held" : "Payable",
    flagCls: r.flagNonPayment ? "pill-red" : "pill-grey",
    auditHref: HREF(r.invoice),
  })),
  countNoun: "memos",
  defaultSort: { key: "age", dir: -1 },
  themeKey: "aqCreditMemoTheme",
  years: AUDIT_YEARS,
};

/* ============================ 6 · AVG RESOLUTION ========================== */
const arsRaw = [
  { invoice: "INV-556842", office: "PE-WICH-01", account: "4421887", disposition: "Credit Memo — Flagged", resolutionDays: 6.5, analyst: "Lucinda", resolved: "2026-06-12", amount: 980.0 },
  { invoice: "INV-556511", office: "PE-DERBY-02", account: "4419002", disposition: "To Be Negotiated", resolutionDays: 4.0, analyst: "Lucinda", resolved: "2026-06-07", amount: 188.0 },
  { invoice: "INV-556701", office: "PE-WICH-01", account: "4421887", disposition: "Credit Memo — Unflagged", resolutionDays: 3.8, analyst: "Chris", resolved: "2026-06-10", amount: 442.7 },
  { invoice: "INV-557140", office: "PE-DERBY-02", account: "4419002", disposition: "Credit Memo — Unflagged", resolutionDays: 3.8, analyst: "Lucinda", resolved: "2026-06-16", amount: 314.2 },
  { invoice: "INV-556990", office: "PE-WICH-01", account: "4421887", disposition: "Accepted — Negotiated", resolutionDays: 0.3, analyst: "Lucinda", resolved: "2026-06-05", amount: 0 },
  { invoice: "INV-557220", office: "PE-DERBY-02", account: "4419002", disposition: "Accepted — No Challenge", resolutionDays: 0.5, analyst: "Chris", resolved: "2026-06-09", amount: 0 },
  { invoice: "INV-556480", office: "PE-WICH-01", account: "4421887", disposition: "Accepted — 30-Day", resolutionDays: 1.2, analyst: "Lucinda", resolved: "2026-06-06", amount: 96.0 },
  { invoice: "INV-557010", office: "PE-DERBY-02", account: "4419002", disposition: "Credit Memo — Flagged", resolutionDays: 5.4, analyst: "Chris", resolved: "2026-06-11", amount: 386.9 },
  { invoice: "INV-556760", office: "PE-WICH-01", account: "4421887", disposition: "Accepted — Negotiated", resolutionDays: 0.8, analyst: "Lucinda", resolved: "2026-06-08", amount: 0 },
  { invoice: "INV-557300", office: "PE-DERBY-02", account: "4419002", disposition: "To Be Negotiated", resolutionDays: 2.6, analyst: "Lucinda", resolved: "2026-06-13", amount: 134.6 },
  { invoice: "INV-556330", office: "PE-WICH-01", account: "4421887", disposition: "Accepted — No Challenge", resolutionDays: 0.4, analyst: "Chris", resolved: "2026-06-04", amount: 0 },
  { invoice: "INV-557410", office: "PE-DERBY-02", account: "4419002", disposition: "Credit Memo — Unflagged", resolutionDays: 2.2, analyst: "Lucinda", resolved: "2026-06-15", amount: 100.8 },
  { invoice: "INV-556210", office: "PE-WICH-01", account: "4421887", disposition: "Accepted — 30-Day", resolutionDays: 1.5, analyst: "Lucinda", resolved: "2026-06-03", amount: 44.8 },
  { invoice: "INV-557120", office: "PE-DERBY-02", account: "4419002", disposition: "Accepted — Negotiated", resolutionDays: 0.9, analyst: "Chris", resolved: "2026-06-12", amount: 0 },
  { invoice: "INV-556905", office: "PE-WICH-01", account: "4421887", disposition: "Credit Memo — Flagged", resolutionDays: 4.7, analyst: "Lucinda", resolved: "2026-06-09", amount: 286.0 },
  { invoice: "INV-557260", office: "PE-DERBY-02", account: "4419002", disposition: "To Be Negotiated", resolutionDays: 3.1, analyst: "Lucinda", resolved: "2026-06-14", amount: 75.6 },
];
const arsAvg = (arsRaw.reduce((s, r) => s + r.resolutionDays, 0) / arsRaw.length).toFixed(1);
const arsCmRate = Math.round((arsRaw.filter((r) => r.disposition.startsWith("Credit Memo")).length / arsRaw.length) * 100);
export const avgResolutionPayload: AuditQueuePayload = {
  searchKeys: ["invoice", "office", "disposition", "analyst"],
  filters: [
    { id: "office", label: "All offices", col: "office", options: opts(arsRaw.map((r) => r.office)) },
    { id: "disposition", label: "All dispositions", col: "disposition", options: opts(arsRaw.map((r) => r.disposition)) },
    { id: "analyst", label: "All analysts", col: "analyst", options: opts(arsRaw.map((r) => r.analyst)) },
  ],
  kpis: [
    { lab: "Avg Days", val: arsAvg + " d", go: "Throughput →" },
    { lab: "Median", val: "2.2 d", go: "Midpoint →" },
    { lab: "Fastest", val: Math.min(...arsRaw.map((r) => r.resolutionDays)) + " d", go: "Best →" },
    { lab: "Slowest", val: Math.max(...arsRaw.map((r) => r.resolutionDays)) + " d", go: "Worst →" },
    { lab: "Resolved (wk)", val: String(arsRaw.length), go: "This week →" },
    { lab: "Credit-Memo Rate", val: arsCmRate + "%", go: "Mix →" },
  ],
  columns: [
    { key: "office", label: "Office / Acct", subKey: "account", sort: true },
    { key: "invoice", label: "Invoice #", render: "mono", sort: true },
    { key: "disposition", label: "Disposition", sort: true, render: "pill", clsKey: "dispCls" },
    { key: "resolutionDays", label: "Resolution", align: "num", sort: true, render: "daysDecimal", toneKey: "speedTone" },
    { key: "analyst", label: "Analyst", sort: true },
    { key: "resolved", label: "Resolved", sort: true },
    { key: "amount", label: "Amount", align: "num", sort: true, render: "money" },
    { key: "_a", label: "", sort: false, render: "action" },
  ],
  rows: withYears(arsRaw, ["amount"]).map((r) => ({ ...r, dispCls: dispCls(r.disposition), speedTone: speedTone(r.resolutionDays), auditHref: HREF(r.invoice) })),
  countNoun: "resolved",
  defaultSort: { key: "resolutionDays", dir: -1 },
  themeKey: "aqResolutionTheme",
  years: AUDIT_YEARS,
};

/* ============ LIVE Credit Memos queue (v_credit_memo_audit, schema 115) ============ */
const cmMatchMeta: Record<string, { reason: string; status: string; cls: string }> = {
  matches: { reason: "Matches original — ready to approve", status: "Matches", cls: "pill-green" },
  mismatch: { reason: "Price differs from original — review", status: "Mismatch", cls: "pill-red" },
  partial: { reason: "Some items not on original invoice", status: "Partial", cls: "pill-yellow" },
  no_reference: { reason: "No original invoice reference", status: "No reference", cls: "pill-grey" },
};

const cmDispMeta: Record<string, { status: string; cls: string }> = {
  approved: { status: "Approved", cls: "pill-green" },
  needs_more_evidence: { status: "Needs review", cls: "pill-yellow" },
  rejected: { status: "Rejected", cls: "pill-red" },
  draft: { status: "Draft", cls: "pill-new" },
  sent: { status: "Sent to vendor", cls: "pill-review" },
  received: { status: "Received", cls: "pill-new" },
  closed: { status: "Closed", cls: "pill-grey" },
};

// Live credit-memo worklist. Two kinds in one queue:
//  • Received — a CM the vendor issued (v_credit_memo_audit), audited vs its original invoice.
//  • Requested — a credit WE asked for from an Invoice-Audit overcharge disposition
//    (credit_memo_requests, request_kind='requested'); the dispute tracker (draft→sent→received).
export async function loadCreditMemoQueue(env: RuntimeEnv = getRuntimeEnv()): Promise<AuditQueuePayload> {
  const { client } = createServerSupabaseClient(env);
  let received: any[] = [];
  let requests: any[] = [];
  if (client) {
    const [{ data }, { data: req }] = await Promise.all([
      client.from("v_credit_memo_audit").select("*").order("invoice_date", { ascending: false }),
      client.from("credit_memo_requests").select("invoice_number,request_kind,status,approved_by,expected_credit,line_count,external_credit_memo_number,created_at"),
    ]);
    received = (data as any[] | null) ?? [];
    requests = (req as any[] | null) ?? [];
  }
  const now = Date.now();
  const ageOf = (iso: string | null) => (iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 864e5)) : 0);
  const receivedDisp = new Map(requests.filter((r) => r.request_kind === "received").map((r) => [r.invoice_number, r]));

  const receivedRows = received.map((r) => {
    const meta = cmMatchMeta[r.match_status] ?? cmMatchMeta.no_reference;
    const d = receivedDisp.get(r.invoice_number);
    const dm = d ? cmDispMeta[(d as any).status] : null;
    const age = ageOf(r.invoice_date);
    return {
      type: "Received", typeCls: "pill-grey",
      memo: r.invoice_number,
      invoice: r.original_invoice_number ?? r.original_invoice_reference ?? "—",
      branch: r.branch_name ?? "", account: r.ship_to_number ?? "",
      amount: Math.abs(Number(r.credit_amount) || 0),
      lines: `${r.matched_lines ?? 0}/${r.line_count ?? 0} match`,
      reason: meta.reason,
      status: dm ? dm.status : meta.status,
      statusCls: dm ? dm.cls : meta.cls,
      amountCls: meta.cls,
      age, ageTone: ageTone(age),
      auditHref: `/accounting/credit-memos/${encodeURIComponent(r.invoice_number)}`,
    };
  });

  const requestedRows = requests.filter((r) => r.request_kind === "requested").map((r) => {
    const dm = cmDispMeta[r.status] ?? { status: r.status, cls: "pill-grey" };
    const age = ageOf(r.created_at);
    return {
      type: "Requested", typeCls: "pill-brand",
      memo: r.external_credit_memo_number ?? "—",
      invoice: r.invoice_number,
      branch: "", account: "",
      amount: Number(r.expected_credit) || 0,
      lines: `${r.line_count ?? 0} lines`,
      reason: "Credit requested from vendor",
      status: dm.status, statusCls: dm.cls, amountCls: "pill-yellow",
      age, ageTone: ageTone(age),
      auditHref: `/accounting/credit-memos/${encodeURIComponent(r.invoice_number)}`,
    };
  });

  const rows = [...requestedRows, ...receivedRows];
  const moneyK = (n: number) => "$" + (n / 1000).toFixed(1) + "k";
  return {
    searchKeys: ["type", "memo", "invoice", "branch", "account", "reason", "status"],
    filters: [
      { id: "type", label: "All types", col: "type", options: [{ value: "Requested", label: "Requested" }, { value: "Received", label: "Received" }] },
      { id: "status", label: "All statuses", col: "status", options: ["Matches", "Mismatch", "Partial", "No reference", "Draft", "Sent to vendor", "Received", "Approved", "Needs review", "Rejected", "Closed"].map((v) => ({ value: v, label: v })) },
      { id: "branch", label: "All branches", col: "branch", options: opts(receivedRows.map((r) => r.branch)) },
    ],
    kpis: [
      { lab: "Received CMs", val: String(receivedRows.length), go: "Received →", filterCol: "type", filterVal: "Received" },
      { lab: "Matches Original", val: String(receivedRows.filter((r) => r.status === "Matches").length), go: "Approve →", filterCol: "status", filterVal: "Matches" },
      { lab: "Needs Review", val: String(receivedRows.filter((r) => r.status === "Mismatch").length), go: "Review →", filterCol: "status", filterVal: "Mismatch" },
      { lab: "Requested", val: String(requestedRows.length), go: "Requested →", filterCol: "type", filterVal: "Requested" },
      { lab: "$ Requested", val: moneyK(requestedRows.reduce((s, r) => s + r.amount, 0)), go: "Tracking →" },
      { lab: "Awaiting Vendor", val: String(requestedRows.filter((r) => r.status === "Sent to vendor").length), go: "Chase →", filterCol: "status", filterVal: "Sent to vendor" },
    ],
    columns: [
      { key: "type", label: "Type", sort: true, render: "pill", clsKey: "typeCls" },
      { key: "memo", label: "Credit Memo #", render: "mono", sort: true },
      { key: "invoice", label: "Invoice", render: "mono", sort: true },
      { key: "branch", label: "Branch", subKey: "account", sort: true },
      { key: "amount", label: "Credit", align: "num", sort: true, render: "pillMoney", clsKey: "amountCls" },
      { key: "lines", label: "Lines", sort: true },
      { key: "reason", label: "Detail", sort: true },
      { key: "age", label: "Age", align: "num", sort: true, render: "days", toneKey: "ageTone" },
      { key: "status", label: "Status", sort: true, render: "pill", clsKey: "statusCls" },
      { key: "_a", label: "", sort: false, render: "action" },
    ],
    rows,
    countNoun: "memos",
    defaultSort: { key: "age", dir: -1 },
    themeKey: "aqCreditMemoTheme",
  };
}
