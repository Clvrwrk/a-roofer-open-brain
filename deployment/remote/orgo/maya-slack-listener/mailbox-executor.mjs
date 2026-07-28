import { createHash } from "node:crypto";
import { classifyMailboxMessage } from "./mailbox-hermes.mjs";
import { MailboxState, mailboxOccurrenceId, millisecondsUntilNextHalfHour } from "./mailbox-state.mjs";
import {
  APPROVED,
  GMAIL_TOOL_VERSION,
  LINEAR_TOOL_VERSION,
  MAILBOX_MAX_PAGES,
  MAILBOX_PAGE_SIZE,
  MAYA_MAILBOX_STATE_DIR,
} from "./policy.mjs";
import { TOOL_SLUG, TOOL_VERSION, classifyError, isSlackTimestamp } from "./core.mjs";

const GMAIL_FETCH = "GMAIL_FETCH_EMAILS";
const GMAIL_FETCH_MESSAGE = "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID";
const GMAIL_MODIFY_LABELS = "GMAIL_ADD_LABEL_TO_EMAIL";
const LINEAR_CREATE = "LINEAR_CREATE_LINEAR_ISSUE";
const LINEAR_LIST = "LINEAR_LIST_LINEAR_ISSUES";

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function requestOptions(signal, timeoutMs = 30_000) {
  return { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) };
}

function requiredSuccessful(result, operation) {
  if (!result?.successful) throw new Error(`${operation} did not return provider confirmation`);
  return result.data ?? {};
}

function firstDefined(object, names) {
  for (const name of names) {
    if (object && object[name] !== undefined && object[name] !== null) return object[name];
  }
  return undefined;
}

function parseMessageEpochMs(message) {
  const value = firstDefined(message, ["internalDate", "internal_date", "messageTimestamp", "date"]);
  if (typeof value === "number" && Number.isFinite(value)) return value > 10_000_000_000 ? value : value * 1_000;
  if (typeof value === "string" && /^\d+$/u.test(value)) {
    const number = Number(value);
    return number > 10_000_000_000 ? number : number * 1_000;
  }
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function extractMessages(data) {
  const messages = Array.isArray(data?.messages)
    ? data.messages
    : Array.isArray(data?.items)
      ? data.items
      : [];
  return messages.filter((message) => message && typeof message === "object");
}

export function normalizeMailboxMessage(data) {
  const headers = data?.headers && typeof data.headers === "object" ? data.headers : {};
  const attachments = firstDefined(data, ["attachmentList", "attachment_list"]);
  const messageId = String(firstDefined(data, ["messageId", "message_id", "id"]) ?? "");
  if (!/^[0-9a-fA-F]+$/u.test(messageId)) throw new Error("Gmail returned an invalid message ID");
  const threadId = String(firstDefined(data, ["threadId", "thread_id"]) ?? "");
  const bodyValue = firstDefined(data, ["messageText", "message_text", "text", "body", "preview", "snippet"]);
  const receivedEpochMs = parseMessageEpochMs(data);
  return Object.freeze({
    messageId,
    threadId,
    receivedAt: new Date(receivedEpochMs).toISOString(),
    receivedEpochMs,
    sender: String(firstDefined(data, ["sender", "from"]) ?? headers.from ?? "unknown").slice(0, 500),
    recipients: String(firstDefined(data, ["to", "recipient"]) ?? headers.to ?? "").slice(0, 500),
    subject: String(firstDefined(data, ["subject"]) ?? headers.subject ?? "(no subject)").slice(0, 500),
    body: typeof bodyValue === "string" ? bodyValue.slice(0, 12_000) : "",
    labelIds: Array.isArray(firstDefined(data, ["labelIds", "label_ids"]))
      ? firstDefined(data, ["labelIds", "label_ids"]).map(String)
      : [],
    attachments: Array.isArray(attachments)
      ? attachments.slice(0, 25).map((item) => ({
          filename: String(firstDefined(item, ["filename", "fileName"]) ?? "attachment").slice(0, 255),
          mimeType: String(firstDefined(item, ["mimeType", "mime_type"]) ?? "application/octet-stream").slice(0, 150),
        }))
      : [],
    displayUrl: String(firstDefined(data, ["displayUrl", "display_url"]) ?? `https://mail.google.com/mail/u/0/#inbox/${messageId}`),
  });
}

export function buildLinearIssueArguments(message, decision, expected = APPROVED) {
  if (!expected.linearTeamId) throw new Error("Linear team is not pinned");
  const attachmentSummary = message.attachments.length
    ? message.attachments.map((item) => `- ${item.filename} (${item.mimeType})`).join("\n")
    : "- None reported";
  return {
    team_id: expected.linearTeamId,
    title: decision.title,
    priority: decision.priority,
    description: [
      "[MAYA] Mailbox intake decision",
      "",
      `Source sender: ${message.sender}`,
      `Received: ${message.receivedAt}`,
      `Gmail message ID: ${message.messageId}`,
      `Gmail source: ${message.displayUrl}`,
      "",
      "## Summary",
      decision.summary,
      "",
      "## Decision rationale",
      decision.reason,
      "",
      "## Attachments",
      attachmentSummary,
      "",
      "The mailbox executor did not reply to the original sender. Any external commitment still requires Christopher's approval.",
    ].join("\n").slice(0, 8_000),
  };
}

export function buildOwnerSlackArguments(message, decision, linearReference, expected = APPROVED) {
  if (!expected.ownerSlackChannelId || !expected.ownerSlackUserId) {
    throw new Error("Owner Slack destination is not pinned");
  }
  const options = decision.options.map((item, index) => `${index + 1}. ${item}`).join(" ");
  const text = [
    `[NA-5][MAYA] - <@${expected.ownerSlackUserId}> [BLOCKED] Mailbox task needs context and routing.`,
    `Source: ${message.subject} from ${message.sender}.`,
    `Completed: reviewed and classified${linearReference ? `; tracked as ${linearReference}` : ""}.`,
    `Blocker: ${decision.reason}`,
    `Recommended routes: ${options}`,
    `Decision needed: ${decision.question}`,
  ].join(" ").replace(/<@(?!U0B8SGJJZLJ)[^>]+>/gu, "[reference removed]").slice(0, 1_500);
  return {
    channel: expected.ownerSlackChannelId,
    markdown_text: text,
    reply_broadcast: false,
    unfurl_links: false,
    unfurl_media: false,
  };
}

async function listCandidateMessages(composio, cursorEpochSeconds, signal, expected) {
  const cursorDate = new Date(Math.max(0, cursorEpochSeconds - 86_400) * 1_000).toISOString().slice(0, 10).replaceAll("-", "/");
  const messages = [];
  let pageToken;
  for (let page = 0; page < MAILBOX_MAX_PAGES; page += 1) {
    const result = await composio.tools.execute(
      GMAIL_FETCH,
      {
        userId: expected.composioUserId,
        connectedAccountId: expected.gmailConnectedAccountId,
        version: GMAIL_TOOL_VERSION,
        arguments: {
          user_id: "me",
          query: `after:${cursorDate} -in:spam -in:trash`,
          max_results: MAILBOX_PAGE_SIZE,
          ids_only: false,
          verbose: false,
          include_payload: false,
          include_spam_trash: false,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      },
      requestOptions(signal),
    );
    const data = requiredSuccessful(result, "Gmail list");
    messages.push(...extractMessages(data));
    pageToken = firstDefined(data, ["nextPageToken", "next_page_token"]);
    if (!pageToken) break;
    if (page === MAILBOX_MAX_PAGES - 1) throw new Error("Gmail pagination exceeded the bounded page limit");
  }
  return messages
    .filter((message) => parseMessageEpochMs(message) > cursorEpochSeconds * 1_000)
    .sort((left, right) => parseMessageEpochMs(left) - parseMessageEpochMs(right));
}

async function hydrateMessage(composio, messageId, signal, expected) {
  const result = await composio.tools.execute(
    GMAIL_FETCH_MESSAGE,
    {
      userId: expected.composioUserId,
      connectedAccountId: expected.gmailConnectedAccountId,
      version: GMAIL_TOOL_VERSION,
      arguments: { user_id: "me", message_id: messageId, format: "full" },
    },
    requestOptions(signal),
  );
  return normalizeMailboxMessage(requiredSuccessful(result, "Gmail hydrate"));
}

async function listKnownLinearSourceIds(composio, signal, expected) {
  const sourceIds = new Map();
  let after;
  for (let page = 0; page < 10; page += 1) {
    const result = await composio.tools.execute(
      LINEAR_LIST,
      {
        userId: expected.composioUserId,
        connectedAccountId: expected.linearConnectedAccountId,
        version: LINEAR_TOOL_VERSION,
        arguments: { first: 250, include_transitions: false, ...(after ? { after } : {}) },
      },
      requestOptions(signal),
    );
    const data = requiredSuccessful(result, "Linear list");
    const issues = Array.isArray(data.issues) ? data.issues : [];
    for (const issue of issues) {
      const description = String(issue.description ?? "");
      const match = description.match(/Gmail message ID: ([0-9a-fA-F]+)/u);
      if (match) sourceIds.set(match[1], String(issue.identifier ?? issue.id ?? "existing issue"));
    }
    const pageInfo = data.page_info ?? data.pageInfo ?? {};
    if (!(pageInfo.hasNextPage ?? pageInfo.has_next_page)) break;
    after = pageInfo.endCursor ?? pageInfo.end_cursor;
    if (!after) throw new Error("Linear pagination omitted the next cursor");
  }
  return sourceIds;
}

async function createLinearIssue(composio, message, decision, signal, expected) {
  const result = await composio.tools.execute(
    LINEAR_CREATE,
    {
      userId: expected.composioUserId,
      connectedAccountId: expected.linearConnectedAccountId,
      version: LINEAR_TOOL_VERSION,
      arguments: buildLinearIssueArguments(message, decision, expected),
    },
    requestOptions(signal),
  );
  const data = requiredSuccessful(result, "Linear create");
  const id = String(data.id ?? "");
  if (!id) throw new Error("Linear create omitted the issue ID");
  return { id, reference: String(data.identifier ?? data.issueIdentifier ?? id) };
}

async function sendOwnerSlack(composio, arguments_, signal, expected) {
  const result = await composio.tools.execute(
    TOOL_SLUG,
    {
      userId: expected.composioUserId,
      connectedAccountId: expected.sendConnectedAccountId,
      version: TOOL_VERSION,
      arguments: arguments_,
    },
    requestOptions(signal),
  );
  const data = requiredSuccessful(result, "Slack owner escalation");
  if (!data.ok || !isSlackTimestamp(data.ts)) throw new Error("Slack escalation omitted provider confirmation");
  return data.ts;
}

async function markRead(composio, message, signal, expected) {
  if (!message.labelIds.includes("UNREAD")) return "already_read";
  const result = await composio.tools.execute(
    GMAIL_MODIFY_LABELS,
    {
      userId: expected.composioUserId,
      connectedAccountId: expected.gmailConnectedAccountId,
      version: GMAIL_TOOL_VERSION,
      arguments: { user_id: "me", message_id: message.messageId, add_label_ids: [], remove_label_ids: ["UNREAD"] },
    },
    requestOptions(signal),
  );
  requiredSuccessful(result, "Gmail mark read");
  return "marked_read";
}

async function processMessage({ composio, classifier, state, listMessage, occurrenceId, signal, expected, onEvent, linearSourceIds }) {
  const messageId = String(firstDefined(listMessage, ["messageId", "message_id", "id"]) ?? "");
  if (!/^[0-9a-fA-F]+$/u.test(messageId)) throw new Error("Gmail list returned an invalid message ID");
  const claim = await state.claim(messageId, occurrenceId);
  if (!claim.claimed) return { state: "duplicate" };
  let message;
  let decision;
  let slackAttempted = false;
  try {
    message = await hydrateMessage(composio, messageId, signal, expected);
    decision = await classifier(message, signal);
    let linearIssue;
    if (decision.action !== "ignore") {
      const existing = linearSourceIds.get(message.messageId);
      linearIssue = existing
        ? { id: existing, reference: existing }
        : await createLinearIssue(composio, message, decision, signal, expected);
      linearSourceIds.set(message.messageId, linearIssue.reference);
    }
    let slackTimestamp;
    if (decision.action === "block") {
      slackAttempted = true;
      slackTimestamp = await sendOwnerSlack(
        composio,
        buildOwnerSlackArguments(message, decision, linearIssue?.reference, expected),
        signal,
        expected,
      );
    }
    const readState = await markRead(composio, message, signal, expected);
    await state.confirm(claim.name, {
      action: decision.action,
      priority: decision.priority,
      linearIssueHash: linearIssue ? hash(linearIssue.id) : null,
      slackMessageHash: slackTimestamp ? hash(slackTimestamp) : null,
      readState,
    });
    onEvent("mailbox_message_confirmed", { message_hash: claim.messageDigest, action: decision.action });
    return { state: "confirmed", action: decision.action };
  } catch (error) {
    const errorClass = classifyError(error);
    let fallbackSlackHash = null;
    if (message && !slackAttempted) {
      try {
        const fallbackDecision = {
          options: ["Open the source email and provide the missing context", "Route the message to the correct PE-CC-Dev owner"],
          question: "Which route should I use for this email?",
          reason: `Mailbox processing failed closed (${errorClass}); no sender reply was made.`,
        };
        const ts = await sendOwnerSlack(
          composio,
          buildOwnerSlackArguments(message, fallbackDecision, null, expected),
          signal,
          expected,
        );
        fallbackSlackHash = hash(ts);
      } catch {
        // The original outcome remains ambiguous; a second provider effect is never retried.
      }
    }
    await state.ambiguous(claim.name, errorClass, { fallbackSlackHash });
    onEvent("mailbox_message_ambiguous", { message_hash: claim.messageDigest, error_class: errorClass });
    return { state: "ambiguous", errorClass };
  }
}

export async function runMailboxOccurrence({
  composio,
  classifier = classifyMailboxMessage,
  state,
  signal,
  expected = APPROVED,
  onEvent = () => {},
  now = new Date(),
}) {
  const cursor = await state.initialize(Math.floor(now.getTime() / 1_000));
  if (cursor.bootstrapped) {
    onEvent("mailbox_bootstrapped", { occurrence_hash: hash(mailboxOccurrenceId(now)) });
    return { state: "bootstrapped", processed: 0 };
  }
  const occurrenceId = mailboxOccurrenceId(now);
  const candidates = await listCandidateMessages(composio, cursor.epochSeconds, signal, expected);
  const linearSourceIds = candidates.length
    ? await listKnownLinearSourceIds(composio, signal, expected)
    : new Map();
  let processed = 0;
  for (const candidate of candidates) {
    if (signal.aborted) throw new Error("Mailbox occurrence aborted");
    const result = await processMessage({
      composio, classifier, state, listMessage: candidate, occurrenceId, signal, expected, onEvent, linearSourceIds,
    });
    if (result.state !== "duplicate") processed += 1;
  }
  await state.advanceCursor(Math.floor(now.getTime() / 1_000));
  onEvent("mailbox_occurrence_complete", {
    occurrence_hash: hash(occurrenceId),
    candidate_count: candidates.length,
    processed_count: processed,
  });
  return { state: "complete", processed, candidates: candidates.length };
}

export async function startMailboxExecutor({ composio, expected = APPROVED, onEvent = () => {}, stateDirectory = MAYA_MAILBOX_STATE_DIR }) {
  const controller = new AbortController();
  const state = new MailboxState(stateDirectory);
  let timer;
  let active = Promise.resolve();
  let stopped = false;
  const run = () => {
    if (stopped) return;
    active = runMailboxOccurrence({ composio, state, signal: controller.signal, expected, onEvent })
      .catch((error) => onEvent("mailbox_occurrence_failed", { error_class: classifyError(error) }))
      .finally(() => schedule());
  };
  const schedule = () => {
    if (stopped) return;
    const delay = millisecondsUntilNextHalfHour();
    onEvent("mailbox_next_occurrence_scheduled", { delay_ms: delay });
    timer = setTimeout(run, delay);
  };
  const initial = await state.initialize();
  if (initial.bootstrapped) {
    onEvent("mailbox_bootstrapped", { occurrence_hash: hash(mailboxOccurrenceId()) });
  }
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
