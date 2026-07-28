import { HERMES_MODEL } from "./policy.mjs";
import { buildReply, buildSendArguments, classifyError, hashId } from "./core.mjs";
import { executeSlackSendOnce } from "./send-once.mjs";

export async function runAcceptedAttempt({
  decision,
  expected,
  store,
  composio,
  attemptSignal,
  runHermes,
  runAgent,
  onEvent,
}) {
  let claim;
  try {
    claim = await store.claim(decision.eventKey, {
      actorId: decision.event.data.user,
      channelId: decision.event.data.channel,
      triggerId: expected.triggerId,
    });
    if (!claim.claimed) return { state: "duplicate" };
    throwIfAborted(attemptSignal);
    onEvent("event_claimed", { event_hash: claim.digest });
    const agentResult = runAgent
      ? await runAgent({
          source: "slack",
          request: decision.messageText,
          sourceContext: {
            actorId: decision.event.data.user,
            channel: decision.event.data.channel,
            threadTs: decision.threadTs,
            ownerSlackChannelId: expected.ownerSlackChannelId,
            ownerSlackUserId: expected.ownerSlackUserId,
          },
          composio,
          signal: attemptSignal,
          expected,
          store,
          claimName: claim.name,
          onEvent,
        })
      : { text: await runHermes(decision.messageText, attemptSignal), confirmedWrites: 0 };
    throwIfAborted(attemptSignal);
    const reply = buildReply(agentResult.text, expected.ownerSlackUserId, {
      allowVerifiedActionClaims: agentResult.confirmedWrites > 0,
    });
    const arguments_ = buildSendArguments(decision.event.data.channel, decision.threadTs, reply);
    throwIfAborted(attemptSignal);
    const outcome = await executeSlackSendOnce({
      composio,
      userId: expected.composioUserId,
      connectedAccountId: expected.sendConnectedAccountId,
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
