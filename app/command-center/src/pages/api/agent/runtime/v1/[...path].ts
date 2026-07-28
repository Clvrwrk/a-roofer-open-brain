import { createHash, timingSafeEqual } from "node:crypto";
import type { APIRoute } from "astro";
import { getRuntimeEnv } from "@lib/runtime-env";
import { PEC78_CAPABILITIES, pec78Json, pec78Mode, sha256Digest } from "@lib/pec78/contract";
import { issuePec78AccessToken, verifyPec78Request, verifyPec78TokenProof } from "@lib/pec78/auth.server";
import { getPec78ComposioServerReadiness, getPec78Readiness } from "@lib/pec78/readiness.server";
import { authorizeRequest, authorizeToken, destinationFor, getShadowStoreReadiness, reserveEffect } from "@lib/pec78/store.server";
import {
  claimComposioSlackEvent,
  completeComposioSlackEvent,
  markComposioSlackEffectExecuting,
  reconcileComposioSlackEffect,
  reserveComposioSlackEffect,
  getComposioProductionReadiness,
  rollbackComposioRuntime,
} from "@lib/pec78/store.server";
import { decryptPec78SlackEvent } from "@lib/pec78/composio-webhook.server";

export const prerender = false;

function bearerAuthorized(request: Request, expectedDigest: string | undefined): boolean {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || !expectedDigest?.startsWith("sha256:")) return false;
  const actual = `sha256:${createHash("sha256").update(token).digest("hex")}`;
  const a = Buffer.from(actual); const b = Buffer.from(expectedDigest);
  return a.length === b.length && timingSafeEqual(a, b);
}

const handle: APIRoute = async ({ request, url }) => {
  const env = getRuntimeEnv();
  if (request.method === "GET" && url.pathname === "/api/agent/runtime/v1/readiness") {
    if (!bearerAuthorized(request, env.PEC78_READINESS_TOKEN_SHA256)) return pec78Json(401, "authentication_required");
    const report = env.PEC78_COMPOSIO_INGRESS_MODE === "validation" || env.PEC78_COMPOSIO_INGRESS_MODE === "enabled"
      ? getPec78ComposioServerReadiness(env, await getComposioProductionReadiness(env))
      : getPec78Readiness(env, await getShadowStoreReadiness(env));
    return new Response(JSON.stringify(report), { status: report.status === "ready" || report.status === "server_ready" ? 200 : 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (request.method === "POST" && url.pathname === "/api/agent/runtime/v1/operator/rollback") {
    if (!bearerAuthorized(request, env.PEC78_ROLLBACK_TOKEN_SHA256)) return pec78Json(401, "authentication_required");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).some((key) => key !== "reason") || typeof body.reason !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9 _.,:;()/-]{2,499}$/.test(body.reason)) return pec78Json(422, "invalid_request");
    const traceId = crypto.randomUUID();
    const rolledBack = await rollbackComposioRuntime(env, { reason: body.reason, traceId });
    if (!rolledBack.ok) return pec78Json(503, String(rolledBack.code ?? "rollback_denied"), traceId);
    return new Response(JSON.stringify({ contractVersion: "pec78-runtime-authorization-v1", traceId, status: "fenced", fenceEpoch: rolledBack.fence_epoch, reconciliationRequired: rolledBack.reconciliation_required === true }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (pec78Mode(env.PEC78_ADAPTER_MODE) === "disabled") return pec78Json(423, "adapter_stopped");
  if (request.method === "POST" && url.pathname === "/api/agent/runtime/v1/token") {
    const proof = await verifyPec78TokenProof(request, env);
    if (!proof.ok) return pec78Json(proof.status, proof.code);
    const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).some((key) => !["capability", "credentialId", "runtimeInstanceId"].includes(key)) ||
        typeof body.capability !== "string" || !PEC78_CAPABILITIES.has(body.capability as never) ||
        typeof body.credentialId !== "string" || typeof body.runtimeInstanceId !== "string") return pec78Json(422, "invalid_request");
    const state = await authorizeToken(env, { credentialId: body.credentialId, runtimeInstanceId: body.runtimeInstanceId, capability: body.capability, proofJti: proof.proofJti });
    if (!state.ok) return pec78Json(state.code === "replay_denied" ? 409 : 403, String(state.code ?? "authority_denied"));
    try {
      const accessToken = issuePec78AccessToken({ env, capability: body.capability, credentialId: body.credentialId, runtimeInstanceId: body.runtimeInstanceId, proofThumbprint: proof.proofThumbprint });
      return new Response(JSON.stringify({ contractVersion: "pec78-runtime-authorization-v1", tokenType: "DPoP", accessToken, expiresIn: 120 }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    } catch { return pec78Json(503, "issuer_unavailable"); }
  }
  const result = await verifyPec78Request(request, env);
  if (!result.ok) return pec78Json(result.status, result.code);
  const bodyText = await request.clone().text();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!idempotencyKey || idempotencyKey.length > 128) return pec78Json(422, "idempotency_required");
  const requestState = await authorizeRequest(env, {
    credentialId: result.identity.credentialId, runtimeInstanceId: result.identity.runtimeInstanceId,
    capability: result.identity.capability, accessJti: result.identity.accessJti, proofJti: result.identity.proofJti,
    routeId: `${request.method} ${url.pathname}`, idempotencyKey, requestDigest: sha256Digest(bodyText),
  });
  if (!requestState.ok) return pec78Json(requestState.code === "replay_denied" || requestState.code === "idempotency_conflict" ? 409 : 403, String(requestState.code ?? "authority_denied"));
  if (requestState.replayed === true) return pec78Json(409, "request_already_processed");
  let body: Record<string, unknown>;
  try { body = JSON.parse(bodyText) as Record<string, unknown>; }
  catch { return pec78Json(422, "invalid_request"); }
  const traceId = crypto.randomUUID();

  if (url.pathname.endsWith("/events/slack/claim")) {
    if (Object.keys(body).length !== 0) return pec78Json(422, "invalid_request", traceId);
    const claimed = await claimComposioSlackEvent(env, {
      credentialId: result.identity.credentialId,
      runtimeInstanceId: result.identity.runtimeInstanceId,
      traceId,
    });
    if (!claimed.ok) return pec78Json(403, String(claimed.code ?? "claim_denied"), traceId);
    if (claimed.empty === true) return new Response(JSON.stringify({ contractVersion: "pec78-runtime-authorization-v1", traceId, status: "empty" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    try {
      const payload = decryptPec78SlackEvent({
        algorithm: claimed.encryption_algorithm,
        keyVersion: claimed.encryption_key_version,
        nonce: claimed.nonce,
        authTag: claimed.auth_tag,
        ciphertext: claimed.ciphertext,
        providerEventId: claimed.provider_event_id,
        payloadDigest: claimed.payload_digest,
      } as never, env);
      const channelId = String(payload.channelId ?? "");
      const threadTs = String(payload.threadTs ?? "");
      if (sha256Digest(channelId) !== claimed.channel_digest || sha256Digest(`${channelId}|${threadTs}`) !== claimed.thread_digest) {
        return pec78Json(503, "event_binding_mismatch", traceId);
      }
      return new Response(JSON.stringify({
        contractVersion: "pec78-runtime-authorization-v1", traceId, status: "claimed",
        eventId: claimed.event_id, leaseId: claimed.lease_id, leaseEpoch: claimed.lease_epoch,
        leaseExpiresAt: claimed.lease_expires_at, payload,
      }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    } catch { return pec78Json(503, "event_decryption_denied", traceId); }
  }

  if (url.pathname.endsWith("/events/slack/complete")) {
    const allowed = ["eventId", "leaseId", "leaseEpoch", "outcome", "code"];
    if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.eventId !== "string" || typeof body.leaseId !== "string" ||
        typeof body.leaseEpoch !== "number" || !Number.isSafeInteger(body.leaseEpoch) || !["completed", "quarantined"].includes(String(body.outcome)) ||
        typeof body.code !== "string" || !/^[a-z0-9_]{1,80}$/.test(body.code)) return pec78Json(422, "invalid_request", traceId);
    const completed = await completeComposioSlackEvent(env, {
      credentialId: result.identity.credentialId, runtimeInstanceId: result.identity.runtimeInstanceId,
      eventId: body.eventId, leaseId: body.leaseId, leaseEpoch: Number(body.leaseEpoch),
      outcome: body.outcome as "completed" | "quarantined", code: body.code, traceId,
    });
    if (!completed.ok) return pec78Json(403, String(completed.code ?? "completion_denied"), traceId);
    return new Response(JSON.stringify({ contractVersion: "pec78-runtime-authorization-v1", traceId, status: completed.state, replayed: completed.replayed === true }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }

  if (url.pathname.endsWith("/effects/slack/reserve")) {
    const allowed = ["eventId", "leaseId", "leaseEpoch", "channelId", "threadTs", "text", "modelRouteId"];
    if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.eventId !== "string" || typeof body.leaseId !== "string" ||
        typeof body.leaseEpoch !== "number" || !Number.isSafeInteger(body.leaseEpoch) || body.channelId !== "C0BD7L43PC2" || typeof body.threadTs !== "string" ||
        !/^\d{10}\.\d{6}$/.test(body.threadTs) || typeof body.text !== "string" || !body.text.startsWith("[NA-5][MAYA] - ") ||
        body.text.length > 1_500 || body.modelRouteId !== "google/gemini-3.1-flash-lite") return pec78Json(422, "production_payload_denied", traceId);
    const reserved = await reserveComposioSlackEffect(env, {
      credentialId: result.identity.credentialId, runtimeInstanceId: result.identity.runtimeInstanceId,
      eventId: body.eventId, leaseId: body.leaseId, leaseEpoch: Number(body.leaseEpoch),
      channelDigest: sha256Digest(body.channelId), threadDigest: sha256Digest(`${body.channelId}|${body.threadTs}`),
      payloadDigest: sha256Digest(body.text), modelRouteId: body.modelRouteId,
      idempotencyKey, traceId,
    });
    if (!reserved.ok) return pec78Json(403, String(reserved.code ?? "effect_denied"), traceId);
    return new Response(JSON.stringify({ contractVersion: "pec78-runtime-authorization-v1", traceId, status: reserved.state, effectId: reserved.effect_id, expiresAt: reserved.expires_at, replayed: reserved.replayed === true }), { status: 201, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }

  if (url.pathname.endsWith("/effects/slack/executing")) {
    const allowed = ["effectId", "leaseId", "leaseEpoch"];
    if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.effectId !== "string" || typeof body.leaseId !== "string" || typeof body.leaseEpoch !== "number" || !Number.isSafeInteger(body.leaseEpoch)) return pec78Json(422, "invalid_request", traceId);
    const executing = await markComposioSlackEffectExecuting(env, { credentialId: result.identity.credentialId, runtimeInstanceId: result.identity.runtimeInstanceId, effectId: body.effectId, leaseId: body.leaseId, leaseEpoch: Number(body.leaseEpoch), traceId });
    if (!executing.ok) return pec78Json(executing.code === "effect_execution_ambiguous" ? 409 : 403, String(executing.code ?? "effect_execution_denied"), traceId);
    if (executing.provider_io_authorized !== true || executing.replayed === true) return pec78Json(409, "provider_io_not_authorized", traceId);
    return new Response(JSON.stringify({ contractVersion: "pec78-runtime-authorization-v1", traceId, status: "executing", replayed: false, providerIoAuthorized: true }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }

  if (url.pathname.endsWith("/effects/slack/reconcile")) {
    const allowed = ["effectId", "leaseId", "leaseEpoch", "outcome", "providerMessageId"];
    if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.effectId !== "string" || typeof body.leaseId !== "string" ||
        typeof body.leaseEpoch !== "number" || !Number.isSafeInteger(body.leaseEpoch) || !["succeeded", "unknown", "failed"].includes(String(body.outcome)) ||
        !(body.providerMessageId === null || typeof body.providerMessageId === "string")) return pec78Json(422, "invalid_request", traceId);
    const reconciled = await reconcileComposioSlackEffect(env, {
      credentialId: result.identity.credentialId, runtimeInstanceId: result.identity.runtimeInstanceId,
      effectId: body.effectId, leaseId: body.leaseId, leaseEpoch: Number(body.leaseEpoch),
      outcome: body.outcome as "succeeded" | "unknown" | "failed", providerMessageId: body.providerMessageId as string | null, traceId,
    });
    if (!reconciled.ok) return pec78Json(403, String(reconciled.code ?? "effect_reconcile_denied"), traceId);
    return new Response(JSON.stringify({ contractVersion: "pec78-runtime-authorization-v1", traceId, status: reconciled.state, eventStatus: reconciled.event_state, replayed: reconciled.replayed === true }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }

  if (!url.pathname.endsWith("/effects/email/reserve")) return pec78Json(503, "operation_not_installed", traceId);
  const allowed = result.identity.capability === "email.send.admin" ? ["text", "subject", "modelRouteId"] : ["text", "modelRouteId"];
  if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.text !== "string" || !body.text.startsWith("PEC-78 Maya shadow test") ||
      body.text.length > 500 || typeof body.modelRouteId !== "string" || body.modelRouteId.length > 100 ||
      (result.identity.capability === "email.send.admin" && (typeof body.subject !== "string" || body.subject !== "PEC-78 Maya shadow test"))) {
    return pec78Json(422, "synthetic_payload_required");
  }
  const reservation = await reserveEffect(env, {
    credentialId: result.identity.credentialId, runtimeInstanceId: result.identity.runtimeInstanceId,
    capability: result.identity.capability, idempotencyKey, requestDigest: sha256Digest(bodyText),
    intentDigest: sha256Digest(`${result.identity.capability}|${destinationFor(result.identity.capability)}|${idempotencyKey}`),
    payloadDigest: sha256Digest(bodyText), modelRouteId: body.modelRouteId, traceId,
  });
  if (!reservation.ok) return pec78Json(403, String(reservation.code ?? "effect_denied"), traceId);
  return new Response(JSON.stringify({ contractVersion: "pec78-runtime-authorization-v1", traceId, status: "reserved", effectId: reservation.effect_id,
    provider: reservation.provider, destination: reservation.destination_ref, expiresAt: reservation.expires_at }),
    { status: 201, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
};

export const GET = handle;
export const POST = handle;
