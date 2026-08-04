#!/usr/bin/env node
// Ingest the 2026-08-04 price-agreement drop (docs/80 §1):
//   ABC  → abc_price_agreements + abc_price_list_items (Wichita 2036874-16,
//          Denver 2036874-9 PA-90502-9AMTT6, DFW 2036874-2)
//   SRS  → price_agreements + price_agreement_items (MELESSA Level 4 sheet,
//          Wichita quote 0049828559 with item codes)
// Text-layer PDFs via pdftotext -layout. Idempotent: agreements matched on
// (account/agreement_number + effective_date); items replaced per agreement.
// Run: node integrations/bridges/ingest-agreement-pdfs-2026-08-04.mjs <dir-with-pdfs>

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = process.argv[2];
if (!DIR) { console.error("usage: … <dir containing the pdfs>"); process.exit(1); }

const env = {};
for (const l of readFileSync(resolve(ROOT, ".env"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SB = (env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL).replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
const pdfText = (f) => execSync(`pdftotext -layout "${resolve(DIR, f)}" -`, { encoding: "utf8", maxBuffer: 1 << 25 });

const UOM = "BD|SQ|RL|PC|EA|BX|LF|CT|RO|CN|TB|BG|PA|SH|CS|GA|TU|KT|EX|BKT";

// "ITEMNUM  Description ...  $123.4567  UOM"  (ABC item-numbered lists) or
// "Description ...  $123.45  UOM"             (desc-only lists / SRS sheets)
function parseLines(txt, { itemNumbered }) {
  const out = [];
  const reItem = new RegExp(`^\\s*([0-9A-Z]{6,16})\\s+(.+?)\\s{2,}\\$?([\\d,]+\\.\\d{2,4})\\s+(${UOM})\\b`);
  const reDescG = new RegExp(`(?:^|\\s{3,})([A-Za-z][^$]*?)\\s{2,}\\$?([\\d,]+\\.\\d{2,4})\\s+(${UOM})\\b`, "g");
  for (const line of txt.split("\n")) {
    if (itemNumbered) {
      const m = line.match(reItem);
      if (m) { out.push({ item_number: m[1], description: m[2].trim(), unit_price: Number(m[3].replace(/,/g, "")), unit: m[4] }); continue; }
    }
    for (const m of line.matchAll(reDescG)) {
      if (/Price List|Effective|Expiration|Item Description|Unit Price|Customer|Sales Rep|Page \d/i.test(m[1])) continue;
      out.push({ item_number: null, description: m[1].trim().replace(/\s+/g, " "), unit_price: Number(m[2].replace(/,/g, "")), unit: m[3] });
    }
  }
  const seen = new Set();
  return out.filter((r) => {
    const k = `${r.item_number ?? ""}|${r.description}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

// SRS quote lines: "ITEMCODE  desc…  QTY  UOM  PRICE  UOM"
function parseSrsQuote(txt) {
  // Quote PDFs have kerning-broken columns ("B D   9 2.00   S Q") — take the tail
  // after the description, strip ALL spaces, then match qty+uom+price+uom.
  const out = [];
  const head = /^\s*([A-Z0-9]{5,16})\s+(.+?)\s{2,}(\d[\d .]*[A-Z][A-Z .]*\d[\d .]*\.[\d .]*\d[A-Z .]*[A-Z])\s*$/;
  const tailRe = new RegExp(`^(\\d+)(${UOM})([\\d]+\\.\\d{2})(${UOM})$`);
  for (const line of txt.split("\n")) {
    const m = line.match(head);
    if (!m) continue;
    const t = m[3].replace(/\s+/g, "").match(tailRe);
    if (t) out.push({ item_number: m[1], description: m[2].trim().replace(/\s+/g, " "), order_uom: t[2], unit_price: Number(t[3]), unit: t[4] });
  }
  return out;
}

async function abcAgreement({ file, account, agreement_number, branch_number, region_code, effective_date, expiry_date, itemNumbered }) {
  const items = parseLines(pdfText(file), { itemNumbered });
  const existing = await rest(`abc_price_agreements?select=id&abc_account_number=eq.${account}&effective_date=eq.${effective_date}`);
  let id = existing[0]?.id;
  const payload = {
    branch_number, region_code, agreement_number, abc_account_number: account,
    sales_rep: "Justin Garza", effective_date, expiry_date,
    version_label: "2026-08-04 drop", source_file: file, notes: "Ingested from Chris's 2026-08-04 file drop (docs/80)" + (itemNumbered ? "" : " — IMAGE PDF, no text layer: OCR pass pending (mig 133 path)"),
  };
  if (id) await rest(`abc_price_agreements?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(payload), headers: { Prefer: "return=minimal" } });
  else { const [row] = await rest("abc_price_agreements", { method: "POST", body: JSON.stringify(payload), headers: { Prefer: "return=representation" } }); id = row.id; }
  await rest(`abc_price_list_items?agreement_id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const rows = items.map((r) => ({ agreement_id: id, item_number: r.item_number, description: r.description, unit: r.unit, unit_price: r.unit_price, approval_status: "pending" }));
  for (let i = 0; i < rows.length; i += 400) await rest("abc_price_list_items", { method: "POST", body: JSON.stringify(rows.slice(i, i + 400)), headers: { Prefer: "return=minimal" } });
  console.log(`ABC ${agreement_number ?? account} (${file}): ${rows.length} items -> agreement ${id}`);
}

async function srsAgreement({ file, kind, version_label, effective_date, branchNameLike, account }) {
  const [vendor] = await rest("vendors?select=id&slug=eq.srs");
  const [branch] = await rest(`vendor_branches?select=id&vendor_id=eq.${vendor.id}&branch_name=ilike.*${branchNameLike}*&limit=1`);
  const txt = pdfText(file);
  const items = kind === "quote" ? parseSrsQuote(txt) : parseLines(txt, { itemNumbered: false });
  const existing = await rest(`price_agreements?select=id&vendor_id=eq.${vendor.id}&version_label=eq.${encodeURIComponent(version_label)}`);
  let id = existing[0]?.id;
  const payload = {
    vendor_id: vendor.id, vendor_branch_id: branch?.id ?? null, account_number: account,
    version_label, effective_date, source_file: file, is_active: true,
    notes: "Ingested from Chris's 2026-08-04 file drop (docs/80)",
  };
  if (id) await rest(`price_agreements?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(payload), headers: { Prefer: "return=minimal" } });
  else { const [row] = await rest("price_agreements", { method: "POST", body: JSON.stringify(payload), headers: { Prefer: "return=representation" } }); id = row.id; }
  await rest(`price_agreement_items?agreement_id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const rows = items.map((r) => ({
    agreement_id: id, raw_item_number: r.item_number ?? null, raw_description: r.description,
    negotiated_price: r.unit_price, price_uom: r.unit, order_uom: r.order_uom ?? null,
    match_type: "unmatched", needs_review: true, approval_status: "pending",
  }));
  for (let i = 0; i < rows.length; i += 400) await rest("price_agreement_items", { method: "POST", body: JSON.stringify(rows.slice(i, i + 400)), headers: { Prefer: "return=minimal" } });
  console.log(`SRS ${version_label} (${file}): ${rows.length} items -> agreement ${id}`);
}

const srsOnly = process.argv.includes("--srs-only");
if (!srsOnly) await abcAgreement({ file: "Pro Exteriors - 6.15.26 Price Page.pdf", account: "2036874-16", agreement_number: "2036874-16", branch_number: "113", region_code: "KS", effective_date: "2026-06-15", expiry_date: "2026-07-31", itemNumbered: false });
if (!srsOnly) await abcAgreement({ file: "Pro Exteriors - Roof Load-POS-35943 (Updated).pdf", account: "2036874-9", agreement_number: "PA-90502-9AMTT6", branch_number: "49", region_code: "CO", effective_date: "2026-06-23", expiry_date: "2026-12-31", itemNumbered: true });
if (!srsOnly) await abcAgreement({ file: "011. Pro Exteriors (4) (1).pdf", account: "2036874-2", agreement_number: "2036874-2", branch_number: "011", region_code: "TX", effective_date: "2026-07-23", expiry_date: "2026-08-19", itemNumbered: true });
await srsAgreement({ file: "MELESSA_PRICE_SHEET- LEVEL 4 (1).pdf", kind: "sheet", version_label: "Melissa TX Level 4 (2026-02-16)", effective_date: "2026-02-16", branchNameLike: "MELISSA", account: "S036198" });
await srsAgreement({ file: "Quote0049828559.pdf", kind: "quote", version_label: "Wichita quote 0049828559 (2026-06-23)", effective_date: "2026-06-23", branchNameLike: "WICHITA", account: "S036198 0001" });
console.log("done");
