import { createHash } from "node:crypto";
import { APPROVED, GMAIL_TOOL_VERSION, LINEAR_TOOL_VERSION } from "./policy.mjs";
import { PREFIX, TOOL_VERSION, isSlackTimestamp } from "./core.mjs";

export const OWNER_EMAIL = "admin@cc.proexteriorsus.net";
export const MAX_CAPABILITY_STEPS = 8;

export const CAPABILITY_CATALOG = Object.freeze([
  ["gmail_search", "Search Maya's Gmail mailbox."],
  ["gmail_get_message", "Read one Gmail message by messageId."],
  ["gmail_get_thread", "Read a Gmail thread by threadId."],
  ["gmail_get_attachment", "Retrieve one Gmail attachment using messageId, attachmentId, and fileName."],
  ["gmail_reply", "Reply in a Gmail thread; body and optional recipientEmail. The owner CC is added in code."],
  ["gmail_send", "Send a new email with recipientEmail, subject, and body. The owner CC is added in code."],
  ["gmail_draft", "Create an email draft with recipientEmail, subject, and body. The owner CC is added in code."],
  ["gmail_label", "Add or remove Gmail label IDs on a message."],
  ["gmail_trash", "Move one Gmail message to Trash; this is recoverable."],
  ["linear_search", "Search PE-CC-Dev Linear issues."],
  ["linear_get_issue", "Read one Linear issue by identifier or UUID."],
  ["linear_list", "List PE-CC-Dev Linear issues."],
  ["linear_create", "Create a PE-CC-Dev Linear issue."],
  ["linear_update", "Update a PE-CC-Dev Linear issue."],
  ["linear_comment", "Add a comment to a PE-CC-Dev Linear issue."],
  ["slack_search", "Search Slack messages accessible to Maya."],
  ["slack_history", "Read accessible Slack channel history by channel ID."],
  ["slack_thread", "Read an accessible Slack thread by channel ID and parent timestamp."],
  ["slack_channels", "List Slack channels accessible to Maya."],
  ["slack_send", "Send a Maya-attributed Slack message to an accessible channel or thread."],
  ["slack_update", "Update a Slack message authored by Maya."],
  ["slack_upload_content", "Create and share a text file in Slack."],
]);

const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u;
const HEX_ID = /^[0-9a-fA-F]+$/u;
const SAFE_ID = /^[A-Za-z0-9_-]{3,128}$/u;
const LINEAR_ISSUE = /^(?:[A-Z][A-Z0-9]+-\d+|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27})$/u;
const SECRET_LANGUAGE = /(?:api[_ -]?key|access token|refresh token|password|signing secret|client secret|private key)/iu;
const WRITE_ACTIONS = new Set([
  "gmail_reply", "gmail_send", "gmail_draft", "gmail_label", "gmail_trash",
  "linear_create", "linear_update", "linear_comment",
  "slack_send", "slack_update", "slack_upload_content",
]);

function cleanString(value, name, limit = 8_000) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const cleaned = value.replace(/\u0000/gu, "").trim();
  if (!cleaned || cleaned.length > limit) throw new Error(`${name} is empty or too long`);
  return cleaned;
}

function optionalString(value, name, limit = 8_000) {
  if (value === undefined || value === null || value === "") return undefined;
  return cleanString(value, name, limit);
}

function email(value, name) {
  const cleaned = cleanString(value, name, 320);
  if (!EMAIL.test(cleaned)) throw new Error(`${name} is not a valid email address`);
  return cleaned.toLowerCase();
}

function emailList(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error(`${name} must be a bounded array`);
  return [...new Set(value.map((item) => email(item, name)))];
}

function id(value, name, pattern = SAFE_ID) {
  const cleaned = cleanString(value, name, 160);
  if (!pattern.test(cleaned)) throw new Error(`${name} is invalid`);
  return cleaned;
}

function integer(value, fallback, min, max) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error("numeric argument is out of bounds");
  return value;
}

function attributedEmailSubject(value) {
  const subject = cleanString(value, "subject", 480);
  return subject.startsWith("[MAYA]") ? subject : `[MAYA] ${subject}`;
}

function attributedBody(value) {
  const body = cleanString(value, "body", 20_000);
  if (SECRET_LANGUAGE.test(body)) throw new Error("outbound content contains protected credential language");
  return body.startsWith("[MAYA]") ? body : `[MAYA]\n\n${body}`;
}

function attributedSlack(value) {
  const body = cleanString(value, "markdownText", 3_500)
    .replace(/<[@#!][^>]+>/gu, "[reference removed]")
    .replace(/<![^>]+>/gu, "[reference removed]");
  if (SECRET_LANGUAGE.test(body)) throw new Error("outbound content contains protected credential language");
  return body.startsWith(PREFIX) ? body : `${PREFIX} ${body}`;
}

function attributedLinear(value, name, limit) {
  const body = cleanString(value, name, limit);
  if (SECRET_LANGUAGE.test(body)) throw new Error("Linear content contains protected credential language");
  return body.startsWith("[MAYA]") ? body : `[MAYA] ${body}`;
}

function withOwnerCc(value) {
  return [...new Set([...emailList(value, "cc"), OWNER_EMAIL])];
}

function executeInput(expected, connectedAccountId, version, arguments_) {
  return { userId: expected.composioUserId, connectedAccountId, version, arguments: arguments_ };
}

export function normalizeCapabilityAction(value, expected = APPROVED) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("capability action must be an object");
  const name = cleanString(value.name, "action name", 80);
  if (!CAPABILITY_CATALOG.some(([candidate]) => candidate === name)) throw new Error("unknown capability action");
  const args = value.arguments && typeof value.arguments === "object" && !Array.isArray(value.arguments)
    ? value.arguments
    : {};
  let slug;
  let connection;
  let version;
  let arguments_;
  if (name === "gmail_search") {
    slug = "GMAIL_FETCH_EMAILS"; connection = expected.gmailConnectedAccountId; version = GMAIL_TOOL_VERSION;
    arguments_ = { user_id: "me", query: optionalString(args.query, "query", 1_000) ?? "in:anywhere", max_results: integer(args.maxResults, 50, 1, 100), ids_only: false, verbose: true, include_payload: true, include_spam_trash: false };
  } else if (name === "gmail_get_message") {
    slug = "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID"; connection = expected.gmailConnectedAccountId; version = GMAIL_TOOL_VERSION;
    arguments_ = { user_id: "me", message_id: id(args.messageId, "messageId", HEX_ID), format: "full" };
  } else if (name === "gmail_get_thread") {
    slug = "GMAIL_FETCH_MESSAGE_BY_THREAD_ID"; connection = expected.gmailConnectedAccountId; version = GMAIL_TOOL_VERSION;
    arguments_ = { user_id: "me", thread_id: id(args.threadId, "threadId", HEX_ID) };
  } else if (name === "gmail_get_attachment") {
    slug = "GMAIL_GET_ATTACHMENT"; connection = expected.gmailConnectedAccountId; version = GMAIL_TOOL_VERSION;
    arguments_ = { user_id: "me", message_id: id(args.messageId, "messageId", HEX_ID), attachment_id: cleanString(args.attachmentId, "attachmentId", 2_000), file_name: cleanString(args.fileName, "fileName", 255) };
  } else if (name === "gmail_reply") {
    slug = "GMAIL_REPLY_TO_THREAD"; connection = expected.gmailConnectedAccountId; version = GMAIL_TOOL_VERSION;
    arguments_ = { user_id: "me", thread_id: id(args.threadId, "threadId", HEX_ID), message_body: attributedBody(args.body), is_html: false, cc: withOwnerCc(args.cc), ...(args.recipientEmail ? { recipient_email: email(args.recipientEmail, "recipientEmail") } : {}), ...(args.extraRecipients ? { extra_recipients: emailList(args.extraRecipients, "extraRecipients") } : {}) };
  } else if (name === "gmail_send" || name === "gmail_draft") {
    slug = name === "gmail_send" ? "GMAIL_SEND_EMAIL" : "GMAIL_CREATE_EMAIL_DRAFT"; connection = expected.gmailConnectedAccountId; version = GMAIL_TOOL_VERSION;
    arguments_ = { user_id: "me", recipient_email: email(args.recipientEmail, "recipientEmail"), extra_recipients: emailList(args.extraRecipients, "extraRecipients"), cc: withOwnerCc(args.cc), subject: attributedEmailSubject(args.subject), body: attributedBody(args.body), is_html: false };
  } else if (name === "gmail_label") {
    slug = "GMAIL_ADD_LABEL_TO_EMAIL"; connection = expected.gmailConnectedAccountId; version = GMAIL_TOOL_VERSION;
    arguments_ = { user_id: "me", message_id: id(args.messageId, "messageId", HEX_ID), add_label_ids: boundedStrings(args.addLabels, "addLabels", 20, 100), remove_label_ids: boundedStrings(args.removeLabels, "removeLabels", 20, 100) };
  } else if (name === "gmail_trash") {
    slug = "GMAIL_MOVE_TO_TRASH"; connection = expected.gmailConnectedAccountId; version = GMAIL_TOOL_VERSION;
    arguments_ = { user_id: "me", message_id: id(args.messageId, "messageId", HEX_ID) };
  } else if (name === "linear_search") {
    slug = "LINEAR_SEARCH_ISSUES"; connection = expected.linearConnectedAccountId; version = LINEAR_TOOL_VERSION;
    arguments_ = { query: cleanString(args.query, "query", 500), first: integer(args.first, 25, 1, 50), include_archived: Boolean(args.includeArchived) };
  } else if (name === "linear_get_issue") {
    slug = "LINEAR_GET_LINEAR_ISSUE"; connection = expected.linearConnectedAccountId; version = LINEAR_TOOL_VERSION;
    arguments_ = { issue_id: id(args.issueId, "issueId", LINEAR_ISSUE) };
  } else if (name === "linear_list") {
    slug = "LINEAR_LIST_LINEAR_ISSUES"; connection = expected.linearConnectedAccountId; version = LINEAR_TOOL_VERSION;
    arguments_ = { first: integer(args.first, 100, 1, 250), include_transitions: Boolean(args.includeTransitions) };
  } else if (name === "linear_create") {
    slug = "LINEAR_CREATE_LINEAR_ISSUE"; connection = expected.linearConnectedAccountId; version = LINEAR_TOOL_VERSION;
    arguments_ = { team_id: expected.linearTeamId, title: attributedLinear(args.title, "title", 140), description: attributedLinear(args.description, "description", 12_000), priority: integer(args.priority, 3, 1, 4) };
  } else if (name === "linear_update") {
    slug = "LINEAR_UPDATE_ISSUE"; connection = expected.linearConnectedAccountId; version = LINEAR_TOOL_VERSION;
    arguments_ = { issueId: id(args.issueId, "issueId", LINEAR_ISSUE), ...(args.title ? { title: attributedLinear(args.title, "title", 140) } : {}), ...(args.description ? { description: attributedLinear(args.description, "description", 12_000) } : {}), ...(args.priority !== undefined ? { priority: integer(args.priority, 3, 0, 4) } : {}), ...(args.stateId ? { stateId: id(args.stateId, "stateId", /^[0-9a-fA-F-]{36}$/u) } : {}) };
  } else if (name === "linear_comment") {
    slug = "LINEAR_CREATE_LINEAR_COMMENT"; connection = expected.linearConnectedAccountId; version = LINEAR_TOOL_VERSION;
    arguments_ = { issueId: id(args.issueId, "issueId", LINEAR_ISSUE), body: attributedLinear(args.body, "body", 8_000) };
  } else if (name === "slack_search") {
    slug = "SLACKBOT_SEARCH_MESSAGES"; connection = expected.sendConnectedAccountId; version = TOOL_VERSION;
    arguments_ = { query: cleanString(args.query, "query", 500), count: integer(args.count, 50, 1, 100), sort: "timestamp", sort_dir: args.sortDirection === "asc" ? "asc" : "desc", highlight: false };
  } else if (name === "slack_history") {
    slug = "SLACKBOT_FETCH_CONVERSATION_HISTORY"; connection = expected.sendConnectedAccountId; version = TOOL_VERSION;
    arguments_ = { channel: id(args.channel, "channel"), limit: integer(args.limit, 100, 1, 200), ...(args.oldest ? { oldest: cleanString(args.oldest, "oldest", 32) } : {}) };
  } else if (name === "slack_thread") {
    slug = "SLACKBOT_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION"; connection = expected.sendConnectedAccountId; version = TOOL_VERSION;
    arguments_ = { channel: id(args.channel, "channel"), ts: slackTs(args.threadTs), limit: integer(args.limit, 100, 1, 200) };
  } else if (name === "slack_channels") {
    slug = "SLACKBOT_LIST_ALL_CHANNELS"; connection = expected.sendConnectedAccountId; version = TOOL_VERSION;
    arguments_ = { limit: integer(args.limit, 200, 1, 500), types: "public_channel,private_channel", exclude_archived: true };
  } else if (name === "slack_send") {
    slug = "SLACKBOT_SEND_MESSAGE"; connection = expected.sendConnectedAccountId; version = TOOL_VERSION;
    arguments_ = { channel: id(args.channel, "channel"), markdown_text: attributedSlack(args.markdownText), ...(args.threadTs ? { thread_ts: slackTs(args.threadTs) } : {}), reply_broadcast: false, unfurl_links: false, unfurl_media: false };
  } else if (name === "slack_update") {
    slug = "SLACKBOT_UPDATES_A_MESSAGE"; connection = expected.sendConnectedAccountId; version = TOOL_VERSION;
    arguments_ = { channel: id(args.channel, "channel"), ts: slackTs(args.ts), markdown_text: attributedSlack(args.markdownText), reply_broadcast: false };
  } else if (name === "slack_upload_content") {
    slug = "SLACKBOT_UPLOAD_OR_CREATE_A_FILE_IN_SLACK"; connection = expected.sendConnectedAccountId; version = TOOL_VERSION;
    arguments_ = { channels: id(args.channel, "channel"), filename: cleanString(args.filename, "filename", 255), title: optionalString(args.title, "title", 255), content: attributedBody(args.content), initial_comment: args.initialComment ? attributedSlack(args.initialComment) : `${PREFIX} Shared working file.` };
  }
  return Object.freeze({ name, slug, write: WRITE_ACTIONS.has(name), input: executeInput(expected, connection, version, arguments_) });
}

function boundedStrings(value, name, maxItems, maxLength) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${name} must be a bounded array`);
  return [...new Set(value.map((item) => cleanString(item, name, maxLength)))];
}

function slackTs(value) {
  const cleaned = cleanString(value, "Slack timestamp", 32);
  if (!isSlackTimestamp(cleaned)) throw new Error("Slack timestamp is invalid");
  return cleaned;
}

export async function executeCapabilityAction({ composio, action, signal, expected = APPROVED }) {
  const normalized = normalizeCapabilityAction(action, expected);
  const result = await composio.tools.execute(
    normalized.slug,
    normalized.input,
    { signal: AbortSignal.any([signal, AbortSignal.timeout(normalized.write ? 45_000 : 30_000)]) },
  );
  if (!result?.successful) throw new Error(`${normalized.slug} did not return provider confirmation`);
  const data = result.data ?? {};
  if (normalized.name.startsWith("slack_") && normalized.write) {
    const ts = data.ts ?? data.message?.ts ?? data.file?.timestamp;
    if (normalized.name !== "slack_upload_content" && !isSlackTimestamp(String(ts ?? ""))) {
      throw new Error(`${normalized.slug} omitted Slack provider confirmation`);
    }
  }
  return Object.freeze({
    name: normalized.name,
    slug: normalized.slug,
    write: normalized.write,
    providerReference: findProviderReference(data),
    modelResult: redactAndBound(data),
  });
}

export function capabilityActionHash(action) {
  return createHash("sha256").update(JSON.stringify(action)).digest("hex");
}

function findProviderReference(data) {
  for (const key of ["identifier", "id", "messageId", "message_id", "threadId", "thread_id", "ts", "draftId", "draft_id"]) {
    const value = data?.[key];
    if (["string", "number"].includes(typeof value)) return String(value).slice(0, 500);
  }
  return "provider-confirmed";
}

function redactAndBound(value) {
  const seen = new WeakSet();
  const redact = (item, depth = 0) => {
    if (depth > 7) return "[depth bounded]";
    if (Array.isArray(item)) return item.slice(0, 50).map((entry) => redact(entry, depth + 1));
    if (item && typeof item === "object") {
      if (seen.has(item)) return "[cycle]";
      seen.add(item);
      const output = {};
      for (const [key, entry] of Object.entries(item).slice(0, 100)) {
        if (/(?:token|secret|password|authorization|cookie|api.?key)/iu.test(key)) output[key] = "[redacted]";
        else output[key] = redact(entry, depth + 1);
      }
      return output;
    }
    if (typeof item === "string") return item.slice(0, 12_000);
    return item;
  };
  const json = JSON.stringify(redact(value));
  return json.length <= 30_000 ? json : `${json.slice(0, 30_000)}[truncated]`;
}
