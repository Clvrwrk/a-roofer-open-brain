#!/usr/bin/env node
// build-inv-processed-weekly.mjs — the Tuesday QB file producer (docs/81 Phase 6).
//
//   node scripts/build-inv-processed-weekly.mjs             # PREP ONLY: writes the CSV, stamps nothing
//   node scripts/build-inv-processed-weekly.mjs --stamp     # also marks the invoices register-exported
//   node scripts/build-inv-processed-weekly.mjs --week      # restrict to this Tue-Tue week
//
// docs/81 decision 2: ONE weekly cross-vendor file, INV-PROCESSED-[date].csv, every
// Tuesday. Decision 14: spreadsheets/CSVs are cross-vendor; only the credit-memo
// request emails are vendor-specific. Decision 1: payment runs ahead of audit, so
// every row is Approved to Pay = Yes and the audit recovers credits behind it.
//
// The membership set lives in SQL (v_inv_processed_weekly, migration 278) so this
// renderer stays dumb and the contract has one home.
//
// STAMPING IS OPT-IN AND IRREVERSIBLE IN PRACTICE. invoice_register_export is the
// load-once guard: once an invoice is stamped it never appears in a future file. Only
// pass --stamp when the CSV has actually been handed to accounting and loaded.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const STAMP = args.has("--stamp");
const WEEK_ONLY = args.has("--week");

const envText = (() => { try { return readFileSync(resolve(ROOT, ".env"), "utf8"); } catch { return ""; } })();
const env = Object.fromEntries(
  envText.split("\n").map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, "")]),
);
const SB_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) { console.error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const sb = (path, init = {}) => fetch(`${SB_URL}${path}`, {
  ...init,
  headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", ...(init.headers || {}) },
});

// PostgREST truncates silently at the row cap — always paginate (see CONVENTIONS §10).
async function fetchAll(path, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const res = await sb(`${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${from}`);
    if (!res.ok) { console.error(`fetch failed: ${res.status} ${await res.text()}`); process.exit(1); }
    const page = await res.json();
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}

// The locked docs/63 QB header + Disposition. Validated against accounting's live
// import — do not reorder or rename.
const HEADER = ["INVOICE_NUMBER","INVOICE_DATE","TOTAL_DUE","PO_NUMBER","DISCOUNT_MESSAGE","DUE_DATE","TERMS","DISCOUNT_AMOUNT","Approved to Pay","Disposition"];
const cell = (v) => {
  const s = String(v ?? "").trim();
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (v) => (v == null || v === "" ? "" : Number(v).toFixed(2));

// Tue-Tue week: the most recent Tuesday back to the Tuesday before it.
function weekStart(today) {
  const d = new Date(today);
  const back = (d.getUTCDay() - 2 + 7) % 7; // 2 = Tuesday
  d.setUTCDate(d.getUTCDate() - back - 7);
  return d.toISOString().slice(0, 10);
}

const now = new Date();
const stamp = now.toISOString().slice(0, 10);
let rows = await fetchAll("/rest/v1/v_inv_processed_weekly?select=*&order=vendor_slug.asc,invoice_date.asc,invoice_number.asc");
if (WEEK_ONLY) {
  const from = weekStart(now);
  rows = rows.filter((r) => r.invoice_date >= from);
  console.log(`--week: restricted to invoices dated >= ${from}`);
}

if (!rows.length) { console.log("nothing to export — every dispositioned invoice is already register-exported."); process.exit(0); }

const csv = [HEADER.join(",")].concat(rows.map((r) => [
  cell(r.invoice_number), cell(r.invoice_date), money(r.total_due), cell(r.po_number),
  cell(r.discount_message), cell(r.due_date), cell(r.terms), money(r.discount_amount),
  cell(r.approved_to_pay), cell(r.disposition),
].join(","))).join("\r\n");

const outDir = resolve(ROOT, "exports", `inv-processed-${stamp}`);
mkdirSync(outDir, { recursive: true });
const fileName = `INV-PROCESSED-${stamp}.csv`;
writeFileSync(resolve(outDir, fileName), csv + "\r\n", "utf8");

const byVendor = {};
let total = 0;
for (const r of rows) {
  byVendor[r.vendor_slug] ??= { invoices: 0, value: 0, cm: 0 };
  byVendor[r.vendor_slug].invoices += 1;
  byVendor[r.vendor_slug].value += Number(r.total_due ?? 0);
  if (r.disposition === "Credit memo requested") byVendor[r.vendor_slug].cm += 1;
  total += Number(r.total_due ?? 0);
}
const summary = [
  `# INV-PROCESSED ${stamp}`, "",
  `Rows: **${rows.length}**   Value: **$${total.toFixed(2)}**`, "",
  "| Vendor | Invoices | Value | Credit memo requested |", "|---|---:|---:|---:|",
  ...Object.entries(byVendor).map(([v, s]) => `| ${v} | ${s.invoices} | $${s.value.toFixed(2)} | ${s.cm} |`),
  "", STAMP ? "Ledger STAMPED — these invoices will not appear in a future file."
           : "Prep only — nothing stamped. Re-run with `--stamp` once accounting has loaded this file.",
].join("\n");
writeFileSync(resolve(outDir, "SUMMARY.md"), summary + "\n", "utf8");

console.log(`${fileName}: ${rows.length} invoices, $${total.toFixed(2)}`);
for (const [v, s] of Object.entries(byVendor)) console.log(`  ${v}: ${s.invoices} invoices, $${s.value.toFixed(2)}`);
console.log(`written -> ${outDir}`);

if (!STAMP) { console.log("\nPREP ONLY — invoice_register_export untouched. Re-run with --stamp after accounting loads it."); process.exit(0); }

const batchId = `inv-processed-${stamp}`;
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500).map((r) => ({
    invoice_number: r.invoice_number, batch_id: batchId, vendor: r.vendor_slug,
    csv_file_name: fileName, csv_row: r, disposition: r.disposition,
    approved_to_pay: true, exported_by: "Alex", register_exported_at: new Date().toISOString(),
  }));
  const res = await sb("/rest/v1/invoice_register_export", {
    method: "POST", headers: { prefer: "resolution=ignore-duplicates" }, body: JSON.stringify(chunk),
  });
  if (!res.ok) { console.error(`stamp failed: ${res.status} ${await res.text()}`); process.exit(1); }
}
console.log(`stamped ${rows.length} invoices as register-exported (batch ${batchId}).`);
