import { Composio } from "@composio/core";
import {
  ReceiptStore,
  TOOL_VERSION,
  evaluateEvent,
  hashId,
  verifyTriggerInstancePreflight,
} from "./core.mjs";
import { APPROVED, GMAIL_TOOL_VERSION, LINEAR_TOOL_VERSION, MAYA_RECEIPT_DIR } from "./policy.mjs";
import { runAcceptedAttempt } from "./attempt.mjs";
import { runHermes } from "./hermes-runner.mjs";
import { createSerialQueue, createShutdownCoordinator } from "./shutdown.mjs";
import { startMailboxExecutor } from "./mailbox-executor.mjs";
import { runCapabilityAgent } from "./capability-agent.mjs";
import { startCadenceExecutor } from "./cadence-executor.mjs";
import { startLinearWorkExecutor } from "./linear-work-executor.mjs";

const required = ["COMPOSIO_API_KEY", "OPENROUTER_API_KEY", "MAYA_COMMAND_CENTER_TOKEN"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const expected = APPROVED;
const store = new ReceiptStore(MAYA_RECEIPT_DIR);
await store.initialize();

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  allowTracking: false,
  toolkitVersions: { slackbot: TOOL_VERSION, gmail: GMAIL_TOOL_VERSION, linear: LINEAR_TOOL_VERSION },
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

let runtimeStop = Promise.resolve();
const shutdown = createShutdownCoordinator({
  onExit: () => runtimeStop.finally(scheduleCleanExit),
  onLog: log,
});
const queue = createSerialQueue({
  handler: processAcceptedEvent,
  onError: (error) => log("queued_attempt_failed", { error_class: error?.name ?? "UnexpectedError" }),
});
const mailbox = await startMailboxExecutor({ composio, expected, onEvent: log, capabilityAgent: runCapabilityAgent });
const cadence = await startCadenceExecutor({ composio, expected, onEvent: log });
const linearWork = await startLinearWorkExecutor({
  composio,
  expected,
  onEvent: log,
  capabilityAgent: runCapabilityAgent,
});
process.once("SIGTERM", () => {
  runtimeStop = Promise.all([mailbox.stop(), cadence.stop(), linearWork.stop()]);
  shutdown.handleSignal();
});

log("listener_started", {
  trigger_hash: hashId(expected.triggerId),
  trigger_uuid_hash: hashId(expected.triggerUuid),
  channel_scope: "all_accessible",
  cat_first: true,
  cadence_loops: true,
  linear_work_claiming: true,
});
await composio.triggers.subscribe(
  async (raw) => {
    if (shutdown.isShuttingDown()) {
      log("event_rejected", { reason: "shutdown_requested" });
      return;
    }
    const decision = evaluateEvent(raw, expected);
    if (!decision.accepted) {
      log("event_rejected", { reason: decision.reason });
      return;
    }

    log("event_queued", { pending: queue.pendingCount() + 1 });
    return queue.enqueue(decision);
  },
  {
    triggerId: expected.triggerId,
    connectedAccountId: expected.receiveConnectedAccountId,
    userId: expected.composioUserId,
  },
);

async function processAcceptedEvent(decision) {
  const attemptSignal = shutdown.beginAttempt();
  if (!attemptSignal) {
    log("event_rejected", { reason: "shutdown_requested" });
    return;
  }
  try {
    await runAcceptedAttempt({
      decision,
      expected,
      store,
      composio,
      attemptSignal,
      runHermes,
      runAgent: runCapabilityAgent,
      onEvent: log,
    });
  } finally {
    shutdown.completeAttempt();
  }
}

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...fields })}\n`);
}

function scheduleCleanExit() {
  setTimeout(() => process.exit(0), 25).unref();
}
