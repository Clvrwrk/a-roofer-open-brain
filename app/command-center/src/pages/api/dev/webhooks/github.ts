import type { APIRoute } from "astro";
import { createHmac, timingSafeEqual } from "node:crypto";
import { jsonApiResponse } from "@lib/agent-api";
import { createDevLinearIssue } from "@lib/linear-dev";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

function verifyGithubSignature(payload: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const received = signature.slice("sha256=".length);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const env = getRuntimeEnv();
  const secret = env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return jsonApiResponse({ error: "webhook_not_configured" }, { status: 503 });
  }

  const raw = await request.text();
  const sig = request.headers.get("x-hub-signature-256");
  if (!verifyGithubSignature(raw, sig, secret)) {
    return jsonApiResponse({ error: "invalid_signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event") ?? "unknown";
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return jsonApiResponse({ error: "invalid_json" }, { status: 400 });
  }

  if (event !== "pull_request") {
    return jsonApiResponse({ status: "ignored", event });
  }

  const action = body.action as string | undefined;
  if (action !== "opened" && action !== "reopened" && action !== "ready_for_review") {
    return jsonApiResponse({ status: "ignored", action });
  }

  const pr = body.pull_request as { html_url?: string; title?: string; number?: number } | undefined;
  const repo = (body.repository as { full_name?: string } | undefined)?.full_name ?? "unknown";

  const issue = await createDevLinearIssue({
    agentCode: "pe-cc-codex",
    title: `PR review: ${repo}#${pr?.number ?? "?"} ${pr?.title ?? ""}`.slice(0, 120),
    description: [
      "GitHub PR opened — Code Reviewer queue.",
      "",
      `- Repo: ${repo}`,
      `- PR: ${pr?.html_url ?? "n/a"}`,
      `- Action: ${action}`,
      "",
      "Run code review checklist per docs/59-endpoint-auth-matrix.md.",
    ].join("\n"),
  });

  return jsonApiResponse({ status: "filed", linear: issue, event, action });
};
