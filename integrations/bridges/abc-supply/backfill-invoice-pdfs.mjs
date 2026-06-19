#!/usr/bin/env node
// backfill-invoice-pdfs.mjs
// One-time (idempotent) backfill of missing invoice PDFs for the Invoice Audit window.
// For every invoice in v_invoice_audit_invoice that has no stored PDF, fetch the document
// from ABC (GET /api/invoice/v1/invoices/pdf/{invoiceId}), upload it to the `invoices`
// storage bucket, and upsert invoice_documents.storage_path. Read-only against ABC.
//
//   node integrations/bridges/abc-supply/backfill-invoice-pdfs.mjs [--dry-run] [--limit N]
//
// Auth + config mirror production-sync.mjs (OAuth client_credentials, prod base by default).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const ENV_PATH = resolve(ROOT, ".env");

const DEFAULTS = {
  sandbox: { authBaseUrl: "https://sandbox.auth.partners.abcsupply.com/oauth2/aus1vp07knpuqf6Xz0h8", apiBaseUrl: "https://partners-sb.abcsupply.com" },
  production: { authBaseUrl: "https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357", apiBaseUrl: "https://partners.abcsupply.com" },
};
const DEFAULT_SCOPES = "invoice.read invoice.history.read";

function parseDotenv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  } catch {}
  return out;
}
const stripSlash = (s) => (s || "").replace(/\/+$/, "");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

const dotenv = parseDotenv(ENV_PATH);
const env = { ...dotenv, ...process.env };
const abcEnv = String(env.ABC_SUPPLY_ENV || "production").toLowerCase();
const cfg = DEFAULTS[abcEnv] || DEFAULTS.production;
const apiBaseUrl = stripSlash(env.ABC_SUPPLY_API_BASE_URL || cfg.apiBaseUrl);
const authBaseUrl = stripSlash(env.ABC_SUPPLY_AUTH_BASE_URL || cfg.authBaseUrl);
const clientId = env.ABC_SUPPLY_CLIENT_ID || env.ClientID;
const clientSecret = env.ABC_SUPPLY_CLIENT_SECRET || env.Client_Secret;
const scope = env.ABC_SUPPLY_SCOPES?.trim() || DEFAULT_SCOPES;
const supabaseUrl = stripSlash(env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || "");
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "invoices";

if (!clientId || !clientSecret) { console.error("Missing ABC_SUPPLY_CLIENT_ID / _SECRET in .env"); process.exit(1); }
if (!supabaseUrl || !serviceRole) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env"); process.exit(1); }

const sb = (path, init = {}) =>
  fetch(`${supabaseUrl}${path}`, { ...init, headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, ...(init.headers || {}) } });

async function getToken() {
  const res = await fetch(`${authBaseUrl}/v1/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`token exchange failed: ${res.status} ${JSON.stringify(json)}`);
  return json.access_token;
}

function fmtDate(d) {
  if (!d) return "00000000";
  const dt = new Date(d);
  return `${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}${dt.getFullYear()}`;
}

async function main() {
  console.log(`ABC env=${abcEnv} api=${apiBaseUrl}  dryRun=${dryRun}`);

  // 1) window invoices, invoices with a PDF, and the ABC vendor_id
  const windowRows = await (await sb(`/rest/v1/v_invoice_audit_invoice?select=invoice_number`)).json();
  const havePdf = new Set(
    (await (await sb(`/rest/v1/invoice_documents?select=invoice_number&storage_path=not.is.null`)).json()).map((r) => r.invoice_number),
  );
  const sampleDoc = (await (await sb(`/rest/v1/invoice_documents?select=vendor_id&limit=1`)).json())[0];
  const vendorId = sampleDoc?.vendor_id ?? null;

  const missingNumbers = [...new Set(windowRows.map((r) => r.invoice_number))].filter((n) => !havePdf.has(n));
  console.log(`window=${windowRows.length} missingPdf=${missingNumbers.length} vendor_id=${vendorId}`);
  if (!missingNumbers.length) { console.log("Nothing to backfill."); return; }

  // 2) pull invoice_id + metadata for the missing invoices
  const inList = missingNumbers.map((n) => `"${n}"`).join(",");
  const invs = await (await sb(`/rest/v1/abc_invoices?select=invoice_number,invoice_id,sold_to_number,bill_to_number,invoice_date&invoice_number=in.(${encodeURIComponent(inList)})`)).json();

  const token = await getToken();
  const out = { fetched: 0, uploaded: 0, upserted: 0, skipped: [], failed: [] };
  let n = 0;
  for (const inv of invs) {
    if (n >= limit) break;
    n++;
    const invoiceId = inv.invoice_id;
    if (!invoiceId) { out.failed.push({ invoice: inv.invoice_number, reason: "no invoice_id" }); continue; }
    const cust = inv.sold_to_number || inv.bill_to_number || "unknown";
    const path = `${cust}_${inv.invoice_number}_${fmtDate(inv.invoice_date)}.pdf`;

    const pdfRes = await fetch(`${apiBaseUrl}/api/invoice/v1/invoices/pdf/${encodeURIComponent(invoiceId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
    });
    if (!pdfRes.ok) { out.failed.push({ invoice: inv.invoice_number, reason: `pdf ${pdfRes.status}` }); continue; }
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    const ct = pdfRes.headers.get("content-type") || "";
    if (buf.length < 200 || !(ct.includes("pdf") || buf.subarray(0, 4).toString() === "%PDF")) {
      out.failed.push({ invoice: inv.invoice_number, reason: `not a pdf (ct=${ct}, bytes=${buf.length})` });
      continue;
    }
    out.fetched++;
    const sha = createHash("sha256").update(buf).digest("hex");
    console.log(`  ${inv.invoice_number} -> ${path} (${buf.length} bytes)`);
    if (dryRun) continue;

    // 3) upload to storage (overwrite-safe)
    const up = await sb(`/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "x-upsert": "true" },
      body: buf,
    });
    if (!up.ok) { out.failed.push({ invoice: inv.invoice_number, reason: `upload ${up.status} ${await up.text()}` }); continue; }
    out.uploaded++;

    // 4) upsert invoice_documents
    const row = {
      vendor_id: vendorId,
      customer_number: cust,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date ? String(inv.invoice_date).slice(0, 10) : null,
      storage_bucket: BUCKET,
      storage_path: path,
      original_filename: path,
      sha256: sha,
      file_size_bytes: buf.length,
      source: "backfill",
      uploaded_by: "backfill-invoice-pdfs",
      uploaded_at: new Date().toISOString(),
    };
    const ins = await sb(`/rest/v1/invoice_documents?on_conflict=vendor_id,invoice_number`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(row),
    });
    if (!ins.ok) { out.failed.push({ invoice: inv.invoice_number, reason: `upsert ${ins.status} ${await ins.text()}` }); continue; }
    out.upserted++;
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log("\n=== backfill summary ===");
  console.log(JSON.stringify({ fetched: out.fetched, uploaded: out.uploaded, upserted: out.upserted, failed: out.failed.length }, null, 2));
  if (out.failed.length) console.log("failed:", JSON.stringify(out.failed, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
