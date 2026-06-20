#!/usr/bin/env node
// price-seed.mjs — ABC current-price seed for the Global Price Agreement item set.
//
// Pulls the live ABC API price for every GPA item at every ABC branch and records it as the
// canonical "API price point" in product_vendor_price_observations (vendor=ABC, source='api').
// This is the seed for estimate-time pricing ("at a minimum, active API pricing for every
// branch"), and the same script re-runs monthly on the 15th (cron) to refresh the point.
//
// ABC pricing is NOT a bulk export: POST /api/pricing/v2/prices is per (Ship-To, branch, items).
// We price each branch against a Pro Exteriors Ship-To that can access it (fallback = primary),
// in 50-item batches. ~696 branches x 99 items / 50 ≈ ~1,400 requests.
//
// Idempotent + resumable: source_ref = `api:{branch}:{cycle}` (cycle defaults to YYYY-MM), so a
// re-run within the same cycle updates in place; a checkpoint file lets an interrupted sweep
// resume. Read-only against ABC; only writes price observations to Supabase.
//
// Usage:
//   node price-seed.mjs --dry --branches=2        # validate shape, no DB writes
//   node price-seed.mjs --branches=2              # write 2 branches (smoke)
//   node price-seed.mjs                           # full sweep (all branches)
//   node price-seed.mjs --cycle=2026-06           # explicit pricing cycle key

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
const SCOPE = args.scope === "purchased" ? "purchased" : "gpa"; // gpa = 99 freq items; purchased = ~606 products we buy
const BRANCH_LIMIT = args.branches ? Number(args.branches) : Infinity;
const ITEM_LIMIT = args.items ? Number(args.items) : Infinity;
const SHIP_TO_OVERRIDE = args["ship-to"] ? String(args["ship-to"]) : null;
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
const CLIENT_ID = env.ABC_SUPPLY_CLIENT_ID;
const CLIENT_SECRET = env.ABC_SUPPLY_CLIENT_SECRET;
const SB_URL = (env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!CLIENT_ID || !CLIENT_SECRET) { console.error("Missing ABC_SUPPLY_CLIENT_ID/SECRET"); process.exit(1); }
if (!SB_URL || !SB_KEY) { console.error("Missing Supabase URL/service-role key"); process.exit(1); }

const RUN_DIR = resolve(new URL(".", import.meta.url).pathname, ".price-seed-runs");
mkdirSync(RUN_DIR, { recursive: true });
const CKPT = resolve(RUN_DIR, `checkpoint-${SCOPE}-${CYCLE}.json`);
const ckpt = existsSync(CKPT) ? JSON.parse(readFileSync(CKPT, "utf8")) : { done: [], stats: {} };
const doneBranches = new Set(ckpt.done);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  log("ABC token refreshed");
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

// ---- Supabase PostgREST ----
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

// ---- helpers ----
const num = (...vals) => { for (const v of vals) { const n = Number(v); if (Number.isFinite(n)) return n; } return null; };
const lineUom = (l) => l?.priceQty?.uom || l?.uom || l?.unitOfMeasure || l?.priceUom || null;
const linePrice = (l) => num(l?.pricePerUnitAmount, l?.unitPrice?.value, l?.unitPrice, l?.price, l?.sellPrice, l?.netPrice);
const lineStatus = (l) => String(l?.status?.code || l?.statusCode || l?.status || "").toUpperCase();
const lineItem = (l) => l?.itemNumber || l?.item?.number || l?.id || null;

async function main() {
  log(`ABC price seed — env=${ABC_ENV} cycle=${CYCLE} dry=${DRY} (resume: ${doneBranches.size} branches done)`);

  // 1. Item set. scope=purchased -> v_price_seed_item (canonical products we buy, ~606);
  //    scope=gpa -> the 99 frequently-ordered SKUs.
  let prodRows = [];
  if (SCOPE === "purchased") {
    prodRows = await sbGet(`v_price_seed_item?select=product_id,item_number,base_uom`);
    prodRows = prodRows.map((r) => ({ id: r.product_id, manufacturer_sku: r.item_number, base_uom: r.base_uom }));
  } else {
    const freq = await sbGet(`frequently_ordered_import?select=item_number`);
    const freqSet = [...new Set(freq.map((r) => r.item_number).filter(Boolean))];
    for (let i = 0; i < freqSet.length; i += 100) {
      const chunk = freqSet.slice(i, i + 100).map((s) => `"${s}"`).join(",");
      prodRows.push(...await sbGet(`products?select=id,manufacturer_sku,base_uom&manufacturer_sku=in.(${chunk})`));
    }
  }
  const items = prodRows.filter((p) => p.manufacturer_sku).slice(0, ITEM_LIMIT);
  const prodByItem = new Map(items.map((p) => [p.manufacturer_sku, p]));
  log(`scope=${SCOPE} items: ${items.length}`);

  // 2. Canonical vendor_branches id map (for the observation's vendor_branch_id).
  const vBranches = await sbGet(`vendor_branches?select=id,branch_number`);
  const vbById = new Map(vBranches.map((b) => [String(b.branch_number).replace(/^0+/, ""), b.id]));

  // 3. Priceable set: ABC only prices a (Ship-To, branch) pair when the branch is in that
  //    Ship-To's access list (out-of-list -> 401). So the seed iterates the branches our
  //    Pro Exteriors Ship-To accounts can actually price (one valid Ship-To per branch), NOT
  //    all ~696 national ABC branches (those we have no account at cannot be priced via the API).
  const regions = await sbGet(`abc_regions?select=ship_to_number,branch_numbers&account_type=eq.Ship-To`);
  const branchShipTo = new Map();
  for (const r of regions) {
    if (!r.ship_to_number) continue;
    const isPE = r.ship_to_number.startsWith("2036874");
    for (const bn of (Array.isArray(r.branch_numbers) ? r.branch_numbers : [])) {
      const key = String(bn);
      if (!branchShipTo.has(key) || (isPE && !String(branchShipTo.get(key)).startsWith("2036874"))) branchShipTo.set(key, r.ship_to_number);
    }
  }
  if (SHIP_TO_OVERRIDE) for (const k of branchShipTo.keys()) branchShipTo.set(k, SHIP_TO_OVERRIDE);
  const branches = [...branchShipTo.keys()].slice(0, BRANCH_LIMIT);
  log(`priceable branches: ${branches.length} (across ${new Set([...branchShipTo.values()]).size} Ship-To accounts)`);

  const stats = { branches: 0, priced: 0, ok_lines: 0, miss_lines: 0, http400: 0, http_other: 0, rows: 0, ...ckpt.stats };
  let bi = 0;
  for (const branch of branches) {
    bi++;
    if (doneBranches.has(branch)) continue;
    const shipTo = branchShipTo.get(branch);
    const rows = [];
    let branchHadError = false;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const body = {
        requestId: `ob-price-seed-${CYCLE}-${branch}-${i}`,
        shipToNumber: shipTo,
        branchNumber: String(branch),
        purpose: "ordering",
        lines: batch.map((p, k) => ({ id: String(k + 1), itemNumber: p.manufacturer_sku, quantity: 1 })),
      };
      const r = await abcPost("/api/pricing/v2/prices", body);
      if (!r.ok) {
        if (r.status === 400) stats.http400++; else stats.http_other++;
        branchHadError = true;
        continue;
      }
      const respLines = Array.isArray(r.json?.lines) ? r.json.lines : [];
      for (const l of respLines) {
        const itemNumber = lineItem(l);
        const prod = prodByItem.get(itemNumber);
        if (!prod) continue;
        if (lineStatus(l) && lineStatus(l) !== "OK") { stats.miss_lines++; continue; }
        const price = linePrice(l);
        if (price == null) { stats.miss_lines++; continue; }
        const uom = lineUom(l);
        stats.ok_lines++;
        rows.push({
          product_id: prod.id,
          vendor_id: null, // filled below from ABC vendor id
          vendor_branch_id: vbById.get(String(branch).replace(/^0+/, "")) || null,
          observed_at: new Date().toISOString(),
          observed_price: price,
          observed_uom: uom,
          price_in_base_uom: uom && prod.base_uom && uom === prod.base_uom ? price : null,
          base_uom: prod.base_uom,
          source: "api",
          source_ref: `api:${branch}:${CYCLE}`,
          observer_type: "agent",
          observer_id: "abc-price-seed",
          confidence_score: 95,
          needs_review: !(uom && prod.base_uom && uom === prod.base_uom),
          review_reason: uom && prod.base_uom && uom !== prod.base_uom ? `uom_normalization_needed: api ${uom} vs base ${prod.base_uom}` : null,
          raw_extracted_text: `branch ${branch} shipTo ${shipTo}`,
        });
      }
      await sleep(120); // gentle pacing
    }
    // resolve ABC vendor id once
    if (rows.length && !rows[0].vendor_id) {
      const vid = await abcVendorId();
      rows.forEach((row) => (row.vendor_id = vid));
    }
    await sbUpsert(rows);
    stats.branches++; stats.priced += rows.length; stats.rows += rows.length;
    doneBranches.add(branch);
    ckpt.done = [...doneBranches]; ckpt.stats = stats;
    if (!DRY) writeFileSync(CKPT, JSON.stringify(ckpt));
    if (bi % 10 === 0 || rows.length) log(`[${bi}/${branches.length}] branch ${branch} (shipTo ${shipTo}) -> ${rows.length} prices${branchHadError ? " (some 400s)" : ""}`);
  }
  log(`DONE cycle=${CYCLE}`, JSON.stringify(stats));
}

let _vid = null;
async function abcVendorId() {
  if (_vid) return _vid;
  const v = await sbGet(`vendors?select=id&slug=eq.abc-supply`);
  _vid = v?.[0]?.id || null;
  return _vid;
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
