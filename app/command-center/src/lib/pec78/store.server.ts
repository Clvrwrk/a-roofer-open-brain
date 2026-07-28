import { createHash } from "node:crypto";
import { createServerSupabaseClient } from "@lib/supabase.server";
import type { RuntimeEnv } from "@lib/runtime-env";

export const PEC78_SLACK_DESTINATION = "C0BD7L43PC2";
export const PEC78_EMAIL_DESTINATION = "admin@cc.proexteriorsus.net";

export function hashClaim(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function rpc(env: RuntimeEnv, name: string, args: Record<string, unknown>) {
  const { client } = createServerSupabaseClient(env);
  if (!client) return { ok: false, code: "authorization_state_unavailable" };
  const { data, error } = await client.rpc(name, args);
  if (error || !data || typeof data !== "object") return { ok: false, code: "authorization_state_unavailable" };
  return data as Record<string, unknown>;
}

export function destinationFor(capability: string): string | null {
  if (capability === "slack.send.christopher") return PEC78_SLACK_DESTINATION;
  if (capability === "email.send.admin") return PEC78_EMAIL_DESTINATION;
  return null;
}

export async function authorizeToken(env: RuntimeEnv, input: {
  credentialId: string; runtimeInstanceId: string; capability: string; proofJti: string;
}) {
  return rpc(env, "pec78_authorize_token", {
    p_credential_id: input.credentialId,
    p_runtime_instance_id: input.runtimeInstanceId,
    p_capability: input.capability,
    p_proof_jti_hash: hashClaim(input.proofJti),
    p_expires_at: new Date(Date.now() + 120_000).toISOString(),
  });
}

export async function authorizeRequest(env: RuntimeEnv, input: {
  credentialId: string; runtimeInstanceId: string; capability: string; accessJti: string; proofJti: string;
  routeId: string; idempotencyKey: string; requestDigest: string;
}) {
  return rpc(env, "pec78_authorize_request", {
    p_credential_id: input.credentialId,
    p_runtime_instance_id: input.runtimeInstanceId,
    p_capability: input.capability,
    p_access_jti_hash: hashClaim(input.accessJti),
    p_proof_jti_hash: hashClaim(input.proofJti),
    p_replay_expires_at: new Date(Date.now() + 180_000).toISOString(),
    p_route_id: input.routeId,
    p_idempotency_key: input.idempotencyKey,
    p_request_digest: input.requestDigest,
    p_destination_ref: destinationFor(input.capability),
  });
}

export async function reserveEffect(env: RuntimeEnv, input: {
  credentialId: string; runtimeInstanceId: string; capability: string; idempotencyKey: string;
  requestDigest: string; intentDigest: string; payloadDigest: string; modelRouteId: string; traceId: string;
}) {
  return rpc(env, "pec78_reserve_shadow_effect", {
    p_credential_id: input.credentialId,
    p_runtime_instance_id: input.runtimeInstanceId,
    p_capability: input.capability,
    p_idempotency_key: input.idempotencyKey,
    p_request_digest: input.requestDigest,
    p_intent_digest: input.intentDigest,
    p_payload_digest: input.payloadDigest,
    p_destination_ref: destinationFor(input.capability),
    p_model_route_id: input.modelRouteId,
    p_trace_id: input.traceId,
    p_build_version: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? "unknown",
  });
}

export async function reconcileEffect(env: RuntimeEnv, input: {
  effectId: string; providerMessageId: string | null; outcome: "succeeded" | "unknown" | "failed"; traceId: string;
}) {
  return rpc(env, "pec78_reconcile_shadow_effect", {
    p_effect_id: input.effectId,
    p_provider_message_id: input.providerMessageId,
    p_outcome: input.outcome,
    p_trace_id: input.traceId,
    p_build_version: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? "unknown",
  });
}

export async function getShadowStoreReadiness(env: RuntimeEnv) {
  return rpc(env, "pec78_shadow_readiness", {});
}

export async function ingestComposioSlackEvent(env: RuntimeEnv, input: {
  providerEventId: string; deliveryDigest: string; messageDigest: string; payloadDigest: string;
  channelDigest: string; threadDigest: string;
  triggerId: string; connectedAccountId: string; composioUserId: string; teamId: string;
  channelId: string; ownerUserId: string; occurredAt: string; algorithm: string; keyVersion: string;
  nonce: string; authTag: string; ciphertext: string; validationMode: boolean; traceId: string;
}) {
  return rpc(env, "pec78_ingest_composio_slack_event_v2", {
    p_provider_event_id: input.providerEventId, p_delivery_digest: input.deliveryDigest,
    p_message_digest: input.messageDigest, p_payload_digest: input.payloadDigest,
    p_channel_digest: input.channelDigest, p_thread_digest: input.threadDigest,
    p_trigger_id: input.triggerId, p_connected_account_id: input.connectedAccountId,
    p_composio_user_id: input.composioUserId, p_team_id: input.teamId, p_channel_id: input.channelId,
    p_owner_user_id: input.ownerUserId, p_occurred_at: input.occurredAt,
    p_encryption_algorithm: input.algorithm, p_encryption_key_version: input.keyVersion,
    p_nonce: input.nonce, p_auth_tag: input.authTag, p_ciphertext: input.ciphertext,
    p_validation_mode: input.validationMode,
    p_runtime_instance_id: env.PEC78_RUNTIME_INSTANCE_ID,
    p_registry_version: env.PEC78_REGISTRY_VERSION,
    p_trace_id: input.traceId,
    p_build_version: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? "unknown",
  });
}

export async function claimComposioSlackEvent(env: RuntimeEnv, input: {
  credentialId: string; runtimeInstanceId: string; traceId: string;
}) {
  return rpc(env, "pec78_claim_composio_slack_event", {
    p_credential_id: input.credentialId, p_runtime_instance_id: input.runtimeInstanceId,
    p_trace_id: input.traceId, p_build_version: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? "unknown",
  });
}

export async function completeComposioSlackEvent(env: RuntimeEnv, input: {
  credentialId: string; runtimeInstanceId: string; eventId: string; leaseId: string; leaseEpoch: number;
  outcome: "completed" | "quarantined"; code: string; traceId: string;
}) {
  return rpc(env, "pec78_complete_composio_slack_event", {
    p_credential_id: input.credentialId, p_runtime_instance_id: input.runtimeInstanceId,
    p_event_id: input.eventId, p_lease_id: input.leaseId, p_lease_epoch: input.leaseEpoch,
    p_outcome: input.outcome, p_code: input.code, p_trace_id: input.traceId,
    p_build_version: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? "unknown",
  });
}

export async function reserveComposioSlackEffect(env: RuntimeEnv, input: {
  credentialId: string; runtimeInstanceId: string; eventId: string; leaseId: string; leaseEpoch: number;
  channelDigest: string; threadDigest: string; payloadDigest: string; modelRouteId: string;
  idempotencyKey: string; traceId: string;
}) {
  return rpc(env, "pec78_reserve_composio_slack_effect", {
    p_credential_id: input.credentialId, p_runtime_instance_id: input.runtimeInstanceId,
    p_event_id: input.eventId, p_lease_id: input.leaseId, p_lease_epoch: input.leaseEpoch,
    p_channel_digest: input.channelDigest, p_thread_digest: input.threadDigest,
    p_payload_digest: input.payloadDigest, p_model_route_id: input.modelRouteId,
    p_idempotency_key: input.idempotencyKey, p_trace_id: input.traceId,
    p_build_version: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? "unknown",
  });
}

export async function markComposioSlackEffectExecuting(env: RuntimeEnv, input: {
  credentialId: string; runtimeInstanceId: string; effectId: string; leaseId: string; leaseEpoch: number; traceId: string;
}) {
  return rpc(env, "pec78_mark_composio_slack_effect_executing", {
    p_credential_id: input.credentialId, p_runtime_instance_id: input.runtimeInstanceId,
    p_effect_id: input.effectId, p_lease_id: input.leaseId, p_lease_epoch: input.leaseEpoch,
    p_trace_id: input.traceId, p_build_version: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? "unknown",
  });
}

export async function reconcileComposioSlackEffect(env: RuntimeEnv, input: {
  credentialId: string; runtimeInstanceId: string; effectId: string; leaseId: string; leaseEpoch: number;
  outcome: "succeeded" | "unknown" | "failed"; providerMessageId: string | null; traceId: string;
}) {
  return rpc(env, "pec78_reconcile_composio_slack_effect", {
    p_credential_id: input.credentialId, p_runtime_instance_id: input.runtimeInstanceId,
    p_effect_id: input.effectId, p_lease_id: input.leaseId, p_lease_epoch: input.leaseEpoch,
    p_outcome: input.outcome, p_provider_message_id: input.providerMessageId,
    p_trace_id: input.traceId, p_build_version: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? "unknown",
  });
}

export async function getComposioProductionReadiness(env: RuntimeEnv) {
  return rpc(env, "pec78_composio_production_readiness", {
    p_runtime_instance_id: env.PEC78_RUNTIME_INSTANCE_ID,
    p_registry_version: env.PEC78_REGISTRY_VERSION,
    p_build_version: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? "unknown",
    p_trigger_id: env.PEC78_COMPOSIO_TRIGGER_ID,
  });
}

export async function rollbackComposioRuntime(env: RuntimeEnv, input: {
  reason: string; traceId: string;
}) {
  return rpc(env, "pec78_rollback_composio_runtime", {
    p_actor_subject: "operator:christopher",
    p_reason: input.reason,
    p_trace_id: input.traceId,
    p_build_version: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? "unknown",
  });
}
