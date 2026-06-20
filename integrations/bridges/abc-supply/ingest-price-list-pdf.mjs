#!/usr/bin/env node
// ingest-price-list-pdf.mjs — parse family-level ABC price-list PDFs that carry NO item codes
// (Denver, Dallas) into price_list_pdf_staging. A pg_trgm match against abc_product_catalog (run
// separately) then assigns the item id# by description (Chris's rule). Text-layer PDFs only
// (pdftotext); no OCR needed. Idempotent (upsert on source_doc + raw_description).

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ENV = "/Users/chussey/Documents/a-roofers-open-brain/.env";
const env = {};
for (const l of readFileSync(ENV, "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const SB = (env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL).replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const DROPBOX = "/Users/chussey/Library/CloudStorage/Dropbox-AIA4";

const DOCS = [
  { file: `${DROPBOX}/AIA4/ProExteriors/ProExteriors Sandbox Project/reabcinvoices/DENVER PRO EXTERIORS LLC PRICE LIST 08-30-2024.pdf`,
    source_doc: "denver-branch49-pricelist-2024", office: "Denver (Greenwood Village), CO", branch_number: "49", effective_date: "2024-09-01" },
  { file: `${DROPBOX}/AIA4/ProExteriors/ProExteriors Sandbox Project/reabcinvoices/04-21-2025 DALLAS.pdf`,
    source_doc: "dallas-pricelist-apr2025", office: "Richardson, TX", branch_number: "41", effective_date: "2025-04-21" },
];

const UOM = "BD|SQ|RL|PC|EA|BX|LF|CT|RO|CN|TB|BG|PA|SH|CS|GA|TU|KT|EX";
const RE = new RegExp(`([A-Za-z][A-Za-z0-9 \\/.&"'+\\-]*?)\\s{2,}(\\d+\\.\\d{2})\\s+(${UOM})\\b(?:\\s+(\\d+\\.\\d{2})\\s+(${UOM})\\b)?`, "g");
// category/brand headers that bleed into the start of a right-column description — strip them
const HEADERS = /^(Shingles|Hip & Ridge Shingles|Starter Shingles|Underlayment|Ridge Vents|Accessories|Nails|Pipe Boots|Flashing|Ventilation|Low Slope|Coil|Sealant|Gutters)\s+/i;

function parse(txt) {
  const rows = [];
  for (const line of txt.split("\n")) {
    let m; RE.lastIndex = 0;
    while ((m = RE.exec(line))) {
      let desc = m[1].trim().replace(/\s+/g, " ");
      while (HEADERS.test(desc)) desc = desc.replace(HEADERS, "");
      if (desc.length < 3) continue;
      let price = Number(m[2]), uom = m[3], bd = m[3] === "BD" ? Number(m[2]) : null;
      if (m[4] && m[5]) { price = Number(m[4]); uom = m[5]; } // 2nd price (usually SQ) = the comparable
      rows.push({ raw_description: desc, price, uom, bd_price: bd });
    }
  }
  // dedup by description (keep first)
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.raw_description) ? false : (seen.add(r.raw_description), true)));
}

for (const d of DOCS) {
  const txt = execSync(`pdftotext -layout "${d.file}" -`, { encoding: "utf8", maxBuffer: 1 << 24 });
  const rows = parse(txt).map((r) => ({ ...r, source_doc: d.source_doc, office: d.office, branch_number: d.branch_number, effective_date: d.effective_date }));
  const res = await fetch(`${SB}/rest/v1/price_list_pdf_staging?on_conflict=source_doc,raw_description`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  console.log(`${d.source_doc}: parsed ${rows.length} items → ${res.ok ? "staged" : "ERR " + res.status + " " + (await res.text())}`);
}
console.log("done");
