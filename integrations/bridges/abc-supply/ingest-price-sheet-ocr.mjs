#!/usr/bin/env node
// OCR ingest for image-only ABC price sheets (no text layer, so pdftotext yields nothing).
// Uses Unstructured's partition API with hi_res + table inference — the same provider the
// Slack attachment processor uses (app/command-center/runtime/slack-attachment-processor.mjs).
// docs/80 §1: the Wichita 2036874-16 sheet arrived as a scan.
//
// Usage:
//   node integrations/bridges/abc-supply/ingest-price-sheet-ocr.mjs \
//     --file=<pdf> --agreement-id=<id> [--dry-run]
//
// Idempotent: replaces abc_price_list_items for the agreement on each run.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const env = {};
for (const line of readFileSync(resolve(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SB = (env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const UKEY = env.UNSTRUCTURED_API_KEY || env.PE_SLACK_UNSTRUCTURED_API;
if (!SB || !KEY) { console.error("missing supabase creds"); process.exit(1); }
if (!UKEY) { console.error("missing UNSTRUCTURED_API_KEY / PE_SLACK_UNSTRUCTURED_API"); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function cachePath(file) { return `${tmpdir()}/ocr-${basename(file).replace(/\W+/g, "_")}.json`; }
async function ocr(file) {
  const cp = cachePath(file);
  if (!args["no-cache"] && existsSync(cp)) { console.log("  using cached OCR"); return JSON.parse(readFileSync(cp, "utf8")); }
  const bytes = readFileSync(file);
  const form = new FormData();
  form.append("files", new Blob([bytes], { type: "application/pdf" }), basename(file));
  // hi_res is required for scans; table inference keeps price columns aligned with descriptions.
  form.append("strategy", "hi_res");
  form.append("pdf_infer_table_structure", "true");
  form.append("coordinates", "true");
  const started = Date.now();
  const res = await fetch("https://api.unstructuredapp.io/general/v0/general", {
    method: "POST", headers: { "unstructured-api-key": UKEY }, body: form,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`unstructured_http_${res.status}: ${body.slice(0, 400)}`);
  console.log(`  OCR ${Math.round((Date.now() - started) / 1000)}s`);
  // Cache raw OCR so parser iteration never re-bills/re-waits on the API.
  try { writeFileSync(cachePath(file), body); } catch {}
  return JSON.parse(body);
}

const UOM = "BD|SQ|RL|PC|EA|BX|LF|CT|RO|CN|TB|BG|PA|SH|CS|GA|TU|KT|EX|BKT";
const SKIP = /Price List|Effective|Expiration|Item Description|Unit Price|Sales Rep|Customer|Page \d|surcharge|credit card/i;

// OCR fragments this layout three ways, so all three are handled:
//   1. one element per row      -> "Elite 3bdls/SQ  $125.9000  SQ"
//   2. a detected table         -> metadata.text_as_html rows
//   3. (most common here) each cell as its own element, in reading order:
//      "Vista AR 252 3bdls/sq" / "$135.0000" / "sQ"
// Case is unreliable from OCR ("sQ"), so UOM matching is case-insensitive and normalized.
function parseElements(elements) {
  const out = [];
  const lineRe = new RegExp(`^(.+?)\\s+\\$?([\\d,]+\\.\\d{2,4})\\s+(${UOM})\\b`, "i");
  const priceOnly = /^\$?([\d,]+\.\d{2,4})$/;
  const uomOnly = new RegExp(`^(${UOM})$`, "i");
  const pushRow = (desc, price, unit) => {
    desc = String(desc).replace(/\s+/g, " ").trim().replace(/^[|•\-\s$]+/, "");
    if (!desc || desc.length < 3 || SKIP.test(desc)) return;
    if (priceOnly.test(desc) || uomOnly.test(desc)) return;
    out.push({ description: desc, unit_price: Number(String(price).replace(/[,$]/g, "")), unit: unit ? String(unit).toUpperCase() : null });
  };

  const flat = [];
  for (const el of elements) {
    const html = el?.metadata?.text_as_html;
    if (html) {
      for (const row of html.split(/<\/tr>/i)) {
        const cells = [...row.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)].map((m) =>
          m[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim());
        // A table row may hold several description/price/UOM triples side by side.
        for (const cell of cells) if (cell) flat.push(cell);
      }
      continue;
    }
    for (const line of String(el?.text || "").split("\n")) {
      const t = line.trim();
      if (t) flat.push(t);
    }
  }

  for (let i = 0; i < flat.length; i++) {
    const whole = flat[i].match(lineRe);
    if (whole) { pushRow(whole[1], whole[2], whole[3]); continue; }
    const p = flat[i].match(priceOnly);
    if (!p) continue;
    // Walk back to the nearest preceding text that isn't itself a price or a UOM.
    let desc = null;
    for (let b = i - 1; b >= 0 && b >= i - 3; b--) {
      const cand = flat[b];
      if (priceOnly.test(cand) || uomOnly.test(cand)) continue;
      desc = cand; break;
    }
    // UOM is normally the next element, but this sheet is two-column and OCR interleaves
    // the columns — sometimes the UOM cell is dropped entirely (e.g. "IPS TB3 …" / "$19.50"
    // then straight into the other column). Stop at the next description/price rather than
    // stealing the neighbouring column's UOM, and emit unit=null when it is genuinely absent.
    // Null UOM is the honest record: docs/46 forbids comparing across unknown units, and
    // these rows land as approval_status='pending' for human review anyway.
    let unit = null;
    for (let f = i + 1; f < flat.length && f <= i + 2; f++) {
      if (uomOnly.test(flat[f])) { unit = flat[f]; break; }
      if (priceOnly.test(flat[f])) break;
    }
    if (desc) pushRow(desc, p[1], unit);
  }

  const seen = new Set();
  return out.filter((r) => {
    const k = `${r.description}|${r.unit_price}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

async function main() {
  const file = args.file, agreementId = args["agreement-id"];
  if (!file || !agreementId) { console.error("--file=<pdf> --agreement-id=<id>"); process.exit(1); }
  console.log(`OCR ingest: ${basename(file)} -> agreement ${agreementId}`);
  const elements = await ocr(file);
  console.log(`  elements: ${elements.length}`);
  const items = parseElements(elements);
  const noUom = items.filter((r) => !r.unit).length;
  console.log(`  parsed price rows: ${items.length}` + (noUom ? ` (${noUom} without a UOM — OCR dropped the cell; flagged for review)` : ""));
  if (!items.length) { console.error("  no rows parsed — inspect OCR output before writing"); process.exit(2); }
  if (args["dry-run"]) { console.log(JSON.stringify(args["dump-all"] ? items : items.slice(0, 12), null, 1)); return; }

  await rest(`abc_price_list_items?agreement_id=eq.${agreementId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const rows = items.map((r) => ({
    agreement_id: Number(agreementId), item_number: null, description: r.description,
    unit: r.unit, unit_price: r.unit_price, approval_status: "pending",
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await rest("abc_price_list_items", { method: "POST", body: JSON.stringify(rows.slice(i, i + 200)), headers: { Prefer: "return=minimal" } });
  }
  await rest(`abc_price_agreements?id=eq.${agreementId}`, {
    method: "PATCH",
    body: JSON.stringify({ notes: `OCR-ingested via Unstructured hi_res on 2026-08-04 (${rows.length} items, image-only PDF). Descriptions only — no item numbers on this sheet; match via trigram against abc_product_catalog.` }),
    headers: { Prefer: "return=minimal" },
  });
  console.log(`  wrote ${rows.length} items`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
