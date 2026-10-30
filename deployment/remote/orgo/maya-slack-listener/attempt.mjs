import { HERMES_MODEL } from "./policy.mjs";
import { buildReply, buildSendArguments, classifyError, hashId } from "./core.mjs";
import { executeSlackSendOnce } from "./send-once.mjs";
import {
  commentLinearIssue,
  ensureCatFirstPair,
  indexLinearOrchestrations,
  listLinearIssues,
  updateLinearIssue,
} from "./linear-orchestration.mjs";
import { recordCommandCenterIntake } from "./command-center-client.mjs";

export async function runAcceptedAttempt({
  decision,
  expected,
  store,
  composio,
  attemptSignal,
  runHermes,
  runAgent,
  recordIntake = recordCommandCenterIntake,
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
    const sourceKeys = [
      `slack-thread:${expected.teamId}:${decision.event.data.channel}:${decision.threadTs}`,
      `slack-message:${expected.teamId}:${decision.event.data.channel}:${decision.event.data.ts}`,
    ];
    const shortRequest = decision.messageText
      .replace(/<@[A-Z0-9]+>/gu, "Maya")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 100);
    const linearPair = await ensureCatFirstPair({
      composio,
      sourceKeys,
      knownIndex: indexLinearOrchestrations(await listLinearIssues(composio, attemptSignal, expected)),
      buildSourceArguments: (keys) => ({
        team_id: expected.linearSourceTeamId,
        project_id: expected.linearSourceProjectId,
        parent_id: expected.linearSourceParentId,
        state_id: expected.linearSourceWorkingStateId,
        assignee_id: expected.linearReviewerId,
        title: `[Maya intake][Slack] ${shortRequest}`.slice(0, 140),
        priority: 3,
        description: [
          "Maya CAT source: true",
          ...keys.map((key) => `Maya source key: ${key}`),
          "Source channel: slack",
          `Source actor: ${decision.event.data.user}`,
          `Source channel ID: ${decision.event.data.channel}`,
          `Source thread timestamp: ${decision.threadTs}`,
          "",
          "## Request",
          decision.messageText,
          "",
          "## Audit contract",
          "Every downstream action and result must link to this CAT source.",
        ].join("\n").slice(0, 8_000),
      }),
      buildWorkArguments: ({ source, sourceKeys: keys }) => ({
        team_id: expected.linearWorkTeamId,
        parent_id: source.id,
        state_id: expected.linearWorkWorkingStateId,
        assignee_id: expected.linearReviewerId,
        title: `[MAYA] Slack accounting request: ${shortRequest}`.slice(0, 140),
        priority: 3,
        description: [
          "[MAYA] Direct Slack work request",
          `CAT source issue: ${source.reference}`,
          ...keys.map((key) => `Maya source key: ${key}`),
          "Maya execution gate: direct addressed Slack request",
          "",
          decision.messageText,
        ].join("\n").slice(0, 8_000),
      }),
      signal: attemptSignal,
      expected,
      onConfirmed: (action, providerReference) => store.recordAction(claim.name, action, providerReference),
    });
    const intake = await recordIntake({
      payload: {
        messageId: decision.event.data.ts,
        externalEventId: decision.event.data.ts,
        sourceChannel: "slack",
        sourceThreadId: decision.threadTs,
        orchestrationKey: sourceKeys[0],
        catSourceIssue: linearPair.source.reference,
        downstreamIssue: linearPair.work.reference,
        alias: "slack",
        classification: "unknown",
        subject: shortRequest || "Slack accounting request",
        from: decision.event.data.user,
        receivedAt: new Date(Number(decision.event.data.ts.split(".")[0]) * 1_000).toISOString(),
        attachments: [],
        gmailLabels: [],
        slackChannelId: decision.event.data.channel,
        slackThreadTs: decision.threadTs,
      },
      signal: attemptSignal,
      expected,
    });
    await store.recordAction(claim.name, "command_center_intake", intake.providerReference);
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
            catSourceIssue: linearPair.source.reference,
            linearWorkIssue: linearPair.work.reference,
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
    const auditComment = await commentLinearIssue(
      composio,
      linearPair.work.id,
      `[MAYA] Work result\n\n${agentResult.text.slice(0, 3_000)}\n\nCAT source: ${linearPair.source.reference}`,
      attemptSignal,
      expected,
    );
    await store.recordAction(claim.name, "linear_result_comment", auditComment);
    await updateLinearIssue(
      composio,
      linearPair.work.id,
      { stateId: expected.linearWorkReviewStateId },
      attemptSignal,
      expected,
    );
    await store.recordAction(claim.name, "linear_work_agent_review", linearPair.work.id);
    await updateLinearIssue(
      composio,
      linearPair.source.id,
      { stateId: expected.linearSourceReviewStateId },
      attemptSignal,
      expected,
    );
    await store.recordAction(claim.name, "linear_source_agent_review", linearPair.source.id);
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
