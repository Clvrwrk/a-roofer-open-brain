import {
  VALIDATION_GATE,
  HERMES_MODEL,
} from "./policy.mjs";
import { buildReply, buildSendArguments, classifyError, hashId } from "./core.mjs";
import { executeSlackSendOnce } from "./send-once.mjs";

export async function runAcceptedAttempt({
  decision,
  expected,
  store,
  composio,
  attemptSignal,
  runHermes,
  onEvent,
}) {
  let claim;
  try {
    const gateClaimed = await store.claimOnceGate(VALIDATION_GATE);
    if (!gateClaimed) {
      onEvent("validation_budget_exhausted");
      return { state: "budget_exhausted" };
    }
    claim = await store.claim(decision.eventKey, {
      actorId: decision.event.data.user,
      channelId: expected.channelId,
      triggerId: expected.triggerId,
    });
    if (!claim.claimed) return { state: "duplicate" };
    throwIfAborted(attemptSignal);
    onEvent("event_claimed", { event_hash: claim.digest });
    const answer = await runHermes(decision.messageText, attemptSignal);
    throwIfAborted(attemptSignal);
    const reply = buildReply(answer);
    const arguments_ = buildSendArguments(expected.channelId, decision.threadTs, reply);
    throwIfAborted(attemptSignal);
    const outcome = await executeSlackSendOnce({
      composio,
      userId: expected.composioUserId,
      connectedAccountId: expected.connectedAccountId,
      arguments_,
      store,
      claimName: claim.name,
      abortSignal: attemptSignal,
    });
    if (outcome.state === "ambiguous") {
      onEvent("event_ambiguous", { event_hash: claim.digest, error_class: outcome.errorClass });
    } else {
      onEvent("send_confirmed", {
        event_hash: claim.digest,
        provider_message_hash: hashId(outcome.providerMessageId),
      });
    }
    return outcome;
  } catch (error) {
    const errorClass = classifyError(error);
    if (claim?.claimed) await store.ambiguous(claim.name, errorClass);
    onEvent("event_ambiguous", {
      event_hash: claim?.digest ?? "unclaimed",
      error_class: errorClass,
    });
    return { state: "ambiguous", errorClass };
  }
}

function throwIfAborted(signal) {
  if (!signal.aborted) return;
  const error = new Error("Shutdown requested");
  error.name = "AbortError";
  throw error;
}
