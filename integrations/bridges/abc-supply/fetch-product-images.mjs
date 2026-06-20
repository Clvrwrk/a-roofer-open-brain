#!/usr/bin/env node
// fetch-product-images.mjs — fetch ABC product images and store them in the public product-images
// bucket for the price-list image chip (Chris). Source = abc_product_catalog.images[0].href
// (the ABC image endpoint). Default scope = the GPA item set; --all = every purchased product.
// Idempotent (skips items that already have image_storage_path unless --force).

import { readFileSync } from "node:fs";
const ENV = "/Users/chussey/Documents/a-roofers-open-brain/.env";
const env = {};
for (const l of readFileSync(ENV, "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const args = new Set(process.argv.slice(2));
const ALL = args.has("--all"), FORCE = args.has("--force");

const SB = (env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL).replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const AUTH = env.ABC_SUPPLY_AUTH_BASE_URL || "https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357";
const CLIENT_ID = env.ABC_SUPPLY_CLIENT_ID, CLIENT_SECRET = env.ABC_SUPPLY_CLIENT_SECRET;

async function abcToken() {
  const r = await fetch(`${AUTH}/v1/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "product.read" }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token failed " + r.status);
  return j.access_token;
}

// items in scope with an image href and no stored image yet.
const setExpr = ALL
  ? `item_number=in.(${(await (await fetch(`${SB}/rest/v1/v_price_seed_item?select=item_number`, { headers: H })).json()).map((r) => `"${r.item_number}"`).join(",")})`
  : `item_number=in.(${[...new Set((await (await fetch(`${SB}/rest/v1/frequently_ordered_import?select=item_number`, { headers: H })).json()).map((r) => r.item_number))].map((s) => `"${s}"`).join(",")})`;
let sel = `${SB}/rest/v1/abc_product_catalog?select=item_number,images,image_storage_path&images=not.is.null&${setExpr}`;
const items = await (await fetch(sel, { headers: H })).json();
const todo = items.filter((i) => Array.isArray(i.images) && i.images[0]?.href && (FORCE || !i.image_storage_path));
console.log(`scope=${ALL ? "all" : "gpa"} · ${items.length} items, ${todo.length} to fetch`);

const token = await abcToken();
let ok = 0, miss = 0;
for (const it of todo) {
  const href = it.images[0].href;
  try {
    const img = await fetch(href, { headers: { Authorization: `Bearer ${token}`, Accept: "image/png,*/*" } });
    if (!img.ok) { miss++; continue; }
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 100) { miss++; continue; }
    const ct = img.headers.get("content-type") || "image/png";
    const ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
    const path = `${encodeURIComponent(it.item_number)}.${ext}`;
    const up = await fetch(`${SB}/storage/v1/object/product-images/${path}`, {
      method: "POST", headers: { ...H, "Content-Type": ct, "x-upsert": "true" }, body: buf,
    });
    if (!up.ok) { miss++; continue; }
    await fetch(`${SB}/rest/v1/abc_product_catalog?item_number=eq.${encodeURIComponent(it.item_number)}`, {
      method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ image_storage_path: path }),
    });
    ok++;
    if (ok % 20 === 0) console.log(`  ${ok}/${todo.length}`);
    await new Promise((r) => setTimeout(r, 80));
  } catch { miss++; }
}
console.log(`done — stored ${ok}, missed ${miss}`);
