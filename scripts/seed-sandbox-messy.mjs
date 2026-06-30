#!/usr/bin/env node
// Seed the SANDBOX with MESSY, human-like leads to exercise error handling and the
// "human aspect" of AccuLynx data: misspellings, inconsistent formatting, varied
// lead sources / trades / categories / work-types / priority, notes with mock lead
// values, and job messages (chats). Names/phones/emails anonymized; addresses kept.
//
// SANDBOX-ONLY hard gate. A few records are intentionally malformed to test error handling.
// Usage: LIMIT=50 OFFSET=51 node scripts/seed-sandbox-messy.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const SANDBOX_NAME = "PE_CC_SANDBOX_ACCULYNX_API_KEY";
const KEY = env[SANDBOX_NAME];
if (!KEY) { console.error(`Refusing to run: ${SANDBOX_NAME} not in .env`); process.exit(1); }
const SB_URL = env.SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const B = "https://api.acculynx.com/api/v2";
const LIMIT = Number(env.LIMIT ?? process.env.LIMIT ?? 50);
const OFFSET = Number(env.OFFSET ?? process.env.OFFSET ?? 51);
const PACE = 130;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const aHdr = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "application/json" };
const sbHdr = { apikey: SRK, Authorization: `Bearer ${SRK}` };
const pick = (arr, i) => arr[i % arr.length];

// --- messiness generators ---
const FIRST = ["jordan", "Casy", "RILEY", "Avery ", "morgann", "Quinn", "Skyler", "reese", "Parker", "Haydn"];
const LAST = ["Sandbox", "Testfeild", "Mock ton", "Sampleby", "fakewell", "Proxyman", "Demoore", "Stubbins"];
const PHONE_FMT = [
  (i) => `316-555-${1000 + i}`,
  (i) => `(316) 555-${1000 + i}`,
  (i) => `316.555.${1000 + i}`,
  (i) => `3165550${i % 1000}`,
  (i) => `+1 316 555 ${1000 + i} x${i % 50}`,
  (i) => ` 316 555 ${1000 + i} `,
];
const CITY = ["Wichita", "wichita", "WICHITA", "Wichta"];
const NOTE = [
  (v) => `Quoted ~$${v} full tearoff, cust wants metal??`,
  (v) => `approx ${v} insurnace claim pending, adjuster TBD`,
  (v) => `LEAD VALUE ~$${v}. left 2 vms no anser`,
  (v) => `~$${v} retail, wants to cloze by EOM!!`,
  (v) => `est ${v}; need re-meausre back slope`,
];
const MSG = [
  "called cust no anser, try eve",
  "adjuster mtg thurs @ 2pm??",
  "cx wants metal NOT shingle - confirm $$",
  "left vm. f/u fri",
  "re-measure needed, back slope steeper than roofr",
  "insurnace approved partial, supplementing",
  "cust ghosted us 3 wks :(",
];
const val = (i) => [(8 + i % 25) * 1000 + (i * 37) % 1000].map((n) => n.toLocaleString())[0];

const US = { id: 1, name: "United States", abbreviation: "US" };
let STATE_BY_ABBR = {};
const stripLink = (o) => o && { id: o.id, name: o.name, abbreviation: o.abbreviation };
const ref = async (p) => (await (await fetch(`${B}${p}`, { headers: aHdr })).json()).items ?? [];
async function call(method, path, body) {
  const res = await fetch(`${B}${path}`, { method, headers: aHdr, body: body ? JSON.stringify(body) : undefined });
  let json; const t = await res.text(); try { json = JSON.parse(t); } catch { json = t; }
  return { status: res.status, json };
}

const main = async () => {
  const [types, cats, trades, sources, works] = await Promise.all([
    ref("/contacts/contact-types"), ref("/company-settings/job-file-settings/job-categories"),
    ref("/company-settings/job-file-settings/trade-types"), ref("/company-settings/leads/lead-sources"),
    ref("/company-settings/job-file-settings/work-types"),
  ]);
  STATE_BY_ABBR = Object.fromEntries((await ref("/acculynx/countries/1/states")).map((s) => [s.abbreviation, stripLink(s)]));
  const defType = (types.find((t) => t.isDefault) ?? types[0])?.id;

  const rows = await (await fetch(
    `${SB_URL}/rest/v1/acculynx_jobs?location_city=ilike.wichita&select=id,raw&order=id&limit=${LIMIT}&offset=${OFFSET}`,
    { headers: sbHdr })).json();

  console.log(`MESSY seed: ${rows.length} records (offset ${OFFSET}). sources=${sources.length} trades=${trades.length} cats=${cats.length} works=${works.length}`);
  let okJobs = 0, okMsgs = 0, fails = 0;
  let i = 0;
  for (const row of rows) {
    i++;
    const a = row.raw?.locationAddress ?? {};
    const broken = i % 11 === 0; // ~1 in 11 intentionally malformed → error-handling test
    const contactBody = {
      contactTypeIds: broken ? [] : [defType],
      firstName: pick(FIRST, i),
      lastName: `${pick(LAST, i)}${i}`,
      companyName: i % 4 === 0 ? `${pick(["ABC", "acme", "Bob's"], i)} Roofing${i % 8 === 0 ? " LLC " : ""}` : null,
      phoneNumbers: [{ number: pick(PHONE_FMT, i)(i), type: pick(["Mobile", "Home", "Work", "mobile"], i), primary: true }],
      emailAddresses: broken ? [{ address: `not-an-email-${i}`, type: "Personal", primary: true }]
        : [{ address: `sandbox+wic${OFFSET + i}@example.com`, type: pick(["Personal", "Work"], i), primary: true }],
      mailingAddress: { street1: a.street1 ?? "1 test st", city: pick(CITY, i), state: stripLink(typeof a.state === "object" ? a.state : STATE_BY_ABBR.KS) ?? STATE_BY_ABBR.KS, zipCode: a.zipCode ?? "67203", country: US },
      note: pick(NOTE, i)(val(i)),
    };
    const c = await call("POST", "/contacts", contactBody);
    if (c.status >= 300) { fails++; console.log(`  [${i}]${broken ? " (intentional)" : ""} contact FAIL ${c.status}: ${JSON.stringify(c.json).slice(0, 140)}`); await sleep(PACE); continue; }
    const contactId = c.json?.id ?? c.json;
    await sleep(PACE);

    const jobBody = {
      contact: { id: contactId },
      locationAddress: { street1: a.street1 ?? "1 test st", city: pick(CITY, i), state: (STATE_BY_ABBR.KS || {}).abbreviation ?? "KS", zipCode: a.zipCode ?? "67203", country: "US" },
      jobCategory: { id: pick(cats, i)?.id },
      workType: works.length ? { id: pick(works, i)?.id } : undefined,
      tradeTypes: [{ id: pick(trades, i)?.id }],
      leadSource: { id: pick(sources, i)?.id },
      priority: pick(["Low", "Normal", "High", "Urgent"], i),
      notes: pick(NOTE, i)(val(i)),
    };
    const j = await call("POST", "/jobs", jobBody);
    if (j.status >= 300) { fails++; console.log(`  [${i}] job FAIL ${j.status}: ${JSON.stringify(j.json).slice(0, 140)}`); await sleep(PACE); continue; }
    okJobs++;
    const jobId = j.json?.id;
    await sleep(PACE);

    // 1-3 messy "chat" messages per job
    const nMsg = 1 + (i % 3);
    for (let m = 0; m < nMsg; m++) {
      const mr = await call("POST", `/jobs/${jobId}/messages`, { message: pick(MSG, i + m) });
      if (mr.status < 300) okMsgs++;
      await sleep(PACE);
    }
    console.log(`  [${i}] contact ${c.status} -> job ${j.status} (${pick(["Low", "Normal", "High", "Urgent"], i)}) + ${nMsg} msgs`);
  }
  console.log(`\nDONE: ${okJobs}/${rows.length} jobs, ${okMsgs} messages. ${fails} intentional/real failures (error-handling samples).`);
};
main().catch((e) => { console.error(e); process.exit(1); });
