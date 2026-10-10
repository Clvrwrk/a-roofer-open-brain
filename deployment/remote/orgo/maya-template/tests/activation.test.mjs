import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { activationPayload, evaluateActivation } from "../runtime/lib/activation.mjs";
import { canonicalJson, sha256 } from "../runtime/lib/atomic-json.mjs";

const manifest = JSON.parse(await readFile(new URL("../manifest.yaml", import.meta.url), "utf8"));
const permissionsRaw = await readFile(new URL("../permissions.yaml", import.meta.url), "utf8");
const releaseDigest = "fixture-release-digest";
const policyDigest = sha256(permissionsRaw);

function signedReceipt(overrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyText = publicKey.export({ type: "spki", format: "pem" }).toString();
  const receipt = {
    schema: 1,
    enabled: true,
    issue_id: "CAT-999",
    gate_id: "fixture-gate",
    approval_id: "fixture-approval",
    builder_id: "fixture-builder",
    auditor_id: "fixture-auditor",
    agent_id: "maya-chen",
    client_id: "pe-finance",
    runtime_version: manifest.runtime_version,
    release_digest: releaseDigest,
    policy_digest: policyDigest,
    not_before: "2026-08-03T00:00:00.000Z",
    expires_at: "2026-08-04T00:00:00.000Z",
    public_key_fingerprint: sha256(publicKeyText),
    ...overrides,
  };
  receipt.signature = sign(null, Buffer.from(canonicalJson(activationPayload(receipt))), privateKey).toString("base64");
  return { receipt, publicKeyText };
}

test("environment flag keeps a valid signed receipt paused", () => {
  const fixture = signedReceipt();
  assert.deepEqual(evaluateActivation({
    enabledFlag: "false",
    receipt: fixture.receipt,
    publicKey: fixture.publicKeyText,
    manifest,
    releaseDigest,
    policyDigest,
    now: new Date("2026-08-03T12:00:00Z"),
  }), { active: false, reason: "environment_disabled" });
});

test("matching Ed25519 receipt activates only inside its window", () => {
  const fixture = signedReceipt();
  const result = evaluateActivation({
    enabledFlag: "true",
    receipt: fixture.receipt,
    publicKey: fixture.publicKeyText,
    manifest,
    releaseDigest,
    policyDigest,
    now: new Date("2026-08-03T12:00:00Z"),
  });
  assert.equal(result.active, true);
  assert.equal(result.issueId, "CAT-999");
});

test("tampered identity, version, signature, or time fails closed", () => {
  for (const overrides of [
    { agent_id: "foreign-agent" },
    { client_id: "foreign-client" },
    { runtime_version: "0.0.0" },
    { expires_at: "2026-08-02T00:00:00.000Z" },
  ]) {
    const fixture = signedReceipt(overrides);
    assert.equal(evaluateActivation({
      enabledFlag: "true",
      receipt: fixture.receipt,
      publicKey: fixture.publicKeyText,
      manifest,
      releaseDigest,
      policyDigest,
      now: new Date("2026-08-03T12:00:00Z"),
    }).active, false);
  }
  const fixture = signedReceipt();
  fixture.receipt.gate_id = "tampered";
  assert.equal(evaluateActivation({
    enabledFlag: "true",
    receipt: fixture.receipt,
    publicKey: fixture.publicKeyText,
    manifest,
    releaseDigest,
    policyDigest,
    now: new Date("2026-08-03T12:00:00Z"),
  }).active, false);
});

test("malformed public key or signature pauses instead of crashing", () => {
  const fixture = signedReceipt();
  assert.doesNotThrow(() => evaluateActivation({
    enabledFlag: "true",
    receipt: fixture.receipt,
    publicKey: "not-a-public-key",
    manifest,
    releaseDigest,
    policyDigest,
    now: new Date("2026-08-03T12:00:00Z"),
  }));
  const malformed = { ...fixture.receipt, signature: "invalid" };
  assert.equal(evaluateActivation({
    enabledFlag: "true",
    receipt: malformed,
    publicKey: fixture.publicKeyText,
    manifest,
    releaseDigest,
    policyDigest,
    now: new Date("2026-08-03T12:00:00Z"),
  }).active, false);
});

test("release, policy, and independent-auditor bindings are mandatory", () => {
  const fixture = signedReceipt();
  assert.equal(evaluateActivation({
    enabledFlag: "true",
    receipt: fixture.receipt,
    publicKey: fixture.publicKeyText,
    manifest,
    releaseDigest: "wrong-release",
    policyDigest,
    now: new Date("2026-08-03T12:00:00Z"),
  }).reason, "release_digest_mismatch");
  assert.equal(evaluateActivation({
    enabledFlag: "true",
    receipt: fixture.receipt,
    publicKey: fixture.publicKeyText,
    manifest,
    releaseDigest,
    policyDigest: "wrong-policy",
    now: new Date("2026-08-03T12:00:00Z"),
  }).reason, "policy_digest_mismatch");
  const selfApproved = signedReceipt({ auditor_id: "fixture-builder" });
  assert.equal(evaluateActivation({
    enabledFlag: "true",
    receipt: selfApproved.receipt,
    publicKey: selfApproved.publicKeyText,
    manifest,
    releaseDigest,
    policyDigest,
    now: new Date("2026-08-03T12:00:00Z"),
  }).reason, "self_approval_prohibited");
});
