#!/usr/bin/env node
// Geocode vendor_branches that have no coordinates, then (optionally) re-run PE office
// territory containment for every branch.
//
//   node scripts/geocode-vendor-branches.mjs [--vendor=abc-supply] [--limit=N] [--dry-run]
//   node scripts/geocode-vendor-branches.mjs --assign-only
//
// Resumable: only touches rows where geom is null and geocode_status <> 'ok'. Rows that
// geocode to a low-precision result are marked so they can be reviewed rather than
// silently trusted — an APPROXIMATE city centroid should not decide a pricing territory.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
const GKEY = env.GOOGLE_MAPS_SERVER_KEY;
if (!SB || !KEY || !GKEY) { console.error("missing SUPABASE_* / GOOGLE_MAPS_SERVER_KEY"); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
async function allRows(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(path, { headers: { Range: `${from}-${from + 999}`, "Range-Unit": "items" } });
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

async function geocode(address) {
  const q = new URLSearchParams({ address, key: GKEY });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${q}`);
  const d = await res.json();
  if (d.status === "OVER_QUERY_LIMIT") throw new Error("OVER_QUERY_LIMIT");
  if (d.status !== "OK" || !d.results?.length) return null;
  const g = d.results[0];
  return { lat: g.geometry.location.lat, lng: g.geometry.location.lng, precision: g.geometry.location_type };
}

async function assignTerritories() {
  // Same containment rule the map uses: a branch inside exactly one office ring is
  // 'covered'; inside several it is 'overlap_pending' and waits for a human call.
  await rest("rpc/assign_branch_territories", { method: "POST", body: "{}" });
}

async function main() {
  if (!args["assign-only"]) {
    const vendorFilter = args.vendor ? `&vendor_id=eq.${(await rest(`vendors?select=id&slug=eq.${args.vendor}`))[0].id}` : "";
    const rows = await allRows(`vendor_branches?select=id,branch_number,branch_name,address,city,state,geocode_status&latitude=is.null${vendorFilter}`);
    const todo = args.limit ? rows.slice(0, Number(args.limit)) : rows;
    console.log(`branches needing coordinates: ${rows.length}${args.limit ? ` (processing ${todo.length})` : ""}`);

    let ok = 0, approx = 0, failed = 0, noaddr = 0;
    for (const [i, b] of todo.entries()) {
      const full = [b.address, b.city, b.state].filter(Boolean).join(", ");
      const cityOnly = [b.city, b.state].filter(Boolean).join(", ");
      const query = full || cityOnly;
      if (!query) {
        if (!args["dry-run"]) await rest(`vendor_branches?id=eq.${b.id}`, { method: "PATCH", body: JSON.stringify({ geocode_status: "no_address" }), headers: { Prefer: "return=minimal" } });
        noaddr++; continue;
      }
      let g = null;
      try { g = await geocode(query); }
      catch (e) { if (e.message === "OVER_QUERY_LIMIT") { console.error("  rate limited — stopping; rerun to resume"); break; } }
      // Fall back to city/state, but record the weaker precision honestly.
      if (!g && full && cityOnly) { try { g = await geocode(cityOnly); } catch {} }
      if (!args["dry-run"]) {
        await rest(`vendor_branches?id=eq.${b.id}`, {
          method: "PATCH",
          body: JSON.stringify(g
            ? { latitude: g.lat, longitude: g.lng, geocode_status: "ok", geocode_precision: g.precision, geocoded_at: new Date().toISOString() }
            : { geocode_status: "failed" }),
          headers: { Prefer: "return=minimal" },
        });
      }
      if (!g) failed++;
      else if (g.precision === "ROOFTOP" || g.precision === "RANGE_INTERPOLATED") ok++;
      else approx++;
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${todo.length} — precise ${ok}, approx ${approx}, failed ${failed}`);
      await new Promise((r) => setTimeout(r, 60));
    }
    console.log(`geocode done: precise ${ok}, approximate ${approx}, failed ${failed}, no address ${noaddr}`);
  }

  if (!args["dry-run"]) {
    await assignTerritories();
    console.log("territory containment re-run");
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
