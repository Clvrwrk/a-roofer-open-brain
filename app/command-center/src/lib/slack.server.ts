// Server-side Slack poster for the Open Brain agents (app "Open Brain Command Center",
// bot user @openbrain, workspace pe-command-center / T0B8QEGPVQW). Posts via the bot token
// (SLACK_BOT_TOKEN, xoxb-…) using Slack mrkdwn. This is the canonical path for agent →
// Slack messages (replacing the per-user MCP connector, which is bound to a different
// workspace). Accounting channel ids come from env (see config/.env.example).
//
// Usage: await postSlackMessage({ channel: env.SLACK_ACCOUNTING_INVOICE_PROCESSING_CHANNEL_ID, text });
import { getRuntimeEnv } from "@lib/runtime-env";

export interface SlackPostInput {
  channel: string; // channel id (C…) or user id (U…) for a DM
  text: string; // Slack mrkdwn (*bold*, _italic_, `code`)
  threadTs?: string; // reply in a thread
  unfurlLinks?: boolean; // default false — keep audit posts compact
}

export interface SlackPostResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

/**
 * Post a message to Slack via the bot token. Returns { ok:false, error } rather than
 * throwing, so a failed post never breaks the calling workflow (the caller decides
 * whether to retry / surface it). No-op with a clear error when the token is unset.
 */
export async function postSlackMessage(input: SlackPostInput): Promise<SlackPostResult> {
  const env = getRuntimeEnv();
  const token = env.SLACK_BOT_TOKEN?.trim();
  if (!token) return { ok: false, error: "slack_bot_token_unset" };
  if (!input.channel) return { ok: false, error: "channel_required" };

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        channel: input.channel,
        text: input.text,
        unfurl_links: input.unfurlLinks ?? false,
        ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
      }),
    });
    const data = (await res.json()) as { ok: boolean; ts?: string; channel?: string; error?: string };
    return { ok: data.ok, ts: data.ts, channel: data.channel, error: data.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "slack_post_failed" };
  }
}
