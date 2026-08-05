#!/usr/bin/env node
/**
 * JT pending_write executor — committed port of the B3 driver algorithm
 * (integrations/bridges/jobtread/mirror/manifests/b3-execute.json), which was
 * never persisted by the Ringer worker. This closes that reproducibility gap.
 *
 *   node integrations/bridges/jobtread/sync-sentinel/executor.mjs --dry-run
 *   node integrations/bridges/jobtread/sync-sentinel/executor.mjs
 *   node integrations/bridges/jobtread/sync-sentinel/executor.mjs --domain=daily_logs
 *
 * HARD RULES (inherited from B3):
 *   - Plays ONLY jt_mirror.pending_write rows with status='approved'.
 *     (The migration rounds ran status='staged' directly; the Sentinel era
 *     adds the human approval hop: staged → approved → executed.)
 *   - Never invents writes. Never creates users/memberships/invites (seat rule).
 *   - Never deletes anything in JobTread. `notify` never true.
 *   - Resolves {"$ref": "<type>:<id>"} via jt_mirror.crosswalk, TYPED BY TARGET
 *     FIELD (jobId→job, unitId→unit, accountId→account, locationId→location).
 *   - Closed-job protocol: reopen → write → re-close; never leave a job open.
 *   - Checkpoint after EVERY write (pending_write + crosswalk + write_action_log)
 *     so an interruption resumes cleanly.
 *   - Halt after 10 consecutive failures. ≤4 req/s.
 */

import { JT_ORG_ID, paveQuery } from "./pave-client.mjs";
import { sql, sqlLit as lit } from "./supabase-sql.mjs";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const domainArg = args.find((a) => a.startsWith("--domain="));
const DOMAIN = domainArg ? domainArg.split("=")[1] : null;

const REF_FIELD_TYPES = {
  jobId: "job",
  accountId: "account",
  locationId: "location",
  documentId: "document",
  unitId: "unit",
  costCodeId: "costCode",
  costTypeId: "costType",
  costItemId: "costItem",
  customFieldId: "customField",
};

const refCache = new Map();
async function resolveRef(sourceType, sourceId, targetType) {
  const key = `${targetType}:${sourceId}`;
  if (refCache.has(key)) return refCache.get(key);
  const rows = await sql(`
SELECT jt_id FROM jt_mirror.crosswalk
WHERE source_id = ${lit(sourceId)} AND jt_type = ${lit(targetType)} LIMIT 1;`);
  const jtId = rows?.[0]?.jt_id || null;
  if (jtId) refCache.set(key, jtId);
  return jtId;
}

/** Walk a payload; replace {"$ref":"type:id"} values, typed by the FIELD name. */
async function resolveRefs(node, fieldName = null, missing = []) {
  if (Array.isArray(node)) {
    const out = [];
    for (const item of node) out.push(await resolveRefs(item, fieldName, missing));
    return out;
  }
  if (node && typeof node === "object") {
    if (typeof node.$ref === "string") {
      const [srcType, ...rest] = node.$ref.split(":");
      const srcId = rest.join(":");
      const targetType = REF_FIELD_TYPES[fieldName] || srcType;
      const jtId = await resolveRef(srcType, srcId, targetType);
      if (!jtId) missing.push(`${fieldName || "?"} → ${node.$ref} (as ${targetType})`);
      return jtId;
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "__execution_order" || k === "$sentinel") continue;
      out[k] = await resolveRefs(v, k, missing);
    }
    return out;
  }
  return node;
}

async function jobClosedOn(jobId) {
  const res = await paveQuery({ job: { $: { id: jobId }, id: {}, closedOn: {} } });
  return res?.job?.closedOn ?? null;
}
async function setJobClosedOn(jobId, closedOn) {
  await paveQuery({
    updateJob: { $: { id: jobId, closedOn }, job: { $: { id: jobId }, id: {} } },
  });
}

function createdKey(paveOp) {
  // createDailyLog → createdDailyLog ; updateJob → (no created key)
  return paveOp.startsWith("create") ? `created${paveOp.slice(6)}` : null;
}

async function executeOp(paveOp, input) {
  const sel = createdKey(paveOp);
  const query = { [paveOp]: { $: input, ...(sel ? { [sel]: { id: {} } } : {}) } };
  const res = await paveQuery(query);
  return sel ? res?.[sel]?.id ?? null : null;
}

async function checkpoint(row, { status, jtId, error }) {
  await sql(`
UPDATE jt_mirror.pending_write
SET status = ${lit(status)}, jt_id = ${lit(jtId)}, error = ${lit(error)},
    attempt = attempt + 1, executed_at = ${status === "executed" ? "now()" : "NULL"},
    updated_at = now()
WHERE id = ${row.id};`);
  await sql(`
INSERT INTO jt_mirror.write_action_log
  (pending_write_id, domain, pave_op, source_ref, idempotency_key, attempt, actor, target_env, status, jt_id, error, created_at)
VALUES (${row.id}, ${lit(row.domain)}, ${lit(row.pave_op)}, ${lit(row.source_ref)},
        ${lit(row.idempotency_key)}, ${Number(row.attempt || 0) + 1}, 'sync-sentinel-executor',
        ${lit(row.target_env)}, ${lit(status)}, ${lit(jtId)}, ${lit(error)}, now());`);
  if (status === "executed" && jtId && row.source_ref) {
    const [sourceTable, ...idParts] = String(row.source_ref).split(":");
    const sourceId = idParts.join(":");
    const jtType = row.pave_op.startsWith("create")
      ? row.pave_op.slice(6, 7).toLowerCase() + row.pave_op.slice(7)
      : null;
    if (jtType) {
      await sql(`
INSERT INTO jt_mirror.crosswalk
  (source_system, source_id, source_table, jt_organization_id, jt_type, jt_id, domain, loader_version, last_synced_at)
VALUES ('acculynx', ${lit(sourceId)}, ${lit(sourceTable)}, ${lit(JT_ORG_ID)},
        ${lit(jtType)}, ${lit(jtId)}, ${lit(row.domain)}, 'sentinel-executor-v1', now())
ON CONFLICT DO NOTHING;`);
    }
  }
}

async function main() {
  const grant = await paveQuery({ currentGrant: { id: {} } });
  if (!grant?.currentGrant?.id) throw new Error("Pave auth failed");

  const rows = await sql(`
SELECT id, domain, pave_op, payload, source_ref, idempotency_key, attempt, target_env
FROM jt_mirror.pending_write
WHERE status = 'approved' ${DOMAIN ? `AND domain = ${lit(DOMAIN)}` : ""}
ORDER BY (payload->>'__execution_order')::int NULLS LAST, created_at
LIMIT 5000;`);
  if (!rows?.length) {
    console.log("No approved pending_write rows. Nothing to do.");
    return;
  }
  console.log(`${rows.length} approved rows${DRY_RUN ? " (dry-run, no writes)" : ""}`);

  let consecutiveFailures = 0;
  let done = 0;
  for (const row of rows) {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    if (payload?.$sentinel?.needs_compile) {
      console.log(`  #${row.id} ${row.source_ref}: needs_compile marker — skipping (compile step not yet built)`);
      continue;
    }
    if (payload?.notify === true) {
      await checkpoint(row, { status: "failed", jtId: null, error: "notify:true forbidden" });
      continue;
    }
    const missing = [];
    const input = await resolveRefs(payload, null, missing);
    if (missing.length) {
      await checkpoint(row, {
        status: "failed",
        jtId: null,
        error: `unresolved $ref: ${missing.join("; ").slice(0, 500)}`,
      });
      consecutiveFailures += 1;
      if (consecutiveFailures >= 10) throw new Error("10 consecutive failures — halting");
      continue;
    }
    if (DRY_RUN) {
      console.log(`  would ${row.pave_op} for ${row.source_ref}`);
      continue;
    }

    // Closed-job protocol for ops that target an existing job.
    const targetJobId = input.jobId || (row.pave_op === "updateJob" ? input.id : null);
    let reopened = null;
    try {
      if (targetJobId && row.pave_op !== "createJob") {
        const closedOn = await jobClosedOn(targetJobId);
        if (closedOn) {
          await setJobClosedOn(targetJobId, null);
          reopened = closedOn;
        }
      }
      const jtId = await executeOp(row.pave_op, input);
      await checkpoint(row, { status: "executed", jtId, error: null });
      consecutiveFailures = 0;
      done += 1;
      if (done % 50 === 0) console.log(`  ${done}/${rows.length} executed`);
    } catch (err) {
      await checkpoint(row, {
        status: "failed",
        jtId: null,
        error: String(err.message).slice(0, 800),
      });
      consecutiveFailures += 1;
      if (consecutiveFailures >= 10) {
        if (reopened && targetJobId) await setJobClosedOn(targetJobId, reopened).catch(() => {});
        throw new Error("10 consecutive failures — halting");
      }
    } finally {
      // Never leave a job reopened, even when the write inside failed.
      if (reopened && targetJobId) {
        await setJobClosedOn(targetJobId, reopened).catch((err) =>
          console.error(`  RECLOSE FAILED for job ${targetJobId}: ${err.message}`)
        );
      }
    }
  }
  console.log(`Done: ${done}/${rows.length} executed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
