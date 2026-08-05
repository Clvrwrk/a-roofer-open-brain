#!/usr/bin/env node
// Compute a drive-time isochrone for a PE office and store it on public.office.
// Reproduces the `google_distance_matrix_bearing_v1` method the original five offices
// used: cast N bearings from the office, binary-search along each for the point whose
// DRIVING duration equals the target (default 120 min), and close the ring.
//
// Usage:
//   node scripts/compute-office-drive-time-boundary.mjs --office-id=<uuid> [--minutes=120] [--bearings=24] [--dry-run]
//
// Idempotent: recomputes and overwrites boundary/boundary_method/boundary_computed_at.

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
const GKEY = env.GOOGLE_MAPS_SERVER_KEY || env.GOOGLE_MAPS_API_KEY;
if (!SB || !KEY) { console.error("missing supabase creds"); process.exit(1); }
if (!GKEY) { console.error("missing GOOGLE_MAPS_SERVER_KEY"); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const R_EARTH_KM = 6371;
function destination(lat, lng, bearingDeg, distKm) {
  const br = (bearingDeg * Math.PI) / 180, d = distKm / R_EARTH_KM;
  const la1 = (lat * Math.PI) / 180, lo1 = (lng * Math.PI) / 180;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [(la2 * 180) / Math.PI, (((lo2 * 180) / Math.PI + 540) % 360) - 180];
}

// Distance Matrix in one call per batch of destinations (max 25 per request).
async function driveMinutes(origin, dests) {
  const out = [];
  for (let i = 0; i < dests.length; i += 25) {
    const chunk = dests.slice(i, i + 25);
    const q = new URLSearchParams({
      origins: `${origin[0]},${origin[1]}`,
      destinations: chunk.map(([a, b]) => `${a},${b}`).join("|"),
      mode: "driving", units: "imperial", key: GKEY,
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${q}`);
    const d = await res.json();
    if (d.status !== "OK") throw new Error(`distancematrix: ${d.status} ${d.error_message || ""}`);
    for (const el of d.rows[0].elements) {
      out.push(el.status === "OK" ? el.duration.value / 60 : null);
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

async function main() {
  const officeId = args["office-id"];
  const targetMin = Number(args.minutes || 120);
  const nBearings = Number(args.bearings || 24);
  if (!officeId) { console.error("--office-id=<uuid> required"); process.exit(1); }

  const [office] = await rest(`office?select=id,name,latitude,longitude,drive_time_minutes&id=eq.${officeId}`);
  if (!office) throw new Error(`office ${officeId} not found`);
  const origin = [Number(office.latitude), Number(office.longitude)];
  console.log(`${office.name} @ ${origin} — target ${targetMin} min, ${nBearings} bearings`);

  // Binary search each bearing for the distance whose drive time hits the target.
  let lo = new Array(nBearings).fill(5);    // km
  let hi = new Array(nBearings).fill(260);  // generous upper bound for 2h driving
  for (let iter = 0; iter < 6; iter++) {
    const mid = lo.map((l, i) => (l + hi[i]) / 2);
    const pts = mid.map((km, i) => destination(origin[0], origin[1], (360 / nBearings) * i, km));
    const mins = await driveMinutes(origin, pts);
    for (let i = 0; i < nBearings; i++) {
      const m = mins[i];
      // Unreachable (water/no road) behaves like "too far" so the ring pulls in.
      if (m === null || m > targetMin) hi[i] = mid[i]; else lo[i] = mid[i];
    }
    console.log(`  iter ${iter + 1}: mean radius ${(lo.reduce((a, b) => a + b, 0) / nBearings).toFixed(1)} km`);
  }

  const ring = lo.map((km, i) => {
    const [la, ln] = destination(origin[0], origin[1], (360 / nBearings) * i, km);
    return [Number(ln.toFixed(6)), Number(la.toFixed(6))]; // GeoJSON is [lng, lat]
  });
  ring.push(ring[0]); // close the polygon
  const geo = { type: "Polygon", coordinates: [ring] };
  console.log(`  ring points: ${ring.length}`);
  if (args["dry-run"]) { console.log(JSON.stringify(geo).slice(0, 300) + "…"); return; }

  await rest(`rpc/set_office_boundary`, {
    method: "POST",
    body: JSON.stringify({ p_office_id: officeId, p_geojson: JSON.stringify(geo), p_method: "google_distance_matrix_bearing_v1", p_minutes: targetMin }),
  });
  console.log("  boundary stored");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
