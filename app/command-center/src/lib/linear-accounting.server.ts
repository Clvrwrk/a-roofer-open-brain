import { getRuntimeEnv } from "@lib/runtime-env";

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
const CAT_TEAM_ID = "fca0aed7-1eac-43ea-aa9b-280d487fcc86";
const CAT_PROJECT_ID = "9b8ce36d-bb1c-444f-84ea-fa2c785b84ce";
const CAT_PARENT_ID = "16ac625e-9f89-4622-80f8-ea36f20bf72f";
const CAT_REVIEW_STATE_ID = "721fd015-d82a-4ae2-b5d8-a34c1fb76c05";
const WORK_TEAM_ID = "f7fd2005-aa04-4de7-a17d-ddae528b5e4a";
const WORK_REVIEW_STATE_ID = "3e03cd48-d3c8-4e63-867c-734387f39efb";
const REVIEWER_ID = "002bc1e6-c102-42f7-86cc-45b7c499dae3";
const SOURCE_KEY = /^(?:gmail-(?:content|thread|message):|slack-|signal-|webhook-|linear-|recurring-)[^\s]{1,470}$/u;
const HEX_MESSAGE_ID = /^[0-9a-fA-F]{8,128}$/u;

interface LinearIssue {
  id: string;
  identifier: string;
  url: string;
  description: string | null;
  parent?: { id: string; identifier: string } | null;
}

export interface AccountingLinearPairInput {
  sourceKeys: string[];
  messageId: string;
  sourceChannel: "gmail";
  sender: string;
  receivedAt: string;
  subject: string;
  summary: string;
  reason: string;
  priority: number;
  attachments: string[];
}

export interface AccountingLinearPair {
  source: LinearIssue & { created: boolean };
  work: LinearIssue & { created: boolean; parentRepaired: boolean };
}

function boundedString(value: unknown, name: string, maxLength: number, allowEmpty = false) {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  const result = value.trim();
  if ((!allowEmpty && !result) || result.length > maxLength) throw new TypeError(`${name} is invalid`);
  return result;
}

function boundedText(value: unknown, name: string, maxLength: number) {
  const result = boundedString(value, name, maxLength).replace(/\s+/gu, " ");
  if (result.length > maxLength) throw new TypeError(`${name} is invalid`);
  return result;
}

export function parseAccountingLinearPairInput(payload: unknown): AccountingLinearPairInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("JSON object required");
  const value = payload as Record<string, unknown>;
  if (!Array.isArray(value.sourceKeys) || value.sourceKeys.length < 1 || value.sourceKeys.length > 3) {
    throw new TypeError("sourceKeys must contain one to three keys");
  }
  const sourceKeys = [...new Set(value.sourceKeys.map((item, index) => boundedString(item, `sourceKeys[${index}]`, 500)))];
  if (!sourceKeys.every((key) => SOURCE_KEY.test(key))) throw new TypeError("sourceKeys contains an unsupported key");
  const messageId = boundedString(value.messageId, "messageId", 128);
  if (!HEX_MESSAGE_ID.test(messageId)) throw new TypeError("messageId is invalid");
  if (value.sourceChannel !== "gmail") throw new TypeError("sourceChannel must be gmail");
  const receivedAt = boundedString(value.receivedAt, "receivedAt", 64);
  if (!Number.isFinite(Date.parse(receivedAt))) throw new TypeError("receivedAt must be a valid timestamp");
  if (!Number.isInteger(value.priority) || Number(value.priority) < 1 || Number(value.priority) > 4) {
    throw new TypeError("priority must be an integer from 1 through 4");
  }
  if (!Array.isArray(value.attachments) || value.attachments.length > 25) {
    throw new TypeError("attachments must be a bounded array");
  }
  return Object.freeze({
    sourceKeys,
    messageId,
    sourceChannel: "gmail",
    sender: boundedText(value.sender, "sender", 500),
    receivedAt,
    subject: boundedText(value.subject, "subject", 500),
    summary: boundedText(value.summary, "summary", 1_500),
    reason: boundedText(value.reason, "reason", 1_500),
    priority: Number(value.priority),
    attachments: value.attachments.map((item, index) => boundedText(item, `attachments[${index}]`, 255)),
  });
}

async function linearGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  fetchImpl: typeof fetch,
  apiKey: string,
) {
  const response = await fetchImpl(LINEAR_ENDPOINT, {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Linear returned HTTP ${response.status}`);
  const json = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
  if (json.errors?.length) throw new Error(`Linear GraphQL error: ${json.errors.map((item) => item.message ?? "unknown").join("; ")}`);
  if (!json.data) throw new Error("Linear omitted GraphQL data");
  return json.data;
}

function exactMatches(issues: LinearIssue[], sourceKeys: string[]) {
  const markers = sourceKeys.map((key) => `Maya source key: ${key}`);
  return issues.filter((issue) => {
    const lines = String(issue.description ?? "").split("\n").map((line) => line.trim());
    return markers.some((marker) => lines.includes(marker));
  });
}

function issueCreateInput(
  input: AccountingLinearPairInput,
  source: boolean,
  parent?: Pick<LinearIssue, "id" | "identifier">,
) {
  const sourceKeyLines = input.sourceKeys.map((key) => `Maya source key: ${key}`);
  if (source) {
    return {
      teamId: CAT_TEAM_ID,
      projectId: CAT_PROJECT_ID,
      parentId: CAT_PARENT_ID,
      stateId: CAT_REVIEW_STATE_ID,
      assigneeId: REVIEWER_ID,
      title: `[Maya intake][Accounting] ${input.subject}`.slice(0, 140),
      priority: input.priority,
      description: [
        "Maya CAT source: true",
        ...sourceKeyLines,
        `Source channel: ${input.sourceChannel}`,
        `Source sender: ${input.sender}`,
        `Received: ${input.receivedAt}`,
        `Gmail message ID: ${input.messageId}`,
        `Gmail source: https://mail.google.com/mail/u/0/#inbox/${input.messageId}`,
        "",
        "## Intake decision",
        input.summary,
        "",
        "## Audit contract",
        "All accounting-team work, Command Center effects, communication receipts, and Fast.io artifacts must link to this CAT source. This source remains open until every child is reviewed or completed.",
      ].join("\n").slice(0, 8_000),
    };
  }
  if (!parent?.id || !parent.identifier) throw new Error("CAT source is required before downstream work");
  const attachmentSummary = input.attachments.length
    ? input.attachments.map((name) => `- ${name}`).join("\n")
    : "- None reported";
  return {
    teamId: WORK_TEAM_ID,
    parentId: parent.id,
    stateId: WORK_REVIEW_STATE_ID,
    assigneeId: REVIEWER_ID,
    title: `[MAYA] Accounting intake: ${input.subject}`.slice(0, 140),
    priority: input.priority,
    description: [
      "[MAYA] Mailbox intake decision",
      `CAT source issue: ${parent.identifier}`,
      ...sourceKeyLines,
      "Maya execution gate: move this issue to Agent Todo",
      "",
      `Source sender: ${input.sender}`,
      `Received: ${input.receivedAt}`,
      `Gmail message ID: ${input.messageId}`,
      `Gmail source: https://mail.google.com/mail/u/0/#inbox/${input.messageId}`,
      "",
      "## Summary",
      input.summary,
      "",
      "## Decision rationale",
      input.reason,
      "",
      "## Attachments",
      attachmentSummary,
      "",
      "Maya may send only the standard receipt acknowledgement to an approved internal sender domain. No substantive sender commitment was made. Any payment, approval, access, or irreversible action still requires Christopher's approval.",
    ].join("\n").slice(0, 8_000),
  };
}

async function createIssue(
  input: Record<string, unknown>,
  fetchImpl: typeof fetch,
  apiKey: string,
) {
  const data = await linearGraphql<{
    issueCreate: { success: boolean; issue: LinearIssue | null };
  }>(
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url description parent { id identifier } }
      }
    }`,
    { input },
    fetchImpl,
    apiKey,
  );
  if (!data.issueCreate.success || !data.issueCreate.issue?.id || !data.issueCreate.issue.identifier) {
    throw new Error("Linear issue creation omitted provider confirmation");
  }
  return data.issueCreate.issue;
}

export async function ensureAccountingLinearPair(
  input: AccountingLinearPairInput,
  {
    fetchImpl = fetch,
    apiKey = getRuntimeEnv().LINEAR_API_KEY?.trim() ?? "",
  }: { fetchImpl?: typeof fetch; apiKey?: string } = {},
): Promise<AccountingLinearPair> {
  if (!apiKey) throw new Error("Linear is not configured");
  const descriptionFilters = input.sourceKeys.map((key) => ({ description: { contains: `Maya source key: ${key}` } }));
  const data = await linearGraphql<{
    sources: { nodes: LinearIssue[] };
    work: { nodes: LinearIssue[] };
  }>(
    `query($sourceFilter: IssueFilter!, $workFilter: IssueFilter!) {
      sources: issues(first: 10, filter: $sourceFilter) { nodes { id identifier url description parent { id identifier } } }
      work: issues(first: 10, filter: $workFilter) { nodes { id identifier url description parent { id identifier } } }
    }`,
    {
      sourceFilter: { team: { id: { eq: CAT_TEAM_ID } }, or: descriptionFilters },
      workFilter: { team: { id: { eq: WORK_TEAM_ID } }, or: descriptionFilters },
    },
    fetchImpl,
    apiKey,
  );
  const sourceMatches = exactMatches(data.sources.nodes, input.sourceKeys);
  const workMatches = exactMatches(data.work.nodes, input.sourceKeys);
  if (sourceMatches.length > 1 || workMatches.length > 1) {
    throw new Error("Linear orchestration is ambiguous and requires operator reconciliation");
  }

  const source = sourceMatches[0] ?? await createIssue(issueCreateInput(input, true), fetchImpl, apiKey);
  const sourceCreated = sourceMatches.length === 0;
  let work = workMatches[0] ?? await createIssue(issueCreateInput(input, false, source), fetchImpl, apiKey);
  const workCreated = workMatches.length === 0;
  let parentRepaired = false;
  if (work.parent?.id !== source.id) {
    const updated = await linearGraphql<{
      issueUpdate: { success: boolean; issue: LinearIssue | null };
    }>(
      `mutation($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue { id identifier url description parent { id identifier } }
        }
      }`,
      { id: work.id, input: { parentId: source.id } },
      fetchImpl,
      apiKey,
    );
    if (!updated.issueUpdate.success || updated.issueUpdate.issue?.parent?.id !== source.id) {
      throw new Error("Linear parent repair omitted provider confirmation");
    }
    work = updated.issueUpdate.issue;
    parentRepaired = true;
  }
  return Object.freeze({
    source: Object.freeze({ ...source, created: sourceCreated }),
    work: Object.freeze({ ...work, created: workCreated, parentRepaired }),
  });
}
