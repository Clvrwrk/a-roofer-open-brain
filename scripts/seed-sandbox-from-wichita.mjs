#!/usr/bin/env node
// Seed the AccuLynx SANDBOX account with anonymized copies of Wichita jobs/contacts.
// Names + phones + emails + companyName are anonymized; addresses are kept (Chris, 2026-06-30).
//
// SANDBOX-ONLY: refuses to run against any key other than PE_CC_SANDBOX_ACCULYNX_API_KEY.
// Source records come from the brain (acculynx_jobs, location_city='wichita').
//
// Usage: LIMIT=1 node scripts/seed-sandbox-from-wichita.mjs   # test one first
//        LIMIT=50 node scripts/seed-sandbox-from-wichita.mjs  # batch
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

// --- HARD SANDBOX GATE ---
const SANDBOX_NAME = "PE_CC_SANDBOX_ACCULYNX_API_KEY";
const KEY = env[SANDBOX_NAME];
if (!KEY) { console.error(`Refusing to run: ${SANDBOX_NAME} not in .env`); process.exit(1); }
const SB_URL = env.SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const B = "https://api.acculynx.com/api/v2";
const LIMIT = Number(env.LIMIT ?? process.env.LIMIT ?? 1);
const PACE = 140;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const aHdr = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "application/json" };
const sbHdr = { apikey: SRK, Authorization: `Bearer ${SRK}` };

const FIRST = ["Jordan", "Casey", "Riley", "Avery", "Morgan", "Quinn", "Skyler", "Reese", "Parker", "Hayden"];
const LAST = ["Sandbox", "Testfield", "Mockton", "Sampleby", "Fakewell", "Proxyman", "Demoore", "Stubbins"];
const anonFirst = (i) => FIRST[i % FIRST.length];
const anonLast = (i) => `${LAST[i % LAST.length]}${i}`;
const anonPhone = (i) => `316-555-${String(1000 + (i % 9000)).slice(0, 4)}`;
const anonEmail = (i) => `sandbox+wic${i}@example.com`;

const US = { id: 1, name: "United States", abbreviation: "US" };
let STATE_BY_ABBR = {}; // populated in main() from /acculynx/countries/1/states
const stripLink = (o) => o && { id: o.id, name: o.name, abbreviation: o.abbreviation };
const resolveState = (s) => {
  if (s && typeof s === "object") return stripLink(s);
  if (typeof s === "string") return STATE_BY_ABBR[s.toUpperCase()] ?? STATE_BY_ABBR[s] ?? null;
  return null;
};
const addr = (a) => a && {
  street1: a.street1 ?? "1 Test St",
  street2: a.street2 ?? null,
  city: a.city ?? "Wichita",
  state: resolveState(a.state) ?? STATE_BY_ABBR.KS ?? null,
  zipCode: a.zipCode ?? null,
  country: (a.country && typeof a.country === "object" ? stripLink(a.country) : US),
};

async function call(method, path, body) {
  const res = await fetch(`${B}${path}`, { method, headers: aHdr, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const ref = async (path) => (await (await fetch(`${B}${path}`, { headers: aHdr })).json()).items ?? [];

const main = async () => {
  // sandbox reference data → map by name
  const [types, cats, trades, sources] = await Promise.all([
    ref("/contacts/contact-types"),
    ref("/company-settings/job-file-settings/job-categories"),
    ref("/company-settings/job-file-settings/trade-types"),
    ref("/company-settings/leads/lead-sources"),
  ]);
  STATE_BY_ABBR = Object.fromEntries((await ref("/acculynx/countries/1/states")).map((s) => [s.abbreviation, stripLink(s)]));
  const defaultType = types.find((t) => t.isDefault)?.id ?? types[0]?.id;
  const catByName = Object.fromEntries(cats.map((c) => [c.name?.toLowerCase(), c.id]));
  const tradeByName = Object.fromEntries(trades.map((t) => [t.name?.toLowerCase(), t.id]));
  const firstTrade = trades[0]?.id, firstSource = sources[0]?.id, firstCat = cats[0]?.id;

  // source Wichita jobs from the brain
  const rows = await (await fetch(
    `${SB_URL}/rest/v1/acculynx_jobs?location_city=ilike.wichita&select=id,raw&limit=${LIMIT}`,
    { headers: sbHdr },
  )).json();

  console.log(`Seeding ${rows.length} record(s) into sandbox. defaultContactType=${defaultType?.slice(0, 8)} cats=${cats.length} trades=${trades.length} sources=${sources.length}`);
  const results = [];
  let i = 0;
  for (const row of rows) {
    i++;
    const r = row.raw ?? {};
    const srcContact = r.contacts?.[0]?.contact ?? {};
    const contactBody = {
      contactTypeIds: [defaultType],
      firstName: anonFirst(i),
      lastName: anonLast(i),
      phoneNumbers: [{ number: anonPhone(i), type: "Mobile", primary: true }],
      emailAddresses: [{ address: anonEmail(i), type: "Personal", primary: true }],
      mailingAddress: addr(r.locationAddress),
    };
    const c = await call("POST", "/contacts", contactBody);
    if (c.status >= 300) { results.push({ i, step: "contact", status: c.status, err: c.json }); console.log(`  [${i}] contact FAIL ${c.status}:`, JSON.stringify(c.json).slice(0, 300)); if (LIMIT <= 2) break; await sleep(PACE); continue; }
    const contactId = c.json?.id ?? c.json;
    await sleep(PACE);

    const cat = catByName[r.jobCategory?.name?.toLowerCase()] ?? firstCat;
    const trade = (r.tradeTypes ?? []).map((t) => tradeByName[t?.name?.toLowerCase()]).filter(Boolean);
    // QUIRK: job locationAddress wants state/country as STRINGS (abbreviation),
    // unlike contact mailingAddress which wants State/Country OBJECTS.
    const la = r.locationAddress ?? {};
    const jobAddr = {
      street1: la.street1 ?? "1 Test St",
      street2: la.street2 ?? null,
      city: la.city ?? "Wichita",
      state: (resolveState(la.state) ?? STATE_BY_ABBR.KS ?? {}).abbreviation ?? "KS",
      zipCode: la.zipCode ?? null,
      country: "US",
    };
    const jobBody = {
      contact: { id: contactId },
      locationAddress: jobAddr,
      jobCategory: cat ? { id: cat } : undefined,
      tradeTypes: (trade.length ? trade : [firstTrade]).filter(Boolean).map((id) => ({ id })),
      leadSource: firstSource ? { id: firstSource } : undefined,
      priority: "Normal",
    };
    const j = await call("POST", "/jobs", jobBody);
    results.push({ i, contactId: String(contactId).slice(0, 8), jobStatus: j.status, jobId: j.json?.id ?? null, err: j.status >= 300 ? j.json : undefined });
    console.log(`  [${i}] contact ${c.status} -> job ${j.status}${j.status >= 300 ? " ERR " + JSON.stringify(j.json).slice(0, 300) : " jobId=" + (j.json?.id ?? "?")}`);
    if (j.status >= 300 && LIMIT <= 2) break;
    await sleep(PACE);
  }
  const ok = results.filter((x) => x.jobStatus && x.jobStatus < 300).length;
  console.log(`\nDONE: ${ok}/${rows.length} jobs created in sandbox.`);
};
main().catch((e) => { console.error(e); process.exit(1); });
