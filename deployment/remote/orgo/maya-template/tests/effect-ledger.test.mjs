import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { reserveEffect, transitionEffect, validateEffectContext } from "../runtime/lib/effect-ledger.mjs";

function context(overrides = {}) {
  return {
    issue_id: "CAT-999",
    run_id: "run-fixture",
    occurrence_id: "maya:fixture:2026-08-03:am",
    agent_id: "maya-chen",
    client_id: "pe-finance",
    trust_tier: "T1-internal",
    tool: "fixture-tool",
    effect_kind: "fixture-write",
    approval: "fixture-approval",
    cost_reservation: "zero",
    idempotency_key: "fixture-idempotency-key",
    runtime_version: "1.0.0-rc.4",
    ...overrides,
  };
}

test("complete effect context reserves exactly once", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-effect-"));
  const first = await reserveEffect(directory, context());
  const second = await reserveEffect(directory, context());
  assert.equal(first.reserved, true);
  assert.equal(second.reserved, false);
  const confirmed = await transitionEffect(first.target, "reserved", "confirmed", { provider_reference_digest: "fixture-digest" });
  assert.equal(confirmed.state, "confirmed");
  await assert.rejects(() => transitionEffect(first.target, "reserved", "confirmed"), /effect_transition_rejected/u);
});

test("missing or cross-boundary context stops before reservation", () => {
  assert.throws(() => validateEffectContext(context({ issue_id: "" })), /effect_context_missing/u);
  assert.throws(() => validateEffectContext(context({ agent_id: "foreign-agent" })), /effect_identity_mismatch/u);
  assert.throws(() => validateEffectContext(context({ client_id: "foreign-client" })), /effect_identity_mismatch/u);
});
