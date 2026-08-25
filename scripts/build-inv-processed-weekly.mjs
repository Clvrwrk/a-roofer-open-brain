#!/usr/bin/env node
// build-inv-processed-weekly.mjs — the Tuesday QB file producer (docs/81 Phase 6).
//
//   node scripts/build-inv-processed-weekly.mjs             # PREP ONLY: writes the CSV, stamps nothing
//   node scripts/build-inv-processed-weekly.mjs --stamp     # also marks the invoices register-exported
//   node scripts/build-inv-processed-weekly.mjs --week      # restrict to this Tue-Tue week
//
// ONE FILE PER VENDOR: INV-PROCESSED-[vendor]-[date].csv, every Tuesday.
// ABC, SRS and QXO each keep a SEPARATE QB bank register, so a mixed-vendor export is
// invalid - it would post one vendor's invoices into another's register. This is Chris's
// ruling of 2026-08-25 and it SUPERSEDES docs/81 decisions 2 and 14 ("one weekly
// cross-vendor file"); it restores the docs/63 contract that invoice-payment.ts still
// carries ("One file per vendor - a batch spanning N vendors produces N files").
// Decision 1 still holds: payment runs ahead of audit, so every row is Approved to Pay
// = Yes and the audit recovers credits behind it.
//
// Negative totals never appear here. A negative total IS a credit memo (Chris,
// 2026-08-25) and belongs in credit-memo reconciliation against its original invoice -
// see v_credit_memo_tbd. Migration 280 enforces this in the view.
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

const byVendor = new Map();
for (const r of rows) {
  if (!byVendor.has(r.vendor_slug)) byVendor.set(r.vendor_slug, []);
  byVendor.get(r.vendor_slug).push(r);
}

const outDir = resolve(ROOT, "exports", `inv-processed-${stamp}`);
mkdirSync(outDir, { recursive: true });

const written = [];
let grandTotal = 0;
for (const [vendor, vrows] of [...byVendor.entries()].sort()) {
  // Guard: a file must never span vendors — separate QB bank registers.
  const distinct = new Set(vrows.map((r) => r.vendor_slug));
  if (distinct.size !== 1) { console.error(`refusing to write a mixed-vendor file for ${vendor}`); process.exit(1); }
  const negatives = vrows.filter((r) => Number(r.total_due) <= 0);
  if (negatives.length) { console.error(`refusing: ${negatives.length} non-positive rows reached ${vendor} — these are credit memos`); process.exit(1); }

  const csv = [HEADER.join(",")].concat(vrows.map((r) => [
    cell(r.invoice_number), cell(r.invoice_date), money(r.total_due), cell(r.po_number),
    cell(r.discount_message), cell(r.due_date), cell(r.terms), money(r.discount_amount),
    cell(r.approved_to_pay), cell(r.disposition),
  ].join(","))).join("\r\n");

  const fileName = `INV-PROCESSED-${vendor}-${stamp}.csv`;
  writeFileSync(resolve(outDir, fileName), csv + "\r\n", "utf8");
  const value = vrows.reduce((a, r) => a + Number(r.total_due ?? 0), 0);
  const cm = vrows.filter((r) => r.disposition === "Credit memo requested").length;
  written.push({ vendor, fileName, invoices: vrows.length, value, cm });
  grandTotal += value;
}

const summary = [
  `# INV-PROCESSED ${stamp}`, "",
  `One file per vendor — ABC, SRS and QXO keep separate QB bank registers.`, "",
  `Files: **${written.length}**   Invoices: **${rows.length}**   Value: **$${grandTotal.toFixed(2)}**`, "",
  "| Vendor | File | Invoices | Value | Credit memo requested |", "|---|---|---:|---:|---:|",
  ...written.map((w) => `| ${w.vendor} | ${w.fileName} | ${w.invoices} | $${w.value.toFixed(2)} | ${w.cm} |`),
  "", "Credits are excluded by contract: a negative total is a credit memo and routes to `v_credit_memo_tbd`.", "",
  STAMP ? "Ledger STAMPED — these invoices will not appear in a future file."
        : "Prep only — nothing stamped. Re-run with `--stamp` once accounting has loaded these files.",
].join("\n");
writeFileSync(resolve(outDir, "SUMMARY.md"), summary + "\n", "utf8");

for (const w of written) console.log(`  ${w.fileName}: ${w.invoices} invoices, $${w.value.toFixed(2)}`);
console.log(`written -> ${outDir}`);

if (!STAMP) { console.log("\nPREP ONLY — invoice_register_export untouched. Re-run with --stamp after accounting loads these."); process.exit(0); }

const batchId = crypto.randomUUID();
for (const w of written) {
  const vrows = byVendor.get(w.vendor);
  for (let i = 0; i < vrows.length; i += 500) {
    const chunk = vrows.slice(i, i + 500).map((r) => ({
      invoice_number: r.invoice_number, batch_id: batchId, vendor: r.vendor_slug,
      csv_file_name: w.fileName, csv_row: r, disposition: r.disposition,
      approved_to_pay: true, exported_by: "Alex", register_exported_at: new Date().toISOString(),
    }));
    const res = await sb("/rest/v1/invoice_register_export", {
      method: "POST", headers: { prefer: "resolution=ignore-duplicates" }, body: JSON.stringify(chunk),
    });
    if (!res.ok) { console.error(`stamp failed: ${res.status} ${await res.text()}`); process.exit(1); }
  }
}
console.log(`stamped ${rows.length} invoices across ${written.length} vendor files (batch ${batchId}).`);
