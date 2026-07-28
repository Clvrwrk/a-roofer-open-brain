import type { APIRoute } from "astro";
import { getRuntimeEnv } from "@lib/runtime-env";
import {
  composioIngressMode,
  encryptPec78SlackEvent,
  verifyPec78ComposioWebhook,
} from "@lib/pec78/composio-webhook.server";
import { ingestComposioSlackEvent } from "@lib/pec78/store.server";

export const prerender = false;

function response(status: number, code: string, traceId: string) {
  return new Response(JSON.stringify({ status: code, traceId }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function log(event: string, traceId: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ service: "pec78-composio-ingress", event, traceId, ...details, at: new Date().toISOString() }));
}

export const POST: APIRoute = async ({ request }) => {
  const env = getRuntimeEnv();
  const traceId = crypto.randomUUID();
  const mode = composioIngressMode(env);
  if (mode === "disabled") {
    log("stopped", traceId);
    return response(423, "ingress_stopped", traceId);
  }
  const rawBody = await request.text();
  const verified = verifyPec78ComposioWebhook({
    rawBody,
    headers: request.headers,
    secret: env.PEC78_COMPOSIO_WEBHOOK_SECRET,
    triggerId: env.PEC78_COMPOSIO_TRIGGER_ID,
    connectedAccountId: env.PEC78_COMPOSIO_CONNECTED_ACCOUNT_ID,
    composioUserId: env.PEC78_COMPOSIO_USER_ID,
  });
  if (!verified.ok) {
    log("rejected", traceId, { code: verified.code });
    return response(verified.status, verified.code, traceId);
  }
  let encrypted;
  try { encrypted = encryptPec78SlackEvent(verified.event, env); }
  catch {
    log("encryption_unavailable", traceId);
    return response(503, "encryption_unavailable", traceId);
  }
  const stored = await ingestComposioSlackEvent(env, {
    ...verified.event,
    ...encrypted,
    validationMode: mode === "validation",
    traceId,
  });
  if (!stored.ok) {
    const code = String(stored.code ?? "ingress_state_unavailable");
    log("store_denied", traceId, { code });
    return response(code === "activation_authorization_denied" ? 403 : 503, code, traceId);
  }
  log(stored.replayed === true ? "duplicate" : "accepted", traceId, { eventDigest: stored.event_digest });
  return response(stored.replayed === true ? 200 : 202, stored.replayed === true ? "duplicate" : "accepted", traceId);
};
