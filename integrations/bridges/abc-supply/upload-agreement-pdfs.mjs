#!/usr/bin/env node
// upload-agreement-pdfs.mjs — store ABC price-agreement PDFs in the `agreements` bucket and
// link each to its agreement so the Price Agreement Audit purple pill opens the source document.
// Mapping is by the agreement's existing source_file intent (number + branch + effective month).
// Idempotent (upsert). Run once after Chris supplies the PDFs.

import { readFileSync, existsSync } from "node:fs";

const ENV = "/Users/chussey/Documents/a-roofers-open-brain/.env";
const env = {};
for (const l of readFileSync(ENV, "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const SB = (env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL).replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const DROPBOX = "/Users/chussey/Library/CloudStorage/Dropbox-AIA4";

// file (relative to DROPBOX) → storage path → agreement id to link (null = store only, no agreement yet)
const MAP = [
  { file: "AIA4/ProExteriors/ProExteriors Sandbox Project/reabcinvoices/Wichita ABC 4.27.26.pdf", path: "wichita-2036874-16-apr2026.pdf", agreementId: 5 },
  { file: "AIA4/ProExteriors/ProExteriors Sandbox Project/reabcinvoices/Pro Exteriors - Wichita Residential Price List 9.15.25 (1).pdf", path: "wichita-2036874-16-sep2025.pdf", agreementId: 4 },
  { file: "AIA4/ProExteriors/ProExteriors Sandbox Project/reabcinvoices/KANSAS CITY, MO PRICING.pdf", path: "kansascity-2036874-20-mar2026.pdf", agreementId: 3 },
  { file: "PE_Open_Brain/Pro Exteriors - PA Item Codes.pdf", path: "wichita-2036874-16-jun2026.pdf", agreementId: 7 },
  { file: "AIA4/ProExteriors/ProExteriors Sandbox Project/reabcinvoices/DENVER PRO EXTERIORS LLC PRICE LIST 08-30-2024.pdf", path: "denver-branch49-pricelist-2024.pdf", agreementId: null },
  { file: "AIA4/ProExteriors/ProExteriors Sandbox Project/reabcinvoices/04-21-2025 DALLAS.pdf", path: "dallas-pricelist-apr2025.pdf", agreementId: null },
  { file: "PE_Open_Brain/ABC Wichita Pricing.pdf", path: "wichita-abc-pricing.pdf", agreementId: null },
];

for (const m of MAP) {
  const full = `${DROPBOX}/${m.file}`;
  if (!existsSync(full)) { console.log(`MISSING ${m.file}`); continue; }
  const bytes = readFileSync(full);
  // upload (upsert) to the agreements bucket
  const up = await fetch(`${SB}/storage/v1/object/agreements/${encodeURIComponent(m.path)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, "Content-Type": "application/pdf", "x-upsert": "true" },
    body: bytes,
  });
  const okUp = up.ok ? "uploaded" : `UPLOAD ${up.status} ${await up.text()}`;
  let linked = "(no agreement)";
  if (m.agreementId != null) {
    const r = await fetch(`${SB}/rest/v1/abc_price_agreements?id=eq.${m.agreementId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ pdf_storage_bucket: "agreements", pdf_storage_path: m.path }),
    });
    linked = r.ok ? `linked → agreement ${m.agreementId}` : `LINK ${r.status} ${await r.text()}`;
  }
  console.log(`${m.path}: ${okUp}; ${linked}`);
}
console.log("done");
