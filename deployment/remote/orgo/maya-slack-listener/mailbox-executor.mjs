import { createHash } from "node:crypto";
import { classifyMailboxMessage } from "./mailbox-hermes.mjs";
import { MailboxState, mailboxOccurrenceId, millisecondsUntilNextHalfHour } from "./mailbox-state.mjs";
import {
  commentLinearIssue,
  sourceKeysForMessage,
  updateLinearIssue,
} from "./linear-orchestration.mjs";
import {
  classifyAccountingAlias,
  ensureCommandCenterLinearPair,
  recordCommandCenterIntake,
} from "./command-center-client.mjs";
import {
  APPROVED,
  ACKNOWLEDGEMENT_DOMAINS,
  GMAIL_TOOL_VERSION,
  MAILBOX_CLEANUP_MAX_PAGES,
  MAILBOX_MAX_PAGES,
  MAILBOX_PAGE_SIZE,
  MAYA_EMAIL_ADDRESS,
  MAYA_MAILBOX_STATE_DIR,
  REQUIRED_EMAIL_CC,
} from "./policy.mjs";
import { TOOL_SLUG, TOOL_VERSION, classifyError, isSlackTimestamp } from "./core.mjs";

const GMAIL_FETCH = "GMAIL_FETCH_EMAILS";
const GMAIL_FETCH_MESSAGE = "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID";
const GMAIL_MODIFY_LABELS = "GMAIL_ADD_LABEL_TO_EMAIL";
const GMAIL_REPLY = "GMAIL_REPLY_TO_THREAD";

const ACCOUNTING_SIGNAL = /\b(?:accounting|accounts? payable|accounts? receivable|a\/?p|a\/?r|invoice|bill|statement|credit memo|remittance|job cost|change order|draw request|insurance supplement|depreciation|price list|pricing|price agreement|vendor price|supplier price|purchase order|quote|estimate)\b/iu;
const PROTECTED_SIGNAL = /\b(?:payroll|human resources|social security|ssn|bank account|routing number|wire transfer|payment authorization|pay this|release payment|credential|password|mfa|security key|login attempt|sign-in|legal notice|subpoena)\b/iu;
const ACCOUNTING_ALIAS = /(?:^|[,;\s<])(?:invoices|ap|creditmemos|priceagreement|ar)@cc\.proexteriorsus\.net\b/iu;
const PROTECTED_ALIAS = /(?:^|[,;\s<])(?:hr|payroll)@cc\.proexteriorsus\.net\b/iu;
const DOCUMENT_FILENAME = /\.(?:pdf|csv|xlsx?|docx?|zip|txt|rtf|ods|odt)$/iu;
const DOCUMENT_MIME = /(?:pdf|spreadsheet|excel|csv|wordprocessingml|msword|zip|plain|rtf|opendocument)/iu;
const LINEAR_IDENTIFIER = /^[A-Z][A-Z0-9]*-\d+$/u;

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
    senderEmail: extractEmailAddress(String(firstDefined(data, ["sender", "from"]) ?? headers.from ?? "")),
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
          attachmentId: String(firstDefined(item, ["attachmentId", "attachment_id", "id"]) ?? "").slice(0, 2_000),
          size: Number(firstDefined(item, ["size", "sizeBytes", "size_bytes"]) ?? 0),
        }))
      : [],
    displayUrl: String(firstDefined(data, ["displayUrl", "display_url"]) ?? `https://mail.google.com/mail/u/0/#inbox/${messageId}`),
  });
}

function extractEmailAddress(value) {
  const bracketed = value.match(/<([^<>\s@]+@[^<>\s@]+)>/u)?.[1];
  const plain = value.match(/(?:^|\s)([^<>\s@]+@[^<>\s@]+)(?:$|\s)/u)?.[1];
  return String(bracketed ?? plain ?? "").toLowerCase().slice(0, 320);
}

export function senderCanReceiveAcknowledgement(senderEmail, domains = ACKNOWLEDGEMENT_DOMAINS) {
  const address = String(senderEmail ?? "").trim().toLowerCase();
  if (address === MAYA_EMAIL_ADDRESS) return false;
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return false;
  const senderDomain = address.slice(at + 1);
  return domains.some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`));
}

function approvedInternalFallbackDecision(message) {
  return Object.freeze({
    version: 1,
    action: "track",
    priority: 3,
    title: `[MAYA] Accounting intake: ${message.subject}`.slice(0, 140),
    summary: "An approved internal sender emailed Maya's accounting mailbox and the message requires review.",
    reason: "Approved internal-domain mail is acknowledged and tracked even when automated classification is unavailable or returns non-actionable.",
    question: "",
    options: [],
  });
}

function securityAuthorizationDecision(message) {
  const content = `${message.subject}\n${message.body}`;
  if (message.senderEmail === "no-reply@accounts.google.com" && /\b(?:security alert|security key|new sign-in|login attempt)\b/iu.test(content)) {
    const securityKey = /\bsecurity key\b/iu.test(content);
    return Object.freeze({
      version: 1,
      action: "block",
      priority: 1,
      title: securityKey
        ? "[MAYA] Google security-key authorization check"
        : "[MAYA] Google account-security authorization check",
      summary: securityKey
        ? "Google reported that a new security key was added to Maya's Google account."
        : "Google reported an account-security event for Maya's Google account.",
      reason: "This is an owner-authorization check. The notification alone does not identify who performed the change or prove that account recovery is required.",
      question: securityKey
        ? "Did you authorize the reported addition of a security key to Maya's Google account?"
        : "Did you authorize the reported Google account-security event?",
      options: [
        "Yes — mark the alert reviewed and retain it as evidence",
        "No or unsure — secure the account and review recent activity",
      ],
    });
  }
  if (message.senderEmail === "feedback@slack.com" && /\b(?:login attempt|new sign-in|security alert)\b/iu.test(content)) {
    return Object.freeze({
      version: 1,
      action: "block",
      priority: 1,
      title: "[MAYA] Slack login authorization check",
      summary: "Slack reported a recent login attempt for the pe-command-center workspace. The notification does not say that Maya's account was deactivated.",
      reason: "This is an owner-authorization check. The notification reports only a login attempt and does not establish the account's broader status.",
      question: "Did you authorize the reported Slack login attempt?",
      options: [
        "Yes — mark the alert reviewed and retain it as evidence",
        "No or unsure — review Slack sessions and secure the account",
      ],
    });
  }
  return null;
}

export function enforceMailboxPolicy(message, decision) {
  if (message.senderEmail === MAYA_EMAIL_ADDRESS) {
    return Object.freeze({
      ...decision,
      action: "ignore",
      priority: 3,
      title: "",
      summary: "Maya's own sent message is not new inbound accounting work.",
      reason: "Self-authored and Sent mail is excluded to prevent receipt and task loops.",
      question: "",
      options: [],
    });
  }
  const securityDecision = securityAuthorizationDecision(message);
  if (securityDecision) return securityDecision;
  const content = `${message.recipients}\n${message.subject}\n${message.body}`;
  const protectedReview = PROTECTED_SIGNAL.test(content) || PROTECTED_ALIAS.test(message.recipients);
  const documentReview = message.attachments.some(
    (item) => DOCUMENT_FILENAME.test(item.filename) || DOCUMENT_MIME.test(item.mimeType),
  );
  const accountingReview = ACCOUNTING_SIGNAL.test(content) || ACCOUNTING_ALIAS.test(message.recipients);
  if (protectedReview && decision.action !== "block") {
    return Object.freeze({
      ...decision,
      action: "block",
      priority: Math.min(decision.priority, 2),
      title: decision.title || `[MAYA] Protected accounting intake: ${message.subject}`.slice(0, 140),
      reason: "Protected, payment, payroll, HR, credential, or legal content requires human review.",
      question: "Which approved owner should review this protected intake?",
      options: ["Review in the pinned admin Slack route", "Route to the authorized functional owner"],
    });
  }
  if ((documentReview || accountingReview) && decision.action === "ignore") {
    return Object.freeze({
      ...decision,
      action: "track",
      priority: 3,
      title: `[MAYA] Accounting intake: ${message.subject}`.slice(0, 140),
      reason: documentReview
        ? "The message contains a document that requires accounting intake review."
        : "The message contains an accounting, price, or vendor-pricing request that requires review.",
      question: "",
      options: [],
    });
  }
  return decision;
}

export function buildAcknowledgementArguments(message) {
  if (!senderCanReceiveAcknowledgement(message.senderEmail)) {
    throw new Error("Sender is not eligible for an automatic acknowledgement");
  }
  if (!/^[0-9a-fA-F]+$/u.test(message.threadId)) throw new Error("Gmail thread ID is invalid");
  return {
    user_id: "me",
    thread_id: message.threadId,
    recipient_email: message.senderEmail,
    message_body: [
      "[MAYA]",
      "",
      "Hi there,",
      "",
      "Thank you for sending this. I've received your email, and I'm working on it now. I'll follow up if I need any additional information.",
      "",
      "Best,",
      "Maya Chen",
      "Accounting Assistant | Pro Exteriors",
    ].join("\n"),
    is_html: false,
    cc: [...REQUIRED_EMAIL_CC],
  };
}

export function buildLinearSourceIssueArguments(message, decision, sourceKeys, expected = APPROVED) {
  if (!expected.linearSourceTeamId || !expected.linearSourceProjectId) {
    throw new Error("Linear CAT source routing is not pinned");
  }
  return {
    team_id: expected.linearSourceTeamId,
    project_id: expected.linearSourceProjectId,
    parent_id: expected.linearSourceParentId,
    state_id: expected.linearSourceReviewStateId,
    assignee_id: expected.linearReviewerId,
    title: `[Maya intake][Accounting] ${decision.title.replace(/^\[MAYA\]\s*/u, "")}`.slice(0, 140),
    priority: decision.priority,
    description: [
      "Maya CAT source: true",
      ...sourceKeys.map((key) => `Maya source key: ${key}`),
      "Source channel: gmail",
      `Source sender: ${message.sender}`,
      `Received: ${message.receivedAt}`,
      `Gmail message ID: ${message.messageId}`,
      `Gmail source: ${message.displayUrl}`,
      "",
      "## Intake decision",
      decision.summary,
      "",
      "## Audit contract",
      "All accounting-team work, Command Center effects, communication receipts, and Fast.io artifacts must link to this CAT source. This source remains open until every child is reviewed or completed.",
    ].join("\n").slice(0, 8_000),
  };
}

export function buildLinearIssueArguments(message, decision, catSource, sourceKeys = sourceKeysForMessage(message), expected = APPROVED) {
  if (!expected.linearWorkTeamId || !catSource?.id) throw new Error("Linear downstream routing is not pinned");
  const attachmentSummary = message.attachments.length
    ? message.attachments.map((item) => `- ${item.filename} (${item.mimeType})`).join("\n")
    : "- None reported";
  return {
    team_id: expected.linearWorkTeamId,
    parent_id: catSource.id,
    state_id: expected.linearWorkReviewStateId,
    assignee_id: expected.linearReviewerId,
    title: decision.title,
    priority: decision.priority,
    description: [
      "[MAYA] Mailbox intake decision",
      `CAT source issue: ${catSource.reference}`,
      ...sourceKeys.map((key) => `Maya source key: ${key}`),
      "Maya execution gate: move this issue to Agent Todo",
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
      "Maya may send only the standard receipt acknowledgement to an approved internal sender domain. No substantive sender commitment was made. Any payment, approval, access, or irreversible action still requires Christopher's approval.",
    ].join("\n").slice(0, 8_000),
  };
}

export function buildOwnerSlackArguments(message, decision, linearReference, expected = APPROVED) {
  if (!expected.ownerSlackChannelId || !expected.ownerSlackUserId) {
    throw new Error("Owner Slack destination is not pinned");
  }
  const blocked = decision.action === "block" || !decision.action;
  const options = (decision.options ?? []).map((item, index) => `${index + 1}. ${item}`).join(" ");
  const safeLinearReference = LINEAR_IDENTIFIER.test(String(linearReference ?? ""))
    ? String(linearReference)
    : linearReference
      ? "the new CAT-first accounting issue pair"
      : "";
  if (!blocked) {
    return {
      channel: expected.ownerSlackChannelId,
      markdown_text: [
        `[NA-5][MAYA] - <@${expected.ownerSlackUserId}> [REVIEW] New accounting email recorded in CODEX AGENT TEAM with linked PE-CC work${safeLinearReference ? ` as ${safeLinearReference}` : ""}.`,
        `Source: ${message.subject} from ${message.sender}.`,
        "Status: CAT source and accounting child are assigned to Christopher in Agent Review; the Gmail source is preserved.",
      ].join(" ").replace(/<@(?!U0B8SGJJZLJ)[^>]+>/gu, "[reference removed]").slice(0, 1_500),
      reply_broadcast: false,
      unfurl_links: false,
      unfurl_media: false,
    };
  }
  const text = [
    `[NA-5][MAYA] - <@${expected.ownerSlackUserId}> [BLOCKED] Mailbox task needs context and routing.`,
    `Source: ${message.subject} from ${message.sender}.`,
    `Completed: reviewed and classified${safeLinearReference ? `; tracked as ${safeLinearReference}` : ""}.`,
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
          query: `after:${cursorDate} -in:sent -from:${MAYA_EMAIL_ADDRESS} -in:spam -in:trash`,
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

async function listInboxCleanupCandidates(composio, signal, expected) {
  const messages = [];
  let pageToken;
  let truncated = false;
  for (let page = 0; page < MAILBOX_CLEANUP_MAX_PAGES; page += 1) {
    const result = await composio.tools.execute(
      GMAIL_FETCH,
      {
        userId: expected.composioUserId,
        connectedAccountId: expected.gmailConnectedAccountId,
        version: GMAIL_TOOL_VERSION,
        arguments: {
          user_id: "me",
          query: `in:inbox -in:sent -from:${MAYA_EMAIL_ADDRESS} -in:spam -in:trash`,
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
    const data = requiredSuccessful(result, "Gmail cleanup list");
    messages.push(...extractMessages(data));
    pageToken = firstDefined(data, ["nextPageToken", "next_page_token"]);
    if (!pageToken) break;
    if (page === MAILBOX_CLEANUP_MAX_PAGES - 1) truncated = true;
  }
  return {
    candidates: messages.sort((left, right) => parseMessageEpochMs(left) - parseMessageEpochMs(right)),
    truncated,
  };
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

async function sendAcknowledgement(composio, message, signal, expected) {
  const result = await composio.tools.execute(
    GMAIL_REPLY,
    {
      userId: expected.composioUserId,
      connectedAccountId: expected.gmailConnectedAccountId,
      version: GMAIL_TOOL_VERSION,
      arguments: buildAcknowledgementArguments(message),
    },
    requestOptions(signal),
  );
  const data = requiredSuccessful(result, "Gmail acknowledgement");
  return String(data.messageId ?? data.message_id ?? data.id ?? message.threadId);
}

export function mailboxLabelPlan(action) {
  if (action === "block") {
    return Object.freeze({ add: ["STARRED", "IMPORTANT"], remove: ["UNREAD"] });
  }
  if (action === "track") {
    return Object.freeze({ add: ["STARRED"], remove: ["UNREAD", "INBOX"] });
  }
  return Object.freeze({ add: [], remove: ["UNREAD", "INBOX"] });
}

async function fileMailboxMessage(composio, message, action, signal, expected) {
  const plan = mailboxLabelPlan(action);
  const add = plan.add.filter((label) => !message.labelIds.includes(label));
  const remove = plan.remove.filter((label) => message.labelIds.includes(label));
  if (add.length === 0 && remove.length === 0) return "labels_already_applied";
  const result = await composio.tools.execute(
    GMAIL_MODIFY_LABELS,
    {
      userId: expected.composioUserId,
      connectedAccountId: expected.gmailConnectedAccountId,
      version: GMAIL_TOOL_VERSION,
      arguments: { user_id: "me", message_id: message.messageId, add_label_ids: add, remove_label_ids: remove },
    },
    requestOptions(signal),
  );
  requiredSuccessful(result, "Gmail file message");
  return `labels:${add.join(",")}:${remove.join(",")}`;
}

async function processMessage({ composio, classifier, capabilityAgent, recordIntake, recordLinearPair, state, listMessage, occurrenceId, signal, expected, onEvent, allowAcknowledgement = true }) {
  const messageId = String(firstDefined(listMessage, ["messageId", "message_id", "id"]) ?? "");
  if (!/^[0-9a-fA-F]+$/u.test(messageId)) throw new Error("Gmail list returned an invalid message ID");
  const claim = await state.claim(messageId, occurrenceId);
  if (!claim.claimed) return { state: "duplicate" };
  let message;
  let decision;
  let slackAttempted = false;
  let acknowledgementAttempted = false;
  let acknowledgementReference;
  try {
    message = await hydrateMessage(composio, messageId, signal, expected);
    try {
      decision = enforceMailboxPolicy(message, await classifier(message, signal));
    } catch (error) {
      if (!senderCanReceiveAcknowledgement(message.senderEmail)) throw error;
      decision = approvedInternalFallbackDecision(message);
      onEvent("mailbox_internal_classifier_fallback", { message_hash: claim.messageDigest });
    }
    if (senderCanReceiveAcknowledgement(message.senderEmail) && decision.action === "ignore") {
      decision = approvedInternalFallbackDecision(message);
      onEvent("mailbox_internal_ignore_promoted", { message_hash: claim.messageDigest });
    }
    let linearPair;
    let sourceKeys = [];
    if (decision.action !== "ignore") {
      sourceKeys = sourceKeysForMessage(message);
      linearPair = await recordLinearPair({
        payload: {
          sourceKeys,
          messageId: message.messageId,
          sourceChannel: "gmail",
          sender: message.sender,
          receivedAt: message.receivedAt,
          subject: message.subject,
          summary: decision.summary,
          reason: decision.reason,
          priority: decision.priority,
          attachments: message.attachments.map((attachment) => attachment.filename),
        },
        signal,
        expected,
      });
      await state.recordAction(claim.name, "command_center_linear_cat_source", linearPair.source.id);
      await state.recordAction(claim.name, "command_center_linear_accounting_child", linearPair.work.id);
      const route = classifyAccountingAlias(message.recipients);
      const intake = await recordIntake({
        payload: {
          messageId: message.messageId,
          externalEventId: message.messageId,
          sourceChannel: "gmail",
          sourceThreadId: message.threadId,
          orchestrationKey: sourceKeys[0],
          catSourceIssue: linearPair.source.reference,
          downstreamIssue: linearPair.work.reference,
          alias: route.alias,
          classification: route.classification,
          subject: message.subject,
          from: message.sender,
          receivedAt: message.receivedAt,
          attachments: message.attachments.map((attachment) => attachment.filename),
          gmailLabels: message.labelIds,
          slackChannelId: "",
          slackThreadTs: "",
        },
        signal,
        expected,
      });
      await state.recordAction(claim.name, "command_center_intake", intake.providerReference);
    }
    if (allowAcknowledgement && decision.action !== "ignore" && senderCanReceiveAcknowledgement(message.senderEmail)) {
      acknowledgementAttempted = true;
      acknowledgementReference = await sendAcknowledgement(composio, message, signal, expected);
      await state.recordAction(claim.name, "gmail_acknowledgement", acknowledgementReference);
    }
    if (capabilityAgent && decision.action !== "ignore") {
      // A capability run may perform multiple external writes. Any uncertain failure
      // is terminally ambiguous, so the legacy fallback send must not run afterward.
      slackAttempted = true;
      const result = await capabilityAgent({
        source: "email",
        request: JSON.stringify({
          sender: message.sender,
          senderEmail: message.senderEmail,
          recipients: message.recipients,
          subject: message.subject,
          body: message.body,
          receivedAt: message.receivedAt,
          messageId: message.messageId,
          threadId: message.threadId,
          displayUrl: message.displayUrl,
          attachments: message.attachments,
        }),
        sourceContext: {
          messageId: message.messageId,
          threadId: message.threadId,
          senderEmail: message.senderEmail,
          ownerSlackChannelId: expected.ownerSlackChannelId,
          ownerSlackUserId: expected.ownerSlackUserId,
          catSourceIssue: linearPair.source.reference,
          linearWorkIssue: linearPair.work.reference,
        },
        composio,
        signal,
        expected: Object.freeze({
          ...expected,
          capabilityMode: "mailbox",
          allowedLinearIssueIds: [linearPair.source.reference, linearPair.source.id, linearPair.work.reference, linearPair.work.id],
        }),
        store: state,
        claimName: claim.name,
        onEvent,
      });
      const commentId = await commentLinearIssue(
        composio,
        linearPair.work.id,
        `[MAYA] Work result\n\n${result.text.slice(0, 3_000)}\n\nCAT source: ${linearPair.source.reference}`,
        signal,
        expected,
      );
      await state.recordAction(claim.name, "linear_result_comment", commentId);
      await updateLinearIssue(composio, linearPair.work.id, { stateId: expected.linearWorkReviewStateId }, signal, expected);
      await state.recordAction(claim.name, "linear_work_agent_review", linearPair.work.id);
      await updateLinearIssue(composio, linearPair.source.id, { stateId: expected.linearSourceReviewStateId }, signal, expected);
      await state.recordAction(claim.name, "linear_source_agent_review", linearPair.source.id);
      const readState = await fileMailboxMessage(composio, message, decision.action, signal, expected);
      await state.confirm(claim.name, {
        action: "capability_work",
        confirmedWrites: result.confirmedWrites,
        finalDigest: hash(result.text),
        acknowledgementHash: acknowledgementReference ? hash(acknowledgementReference) : null,
        readState,
      });
      onEvent("mailbox_message_confirmed", { message_hash: claim.messageDigest, action: "capability_work" });
      return { state: "confirmed", action: "capability_work" };
    }
    let slackTimestamp;
    if (decision.action !== "ignore") {
      slackAttempted = true;
      slackTimestamp = await sendOwnerSlack(
        composio,
        buildOwnerSlackArguments(
          message,
          decision,
          linearPair?.source.reference,
          expected,
        ),
        signal,
        expected,
      );
      await state.recordAction(claim.name, "slack_send", slackTimestamp);
    }
    const readState = await fileMailboxMessage(composio, message, decision.action, signal, expected);
    if (readState !== "labels_already_applied") {
      await state.recordAction(claim.name, "gmail_file", `${message.messageId}:${decision.action}`);
    }
    await state.confirm(claim.name, {
      action: decision.action,
      priority: decision.priority,
      linearSourceIssueHash: linearPair ? hash(linearPair.source.id) : null,
      linearWorkIssueHash: linearPair ? hash(linearPair.work.id) : null,
      slackMessageHash: slackTimestamp ? hash(slackTimestamp) : null,
      acknowledgementHash: acknowledgementReference ? hash(acknowledgementReference) : null,
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
          reason: acknowledgementReference
            ? `Mailbox processing failed closed (${errorClass}) after the sender receipt was provider-confirmed; downstream work remains in review.`
            : acknowledgementAttempted
              ? `Mailbox processing failed closed (${errorClass}); the sender-reply outcome is ambiguous and must not be retried automatically.`
              : `Mailbox processing failed closed (${errorClass}); no sender reply was made.`,
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
  capabilityAgent,
  recordIntake = recordCommandCenterIntake,
  recordLinearPair = ensureCommandCenterLinearPair,
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
  let processed = 0;
  for (const candidate of candidates) {
    if (signal.aborted) throw new Error("Mailbox occurrence aborted");
    const result = await processMessage({
      composio, classifier, capabilityAgent, recordIntake, recordLinearPair, state, listMessage: candidate, occurrenceId, signal, expected, onEvent,
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

export async function runInboxCleanup({
  composio,
  classifier = classifyMailboxMessage,
  state,
  signal,
  expected = APPROVED,
  onEvent = () => {},
  allowAcknowledgement = false,
  recordIntake = recordCommandCenterIntake,
  recordLinearPair = ensureCommandCenterLinearPair,
  now = new Date(),
}) {
  await state.initialize(Math.floor(now.getTime() / 1_000));
  const occurrenceId = `maya-chen:mailbox-cleanup:${now.toISOString()}`;
  const { candidates, truncated } = await listInboxCleanupCandidates(composio, signal, expected);
  let processed = 0;
  let duplicates = 0;
  let ambiguous = 0;
  for (const candidate of candidates) {
    if (signal.aborted) throw new Error("Mailbox cleanup aborted");
    const result = await processMessage({
      composio,
      classifier,
      recordIntake,
      recordLinearPair,
      state,
      listMessage: candidate,
      occurrenceId,
      signal,
      expected,
      onEvent,
      allowAcknowledgement,
    });
    if (result.state === "duplicate") duplicates += 1;
    else {
      processed += 1;
      if (result.state === "ambiguous") ambiguous += 1;
    }
  }
  onEvent("mailbox_cleanup_complete", {
    candidate_count: candidates.length,
    processed_count: processed,
    duplicate_count: duplicates,
    ambiguous_count: ambiguous,
    truncated,
  });
  return { state: "complete", candidates: candidates.length, processed, duplicates, ambiguous, truncated };
}

export async function startMailboxExecutor({ composio, expected = APPROVED, onEvent = () => {}, stateDirectory = MAYA_MAILBOX_STATE_DIR, capabilityAgent }) {
  const controller = new AbortController();
  const state = new MailboxState(stateDirectory);
  let timer;
  let active = Promise.resolve();
  let stopped = false;
  const run = () => {
    if (stopped) return;
    active = runMailboxOccurrence({ composio, state, signal: controller.signal, expected, onEvent, capabilityAgent })
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
