#!/usr/bin/env node
// alex-no-price-triage.mjs — nightly Alex pass (PEC-195, A3 approved 2026-08-09).
// Calls public.alex_no_price_triage(): refreshes agreement_gap_queue (repeat-purchase
// No-Price items per vendor+office → global product file candidates) and stamps every
// other pending No-Price line passed/valid as Alex. Logs to dashboard_action_log.
// Runs from scripts/abc-nightly-sync.sh after the invoice ingest.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const envText = (() => { try { return readFileSync(resolve(ROOT, ".env"), "utf8"); } catch { return ""; } })();
const env = Object.fromEntries(
  envText.split("\n").map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, "")]),
);
const SB_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) { console.error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const sb = (path, init = {}) => fetch(`${SB_URL}${path}`, {
  ...init,
  headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", ...(init.headers || {}) },
});

const rpc = await sb("/rest/v1/rpc/alex_no_price_triage", { method: "POST", body: "{}" });
if (!rpc.ok) { console.error(`alex_no_price_triage failed: ${rpc.status} ${await rpc.text()}`); process.exit(1); }
const summary = await rpc.json();
console.log("alex triage:", JSON.stringify(summary));

await sb("/rest/v1/dashboard_action_log", {
  method: "POST",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({
    work_key: `alex-no-price-triage-${new Date().toISOString().slice(0, 10)}`,
    action_type: "alex_no_price_triage",
    actor_id: "alex@openbrain",
    actor_type: "agent",
    actor_display_name: "Alex",
    decision: "mark_done",
    department: "accounting",
    payload: summary,
    source_table: "agreement_gap_queue",
    workflow: "invoice-audit-v2",
  }),
});
