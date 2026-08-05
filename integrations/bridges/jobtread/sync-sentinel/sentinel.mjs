#!/usr/bin/env node
/**
 * JT Sync Sentinel — daily JobTread ⇄ Supabase alignment (docs/80, schema 196).
 *
 *   node integrations/bridges/jobtread/sync-sentinel/sentinel.mjs --mode=smoke
 *   node integrations/bridges/jobtread/sync-sentinel/sentinel.mjs --mode=daily
 *   node integrations/bridges/jobtread/sync-sentinel/sentinel.mjs --only=jobs,accounts --dry-run
 *   node integrations/bridges/jobtread/sync-sentinel/sentinel.mjs --mode=daily --stage-outbound
 *
 * What a daily run does:
 *   1. INBOUND SWEEP  — pages every JT entity, sha256-fingerprints each node,
 *      upserts changed rows into jt_mirror echo tables (JT → Supabase for
 *      operational data, per the approved field-ownership conflict policy).
 *   2. DRIFT DETECT   — jt_only records (born in JT, no crosswalk),
 *      sot_only records (new AccuLynx rows never mirrored), milestone drift
 *      (v_recon_jobs_by_milestone). Identity conflicts land in
 *      jt_mirror.conflict_review, never auto-overwritten.
 *   3. OUTBOUND STAGE — with --stage-outbound: new AccuLynx jobs since the
 *      watermark are staged into jt_mirror.pending_write (status='staged').
 *      NOTHING is written to JobTread by this script — executor.mjs plays
 *      approved rows only.
 *   4. REPORT         — jt_mirror.sync_runs row + optional Slack post to
 *      #ob-agents-internal (SLACK_BOT_TOKEN, system-status fallback identity).
 *
 * READS ONLY against JobTread. Env: master.env (JT grant key, SUPABASE_ACCESS_TOKEN).
 */

import { createHash } from "node:crypto";
import {
  JT_ORG_ID,
  listWebhooks,
  paveQuery,
  pavePagedOrgConnection,
} from "./pave-client.mjs";

import { jsonLit, sql, sqlLit } from "./supabase-sql.mjs";

const LOADER_VERSION = "sentinel-v1.1";
const SLACK_CHANNEL = process.env.JT_SENTINEL_SLACK_CHANNEL || "C0BD8U44HL3"; // #ob-agents-internal
const FLUSH_SIZE = 250; // rows buffered across pages before one SQL upsert

const args = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : true;
};
const MODE = flag("mode", "daily");
const ONLY = flag("only") ? String(flag("only")).split(",") : null;
const DRY_RUN = Boolean(flag("dry-run", false));
const STAGE_OUTBOUND = Boolean(flag("stage-outbound", false));

// ---------------------------------------------------------------- entity specs
const fingerprint = (node) => createHash("sha256").update(JSON.stringify(node)).digest("hex");

function cfvMap(node) {
  const out = {};
  for (const v of node.customFieldValues?.nodes || []) {
    if (v.customField?.name) out[v.customField.name] = v.value ?? null;
  }
  return out;
}

/** Each spec: connection, selection, table, jtType (crosswalk), toRow(node). */
const ENTITY_SPECS = [
  {
    key: "accounts",
    connection: "accounts",
    table: "accounts",
    jtType: "account",
    identity: true,
    selection: { id: {}, name: {}, type: {}, isTaxable: {}, createdAt: {}, archivedAt: {} },
    toRow: (n) => ({
      jt_id: n.id,
      jt_organization_id: JT_ORG_ID,
      account_type: n.type ?? null,
      name: n.name ?? null,
      raw: n,
    }),
    cols: "jt_id text, jt_organization_id text, account_type text, name text, raw jsonb",
    set: ["account_type", "name", "raw"],
  },
  {
    key: "locations",
    connection: "locations",
    table: "locations",
    jtType: "location",
    identity: true,
    selection: {
      id: {}, name: {}, formattedAddress: {}, createdAt: {},
      account: { id: {} },
    },
    toRow: (n) => ({
      jt_id: n.id,
      jt_organization_id: JT_ORG_ID,
      account_jt_id: n.account?.id ?? null,
      name: n.name ?? null,
      address: n.formattedAddress ?? null,
      raw: n,
    }),
    cols: "jt_id text, jt_organization_id text, account_jt_id text, name text, address text, raw jsonb",
    set: ["account_jt_id", "name", "address", "raw"],
  },
  {
    key: "jobs",
    connection: "jobs",
    table: "jobs",
    jtType: "job",
    identity: true,
    pageSize: 25, // 100×25 customFieldValues trips Pave's 413 response limit
    selection: {
      id: {}, name: {}, number: {}, closedOn: {}, createdAt: {},
      location: { id: {}, account: { id: {} } },
      customFieldValues: { $: { size: 25 }, nodes: { value: {}, customField: { id: {}, name: {} } } },
    },
    toRow: (n) => ({
      jt_id: n.id,
      jt_organization_id: JT_ORG_ID,
      account_jt_id: n.location?.account?.id ?? null,
      location_jt_id: n.location?.id ?? null,
      name: n.name ?? null,
      number: n.number == null ? null : String(n.number),
      closed_on: n.closedOn ?? null,
      custom_field_values: cfvMap(n),
      raw: n,
    }),
    cols: "jt_id text, jt_organization_id text, account_jt_id text, location_jt_id text, name text, number text, closed_on date, custom_field_values jsonb, raw jsonb",
    set: ["account_jt_id", "location_jt_id", "name", "number", "closed_on", "custom_field_values", "raw"],
  },
  {
    key: "documents",
    connection: "documents",
    table: "documents",
    jtType: "document",
    identity: false,
    selection: {
      id: {}, name: {}, number: {}, type: {}, status: {}, price: {}, externalId: {}, createdAt: {},
      job: { id: {} }, account: { id: {} },
    },
    toRow: (n) => ({
      jt_id: n.id,
      jt_organization_id: JT_ORG_ID,
      job_jt_id: n.job?.id ?? null,
      account_jt_id: n.account?.id ?? null,
      document_type: n.type ?? null,
      name: n.name ?? null,
      number: n.number == null ? null : String(n.number),
      external_id: n.externalId ?? null,
      status: n.status ?? null,
      total: n.price ?? null,
      raw: n,
    }),
    cols: "jt_id text, jt_organization_id text, job_jt_id text, account_jt_id text, document_type text, name text, number text, external_id text, status text, total numeric, raw jsonb",
    set: ["job_jt_id", "account_jt_id", "document_type", "name", "number", "external_id", "status", "total", "raw"],
  },
  {
    key: "daily_logs",
    connection: "dailyLogs",
    table: "daily_logs",
    jtType: "daily_log",
    identity: false,
    selection: { id: {}, date: {}, notes: {}, createdAt: {}, job: { id: {} } },
    toRow: (n) => ({
      jt_id: n.id,
      jt_organization_id: JT_ORG_ID,
      job_jt_id: n.job?.id ?? null,
      log_date: n.date ?? null,
      notes: n.notes ?? null,
      raw: n,
    }),
    cols: "jt_id text, jt_organization_id text, job_jt_id text, log_date date, notes text, raw jsonb",
    set: ["job_jt_id", "log_date", "notes", "raw"],
  },
  {
    key: "cost_codes",
    connection: "costCodes",
    table: "cost_codes",
    jtType: "costCode",
    identity: false,
    selection: { id: {}, name: {}, number: {}, isActive: {}, createdAt: {}, parentCostCode: { id: {} } },
    toRow: (n) => ({
      jt_id: n.id,
      jt_organization_id: JT_ORG_ID,
      parent_jt_id: n.parentCostCode?.id ?? null,
      name: n.name ?? null,
      number: n.number == null ? null : String(n.number),
      raw: n,
    }),
    cols: "jt_id text, jt_organization_id text, parent_jt_id text, name text, number text, raw jsonb",
    set: ["parent_jt_id", "name", "number", "raw"],
  },
  {
    key: "cost_items",
    connection: "costItems",
    table: "cost_items",
    jtType: "costItem",
    identity: false,
    selection: {
      id: {}, name: {}, description: {}, quantity: {}, unitCost: {}, unitPrice: {}, createdAt: {},
      costCode: { id: {} }, costType: { id: {} }, unit: { id: {} },
      document: { id: {} }, job: { id: {} },
    },
    toRow: (n) => ({
      jt_id: n.id,
      jt_organization_id: JT_ORG_ID,
      job_jt_id: n.job?.id ?? null,
      document_jt_id: n.document?.id ?? null,
      cost_code_jt_id: n.costCode?.id ?? null,
      cost_type_jt_id: n.costType?.id ?? null,
      unit_jt_id: n.unit?.id ?? null,
      name: n.name ?? null,
      description: n.description ?? null,
      quantity: n.quantity ?? null,
      unit_cost: n.unitCost ?? null,
      unit_price: n.unitPrice ?? null,
      raw: n,
    }),
    cols: "jt_id text, jt_organization_id text, job_jt_id text, document_jt_id text, cost_code_jt_id text, cost_type_jt_id text, unit_jt_id text, name text, description text, quantity numeric, unit_cost numeric, unit_price numeric, raw jsonb",
    set: ["job_jt_id", "document_jt_id", "cost_code_jt_id", "cost_type_jt_id", "unit_jt_id", "name", "description", "quantity", "unit_cost", "unit_price", "raw"],
  },
];

// ------------------------------------------------------------------- upserts
async function upsertBatch(spec, rows) {
  if (!rows.length) return { inserted: 0, updated: 0 };
  const enriched = rows.map((r) => ({ ...r, content_hash: fingerprint(r.raw) }));
  if (DRY_RUN) return { inserted: 0, updated: 0, dryRun: enriched.length };
  const colNames = spec.cols.split(",").map((c) => c.trim().split(" ")[0]);
  const setClause = spec.set
    .concat(["content_hash"])
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const query = `
WITH incoming AS (
  SELECT * FROM jsonb_to_recordset(${jsonLit(enriched)}::jsonb)
    AS x(${spec.cols}, content_hash text)
), ins AS (
  INSERT INTO jt_mirror.${spec.table} AS t (${colNames.join(", ")}, content_hash, synced_at)
  SELECT ${colNames.join(", ")}, content_hash, now() FROM incoming
  ON CONFLICT (jt_id) DO UPDATE SET ${setClause}, synced_at = now()
    WHERE t.content_hash IS DISTINCT FROM excluded.content_hash
  RETURNING (t.xmax = 0) AS inserted
)
SELECT count(*) FILTER (WHERE inserted) AS inserted,
       count(*) FILTER (WHERE NOT inserted) AS updated
FROM ins;`;
  try {
    const out = await sql(query);
    const row = Array.isArray(out) ? out[0] : null;
    return { inserted: Number(row?.inserted || 0), updated: Number(row?.updated || 0) };
  } catch (err) {
    // Oversized or otherwise rejected batch: split and retry down to single rows.
    if (rows.length > 1) {
      const mid = Math.ceil(rows.length / 2);
      const a = await upsertBatch(spec, rows.slice(0, mid));
      const b = await upsertBatch(spec, rows.slice(mid));
      return {
        inserted: (a.inserted || 0) + (b.inserted || 0),
        updated: (a.updated || 0) + (b.updated || 0),
      };
    }
    throw err;
  }
}

// --------------------------------------------------------------------- sweep
async function sweepEntity(spec, runId) {
  let seen = 0;
  let inserted = 0;
  let updated = 0;
  let buffer = [];
  const flush = async () => {
    if (!buffer.length) return;
    const res = await upsertBatch(spec, buffer);
    inserted += res.inserted || 0;
    updated += res.updated || 0;
    buffer = [];
  };
  await pavePagedOrgConnection(spec.connection, spec.selection, {
    size: spec.pageSize || 100,
    onPage: async (nodes) => {
      seen += nodes.length;
      buffer.push(...nodes.filter((n) => n?.id).map(spec.toRow));
      if (buffer.length >= FLUSH_SIZE) await flush();
      process.stdout.write(`  ${spec.key}: ${seen} seen\r`);
    },
  });
  await flush();
  console.log(`  ${spec.key}: ${seen} seen, ${inserted} new, ${updated} changed`);

  // jt_only: echo rows with no crosswalk entry → born in JobTread.
  const jtOnlyRes = DRY_RUN
    ? [{ n: 0 }]
    : await sql(`
SELECT count(*) AS n FROM jt_mirror.${spec.table} e
LEFT JOIN jt_mirror.crosswalk c ON c.jt_type = ${sqlLit(spec.jtType)} AND c.jt_id = e.jt_id
WHERE c.id IS NULL;`);
  const jtOnly = Number(jtOnlyRes?.[0]?.n || 0);

  // Identity entities born in JT violate the SOT-owns-identity policy → review queue.
  if (!DRY_RUN && spec.identity && jtOnly > 0) {
    await sql(`
INSERT INTO jt_mirror.conflict_review (entity, jt_id, field, jt_value, classification, run_id)
SELECT ${sqlLit(spec.key)}, e.jt_id, '_record', left(coalesce(e.name, e.jt_id), 200), 'jt_only', ${runId}
FROM jt_mirror.${spec.table} e
LEFT JOIN jt_mirror.crosswalk c ON c.jt_type = ${sqlLit(spec.jtType)} AND c.jt_id = e.jt_id
WHERE c.id IS NULL
ON CONFLICT (entity, coalesce(jt_id,''), field) WHERE status = 'open' DO NOTHING;`);
  }

  if (!DRY_RUN) {
    await sql(`
INSERT INTO jt_mirror.sync_watermarks (entity, last_swept_at, last_run_id, rows_seen, rows_changed, rows_jt_only, updated_at)
VALUES (${sqlLit(spec.key)}, now(), ${runId}, ${seen}, ${inserted + updated}, ${jtOnly}, now())
ON CONFLICT (entity) DO UPDATE SET last_swept_at = now(), last_run_id = ${runId},
  rows_seen = ${seen}, rows_changed = ${inserted + updated}, rows_jt_only = ${jtOnly}, updated_at = now();`);
    // Freshness stamp on the crosswalk for everything still present in JT.
    await sql(`
UPDATE jt_mirror.crosswalk c SET last_synced_at = now(), updated_at = now()
FROM jt_mirror.${spec.table} e
WHERE c.jt_type = ${sqlLit(spec.jtType)} AND c.jt_id = e.jt_id AND e.synced_at > now() - interval '1 hour';`);
  }

  return { seen, inserted, updated, jt_only: jtOnly };
}

// --------------------------------------------------------------- drift + SOT
async function detectSotDrift(runId) {
  // New AccuLynx jobs never mirrored to JT (excludes sandbox + archived, per B2 scope).
  const sotOnly = await sql(`
SELECT count(*) AS n FROM public.acculynx_jobs aj
LEFT JOIN jt_mirror.crosswalk c
  ON c.source_system = 'acculynx' AND c.jt_type = 'job' AND c.source_id = aj.id::text
WHERE c.id IS NULL AND aj.archived_at IS NULL AND coalesce(aj.account_key,'') <> 'PE_CC_SANDBOX';`);

  const milestoneDrift = await sql(
    `SELECT * FROM jt_mirror.v_recon_jobs_by_milestone WHERE coalesce(source_count,0) <> coalesce(crosswalk_count,0) LIMIT 50;`
  ).catch(() => []);

  if (!DRY_RUN) {
    await sql(`
INSERT INTO jt_mirror.conflict_review (entity, jt_id, source_ref, field, sot_value, classification, run_id)
SELECT 'jobs', NULL, 'acculynx_jobs:' || aj.id::text, '_record',
       left(coalesce(aj.job_name, aj.id::text), 200), 'sot_only', ${runId}
FROM public.acculynx_jobs aj
LEFT JOIN jt_mirror.crosswalk c
  ON c.source_system = 'acculynx' AND c.jt_type = 'job' AND c.source_id = aj.id::text
WHERE c.id IS NULL AND aj.archived_at IS NULL AND coalesce(aj.account_key,'') <> 'PE_CC_SANDBOX'
ON CONFLICT DO NOTHING;`);
  }

  return {
    sot_only_jobs: Number(sotOnly?.[0]?.n || 0),
    milestone_drift_rows: Array.isArray(milestoneDrift) ? milestoneDrift.length : 0,
  };
}

// ---------------------------------------------------------- outbound staging
async function stageOutbound(runId) {
  if (!STAGE_OUTBOUND || DRY_RUN) return 0;
  // Stage createJob-family work for new AccuLynx jobs as HUMAN-GATED rows.
  // v1 stages a marker row per job; the compile step (payload build) runs at
  // approval time so payloads always reflect current SOT state.
  const res = await sql(`
INSERT INTO jt_mirror.pending_write (domain, pave_op, payload, status, source_ref, target_env)
SELECT 'jobs_incremental', 'createJob',
       jsonb_build_object('$sentinel', jsonb_build_object(
         'acculynx_job_id', aj.id::text,
         'job_name', aj.job_name,
         'job_number', aj.job_number,
         'account_key', aj.account_key,
         'detected_by_run', ${runId},
         'needs_compile', true
       )),
       'staged', 'acculynx_jobs:' || aj.id::text, 'production'
FROM public.acculynx_jobs aj
LEFT JOIN jt_mirror.crosswalk c
  ON c.source_system = 'acculynx' AND c.jt_type = 'job' AND c.source_id = aj.id::text
WHERE c.id IS NULL AND aj.archived_at IS NULL AND coalesce(aj.account_key,'') <> 'PE_CC_SANDBOX'
ON CONFLICT (domain, source_ref, pave_op) DO NOTHING
RETURNING id;`);
  return Array.isArray(res) ? res.length : 0;
}

// -------------------------------------------------------------------- report
async function postSlack(text) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: SLACK_CHANNEL, text }),
    });
  } catch (err) {
    console.error("Slack post failed:", err.message);
  }
}

// ---------------------------------------------------------------------- main
async function main() {
  console.log(`JT Sync Sentinel ${LOADER_VERSION} — mode=${MODE}${DRY_RUN ? " (dry-run)" : ""}`);

  // Auth + org preflight (same probe as r0).
  const grant = await paveQuery({
    currentGrant: { id: {}, user: { id: {}, name: {} } },
  });
  if (!grant?.currentGrant?.id) throw new Error("Pave auth failed — no currentGrant");
  console.log(`  auth OK (grant user: ${grant.currentGrant.user?.name || "unknown"})`);

  if (MODE === "smoke") {
    const hooks = await listWebhooks();
    console.log(`  registered webhooks: ${hooks.length}`);
    for (const h of hooks) console.log(`    ${h.id} → ${h.url} [${(h.eventTypes || []).length} events]`);
    return;
  }

  if (!DRY_RUN) {
    // A crashed run can leave status='running' forever; sweep them to failed.
    await sql(`
UPDATE jt_mirror.sync_runs SET status = 'failed', finished_at = now(),
  error = coalesce(error, 'stale: never finished')
WHERE status = 'running' AND started_at < now() - interval '6 hours';`).catch(() => {});
  }
  const runRow = DRY_RUN
    ? [{ id: 0 }]
    : await sql(`
INSERT INTO jt_mirror.sync_runs (run_kind, loader_version)
VALUES (${sqlLit(MODE)}, ${sqlLit(LOADER_VERSION)}) RETURNING id;`);
  const runId = Number(runRow?.[0]?.id || 0);

  const entities = {};
  let failed = null;
  try {
    for (const spec of ENTITY_SPECS) {
      if (ONLY && !ONLY.includes(spec.key)) continue;
      entities[spec.key] = await sweepEntity(spec, runId);
    }
    const drift = await detectSotDrift(runId);
    const staged = await stageOutbound(runId);

    if (!DRY_RUN) {
      await sql(`
UPDATE jt_mirror.sync_runs SET finished_at = now(), status = 'ok',
  entities = ${jsonLit(entities)}::jsonb, drift = ${jsonLit(drift)}::jsonb,
  staged_outbound = ${staged}
WHERE id = ${runId};`);
    }

    const changed = Object.values(entities).reduce((a, e) => a + e.inserted + e.updated, 0);
    const jtOnly = Object.values(entities).reduce((a, e) => a + e.jt_only, 0);
    const summary =
      `JT Sync Sentinel run ${runId} OK — ` +
      `${changed} changed rows mirrored, ${jtOnly} JT-native records, ` +
      `${drift.sot_only_jobs} AccuLynx jobs not yet in JT, ` +
      `${drift.milestone_drift_rows} milestone-drift domains` +
      (staged ? `, ${staged} outbound rows staged (awaiting approval)` : "");
    console.log(summary);
    await postSlack(`:satellite: ${summary}`);
  } catch (err) {
    failed = err;
    if (!DRY_RUN && runId) {
      await sql(`
UPDATE jt_mirror.sync_runs SET finished_at = now(), status = 'failed',
  entities = ${jsonLit(entities)}::jsonb, error = ${sqlLit(String(err.message).slice(0, 1000))}
WHERE id = ${runId};`).catch(() => {});
    }
    await postSlack(`:rotating_light: JT Sync Sentinel run ${runId} FAILED: ${String(err.message).slice(0, 300)}`);
  }
  if (failed) throw failed;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
