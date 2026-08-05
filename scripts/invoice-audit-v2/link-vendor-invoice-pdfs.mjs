#!/usr/bin/env node
// link-vendor-invoice-pdfs.mjs — Phase 5 (docs/81 §7): match SRS/QXO invoice PDFs
// against ingested vendor_invoices, upload to the `invoices` storage bucket, upsert
// invoice_documents, and stamp invoice_pipeline_status (vendor-scoped).
//
//   node scripts/invoice-audit-v2/link-vendor-invoice-pdfs.mjs --vendor=srs --dir="<folder>"
//
// Filename convention: invoice_<INVOICE_NUMBER>.pdf (other files reported as skipped).
// Idempotent: re-upload overwrites the same storage path; upserts by (vendor, invoice).

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));

function parseDotenv(path) {
  const out = {};
  try { for (const line of readFileSync(path, "utf8").split("\n")) { const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch {}
  return out;
}
const env = { ...parseDotenv(resolve(ROOT, ".env")), ...process.env };
const URL_ = (env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path, init = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const slug = args.vendor, dir = args.dir;
if (!slug || !dir) { console.error("--vendor=srs|qxo --dir=<folder> required"); process.exit(1); }

const [vendor] = await rest(`vendors?slug=eq.${slug}&select=id,slug`);
if (!vendor) { console.error(`vendor '${slug}' not found`); process.exit(1); }

const invoices = await rest(`vendor_invoices?vendor_id=eq.${vendor.id}&select=id,invoice_number,invoice_date,account_number&limit=1000`);
const byNumber = new Map(invoices.map((i) => [i.invoice_number.replace(/^0+/, ""), i]));
const exact = new Map(invoices.map((i) => [i.invoice_number, i]));

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
const report = { linked: [], unmatched_pdfs: [], invoices_without_pdf: [] };

for (const f of files) {
  const m = basename(f).match(/^invoice[_-](.+)\.pdf$/i);
  const num = m ? m[1] : basename(f, ".pdf");
  const inv = exact.get(num) || byNumber.get(num.replace(/^0+/, ""));
  if (!inv) { report.unmatched_pdfs.push(f); continue; }

  const bytes = readFileSync(join(dir, f));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `${slug}/${inv.invoice_number}.pdf`;
  const up = await fetch(`${URL_}/storage/v1/object/invoices/${storagePath}`, {
    method: "POST", headers: { ...H, "Content-Type": "application/pdf", "x-upsert": "true" }, body: bytes,
  });
  if (!up.ok) throw new Error(`upload ${storagePath} -> ${up.status}: ${await up.text()}`);

  await rest(`invoice_documents?on_conflict=vendor_id,invoice_number`, {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ vendor_id: vendor.id, customer_number: inv.account_number || slug.toUpperCase(), invoice_number: inv.invoice_number, invoice_date: inv.invoice_date, storage_bucket: "invoices", storage_path: storagePath, original_filename: f, sha256, file_size_bytes: bytes.length, source: "manual_upload", uploaded_by: "phase5-ingest" }]),
  });

  await rest(`invoice_pipeline_status?on_conflict=vendor_slug,invoice_number`, {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ vendor_slug: slug, invoice_number: inv.invoice_number, pipeline_status: "invoice_processed", processed_at: new Date().toISOString(), pdf_linked: true, agreement_matched: false, source: "pipeline_v2", note: "Phase 5 initial vendor ingest (docs/81); agreement matching pending vendor agreement load" }]),
  });
  report.linked.push(inv.invoice_number);
}

const linkedSet = new Set(report.linked);
report.invoices_without_pdf = invoices.map((i) => i.invoice_number).filter((n) => !linkedSet.has(n));
console.log(JSON.stringify({ vendor: slug, pdfs: files.length, ...report, linkedCount: report.linked.length }, null, 2));
