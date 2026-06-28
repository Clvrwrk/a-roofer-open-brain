import type { APIRoute } from "astro";
import { createHmac, timingSafeEqual } from "node:crypto";
import { jsonApiResponse } from "@lib/agent-api";
import { createDevLinearIssue } from "@lib/linear-dev";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

function verifySentrySignature(payload: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const env = getRuntimeEnv();
  const secret = env.SENTRY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return jsonApiResponse({ error: "webhook_not_configured" }, { status: 503 });
  }

  const raw = await request.text();
  const sig = request.headers.get("sentry-hook-signature") ?? request.headers.get("x-sentry-signature");
  if (!verifySentrySignature(raw, sig, secret)) {
    return jsonApiResponse({ error: "invalid_signature" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return jsonApiResponse({ error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? body.event ?? "unknown");
  const data = (body.data as Record<string, unknown> | undefined) ?? {};
  const issue = (data.issue as { title?: string; permalink?: string; level?: string } | undefined) ?? {};

  const linearIssue = await createDevLinearIssue({
    agentCode: "pe-cc-codex",
    title: `Sentry: ${issue.title ?? action}`.slice(0, 120),
    description: [
      "Sentry webhook — Bug Triager queue.",
      "",
      `- Action: ${action}`,
      `- Level: ${issue.level ?? "unknown"}`,
      `- Link: ${issue.permalink ?? "n/a"}`,
      "",
      "Classify severity and attach reproduction steps.",
    ].join("\n"),
  });

  return jsonApiResponse({ status: "filed", linear: linearIssue, action });
};
