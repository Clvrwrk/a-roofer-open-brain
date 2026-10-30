import { ReceiptStore } from "./core.mjs";
import { APPROVED, LINEAR_WORK_INTERVAL_MS, MAYA_LINEAR_STATE_DIR } from "./policy.mjs";
import {
  commentLinearIssue,
  listLinearIssues,
  updateLinearIssue,
} from "./linear-orchestration.mjs";
import { recordCommandCenterIntake } from "./command-center-client.mjs";

function nestedId(value, names) {
  for (const name of names) {
    const direct = value?.[name];
    if (typeof direct === "string") return direct;
    if (direct && typeof direct === "object" && typeof direct.id === "string") return direct.id;
  }
  return "";
}

function issueIdentifier(issue) {
  return String(issue.identifier ?? issue.issueIdentifier ?? issue.id ?? "");
}

export function catSourceBinding(description) {
  const line = String(description ?? "").match(/^CAT source issue:([^\n]*)$/imu)?.[1] ?? "";
  const reference = line.match(/\b(CAT-\d+)\b/u)?.[1] ?? "";
  const entityId = line.match(/<issue\s+id="([0-9a-f-]{36})"[^>]*>/iu)?.[1] ?? "";
  return Object.freeze({ reference, id: entityId || reference });
}

export function isExecutableMayaIssue(issue, expected = APPROVED) {
  const description = String(issue?.description ?? "");
  const title = String(issue?.title ?? "");
  const teamId = nestedId(issue, ["team_id", "teamId", "team"]);
  const stateId = nestedId(issue, ["state_id", "stateId", "state"]);
  const stateName = String(issue?.state?.name ?? issue?.stateName ?? "");
  const isTodoState = stateId === expected.linearWorkTodoStateId ||
    (!stateId && stateName === expected.linearWorkTodoStateName);
  return Boolean(
    issue?.id &&
    /^\[MAYA\]/u.test(title) &&
    teamId === expected.linearWorkTeamId &&
    isTodoState &&
    catSourceBinding(description).reference &&
    /^Maya execution gate:\s*(?:Agent Todo|move this issue to Agent Todo)\s*$/imu.test(description)
  );
}

export async function runLinearWorkOccurrence({
  composio,
  capabilityAgent,
  store,
  signal,
  expected = APPROVED,
  onEvent = () => {},
  recordIntake = recordCommandCenterIntake,
}) {
  const candidates = (await listLinearIssues(composio, signal, expected))
    .filter((issue) => isExecutableMayaIssue(issue, expected))
    .sort((left, right) => String(left.createdAt ?? left.created_at ?? "").localeCompare(String(right.createdAt ?? right.created_at ?? "")))
    .slice(0, 1);
  if (candidates.length === 0) return { state: "idle", candidates: 0, processed: 0 };

  const issue = candidates[0];
  const reference = issueIdentifier(issue);
  const source = catSourceBinding(issue.description);
  const sourceReference = source.reference;
  const claim = await store.claim(`linear-work:${issue.id}`, {
    actorId: "maya-chen",
    channelId: "linear",
    triggerId: reference,
  });
  if (!claim.claimed) return { state: "duplicate", candidates: 1, processed: 0 };

  try {
    await updateLinearIssue(composio, issue.id, { stateId: expected.linearWorkWorkingStateId }, signal, expected);
    await store.recordAction(claim.name, "linear_work_claim", issue.id);
    const startedComment = await commentLinearIssue(
      composio,
      issue.id,
      `[MAYA] Claimed this explicitly authorized Agent Todo item. Audit root: ${sourceReference}. Financial mutations and external sends remain human-gated.`,
      signal,
      expected,
    );
    await store.recordAction(claim.name, "linear_claim_comment", startedComment);

    const intake = await recordIntake({
      payload: {
        messageId: issue.id,
        externalEventId: issue.id,
        sourceChannel: "linear",
        sourceThreadId: sourceReference,
        orchestrationKey: `linear-work:${issue.id}`,
        catSourceIssue: sourceReference,
        downstreamIssue: reference,
        alias: "linear",
        classification: "unknown",
        subject: String(issue.title).slice(0, 500),
        from: "CODEX AGENT TEAM",
        receivedAt: String(issue.createdAt ?? issue.created_at ?? new Date().toISOString()),
        attachments: [],
        gmailLabels: [],
        slackChannelId: "",
        slackThreadTs: "",
      },
      signal,
      expected,
    });
    await store.recordAction(claim.name, "command_center_intake", intake.providerReference);

    const result = await capabilityAgent({
      source: "linear_work",
      request: JSON.stringify({
        identifier: reference,
        title: issue.title,
        description: String(issue.description ?? "").slice(0, 12_000),
      }),
      sourceContext: {
        catSourceIssue: sourceReference,
        linearWorkIssue: reference,
        ownerSlackChannelId: expected.ownerSlackChannelId,
        ownerSlackUserId: expected.ownerSlackUserId,
      },
      composio,
      signal,
      expected: Object.freeze({
        ...expected,
        capabilityMode: "linear_work",
        allowedLinearIssueIds: [reference, issue.id, sourceReference],
      }),
      store,
      claimName: claim.name,
      onEvent,
    });

    const resultComment = await commentLinearIssue(
      composio,
      issue.id,
      `[MAYA] Review packet\n\n${result.text.slice(0, 4_000)}\n\nAudit root: ${sourceReference}`,
      signal,
      expected,
    );
    await store.recordAction(claim.name, "linear_result_comment", resultComment);
    await updateLinearIssue(composio, issue.id, { stateId: expected.linearWorkReviewStateId }, signal, expected);
    await store.recordAction(claim.name, "linear_work_agent_review", issue.id);
    await updateLinearIssue(composio, source.id, { stateId: expected.linearSourceReviewStateId }, signal, expected);
    await store.recordAction(claim.name, "linear_source_agent_review", sourceReference);
    await store.confirm(claim.name, issue.id, "linear-work-v1");
    onEvent("linear_work_confirmed", { work_issue: reference, source_issue: sourceReference });
    return { state: "complete", candidates: 1, processed: 1, reference, sourceReference };
  } catch (error) {
    await store.ambiguous(claim.name, error?.name ?? "Error");
    onEvent("linear_work_ambiguous", { work_issue: reference, error_class: error?.name ?? "Error" });
    return { state: "ambiguous", candidates: 1, processed: 1, reference, sourceReference };
  }
}

export async function startLinearWorkExecutor({
  composio,
  capabilityAgent,
  expected = APPROVED,
  onEvent = () => {},
  stateDirectory = MAYA_LINEAR_STATE_DIR,
}) {
  const controller = new AbortController();
  const store = new ReceiptStore(stateDirectory);
  await store.initialize();
  let timer;
  let active = Promise.resolve();
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(run, LINEAR_WORK_INTERVAL_MS);
  };
  const run = () => {
    if (stopped) return;
    active = runLinearWorkOccurrence({
      composio,
      capabilityAgent,
      store,
      signal: controller.signal,
      expected,
      onEvent,
    }).catch((error) => onEvent("linear_work_tick_failed", { error_class: error?.name ?? "Error" }))
      .finally(schedule);
  };
  schedule();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
      await active;
    },
  };
}
