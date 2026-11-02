import type { APIRoute } from "astro";
import { jsonApiResponse } from "@lib/agent-api";
import { decideDispatch, triggerOf, verifyLinearSignature, type LinearWebhookEvent } from "@lib/linear-agent-dispatch";
import { enqueueAgentDispatch } from "@lib/linear-agent-queue.server";
import { fetchIssueLabelNames, getAppUserId } from "@lib/linear-client.server";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

/** POST /api/dev/webhooks/linear — wakes the lane agent on an @PE Dev Agents mention or `agent-go`. */
export const POST: APIRoute = async ({ request }) => {
  const secret = getRuntimeEnv().LINEAR_WEBHOOK_SECRET?.trim();
  if (!secret) return jsonApiResponse({ error: "webhook_not_configured" }, { status: 503 });

  const raw = await request.text();
  if (!verifyLinearSignature(raw, request.headers.get("linear-signature"), secret)) {
    return jsonApiResponse({ error: "invalid_signature" }, { status: 401 });
  }
  let event: LinearWebhookEvent;
  try {
    event = JSON.parse(raw) as LinearWebhookEvent;
  } catch {
    return jsonApiResponse({ error: "invalid_json" }, { status: 400 });
  }

  const appUserId = await getAppUserId();
  const t = triggerOf(event, appUserId);
  if ("ignore" in t) return jsonApiResponse({ status: "ignored", reason: t.ignore });

  const issueLabelNames = "labelNames" in t ? undefined : await fetchIssueLabelNames(t.issueId);
  const decision = decideDispatch(event, { issueLabelNames, appUserId });
  if (decision.kind !== "dispatch") return jsonApiResponse({ status: decision.kind, decision });

  const deliveryId = request.headers.get("linear-delivery") ?? `${decision.sourceId}:${decision.trigger}`;
  try {
    const queued = await enqueueAgentDispatch(decision, deliveryId);
    return jsonApiResponse({ status: "queued", lane: decision.lane, paidSession: decision.paidSession, ...queued }, { status: 202 });
  } catch (error) {
    console.error("[linear-webhook] enqueue failed:", error instanceof Error ? error.message : "unknown");
    return jsonApiResponse({ error: "enqueue_failed" }, { status: 500 });
  }
};
