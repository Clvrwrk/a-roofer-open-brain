import fs from "node:fs";

const PERSONA_ORDER = ["maya-chen", "alex-rivers", "casey-morgan", "jordan-price", "sam-torres", "rowan-vale", "lena-brooks"];
const ALL_PERSONAS = [...PERSONA_ORDER, "ops-conductor"];
const SERVICE_ROLES = Object.freeze({
  "maya-chen": "ob-accounting", "alex-rivers": "ob-accounting", "casey-morgan": "ob-accounting",
  "jordan-price": "ob-accounting", "sam-torres": "ob-conductor", "rowan-vale": "ob-researcher",
  "lena-brooks": "ob-marketing", "ops-conductor": "ob-conductor"
});
const STATES = ["planned", "inventory-only", "verified", "authorized", "suspended", "revoked"];
const TRANSITIONS = Object.freeze({
  planned: ["inventory-only", "revoked"],
  "inventory-only": ["verified", "revoked"],
  verified: ["authorized", "inventory-only", "revoked"],
  authorized: ["suspended", "revoked"],
  suspended: ["authorized", "revoked"],
  revoked: []
});
const CLAIM_KEYS = ["persona_id", "google_email", "google_customer_id", "google_subject_id", "google_credential_ref", "slack_team_id", "slack_app_id", "slack_bot_user_id", "slack_installation_id", "slack_token_fingerprint", "command_center_subject", "runtime_owner_id", "runtime_instance_id", "runtime_credential_ref", "orgo_workspace_id", "orgo_computer_id"];
const STATUS = Object.freeze({
  google: ["profile-declared-unverified", "operator-confirmed-authenticated", "verified"],
  slack: ["profile-declared-live-unverified", "verified"],
  orgo: ["planned", "observed-live", "verified", "not-authorized"],
  runtime: ["planned", "planned-unverified", "verified", "not-authorized"]
});
const BASE_CAPABILITIES = ["mailbox.read", "mailbox.classify", "command_center.record_decision", "slack.send.christopher", "email.send.admin"];
const CAPABILITIES = Object.freeze(Object.fromEntries(PERSONA_ORDER.map((id) => [id, [...BASE_CAPABILITIES]])));
CAPABILITIES["rowan-vale"].splice(2, 0, "external.research.propose");
CAPABILITIES["lena-brooks"].splice(2, 0, "marketing.draft");
const FORBIDDEN_PREFIXES = ["admin.", "approval.", "billing.", "dns.", "payment.", "publish.", "external.send."];
const REQUIRED_BINDINGS = [
  ["google", "customer_id"], ["google", "subject_id"], ["google", "credential_ref"],
  ["slack", "team_id"], ["slack", "app_id"], ["slack", "bot_user_id"], ["slack", "installation_id"], ["slack", "token_fingerprint"],
  ["orgo", "workspace_id"], ["orgo", "computer_id"], ["runtime", "instance_id"], ["runtime", "credential_ref"]
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const unique = (items, label, { allowNull = false } = {}) => {
  const values = allowNull ? items.filter((v) => v != null) : items;
  if (values.length !== new Set(values).size) throw new Error(`duplicate_${label}`);
};
const exactKeys = (object, expected, label) => {
  if (!object || typeof object !== "object" || Array.isArray(object) || !same(Object.keys(object).sort(), [...expected].sort())) throw new Error(`${label}_schema_mismatch`);
};
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

export function validateRegistry(registry) {
  if (registry.schema_version !== 1) throw new Error("unsupported_schema_version");
  if (registry.shared_token_fallback_allowed !== false) throw new Error("shared_token_fallback_must_be_false");
  if (registry.unknown_principal_policy !== "deny") throw new Error("unknown_principal_must_deny");
  if (!same(registry.effect_authorization, { adapter_id: "pec78-runtime-authorization-v1", status: "not-installed", default_policy: "deny" })) throw new Error("effect_authorization_fence_mismatch");
  if (!same(registry.authorization_states, STATES)) throw new Error("authorization_states_mismatch");
  if (!same(registry.activation_order, PERSONA_ORDER)) throw new Error("activation_order_mismatch");
  if (!Array.isArray(registry.principals) || !same(registry.principals.map((p) => p.persona_id), ALL_PERSONAS)) throw new Error("principal_roster_mismatch");

  for (const [path, label, allowNull] of [
    [["persona_id"], "persona_id", false], [["google", "primary_email"], "google_email", false], [["google", "subject_id"], "google_subject_id", true],
    [["google", "credential_ref"], "google_credential_ref", true], [["slack", "app_id"], "slack_app_id", false], [["slack", "bot_user_id"], "slack_bot_user_id", true],
    [["slack", "installation_id"], "slack_installation_id", true], [["slack", "token_env_key"], "slack_token_env_key", false], [["slack", "token_fingerprint"], "slack_token_fingerprint", true],
    [["command_center", "subject"], "command_center_subject", false], [["runtime", "owner_id"], "runtime_owner_id", false], [["runtime", "instance_id"], "runtime_instance_id", true],
    [["runtime", "credential_ref"], "runtime_credential_ref", true], [["orgo", "workspace_name"], "orgo_workspace_name", true], [["orgo", "workspace_id"], "orgo_workspace_id", true], [["orgo", "computer_id"], "orgo_computer_id", true]
  ]) unique(registry.principals.map((p) => path.reduce((v, k) => v[k], p)), label, { allowNull });

  for (const p of registry.principals) {
    for (const key of ["persona_id", "display_name", "role", "activation_scope", "lifecycle", "allowed_capabilities", "google", "slack", "command_center", "orgo", "runtime"]) if (!(key in p)) throw new Error(`missing_${key}`);
    const expectedScope = p.persona_id === "ops-conductor" ? "control-plane-only" : "named-agent";
    if (p.activation_scope !== expectedScope) throw new Error("activation_scope_mismatch");
    if (p.command_center.service_role !== SERVICE_ROLES[p.persona_id]) throw new Error("service_role_mismatch");
    const expectedCapabilities = p.persona_id === "ops-conductor" ? [] : CAPABILITIES[p.persona_id];
    if (!same(p.allowed_capabilities, expectedCapabilities)) throw new Error("capability_allowlist_mismatch");
    if (p.allowed_capabilities.some((capability) => FORBIDDEN_PREFIXES.some((prefix) => capability.startsWith(prefix)))) throw new Error("forbidden_capability_class");
    if (!STATES.includes(p.lifecycle.state)) throw new Error("invalid_authorization_state");
    const position = PERSONA_ORDER.indexOf(p.persona_id);
    const expectedPredecessor = position > 0 ? PERSONA_ORDER[position - 1] : null;
    if (p.lifecycle.predecessor_persona_id !== expectedPredecessor) throw new Error("rollout_predecessor_mismatch");
    if (p.lifecycle.state !== "planned" && position > 0 && !p.lifecycle.predecessor_receipt_id) throw new Error("rollout_predecessor_receipt_required");
    for (const group of ["google", "slack", "orgo", "runtime"]) if (!STATUS[group].includes(p[group].status)) throw new Error(`invalid_${group}_status`);
    if (p.google.primary_email !== `${p.persona_id.replaceAll("-", ".")}@${registry.workspace_domain}` && p.persona_id !== "ops-conductor") throw new Error("email_persona_mismatch");
    if (p.persona_id === "ops-conductor" && p.google.primary_email !== `ops-conductor@${registry.workspace_domain}`) throw new Error("email_persona_mismatch");
    if (p.slack.team_id !== "T0B8QEGPVQW") throw new Error("slack_team_mismatch");
    if (!p.slack.status.includes("unverified")) throw new Error("slack_live_status_must_remain_unverified");
    if (p.command_center.subject !== `named-agent:${p.persona_id}`) throw new Error("command_center_subject_mismatch");
    if (p.runtime.owner_id !== `runtime:${p.persona_id}`) throw new Error("runtime_owner_mismatch");
    if (expectedScope === "named-agent") {
      if (!p.orgo.workspace_name || !p.orgo.computer_name) throw new Error("named_agent_requires_orgo_targets");
      if (p.runtime.credential_scope !== "persona-only") throw new Error("named_agent_requires_persona_credentials");
    } else if (p.orgo.workspace_id || p.orgo.workspace_name || p.orgo.computer_id || p.orgo.computer_name || p.runtime.instance_id || p.runtime.hermes_home || p.runtime.credential_ref || p.runtime.credential_scope !== "control-plane-only" || p.lifecycle.state !== "revoked") {
      throw new Error("ops_conductor_must_remain_fenced");
    }
    if (p.lifecycle.state === "authorized") {
      if (!p.lifecycle.evidence_receipt_id || !p.lifecycle.human_approval_id) throw new Error("authorized_requires_receipts");
      for (const [group, key] of REQUIRED_BINDINGS) if (!p[group][key]) throw new Error(`authorized_requires_${group}_${key}`);
      for (const group of ["google", "slack", "orgo", "runtime"]) if (p[group].status !== "verified") throw new Error(`authorized_requires_verified_${group}`);
      if (registry.effect_authorization.status !== "installed") throw new Error("authorization_adapter_not_installed");
    }
  }

  return registry;
}

export function assertLifecycleTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to)) throw new Error("invalid_authorization_state");
  if (!TRANSITIONS[from].includes(to)) throw new Error(`illegal_lifecycle_transition:${from}->${to}`);
  return true;
}

export function claimForPrincipal(principal) {
  return {
    persona_id: principal.persona_id,
    google_email: principal.google.primary_email,
    google_customer_id: principal.google.customer_id,
    google_subject_id: principal.google.subject_id,
    google_credential_ref: principal.google.credential_ref,
    slack_team_id: principal.slack.team_id,
    slack_app_id: principal.slack.app_id,
    slack_bot_user_id: principal.slack.bot_user_id,
    slack_installation_id: principal.slack.installation_id,
    slack_token_fingerprint: principal.slack.token_fingerprint,
    command_center_subject: principal.command_center.subject,
    runtime_owner_id: principal.runtime.owner_id,
    runtime_instance_id: principal.runtime.instance_id,
    runtime_credential_ref: principal.runtime.credential_ref,
    orgo_workspace_id: principal.orgo.workspace_id,
    orgo_computer_id: principal.orgo.computer_id
  };
}

export function resolveIdentity(registry, claim) {
  validateRegistry(registry);
  exactKeys(claim, CLAIM_KEYS, "claim");
  const principal = registry.principals.find((item) => item.persona_id === claim.persona_id);
  if (!principal) throw new Error("unknown_principal");
  const expected = claimForPrincipal(principal);
  for (const key of CLAIM_KEYS) {
    if ((key === "orgo_workspace_id" || key === "orgo_computer_id") && expected[key] == null && claim[key] != null) throw new Error("orgo_resource_unbound");
    if (claim[key] !== expected[key]) throw new Error(`${key}_mismatch`);
  }
  return deepFreeze(structuredClone(principal));
}

export function authorizeOperation(registry, claim, operation) {
  const principal = resolveIdentity(registry, claim);
  if (!operation || typeof operation !== "object" || typeof operation.capability !== "string") throw new Error("operation_schema_mismatch");
  if (principal.persona_id === "rowan-vale" && operation.capability.startsWith("internal.")) throw new Error("rowan_external_only");
  if (principal.persona_id === "sam-torres" && operation.capability === "trust_tier.write") throw new Error("sam_trust_tier_forbidden");
  if (!principal.allowed_capabilities.includes(operation.capability)) throw new Error("capability_forbidden");
  if (registry.effect_authorization.status !== "installed") throw new Error("authorization_adapter_not_installed");
  if (principal.lifecycle.state !== "authorized") throw new Error(`principal_not_authorized:${principal.lifecycle.state}`);
  if (operation.human_approval_id !== principal.lifecycle.human_approval_id) throw new Error("operation_approval_mismatch");
  return { authorized: true, persona_id: principal.persona_id, capability: operation.capability };
}

export function assertVerificationPredecessor(registry, personaId, trustedCompletedReceipt) {
  validateRegistry(registry);
  const position = PERSONA_ORDER.indexOf(personaId);
  if (position < 0) throw new Error("unknown_principal");
  if (position === 0) return true;
  const predecessor = registry.principals[position - 1];
  if (predecessor.lifecycle.state !== "authorized" || !predecessor.lifecycle.evidence_receipt_id) throw new Error("rollout_predecessor_incomplete");
  if (!trustedCompletedReceipt || trustedCompletedReceipt.persona_id !== predecessor.persona_id || trustedCompletedReceipt.receipt_id !== predecessor.lifecycle.evidence_receipt_id || trustedCompletedReceipt.verdict !== "PASS" || trustedCompletedReceipt.clean_days !== 3) throw new Error("rollout_predecessor_receipt_invalid");
  return true;
}

export const resolvePrincipal = resolveIdentity;

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2] ?? new URL("./named-agent-principals.json", import.meta.url);
  validateRegistry(JSON.parse(fs.readFileSync(path, "utf8")));
  console.log("named-agent principal registry valid");
}
