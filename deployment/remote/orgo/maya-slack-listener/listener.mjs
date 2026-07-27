import { Composio } from "@composio/core";
import {
  ReceiptStore,
  TOOL_VERSION,
  evaluateEvent,
  hashId,
  verifyTriggerInstancePreflight,
} from "./core.mjs";
import { APPROVED, MAYA_RECEIPT_DIR } from "./policy.mjs";
import { runAcceptedAttempt } from "./attempt.mjs";
import { runHermes } from "./hermes-runner.mjs";
import { createShutdownCoordinator } from "./shutdown.mjs";

const required = ["COMPOSIO_API_KEY", "OPENROUTER_API_KEY"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const expected = APPROVED;
const store = new ReceiptStore(MAYA_RECEIPT_DIR);
await store.initialize();

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolkitVersions: { slackbot: TOOL_VERSION },
});

const triggerListing = await composio.getClient().triggerInstances.listActive(
  {
    trigger_ids: [expected.triggerId],
    show_disabled: true,
    limit: 10,
  },
  { signal: AbortSignal.timeout(30_000) },
);
verifyTriggerInstancePreflight(triggerListing, expected);

const shutdown = createShutdownCoordinator({
  onExit: scheduleCleanExit,
  onLog: log,
});
process.once("SIGTERM", () => shutdown.handleSignal());

log("listener_started", {
  trigger_hash: hashId(expected.triggerId),
  trigger_uuid_hash: hashId(expected.triggerUuid),
  channel_hash: hashId(expected.channelId),
});
await composio.triggers.subscribe(
  async (raw) => {
    if (shutdown.isActive() || shutdown.isShuttingDown()) return;
    const decision = evaluateEvent(raw, expected);
    if (!decision.accepted) {
      log("event_rejected", { reason: decision.reason });
      return;
    }

    const attemptSignal = shutdown.beginAttempt();
    if (!attemptSignal) return;
    try {
      await runAcceptedAttempt({
        decision,
        expected,
        store,
        composio,
        attemptSignal,
        runHermes,
        onEvent: log,
      });
    } finally {
      shutdown.completeAttempt();
    }
  },
  {
    triggerId: expected.triggerId,
    connectedAccountId: expected.connectedAccountId,
    userId: expected.composioUserId,
  },
);

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...fields })}\n`);
}

function scheduleCleanExit() {
  setTimeout(() => process.exit(0), 25).unref();
}
