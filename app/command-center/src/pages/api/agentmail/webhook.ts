import type { APIRoute } from "astro";
import { Webhook } from "svix";
import {
  AGENTMAIL_AGENT_ROSTER,
  AGENTMAIL_WEBHOOK_EVENTS,
  getAgentMailRuntimeConfig,
  getAgentMailWebhookSecrets,
} from "@lib/agentmail";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

type VerifiedWebhookPayload = Record<string, unknown>;

function redactId(value: unknown) {
  const text = typeof value === "string" ? value : "";
  if (!text) return null;
  if (text.length <= 10) return "[redacted]";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function buildSvixHeaders(headers: Headers) {
  return {
    "svix-id": headers.get("svix-id") ?? "",
    "svix-timestamp": headers.get("svix-timestamp") ?? "",
    "svix-signature": headers.get("svix-signature") ?? "",
  };
}

function hasRequiredSvixHeaders(headers: ReturnType<typeof buildSvixHeaders>) {
  return Boolean(headers["svix-id"] && headers["svix-timestamp"] && headers["svix-signature"]);
}

function getObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getEventType(payload: VerifiedWebhookPayload) {
  return String(payload.event_type ?? payload.type ?? payload.eventType ?? "unknown");
}

function getEventData(payload: VerifiedWebhookPayload) {
  return getObject(payload.data ?? payload.message ?? payload.payload);
}

function summarizePayload(payload: VerifiedWebhookPayload) {
  const data = getEventData(payload);
  const message = getObject(data.message);
  const inbox = getObject(data.inbox);

  return {
    eventType: getEventType(payload),
    inboxId: redactId(data.inbox_id ?? inbox.inbox_id ?? message.inbox_id),
    messageId: redactId(data.message_id ?? message.message_id ?? data.id ?? message.id),
    threadId: redactId(data.thread_id ?? message.thread_id),
  };
}

function logWebhook(event: string, details: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      service: "agentmail-webhook",
      event,
      ...details,
      timestamp: new Date().toISOString(),
    }),
  );
}

function verifyPayload(payload: string, headers: ReturnType<typeof buildSvixHeaders>, secrets: string[]) {
  for (const secret of secrets) {
    try {
      return new Webhook(secret).verify(payload, headers) as VerifiedWebhookPayload;
    } catch {
      // Try the next webhook signing secret. Multiple AgentMail endpoints can post here.
    }
  }

  return null;
}

export const GET: APIRoute = () => {
  const config = getAgentMailRuntimeConfig();

  return new Response(
    JSON.stringify(
      {
        status: "ok",
        service: "agentmail-webhook",
        configured: config.webhookConfigured,
        domain: config.domain,
        agentInboxes: AGENTMAIL_AGENT_ROSTER.length,
        webhookSecretCount: config.webhookSecretCount,
        eventTypes: AGENTMAIL_WEBHOOK_EVENTS,
      },
      null,
      2,
    ),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
};

export const POST: APIRoute = async ({ request }) => {
  const env = getRuntimeEnv();
  const secrets = getAgentMailWebhookSecrets(env);
  const svixHeaders = buildSvixHeaders(request.headers);

  if (secrets.length === 0) {
    logWebhook("rejected_missing_secret");
    return new Response(null, { status: 503 });
  }

  if (!hasRequiredSvixHeaders(svixHeaders)) {
    logWebhook("rejected_missing_signature_headers");
    return new Response(null, { status: 400 });
  }

  const payload = await request.text();
  const verified = verifyPayload(payload, svixHeaders, secrets);

  if (!verified) {
    logWebhook("rejected_bad_signature");
    return new Response(null, { status: 400 });
  }

  const summary = summarizePayload(verified);
  logWebhook("received", summary);

  return new Response(null, { status: 204 });
};
