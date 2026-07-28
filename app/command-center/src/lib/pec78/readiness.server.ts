import type { RuntimeEnv } from "@lib/runtime-env";
import { PEC78_CONTRACT_VERSION, pec78Mode } from "./contract";
import { pec78KeysSeparated } from "./auth.server";

export function getPec78Readiness(env: RuntimeEnv, store: Record<string, unknown> = {}) {
  const mode = pec78Mode(env.PEC78_ADAPTER_MODE);
  const configured = [
    { id: "adapter_shadow", ok: mode === "shadow", code: mode },
    { id: "production_gate", ok: Boolean(env.PEC78_PRODUCTION_GATE_DIGEST), code: env.PEC78_PRODUCTION_GATE_DIGEST ? "configured" : "missing" },
    { id: "maya_public_key", ok: Boolean(env.PEC78_MAYA_PUBLIC_JWK && env.PEC78_MAYA_JWK_THUMBPRINT), code: env.PEC78_MAYA_PUBLIC_JWK ? "configured" : "missing" },
    { id: "issuer_key_separation", ok: pec78KeysSeparated(env), code: pec78KeysSeparated(env) ? "verified" : "denied" },
    { id: "registry_version", ok: Boolean(env.PEC78_REGISTRY_VERSION), code: env.PEC78_REGISTRY_VERSION ? "configured" : "missing" },
  ];
  const storeKeys = ["principal_active", "credential_active", "capabilities_active", "destinations_active", "schedule_disabled", "gate_active", "budget_active", "no_kill_switch", "no_active_lease", "no_unreconciled_effect"];
  const checks = [...configured, ...storeKeys.map((id) => ({ id, ok: store[id] === true, code: store[id] === true ? "observed" : "denied" }))]
    .map((check) => ({ ...check, observedAt: new Date().toISOString() }));
  const status = mode === "disabled" ? "stopped" : checks.every((check) => check.ok) ? "ready" : "degraded";
  return { contractVersion: PEC78_CONTRACT_VERSION, status, observedAt: new Date().toISOString(), maxAgeSeconds: 60, checks, buildCommit: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? null, registryVersion: env.PEC78_REGISTRY_VERSION ?? null };
}

export function getPec78ComposioServerReadiness(env: RuntimeEnv, store: Record<string, unknown> = {}) {
  const keyBytes = (() => { try { return Buffer.from(env.PEC78_EVENT_ENCRYPTION_KEY ?? "", "base64").length; } catch { return 0; } })();
  const configured = [
    { id: "adapter_shadow", ok: pec78Mode(env.PEC78_ADAPTER_MODE) === "shadow", code: pec78Mode(env.PEC78_ADAPTER_MODE) },
    { id: "ingress_validation", ok: env.PEC78_COMPOSIO_INGRESS_MODE === "validation", code: env.PEC78_COMPOSIO_INGRESS_MODE ?? "disabled" },
    { id: "webhook_secret", ok: Boolean(env.PEC78_COMPOSIO_WEBHOOK_SECRET), code: env.PEC78_COMPOSIO_WEBHOOK_SECRET ? "configured" : "missing" },
    { id: "event_encryption", ok: keyBytes === 32 && Boolean(env.PEC78_EVENT_ENCRYPTION_KEY_VERSION), code: keyBytes === 32 ? "configured" : "denied" },
    { id: "trigger_bound", ok: /^ti_[A-Za-z0-9_-]{6,128}$/.test(env.PEC78_COMPOSIO_TRIGGER_ID ?? ""), code: env.PEC78_COMPOSIO_TRIGGER_ID ? "configured" : "missing" },
    { id: "connected_account", ok: env.PEC78_COMPOSIO_CONNECTED_ACCOUNT_ID === "ca_X9dQyRDSS0sa", code: env.PEC78_COMPOSIO_CONNECTED_ACCOUNT_ID ? "configured" : "missing" },
    { id: "composio_user", ok: env.PEC78_COMPOSIO_USER_ID === "maya-chen", code: env.PEC78_COMPOSIO_USER_ID ? "configured" : "missing" },
    { id: "issuer_key_separation", ok: pec78KeysSeparated(env), code: pec78KeysSeparated(env) ? "verified" : "denied" },
    { id: "registry_version", ok: Boolean(env.PEC78_REGISTRY_VERSION), code: env.PEC78_REGISTRY_VERSION ? "configured" : "missing" },
    { id: "runtime_instance", ok: /^[0-9a-f-]{36}$/i.test(env.PEC78_RUNTIME_INSTANCE_ID ?? ""), code: env.PEC78_RUNTIME_INSTANCE_ID ? "configured" : "missing" },
  ];
  const observed = [
    ["database_ready", store.ok === true], ["authority_tuple_ready", store.authority_tuple_ready === true],
    ["principal_active", store.principal_active === true], ["source_bound", store.source_bound === true],
    ["source_active", store.source_active === true], ["receive_capability_active", store.receive_capability_active === true],
    ["send_capability_active", store.send_capability_active === true], ["validation_authorization_active", store.validation_authorization_active === true],
    ["credential_active", store.credential_active === true], ["destination_active", store.destination_active === true],
    ["gate_active", store.gate_active === true], ["budget_active", store.budget_active === true],
    ["activation_binding_exact", store.activation_binding_exact === true], ["migration_current", store.migration_current === true],
    ["no_kill_switch", store.no_kill_switch === true], ["receipt_chain_healthy", store.receipt_chain_healthy === true],
    ["no_active_event_lease", store.active_event_leases === 0], ["no_unknown_effect", store.unknown_effects === 0],
    ["queue_empty_before_activation", store.pending_events === 0],
  ].map(([id, ok]) => ({ id: String(id), ok: ok === true, code: ok === true ? "observed" : "denied" }));
  const checks = [...configured, ...observed].map((check) => ({ ...check, observedAt: new Date().toISOString() }));
  return {
    contractVersion: PEC78_CONTRACT_VERSION,
    readinessVersion: "pec78-composio-server-readiness-v1",
    status: checks.every((check) => check.ok) ? "server_ready" : "degraded",
    observedAt: new Date().toISOString(), maxAgeSeconds: 60, checks,
    buildCommit: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? null,
    registryVersion: env.PEC78_REGISTRY_VERSION ?? null,
    note: "Orgo worker and Composio trigger state require separate live operator evidence.",
  };
}
