import { verify } from "node:crypto";
import { canonicalJson, sha256 } from "./atomic-json.mjs";

const REQUIRED = [
  "schema", "enabled", "issue_id", "gate_id", "approval_id", "builder_id", "auditor_id",
  "agent_id", "client_id", "runtime_version", "release_digest", "policy_digest",
  "not_before", "expires_at", "public_key_fingerprint", "signature",
];

export function activationPayload(receipt) {
  const { signature: _signature, ...payload } = receipt;
  return payload;
}

export function evaluateActivation({ enabledFlag, receipt, publicKey, manifest, releaseDigest, policyDigest, now = new Date() }) {
  if (String(enabledFlag).toLowerCase() !== "true") return { active: false, reason: "environment_disabled" };
  if (!receipt || !publicKey) return { active: false, reason: "activation_material_missing" };
  if (REQUIRED.some((field) => receipt[field] === undefined || receipt[field] === null || receipt[field] === "")) {
    return { active: false, reason: "activation_receipt_incomplete" };
  }
  if (receipt.schema !== 1 || receipt.enabled !== true) return { active: false, reason: "activation_receipt_disabled" };
  if (receipt.agent_id !== manifest.identity.persona_id) return { active: false, reason: "agent_binding_mismatch" };
  if (receipt.client_id !== manifest.memory.required_client_id) return { active: false, reason: "client_binding_mismatch" };
  if (receipt.runtime_version !== manifest.runtime_version) return { active: false, reason: "runtime_version_mismatch" };
  if (receipt.builder_id === receipt.auditor_id) return { active: false, reason: "self_approval_prohibited" };
  if (!releaseDigest || receipt.release_digest !== releaseDigest) return { active: false, reason: "release_digest_mismatch" };
  if (!policyDigest || receipt.policy_digest !== policyDigest) return { active: false, reason: "policy_digest_mismatch" };
  if (!/^CAT-\d+$/u.test(receipt.issue_id)) return { active: false, reason: "tracker_issue_invalid" };
  const current = now.getTime();
  const notBefore = Date.parse(receipt.not_before);
  const expiresAt = Date.parse(receipt.expires_at);
  if (!Number.isFinite(notBefore) || !Number.isFinite(expiresAt) || current < notBefore || current >= expiresAt) {
    return { active: false, reason: "activation_window_invalid" };
  }
  if (sha256(publicKey) !== receipt.public_key_fingerprint) {
    return { active: false, reason: "public_key_fingerprint_mismatch" };
  }
  let signature;
  try {
    signature = Buffer.from(receipt.signature, "base64");
    if (signature.length !== 64) throw new Error("signature length invalid");
  } catch {
    return { active: false, reason: "activation_signature_invalid" };
  }
  let valid = false;
  try {
    valid = verify(null, Buffer.from(canonicalJson(activationPayload(receipt))), publicKey, signature);
  } catch {
    return { active: false, reason: "activation_signature_invalid" };
  }
  return valid
    ? { active: true, reason: "signed_activation_verified", gateId: receipt.gate_id, issueId: receipt.issue_id }
    : { active: false, reason: "activation_signature_invalid" };
}
