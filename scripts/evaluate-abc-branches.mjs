#!/usr/bin/env node
// evaluate-abc-branches.mjs — docs/33 Phase 3 (§4.4 Branch Selection)
//
// Ranks ABC branches for a property address. Pure computation: branch data
// comes in as JSON (exported from abc_vendor_branches / abc_ship_to_branch_access);
// output is an evaluations JSON for loading into estimate_branch_evaluations.
//
// Geocoding providers, in order:
//   1. Google Geocoding API — only if GOOGLE_MAPS_SERVER_KEY is set
//      (must be an IP-restricted or unrestricted key; referrer-restricted
//      browser keys are rejected by Google for server-side APIs).
//   2. US Census Bureau geocoder (free, no key) — fallback.
// Drive time uses the Google Routes API only when the server key exists;
// otherwise drive_time is null and ranking is straight-line (haversine).
//
// Usage:
//   node scripts/evaluate-abc-branches.mjs --address "1424 N 24th St, Kansas City, KS" \
//     --branches /tmp/branch_data.json [--top 5] [--ship-to 2036874-12]

const args = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const address = opt('address');
const branchesFile = opt('branches');
const top = parseInt(opt('top', '5'), 10);
const shipTo = opt('ship-to');
if (!address || !branchesFile) {
  console.error('Usage: evaluate-abc-branches.mjs --address "<addr>" --branches <file.json> [--top N] [--ship-to N]');
  process.exit(1);
}

const { readFileSync } = await import('node:fs');
const data = JSON.parse(readFileSync(branchesFile, 'utf8'));
const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY || null;

async function geocode(addr) {
  if (serverKey) {
    const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${serverKey}`;
    const r = await (await fetch(u)).json();
    if (r.status === 'OK' && r.results.length) {
      const g = r.results[0];
      return { lat: g.geometry.location.lat, lng: g.geometry.location.lng, provider: 'google_geocoding', matched: g.formatted_address };
    }
    console.error(`google geocode: ${r.status} ${r.error_message || ''} — falling back to census`);
  }
  const u = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(addr)}&benchmark=Public_AR_Current&format=json`;
  const r = await (await fetch(u)).json();
  const m = r?.result?.addressMatches?.[0];
  if (!m) throw new Error(`No geocode match for: ${addr}`);
  return { lat: m.coordinates.y, lng: m.coordinates.x, provider: 'census_bureau', matched: m.matchedAddress };
}

function haversineMiles(a, b) {
  const R = 3958.761; // miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

async function driveTimes(origin, dests) {
  if (!serverKey) return dests.map(() => null);
  // Routes API computeRouteMatrix
  const body = {
    origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
    destinations: dests.map((d) => ({ waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } } })),
    travelMode: 'DRIVE',
  };
  const r = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': serverKey,
      'X-Goog-FieldMask': 'destinationIndex,duration,distanceMeters,condition',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) { console.error(`routes api: HTTP ${r.status} — drive times unavailable`); return dests.map(() => null); }
  const rows = await r.json();
  const out = dests.map(() => null);
  for (const row of rows) {
    if (row.condition === 'ROUTE_EXISTS' && row.duration) {
      out[row.destinationIndex] = { minutes: Math.round(parseFloat(row.duration) / 60 * 10) / 10, meters: row.distanceMeters };
    }
  }
  return out;
}

const origin = await geocode(address);
const accessible = shipTo
  ? new Set((data.ship_to_access || []).filter((a) => a.ship_to === shipTo).map((a) => a.branch_number))
  : null;

const ranked = data.branches
  .filter((b) => b.lat && b.lng)
  .map((b) => ({
    ...b,
    distance_miles: +haversineMiles(origin, { lat: b.lat, lng: b.lng }).toFixed(2),
    eligible: accessible ? accessible.has(b.branch_number) : true,
  }))
  .sort((a, b) => a.distance_miles - b.distance_miles);

const candidates = ranked.filter((b) => b.eligible).slice(0, top);
const times = await driveTimes(origin, candidates);
candidates.forEach((c, i) => { c.drive_time_minutes = times[i]?.minutes ?? null; });
// selected = nearest by drive time when available, else by distance
const selected = [...candidates].sort((a, b) =>
  (a.drive_time_minutes ?? a.distance_miles * 2) - (b.drive_time_minutes ?? b.distance_miles * 2))[0];

console.log(JSON.stringify({
  address,
  geocode: origin,
  evaluation_source: serverKey ? 'google_geocoding+routes' : `${origin.provider}+haversine`,
  ship_to: shipTo || null,
  evaluations: candidates.map((c) => ({
    branch_number: c.branch_number,
    branch_name: c.branch_name,
    city: c.city, state: c.state,
    distance_miles: c.distance_miles,
    drive_time_minutes: c.drive_time_minutes,
    eligible: c.eligible,
    selected: c.branch_number === selected.branch_number,
  })),
}, null, 2));
