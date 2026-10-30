import { Composio } from "@composio/core";
import { runInboxCleanup } from "./mailbox-executor.mjs";
import { MailboxState } from "./mailbox-state.mjs";
import {
  APPROVED,
  GMAIL_TOOL_VERSION,
  LINEAR_TOOL_VERSION,
  MAYA_MAILBOX_STATE_DIR,
} from "./policy.mjs";
import { TOOL_VERSION } from "./core.mjs";

for (const name of ["COMPOSIO_API_KEY", "OPENROUTER_API_KEY"]) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  allowTracking: false,
  toolkitVersions: { slackbot: TOOL_VERSION, gmail: GMAIL_TOOL_VERSION, linear: LINEAR_TOOL_VERSION },
});
const state = new MailboxState(MAYA_MAILBOX_STATE_DIR);
const result = await runInboxCleanup({
  composio,
  state,
  signal: AbortSignal.timeout(25 * 60 * 1_000),
  expected: APPROVED,
  allowAcknowledgement: false,
  onEvent(event, fields) {
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...fields })}\n`);
  },
});
process.stdout.write(`${JSON.stringify({ event: "mailbox_cleanup_result", ...result })}\n`);
if (result.ambiguous > 0) process.exitCode = 2;
