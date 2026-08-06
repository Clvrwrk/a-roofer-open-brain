import { createHash } from "node:crypto";
import { APPROVED, LINEAR_TOOL_VERSION } from "./policy.mjs";

const LINEAR_CREATE = "LINEAR_CREATE_LINEAR_ISSUE";
const LINEAR_GET = "LINEAR_GET_LINEAR_ISSUE";
const LINEAR_LIST = "LINEAR_LIST_LINEAR_ISSUES";
const LINEAR_UPDATE = "LINEAR_UPDATE_ISSUE";
const LINEAR_COMMENT = "LINEAR_CREATE_LINEAR_COMMENT";
const LINEAR_IDENTIFIER = /^[A-Z][A-Z0-9]*-\d+$/u;

function requestOptions(signal, timeoutMs = 30_000) {
  return { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) };
}

function requiredSuccessful(result, operation) {
  if (!result?.successful) throw new Error(`${operation} did not return provider confirmation`);
  return result.data ?? {};
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizedSubject(value) {
  return String(value ?? "")
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/iu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function significantAttachmentNames(message) {
  return (message.attachments ?? [])
    .map((item) => String(item.filename ?? "").trim().toLowerCase())
    .filter((name) => name && !/^image(?:\d+)?\.(?:png|jpe?g|gif)$/iu.test(name))
    .sort();
}

/**
 * A Gmail message can arrive as several forwarded copies. The thread key catches
 * replies; the day-scoped content key converges same-day forwards without merging
 * an unrelated recurring subject months later.
 */
export function sourceKeysForMessage(message) {
  const day = String(message.receivedAt ?? "").slice(0, 10) || "unknown-day";
  const content = JSON.stringify({
    day,
    subject: normalizedSubject(message.subject),
    attachments: significantAttachmentNames(message),
  });
  const keys = [`gmail-message:${message.messageId}`];
  if (/^[0-9a-fA-F]+$/u.test(String(message.threadId ?? ""))) {
    keys.unshift(`gmail-thread:${message.threadId}`);
  }
  keys.unshift(`gmail-content:${day}:${hash(content).slice(0, 24)}`);
  return Object.freeze([...new Set(keys)]);
}

function issueData(data) {
  return data?.issue ?? data?.data ?? data ?? {};
}

export async function getLinearIssue(composio, issueId, signal, expected = APPROVED) {
  const result = await composio.tools.execute(
    LINEAR_GET,
    {
      userId: expected.composioUserId,
      connectedAccountId: expected.linearConnectedAccountId,
      version: LINEAR_TOOL_VERSION,
      arguments: { issue_id: issueId },
    },
    requestOptions(signal),
  );
  return issueData(requiredSuccessful(result, "Linear get"));
}

export async function listLinearIssues(composio, signal, expected = APPROVED) {
  const issues = [];
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
    issues.push(...(Array.isArray(data.issues) ? data.issues : []));
    const pageInfo = data.page_info ?? data.pageInfo ?? {};
    if (!(pageInfo.hasNextPage ?? pageInfo.has_next_page)) break;
    after = pageInfo.endCursor ?? pageInfo.end_cursor;
    if (!after) throw new Error("Linear pagination omitted the next cursor");
  }
  return issues;
}

function referenceFrom(issue) {
  const reference = String(issue.identifier ?? issue.issueIdentifier ?? "");
  return LINEAR_IDENTIFIER.test(reference) ? reference : String(issue.id ?? "");
}

export async function createLinearIssue(composio, arguments_, signal, expected = APPROVED) {
  const result = await composio.tools.execute(
    LINEAR_CREATE,
    {
      userId: expected.composioUserId,
      connectedAccountId: expected.linearConnectedAccountId,
      version: LINEAR_TOOL_VERSION,
      arguments: arguments_,
    },
    requestOptions(signal, 45_000),
  );
  const data = requiredSuccessful(result, "Linear create");
  const id = String(data.id ?? "");
  if (!id) throw new Error("Linear create omitted the issue ID");
  let reference = referenceFrom(data);
  if (!LINEAR_IDENTIFIER.test(reference)) {
    try {
      reference = referenceFrom(await getLinearIssue(composio, id, signal, expected));
    } catch {
      reference = id;
    }
  }
  return Object.freeze({ id, reference, created: true });
}

export async function updateLinearIssue(composio, issueId, fields, signal, expected = APPROVED) {
  const result = await composio.tools.execute(
    LINEAR_UPDATE,
    {
      userId: expected.composioUserId,
      connectedAccountId: expected.linearConnectedAccountId,
      version: LINEAR_TOOL_VERSION,
      arguments: { issueId, ...fields },
    },
    requestOptions(signal, 45_000),
  );
  const data = requiredSuccessful(result, "Linear update");
  return Object.freeze({ id: String(data.id ?? issueId), reference: referenceFrom(data) || issueId });
}

export async function commentLinearIssue(composio, issueId, body, signal, expected = APPROVED) {
  const result = await composio.tools.execute(
    LINEAR_COMMENT,
    {
      userId: expected.composioUserId,
      connectedAccountId: expected.linearConnectedAccountId,
      version: LINEAR_TOOL_VERSION,
      arguments: { issueId, body },
    },
    requestOptions(signal, 45_000),
  );
  const data = requiredSuccessful(result, "Linear comment");
  return String(data.id ?? "provider-confirmed");
}

function sourceKeysFromDescription(description) {
  const keys = [];
  for (const match of String(description ?? "").matchAll(/^Maya source key:\s*(\S+)\s*$/gimu)) {
    keys.push(match[1]);
  }
  const legacy = String(description ?? "").match(/Gmail message ID:\s*([0-9a-fA-F]+)/iu)?.[1];
  if (legacy) keys.push(`gmail-message:${legacy}`);
  return [...new Set(keys)];
}

/** Index both CAT source issues and their downstream accounting children. */
export function indexLinearOrchestrations(issues) {
  const index = new Map();
  for (const issue of issues) {
    const description = String(issue.description ?? "");
    const keys = sourceKeysFromDescription(description);
    if (keys.length === 0) continue;
    const reference = referenceFrom(issue);
    const record = { id: String(issue.id ?? reference), reference, description };
    const isSource = /^Maya CAT source:\s*true\s*$/imu.test(description) || reference.startsWith("CAT-");
    for (const key of keys) {
      const current = index.get(key) ?? {};
      index.set(key, isSource ? { ...current, source: record } : { ...current, work: record });
    }
  }
  return index;
}

function findKnown(index, keys) {
  for (const key of keys) {
    const value = index.get(key);
    if (value) return value;
  }
  return null;
}

/**
 * Create/repair one CAT source → one downstream work pair. Provider-confirmed
 * steps are reported immediately so the caller can retain an ambiguity-safe receipt.
 */
export async function ensureCatFirstPair({
  composio,
  sourceKeys,
  knownIndex,
  buildSourceArguments,
  buildWorkArguments,
  signal,
  expected = APPROVED,
  onConfirmed = async () => {},
}) {
  let known = findKnown(knownIndex, sourceKeys) ?? {};
  let source = known.source;
  if (!source) {
    source = await createLinearIssue(composio, buildSourceArguments(sourceKeys), signal, expected);
    await onConfirmed("linear_cat_source_create", source.id);
  }

  let work = known.work;
  if (work) {
    await updateLinearIssue(composio, work.id, { parentId: source.id }, signal, expected);
    await onConfirmed("linear_work_parent_repair", work.id);
  } else {
    work = await createLinearIssue(
      composio,
      buildWorkArguments({ source, sourceKeys }),
      signal,
      expected,
    );
    await onConfirmed("linear_work_create", work.id);
  }

  const value = { source, work };
  for (const key of sourceKeys) knownIndex.set(key, value);
  return Object.freeze({ ...value, created: !known.source || !known.work });
}
