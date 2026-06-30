#!/usr/bin/env node
// Generates docs/65-acculynx-read-capability-matrix.md from the latest sandbox sweep batch.
// Joins acculynx_get_checklist with the latest acculynx_api_probe batch via PostgREST.
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env. No secrets are written to the doc.
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env");
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const get = async (q) => (await fetch(`${URL}/rest/v1/${q}`, { headers: h })).json();

const checklist = await get("acculynx_get_checklist?select=operation_id,path,tier,base_url,pagination_param,probeability&order=tier,operation_id");
const latest = await get("acculynx_api_probe?select=probe_batch_id&order=probed_at.desc&limit=1");
const batchId = latest[0].probe_batch_id;
const probes = await get(`acculynx_api_probe?probe_batch_id=eq.${encodeURIComponent(batchId)}&select=probe_name,http_status,reported_count,result_summary`);
const byOp = Object.fromEntries(probes.map((p) => [p.probe_name, p]));

const QUIRK = {
  getMilestonesForJob: "path is /jobs/{jobId}/milestone-history (not /milestones/history)",
  getJobs: "milestone filter case-sensitive; assignment=unassigned needed for dead leads",
  getFinancialsSupplementsForCompany: "company-level /supplements (not nested under a job)",
};

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
const arr = (a) => (Array.isArray(a) && a.length ? a.join(" ") : "—");

const counts = {};
for (const p of probes) {
  const v = p.result_summary?.verdict ?? String(p.http_status ?? "—");
  counts[v] = (counts[v] ?? 0) + 1;
}

const rows = checklist.map((c) => {
  const p = byOp[c.operation_id] ?? {};
  const rs = p.result_summary ?? {};
  const verdict = rs.verdict ?? (p.http_status != null ? String(p.http_status) : "—");
  const wh = c.base_url.includes("/webhooks/v2") ? " (webhooks)" : "";
  return `| ${esc(c.operation_id)} | \`${esc(c.path)}\`${wh} | ${c.tier} | ${verdict} | ${arr(rs.top_keys)} | ${arr(rs.item_keys)} | ${c.pagination_param ?? "—"} | ${p.reported_count ?? "—"} | ${esc(QUIRK[c.operation_id] ?? (c.probeability !== "probeable" ? c.probeability : ""))} |`;
});

const doc = `# AccuLynx Read-Capability Matrix (Phase 1, REQ-05)

Generated: 2026-06-30 from sandbox sweep batch \`${batchId}\`
Source account: **sandbox** (\`PE_CC_SANDBOX_ACCULYNX_API_KEY\`) — no production account was touched.
Pairs with the write matrix [docs/37](37-acculynx-write-capability-matrix.md). Source of truth: \`public.acculynx_get_checklist\` (86 GETs from \`openapi-index.json\`) reconciled against \`public.acculynx_api_probe\`.

## How to read this

One row per documented GET (86 total). **Sandbox status** verdict vocabulary:
\`200\` works · \`empty\` 200 but zero items in sandbox · \`204\` no content · \`4xx\` error ·
\`tier_gated\` webhook endpoint gated by account tier · \`unprobeable\` no seed id available in the sandbox
(sparse data: 1 job / 1 contact / 1 supplement — Phase 4 write-seeding can deepen coverage on a re-run).
Evidence: every row traces to probe batch \`${batchId}\`.

**Verdict totals:** ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}× ${k}`).join(" · ")}

## Matrix

| operationId | Path | Tier | Sandbox status | Top-level keys | Item keys (collections) | Pagination | Reported count | Quirks / delta-from-docs |
|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## Known structural notes (independent of sandbox data)

- **Write-only paths have no read GET:** \`POST /jobs/{jobId}/messages\` and \`POST /contacts/{contactId}/logs\` are not in the 86 GETs — there is no read path (docs/37).
- **Reports (5 ops):** \`/reports/scheduled-reports/{scheduledReportId}/...\` require a \`scheduledReportId\` but no GET lists them — \`unprobeable\` without a human-supplied id from the AccuLynx UI.
- **Webhooks (3 ops):** \`/subscriptions\`, \`/subscriptions/{id}\`, \`/topics\` are on the webhooks base URL and may be account-tier gated.
- **Pagination split:** 21 GETs use \`recordStartIndex\`, 10 use \`pageStartIndex\` — selected per-endpoint, never globally.
`;

writeFileSync("docs/65-acculynx-read-capability-matrix.md", doc);
console.log(`wrote docs/65 with ${rows.length} endpoint rows (batch ${batchId})`);
