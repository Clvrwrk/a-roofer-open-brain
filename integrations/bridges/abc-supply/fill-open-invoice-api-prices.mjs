#!/usr/bin/env node
// fill-open-invoice-api-prices.mjs — targeted ABC price fetch for OPEN-invoice gaps.
//
// Analyzes every OPEN ABC invoice (abc_invoices.ar_status='open'), finds each distinct
// (item_number, branch) that has NO current API price in v_branch_item_api_price, and fetches
// the live ABC price for exactly those combos. For items in our products catalog it records the
// price as the canonical API price point (product_vendor_price_observations, source='api',
// source_ref `api:{branch}:{cycle}`) so it flows straight into v_branch_item_api_price and the
// "API Price" column on the Invoice Audit. Items ABC prices that are NOT in our catalog, plus
// items ABC will not price (freight/fuel/delivery/credits/special-order), are reported only.
//
// Read-only against ABC. Additive + idempotent against Supabase (same upsert key as price-seed).
// Mirrors integrations/bridges/abc-supply/price-seed.mjs.
//
// Usage:
//   node fill-open-invoice-api-prices.mjs --dry     # fetch from ABC, report, NO DB writes
//   node fill-open-invoice-api-prices.mjs           # fetch + upsert observations for catalog items

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const ENV_PATH = resolve(ROOT, ".env");

// ---- env (manual parse; last value wins so ABC_SUPPLY_ENV=Production overrides a stray Sandbox) ----
const env = {};
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const DRY = Boolean(args.dry);
const CYCLE = args.cycle ? String(args.cycle) : new Date().toISOString().slice(0, 7); // YYYY-MM
const BATCH = 50;

const ABC_ENV = (env.ABC_SUPPLY_ENV || "Production").toLowerCase().includes("sand") ? "sandbox" : "production";
const ABC = {
  sandbox:    { api: "https://partners-sb.abcsupply.com", auth: "https://sandbox.auth.partners.abcsupply.com/oauth2/aus1vp07knpuqf6Xz0h8" },
  production: { api: "https://partners.abcsupply.com",     auth: "https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357" },
}[ABC_ENV];
const API = env.ABC_SUPPLY_API_BASE_URL || ABC.api;
const AUTH = env.ABC_SUPPLY_AUTH_BASE_URL || ABC.auth;
const SCOPES = env.ABC_SUPPLY_SCOPES || "pricing.read product.read account.read location.read";
// production creds win (env declares Sandbox then Production; last value already applied above,
// but CLIENT_ID/SECRET are the only pair that can differ — use the env-selected pair).
const CLIENT_ID = env.ABC_SUPPLY_CLIENT_ID;
const CLIENT_SECRET = env.ABC_SUPPLY_CLIENT_SECRET;
const SB_URL = (env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!CLIENT_ID || !CLIENT_SECRET) { console.error("Missing ABC_SUPPLY_CLIENT_ID/SECRET"); process.exit(1); }
if (!SB_URL || !SB_KEY) { console.error("Missing Supabase URL/service-role key"); process.exit(1); }

const OUT_DIR = resolve(ROOT, "outputs");
mkdirSync(OUT_DIR, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normBranch = (b) => String(b ?? "").replace(/^0+/, "");

// ---- ABC auth ----
let token = null;
async function ensureToken() {
  if (token && Date.now() < token.exp) return;
  const res = await fetch(`${AUTH}/v1/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPES }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.access_token) throw new Error(`token exchange failed ${res.status}`);
  token = { v: j.access_token, exp: Date.now() + Math.max((j.expires_in || 3600) - 120, 60) * 1000 };
  log(`ABC token refreshed (env=${ABC_ENV})`);
}
async function abcPost(path, body) {
  await ensureToken();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.v}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json: j };
}

// ---- Supabase PostgREST (paginated GET) ----
async function sbGetAll(pathBase) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const res = await fetch(`${SB_URL}/rest/v1/${pathBase}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Range: `${from}-${to}`, "Range-Unit": "items" },
    });
    if (!res.ok) throw new Error(`sbGet ${pathBase} -> ${res.status} ${await res.text()}`);
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error(`sbGet ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
async function sbUpsert(rows) {
  if (DRY || !rows.length) return { ok: true, dry: DRY, n: rows.length };
  const res = await fetch(`${SB_URL}/rest/v1/product_vendor_price_observations?on_conflict=vendor_id,source,source_ref,product_id`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`sbUpsert -> ${res.status} ${await res.text()}`);
  return { ok: true, n: rows.length };
}

// ---- response helpers (match price-seed) ----
const num = (...vals) => { for (const v of vals) { const n = Number(v); if (Number.isFinite(n)) return n; } return null; };
const lineUom = (l) => l?.priceQty?.uom || l?.uom || l?.unitOfMeasure || l?.priceUom || null;
const linePrice = (l) => num(l?.pricePerUnitAmount, l?.unitPrice?.value, l?.unitPrice, l?.price, l?.sellPrice, l?.netPrice);
const lineStatus = (l) => String(l?.status?.code || l?.statusCode || l?.status || "").toUpperCase();
const lineItem = (l) => l?.itemNumber || l?.item?.number || l?.id || null;

let _vid = null;
async function abcVendorId() {
  if (_vid) return _vid;
  const v = await sbGet(`vendors?select=id&slug=eq.abc-supply`);
  _vid = v?.[0]?.id || null;
  return _vid;
}

async function main() {
  log(`OPEN-invoice API-price gap fill — env=${ABC_ENV} cycle=${CYCLE} dry=${DRY}`);

  // 1. Open invoices + their branch (audit view carries the resolved branch_number).
  const openInv = await sbGetAll(`abc_invoices?select=invoice_number&ar_status=eq.open`);
  const openSet = new Set(openInv.map((r) => r.invoice_number));
  const auditInv = await sbGetAll(`v_invoice_audit_invoice?select=invoice_number,branch_number,ship_to_number`);
  const branchByInvoice = new Map();
  for (const i of auditInv) if (openSet.has(i.invoice_number)) branchByInvoice.set(i.invoice_number, normBranch(i.branch_number ?? i.ship_to_number));
  log(`open invoices: ${openSet.size} (branch resolved for ${branchByInvoice.size})`);

  // 2. Open-invoice lines -> distinct (item_number, branch).
  const lineRows = await sbGetAll(`v_invoice_audit_line?select=invoice_number,item_number`);
  const combos = new Map(); // key item|branch -> {item_number, branch}
  for (const l of lineRows) {
    if (!openSet.has(l.invoice_number)) continue;
    const item = l.item_number;
    if (!item) continue;
    const branch = branchByInvoice.get(l.invoice_number);
    if (!branch) continue;
    combos.set(`${item}|${branch}`, { item_number: item, branch });
  }

  // 3. Existing API prices -> remove combos already covered.
  const existing = new Set((await sbGetAll(`v_branch_item_api_price?select=item_number,branch_number_norm`)).map((r) => `${r.item_number}|${r.branch_number_norm}`));
  const missing = [...combos.values()].filter((c) => !existing.has(`${c.item_number}|${c.branch}`));
  log(`open-invoice combos: ${combos.size}; already priced: ${combos.size - missing.length}; MISSING: ${missing.length}`);

  // 4. Ship-To per branch (Pro Exteriors preferred), same logic as price-seed.
  const regions = await sbGet(`abc_regions?select=ship_to_number,branch_numbers&account_type=eq.Ship-To`);
  const branchShipTo = new Map();
  for (const r of regions) {
    if (!r.ship_to_number) continue;
    const isPE = r.ship_to_number.startsWith("2036874");
    for (const bn of (Array.isArray(r.branch_numbers) ? r.branch_numbers : [])) {
      const key = normBranch(bn);
      if (!branchShipTo.has(key) || (isPE && !String(branchShipTo.get(key)).startsWith("2036874"))) branchShipTo.set(key, r.ship_to_number);
    }
  }

  // 5. products lookup for the missing item set (id + base_uom).
  const itemSet = [...new Set(missing.map((m) => m.item_number))];
  const prodByItem = new Map();
  for (let i = 0; i < itemSet.length; i += 100) {
    const chunk = itemSet.slice(i, i + 100).map((s) => `"${s.replace(/"/g, '\\"')}"`).join(",");
    const rows = await sbGet(`products?select=id,manufacturer_sku,base_uom&manufacturer_sku=in.(${chunk})`);
    for (const p of rows) prodByItem.set(p.manufacturer_sku, p);
  }

  // 6. Group missing by branch and price each branch in batches.
  const byBranch = new Map();
  for (const m of missing) { (byBranch.get(m.branch) ?? byBranch.set(m.branch, []).get(m.branch)).push(m.item_number); }

  const vid = await abcVendorId();
  const results = []; // per (item, branch): {item_number, branch, ship_to, status, api_price, api_uom, in_catalog, http}
  const upserts = [];
  const stats = { branches: 0, requests: 0, http_ok: 0, http_400: 0, http_other: 0, priced: 0, no_price: 0, not_in_catalog_priced: 0, will_upsert: 0 };

  for (const [branch, items] of byBranch) {
    const shipTo = branchShipTo.get(branch);
    stats.branches++;
    if (!shipTo) {
      for (const it of items) results.push({ item_number: it, branch, ship_to: null, status: "no_shipto_account", api_price: null, api_uom: null, in_catalog: prodByItem.has(it) });
      log(`branch ${branch}: NO priceable Ship-To — ${items.length} items skipped`);
      continue;
    }
    const priced = new Map(); // item -> {price, uom, status}
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const body = {
        requestId: `ob-openfill-${CYCLE}-${branch}-${i}`,
        shipToNumber: shipTo,
        branchNumber: String(branch),
        purpose: "ordering",
        lines: batch.map((it, k) => ({ id: String(k + 1), itemNumber: it, quantity: 1 })),
      };
      const r = await abcPost("/api/pricing/v2/prices", body);
      stats.requests++;
      if (!r.ok) {
        if (r.status === 400) stats.http_400++; else stats.http_other++;
        for (const it of batch) priced.set(it, { price: null, uom: null, status: `http_${r.status}` });
        await sleep(150);
        continue;
      }
      stats.http_ok++;
      const respLines = Array.isArray(r.json?.lines) ? r.json.lines : [];
      const byItem = new Map();
      for (const l of respLines) { const it = lineItem(l); if (it) byItem.set(it, l); }
      for (const it of batch) {
        const l = byItem.get(it);
        if (!l) { priced.set(it, { price: null, uom: null, status: "not_returned" }); continue; }
        const st = lineStatus(l);
        const price = linePrice(l);
        if (st && st !== "OK") { priced.set(it, { price: null, uom: null, status: `line_${st}` }); continue; }
        if (price == null) { priced.set(it, { price: null, uom: null, status: "no_price" }); continue; }
        priced.set(it, { price, uom: lineUom(l), status: "OK" });
      }
      await sleep(150);
    }

    for (const it of items) {
      const pr = priced.get(it) || { price: null, uom: null, status: "unknown" };
      const prod = prodByItem.get(it);
      const inCatalog = !!prod;
      const row = { item_number: it, branch, ship_to: shipTo, status: pr.status, api_price: pr.price, api_uom: pr.uom, in_catalog: inCatalog };
      results.push(row);
      if (pr.status === "OK" && pr.price != null) {
        stats.priced++;
        if (inCatalog) {
          const uom = pr.uom;
          upserts.push({
            product_id: prod.id,
            vendor_id: vid,
            vendor_branch_id: null,
            observed_at: new Date().toISOString(),
            observed_price: pr.price,
            observed_uom: uom,
            price_in_base_uom: uom && prod.base_uom && uom === prod.base_uom ? pr.price : null,
            base_uom: prod.base_uom,
            source: "api",
            source_ref: `api:${branch}:${CYCLE}`,
            observer_type: "agent",
            observer_id: "open-invoice-gap-fill",
            confidence_score: 95,
            needs_review: !(uom && prod.base_uom && uom === prod.base_uom),
            review_reason: uom && prod.base_uom && uom !== prod.base_uom ? `uom_normalization_needed: api ${uom} vs base ${prod.base_uom}` : null,
            raw_extracted_text: `open-invoice gap fill; branch ${branch} shipTo ${shipTo}`,
          });
          stats.will_upsert++;
        } else {
          stats.not_in_catalog_priced++;
        }
      } else if (pr.status === "no_price" || pr.status === "not_returned" || pr.status?.startsWith("line_")) {
        stats.no_price++;
      }
    }
    log(`branch ${branch} (shipTo ${shipTo}): ${items.length} items -> priced ${[...priced.values()].filter((p) => p.status === "OK").length}`);
  }

  // 7. Upsert catalog observations.
  // resolve vendor_branch_id for the upserts
  if (upserts.length) {
    const vbs = await sbGet(`vendor_branches?select=id,branch_number`);
    const vbById = new Map(vbs.map((b) => [normBranch(b.branch_number), b.id]));
    // re-derive branch from source_ref for each row
    for (const row of upserts) {
      const br = row.source_ref.split(":")[1];
      row.vendor_branch_id = vbById.get(normBranch(br)) || null;
    }
    // upsert in chunks
    for (let i = 0; i < upserts.length; i += 200) await sbUpsert(upserts.slice(i, i + 200));
  }

  log(`DONE`, JSON.stringify(stats));
  const report = { generated_at: new Date().toISOString(), env: ABC_ENV, cycle: CYCLE, dry: DRY, stats, results };
  const path = resolve(OUT_DIR, `open-invoice-api-price-fill-${CYCLE}${DRY ? "-dry" : ""}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  log(`report -> ${path}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
