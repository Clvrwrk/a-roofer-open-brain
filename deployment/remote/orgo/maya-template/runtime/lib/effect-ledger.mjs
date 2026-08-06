import path from "node:path";
import { createJsonExclusive, readJson, sha256, writeJsonAtomic } from "./atomic-json.mjs";

export const REQUIRED_EFFECT_FIELDS = Object.freeze([
  "issue_id", "run_id", "occurrence_id", "agent_id", "client_id", "trust_tier",
  "tool", "effect_kind", "approval", "cost_reservation", "idempotency_key", "runtime_version",
]);

export function validateEffectContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error("effect_context_invalid");
  const missing = REQUIRED_EFFECT_FIELDS.filter((field) => context[field] === undefined || context[field] === null || context[field] === "");
  if (missing.length) throw new Error(`effect_context_missing:${missing.join(",")}`);
  if (!/^CAT-\d+$/u.test(String(context.issue_id))) throw new Error("effect_issue_invalid");
  if (context.agent_id !== "maya-chen" || context.client_id !== "pe-finance") throw new Error("effect_identity_mismatch");
  return Object.freeze({ ...context });
}

export async function reserveEffect(directory, context, now = new Date()) {
  const clean = validateEffectContext(context);
  const digest = sha256(String(clean.idempotency_key));
  const target = path.join(directory, `${digest}.json`);
  const created = await createJsonExclusive(target, {
    schema: 1,
    state: "reserved",
    idempotency_digest: digest,
    context: clean,
    reserved_at: now.toISOString(),
  });
  return { reserved: created, digest, target };
}

export async function transitionEffect(target, expected, state, fields = {}, now = new Date()) {
  const receipt = await readJson(target);
  if (receipt.state !== expected) throw new Error("effect_transition_rejected");
  await writeJsonAtomic(target, { ...receipt, ...fields, state, updated_at: now.toISOString() });
  return await readJson(target);
}
