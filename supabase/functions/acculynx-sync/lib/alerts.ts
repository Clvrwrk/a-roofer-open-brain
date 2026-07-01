// acculynx-sync — lib/alerts.ts (Phase 3, plan 03-03)
//
// Fire-and-forget alert helpers for in-run edge-function hard failures.
//   - postSlackAlert(webhookUrl, message)  → POST {text} to a Slack incoming webhook
//   - captureSentryError(dsn, error, ctx)  → POST a minimal Sentry envelope
//
// Hard rule 2: NO module-level secret constants. Webhook/DSN are explicit params only
// (the caller reads Deno.env). This module NEVER reads an AccuLynx API key / PE_CC_* var.
// Defense in depth: redact() scrubs Bearer/sk-/xoxb tokens from any outbound text, and
// captureSentryError strips context keys named like *key*/*token*/*authorization*/*secret*.
// Both helpers swallow all errors — alerting must never crash or fail the sync.

// deno-lint-ignore-file no-explicit-any

/** Scrub anything token-shaped from outbound text (defense in depth, hard rule 2). */
export function redact(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/xox[baprs]-[A-Za-z0-9-]+/gi, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9]{8,}/gi, "[REDACTED]")
    .replace(/sntrys_[A-Za-z0-9]+/gi, "[REDACTED]");
}

const SECRET_KEY_RE = /key|token|authorization|secret|password|jwt|dsn/i;

/** Drop context entries whose KEY looks secret-bearing; redact string VALUES. */
function scrubContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx ?? {})) {
    if (SECRET_KEY_RE.test(k)) continue;
    out[k] = typeof v === "string" ? redact(v) : v;
  }
  return out;
}

/**
 * Post a plain-text alert to Slack via chat.postMessage (the repo's bot-token pattern —
 * see .claude/skills/slack-agents). Fire-and-forget: never throws, swallows non-2xx and
 * network errors so alerting can never crash the sync. The botToken is an explicit param
 * (caller reads Deno.env — hard rule 2); it is sent only as the Authorization header, never
 * in the body, and is never logged.
 */
export async function postSlackAlert(botToken: string, channel: string, message: string): Promise<void> {
  if (!botToken || !channel) return;
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel, text: redact(message) }),
    });
  } catch (_e) {
    // fire-and-forget — alerting failure must never propagate
  }
}

/**
 * Capture an error to Sentry via a minimal envelope POST. Fire-and-forget.
 * dsn format: https://<publicKey>@<host>/<projectId>
 */
export async function captureSentryError(
  dsn: string,
  error: Error,
  context: Record<string, unknown> = {},
): Promise<void> {
  if (!dsn) return;
  try {
    const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
    if (!m) return;
    const [, publicKey, host, projectId] = m;
    const endpoint = `https://${host}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`;

    const eventId = crypto.randomUUID().replace(/-/g, "");
    const sentAt = new Date().toISOString();
    const event = {
      event_id: eventId,
      level: "error",
      platform: "javascript",
      logger: "acculynx-sync",
      message: redact(error?.message ?? String(error)),
      extra: scrubContext(context),
    };
    const envelope =
      JSON.stringify({ event_id: eventId, sent_at: sentAt }) + "\n" +
      JSON.stringify({ type: "event" }) + "\n" +
      JSON.stringify(event) + "\n";

    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
    });
  } catch (_e) {
    // fire-and-forget
  }
}
