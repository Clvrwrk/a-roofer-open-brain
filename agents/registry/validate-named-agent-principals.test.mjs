import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertLifecycleTransition, assertVerificationPredecessor, authorizeOperation, claimForPrincipal, resolveIdentity, validateRegistry } from "./validate-named-agent-principals.mjs";

const source = JSON.parse(fs.readFileSync(new URL("./named-agent-principals.json", import.meta.url), "utf8"));
const clone = () => structuredClone(source);
const principal = (id, registry = source) => registry.principals.find((p) => p.persona_id === id);
const claim = (id, registry = source) => claimForPrincipal(principal(id, registry));
const ids = source.principals.map((p) => p.persona_id);

test("canonical registry validates", () => assert.equal(validateRegistry(clone()).principals.length, 8));
for (const id of ids) test(`${id} canonical inventory identity resolves`, () => assert.equal(resolveIdentity(source, claim(id)).persona_id, id));
test("resolved identity is frozen", () => assert.equal(Object.isFrozen(resolveIdentity(source, claim("maya-chen")).google), true));
test("unknown principal fails closed", () => { const c = claim("maya-chen"); c.persona_id = "nobody"; assert.throws(() => resolveIdentity(source, c), /unknown_principal/); });
test("missing and extra claim fields fail", () => {
  const missing = claim("maya-chen"); delete missing.slack_team_id;
  assert.throws(() => resolveIdentity(source, missing), /claim_schema_mismatch/);
  assert.throws(() => resolveIdentity(source, { ...claim("maya-chen"), extra: true }), /claim_schema_mismatch/);
});

for (const field of ["google_email", "google_customer_id", "google_subject_id", "google_credential_ref", "slack_team_id", "slack_app_id", "slack_bot_user_id", "slack_installation_id", "slack_token_fingerprint", "command_center_subject", "runtime_owner_id", "runtime_instance_id", "runtime_credential_ref", "orgo_workspace_id", "orgo_computer_id"]) {
  test(`${field} mismatch fails closed`, () => { const c = claim("maya-chen"); c[field] = c[field] == null ? "wrong" : "wrong"; assert.throws(() => resolveIdentity(source, c), new RegExp(field.startsWith("orgo_") && field !== "orgo_workspace_id" && false ? "x" : `${field}_mismatch|orgo_resource_unbound`)); });
}
for (const left of ids) for (const right of ids) if (left !== right) {
  test(`${left} cannot use ${right} identity bindings`, () => {
    const mixed = claim(left);
    const other = claim(right);
    for (const key of Object.keys(mixed)) if (key !== "persona_id") mixed[key] = other[key];
    assert.throws(() => resolveIdentity(source, mixed), /mismatch|unbound/);
  });
}

test("planned principal supplied Orgo IDs is explicitly unbound", () => { const c = claim("alex-rivers"); c.orgo_workspace_id = "invented"; c.orgo_computer_id = "invented"; assert.throws(() => resolveIdentity(source, c), /orgo_resource_unbound/); });
for (const id of ids) test(`${id} operation authorization denied while adapter is absent`, () => {
  const capability = principal(id).allowed_capabilities[0] ?? "mailbox.read";
  assert.throws(() => authorizeOperation(source, claim(id), { capability }), /capability_forbidden|authorization_adapter_not_installed/);
});
test("resolver rejects a tampered registry", () => { const r = clone(); r.activation_order.reverse(); assert.throws(() => resolveIdentity(r, claim("maya-chen")), /activation_order_mismatch/); });

for (const [path, message] of [
  [["google", "primary_email"], "duplicate_google_email"], [["google", "subject_id"], "duplicate_google_subject_id"], [["google", "credential_ref"], "duplicate_google_credential_ref"],
  [["slack", "app_id"], "duplicate_slack_app_id"], [["slack", "bot_user_id"], "duplicate_slack_bot_user_id"], [["slack", "installation_id"], "duplicate_slack_installation_id"],
  [["slack", "token_env_key"], "duplicate_slack_token_env_key"], [["slack", "token_fingerprint"], "duplicate_slack_token_fingerprint"], [["command_center", "subject"], "duplicate_command_center_subject"],
  [["runtime", "owner_id"], "duplicate_runtime_owner_id"], [["runtime", "instance_id"], "duplicate_runtime_instance_id"], [["runtime", "credential_ref"], "duplicate_runtime_credential_ref"],
  [["orgo", "workspace_name"], "duplicate_orgo_workspace_name"], [["orgo", "workspace_id"], "duplicate_orgo_workspace_id"], [["orgo", "computer_id"], "duplicate_orgo_computer_id"]
]) test(`${message} fails`, () => {
  const r = clone();
  let seed = path.reduce((v, key) => v[key], r.principals[0]);
  if (seed == null) { let target = r.principals[0]; for (const key of path.slice(0, -1)) target = target[key]; target[path.at(-1)] = "same"; seed = "same"; }
  let target = r.principals[1]; for (const key of path.slice(0, -1)) target = target[key]; target[path.at(-1)] = seed;
  assert.throws(() => validateRegistry(r), new RegExp(message));
});

test("shared-token fallback fails", () => { const r = clone(); r.shared_token_fallback_allowed = true; assert.throws(() => validateRegistry(r), /shared_token_fallback/); });
test("authorization state vocabulary is frozen", () => { const r = clone(); r.authorization_states.push("active"); assert.throws(() => validateRegistry(r), /authorization_states_mismatch/); });
test("effect authorization adapter fence is frozen", () => { const r = clone(); r.effect_authorization.status = "installed"; assert.throws(() => validateRegistry(r), /effect_authorization_fence_mismatch/); });
test("unknown capability is default-denied", () => assert.throws(() => authorizeOperation(source, claim("maya-chen"), { capability: "payment.issue" }), /capability_forbidden/));
test("capability allowlist drift fails", () => { const r = clone(); r.principals[0].allowed_capabilities.push("admin.users"); assert.throws(() => validateRegistry(r), /capability_allowlist_mismatch|forbidden_capability_class/); });
for (const group of ["google", "slack", "orgo", "runtime"]) test(`invalid ${group} status fails`, () => { const r = clone(); r.principals[0][group].status = "live-ish"; assert.throws(() => validateRegistry(r), new RegExp(`invalid_${group}_status`)); });
test("unknown state fails", () => { const r = clone(); r.principals[0].lifecycle.state = "active"; assert.throws(() => validateRegistry(r), /invalid_authorization_state/); });
test("legal lifecycle transition is explicit", () => assert.equal(assertLifecycleTransition("planned", "inventory-only"), true));
test("lifecycle cannot skip verification", () => assert.throws(() => assertLifecycleTransition("planned", "authorized"), /illegal_lifecycle_transition/));
test("revocation is terminal", () => assert.throws(() => assertLifecycleTransition("revoked", "authorized"), /illegal_lifecycle_transition/));
test("authorized lifecycle requires receipts", () => { const r = clone(); r.principals[0].lifecycle.state = "authorized"; assert.throws(() => validateRegistry(r), /authorized_requires_receipts/); });
test("authorized lifecycle requires immutable bindings", () => { const r = clone(); const p = r.principals[0]; p.lifecycle = { state: "authorized", evidence_receipt_id: "receipt", human_approval_id: "approval", predecessor_persona_id: null, predecessor_receipt_id: null }; assert.throws(() => validateRegistry(r), /authorized_requires_google_customer_id/); });
test("Maya may begin verification without a predecessor", () => assert.equal(assertVerificationPredecessor(source, "maya-chen"), true));
test("Alex cannot begin before Maya has a completed gate", () => assert.throws(() => assertVerificationPredecessor(source, "alex-rivers", { persona_id: "maya-chen", receipt_id: "fake", verdict: "PASS", clean_days: 3 }), /rollout_predecessor_incomplete/));
test("service-role escalation fails", () => { const r = clone(); principal("rowan-vale", r).command_center.service_role = "ob-accounting"; assert.throws(() => validateRegistry(r), /service_role_mismatch/); });
test("Sam cannot gain trust-tier service role", () => { const r = clone(); principal("sam-torres", r).command_center.service_role = "ob-quality-control"; assert.throws(() => validateRegistry(r), /service_role_mismatch/); });
test("Rowan internal capability is forbidden independently of lifecycle", () => assert.throws(() => authorizeOperation(source, claim("rowan-vale"), { capability: "internal.brain.read" }), /rowan_external_only/));
test("Sam trust-tier mutation is forbidden independently of lifecycle", () => assert.throws(() => authorizeOperation(source, claim("sam-torres"), { capability: "trust_tier.write" }), /sam_trust_tier_forbidden/));
test("Ops Conductor cannot gain named-agent resources", () => { const r = clone(); const p = principal("ops-conductor", r); p.activation_scope = "named-agent"; p.orgo.workspace_name = "forbidden"; assert.throws(() => validateRegistry(r), /activation_scope_mismatch|ops_conductor_must_remain_fenced/); });
test("Slack team is immutable", () => { const r = clone(); r.principals[0].slack.team_id = "wrong"; assert.throws(() => validateRegistry(r), /slack_team_mismatch/); });
