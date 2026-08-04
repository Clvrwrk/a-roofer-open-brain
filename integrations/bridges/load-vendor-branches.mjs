#!/usr/bin/env node
// Load QXO + SRS branch registries (extracted 2026-08-04 from vendor sites) into
// canonical vendor_branches. Idempotent: skips rows that already exist for the
// vendor (QXO keyed on branch_number, SRS keyed on branch_name). Additive only.
//
// Usage: node integrations/bridges/load-vendor-branches.mjs [--dry-run]
//
// After loading, assign territories + geom with the SQL in
// docs/80-qxo-srs-file-formats-and-ingestion-spec.md §7 (boundary containment).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dryRun = process.argv.includes("--dry-run");

function parseDotenv(path) {
  try {
    const out = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...parseDotenv(resolve(ROOT, ".env")), ...process.env };
const SUPABASE_URL = (env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...HEADERS, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// PostgREST caps responses; page to get every existing row (playbook: silent truncation).
async function allRows(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(path, { headers: { Range: `${from}-${from + 999}`, "Range-Unit": "items", Prefer: "count=exact" } });
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

function srsSalesRep(team) {
  const ae = (team || []).find((t) => /account executive/i.test(t.role) && t.email);
  return ae ? { name: ae.name, email: ae.email } : { name: null, email: null };
}

async function main() {
  const vendors = await rest("vendors?select=id,slug&slug=in.(qxo,srs)");
  const vendorId = Object.fromEntries(vendors.map((v) => [v.slug, v.id]));
  if (!vendorId.qxo || !vendorId.srs) throw new Error("qxo/srs rows missing from vendors table");

  const qxo = JSON.parse(readFileSync(resolve(ROOT, "integrations/bridges/qxo/data/branches-2026-08-04.json"), "utf8"));
  const srs = JSON.parse(readFileSync(resolve(ROOT, "integrations/bridges/srs-roofhub/data/branches-2026-08-04.json"), "utf8"));

  const existing = await allRows(`vendor_branches?select=vendor_id,branch_number,branch_name&vendor_id=in.(${vendorId.qxo},${vendorId.srs})`);
  const haveQxo = new Set(existing.filter((r) => r.vendor_id === vendorId.qxo).map((r) => r.branch_number));
  const haveSrs = new Set(existing.filter((r) => r.vendor_id === vendorId.srs).map((r) => r.branch_name));

  const rows = [];
  for (const b of qxo) {
    if (haveQxo.has(String(b.branch_key))) continue;
    rows.push({
      vendor_id: vendorId.qxo,
      branch_number: String(b.branch_key),
      branch_name: b.name || `QXO ${b.city}`,
      address: b.address || null,
      city: b.city || null,
      state: b.state || null,
      phone: b.phone || null,
      latitude: b.latitude ?? null,
      longitude: b.longitude ?? null,
      geocode_status: b.latitude != null ? "ok" : "missing",
      pricing_status: "out_of_boundary",
      is_active: true,
      notes: [b.hours_mon_fri ? `Hours M-F: ${b.hours_mon_fri}` : null, b.products?.length ? `Products: ${b.products.join(", ")}` : null, `Source: store-location API ${b.extracted_at}`]
        .filter(Boolean)
        .join(" | "),
    });
  }
  // vendor_branches.branch_number is NOT NULL; SRS has no numeric branch ids on the
  // public site, so derive a stable code from the detail-page slug (brand acronym +
  // location tail), de-duped with a numeric suffix. The AMDEN/DJWIC codes SRS prints
  // on invoices get crosswalked to these rows later via city/state.
  const usedSrsCodes = new Set();
  function srsCode(b) {
    const tail = b.detail_url.replace(/\/$/, "").split("/").pop() || "";
    const [brand, loc] = tail.includes("---") ? tail.split("---") : ["srs", tail];
    const acr = brand.split("-").map((w) => w[0] || "").join("").toUpperCase();
    let code = `${acr}-${(loc || b.city || "X").replace(/[^a-z0-9]+/gi, "").toUpperCase()}`.slice(0, 28);
    let n = 2;
    while (usedSrsCodes.has(code)) code = `${code}-${n++}`;
    usedSrsCodes.add(code);
    return code;
  }
  for (const b of srs) {
    if (haveSrs.has(b.name)) continue;
    const rep = srsSalesRep(b.team);
    rows.push({
      vendor_id: vendorId.srs,
      branch_number: srsCode(b),
      branch_name: b.name,
      address: b.address || null,
      city: b.city || null,
      state: b.state || null,
      phone: b.phone || null,
      manager_name: b.branch_manager || null,
      manager_email: b.manager_email || null,
      sales_rep_name: rep.name,
      sales_rep_email: rep.email,
      latitude: b.latitude ?? null,
      longitude: b.longitude ?? null,
      geocode_status: b.latitude != null ? "ok" : "missing",
      pricing_status: "out_of_boundary",
      is_active: true,
      notes: [b.hours ? `Hours: ${b.hours}` : null, b.brand ? `Brand: ${b.brand}` : null, b.products?.length ? `Products: ${b.products.slice(0, 15).join(", ")}` : null, `Source: srsdistribution.com ${b.extracted_at}`]
        .filter(Boolean)
        .join(" | "),
    });
  }

  // PostgREST bulk insert requires identical keys on every row (playbook 3) —
  // normalize all rows to the union of columns with explicit nulls.
  const COLS = ["vendor_id","branch_number","branch_name","address","city","state","phone","manager_name","manager_email","sales_rep_name","sales_rep_email","latitude","longitude","geocode_status","pricing_status","is_active","notes"];
  const uniform = rows.map((r) => Object.fromEntries(COLS.map((c) => [c, r[c] ?? null])));
  rows.length = 0;
  rows.push(...uniform);

  console.log(`existing qxo=${haveQxo.size} srs=${haveSrs.size}; inserting ${rows.length} new rows${dryRun ? " (dry-run)" : ""}`);
  if (dryRun || rows.length === 0) return;

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await rest("vendor_branches", { method: "POST", body: JSON.stringify(chunk), headers: { Prefer: "return=minimal" } });
    console.log(`  inserted ${Math.min(i + 200, rows.length)}/${rows.length}`);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
