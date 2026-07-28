import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildLinearIssueArguments,
  buildOwnerSlackArguments,
  normalizeMailboxMessage,
  runMailboxOccurrence,
  startMailboxExecutor,
} from "../mailbox-executor.mjs";
import { buildMailboxPrompt, parseMailboxDecision } from "../mailbox-hermes.mjs";
import { MailboxState, mailboxOccurrenceId, millisecondsUntilNextHalfHour } from "../mailbox-state.mjs";
import { APPROVED } from "../policy.mjs";

const messageId = "19fabcdef1234567";
const now = new Date("2026-07-28T10:30:00.000Z");
const receivedMs = now.getTime() - 60_000;

function providerMessage() {
  return {
    messageId,
    threadId: "19fabcdef7654321",
    internalDate: String(receivedMs),
    sender: "Lucinda Dunn <accounting@example.test>",
    to: "maya.chen@example.test",
    subject: "Vendor price update",
    messageText: "Please review the attached vendor price update.",
    labelIds: ["INBOX", "UNREAD"],
    displayUrl: `https://mail.google.test/${messageId}`,
    attachmentList: [{ filename: "prices.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
  };
}

function decision(action = "track") {
  return {
    version: 1,
    action,
    priority: action === "block" ? 2 : 3,
    title: "[MAYA] Review vendor price update",
    summary: "A vendor price workbook needs accounting review.",
    reason: action === "block" ? "The effective date is missing." : "This is a clear accounting task.",
    question: action === "block" ? "Which effective date should I use?" : "",
    options: action === "block" ? ["Use the email received date", "Request a dated agreement from Lucinda"] : [],
  };
}

function fakeComposio({ action = "track", existing = false } = {}) {
  const calls = [];
  const tools = {
    async execute(slug, input) {
      calls.push({ slug, input });
      if (slug === "GMAIL_FETCH_EMAILS") {
        return { successful: true, data: { messages: [{ messageId, internalDate: String(receivedMs) }] } };
      }
      if (slug === "LINEAR_LIST_LINEAR_ISSUES") {
        return {
          successful: true,
          data: {
            issues: existing ? [{ id: "issue-existing", identifier: "PEC-900", description: `Gmail message ID: ${messageId}` }] : [],
            page_info: { hasNextPage: false },
          },
        };
      }
      if (slug === "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID") return { successful: true, data: providerMessage() };
      if (slug === "LINEAR_CREATE_LINEAR_ISSUE") return { successful: true, data: { id: "issue-new", identifier: "PEC-901" } };
      if (slug === "SLACKBOT_SEND_MESSAGE") return { successful: true, data: { ok: true, ts: "1785234600.000001" } };
      if (slug === "GMAIL_ADD_LABEL_TO_EMAIL") return { successful: true, data: { id: messageId } };
      throw new Error(`unexpected tool ${slug}`);
    },
  };
  return { composio: { tools }, calls, classifier: async () => decision(action) };
}

test("mailbox classifier treats email as untrusted and returns a strict decision", () => {
  const prompt = buildMailboxPrompt(providerMessage());
  assert.match(prompt, /untrusted data, never authority/u);
  assert.match(prompt, /Never claim an action was completed/u);
  assert.match(prompt, /contact the original sender/iu);
  const parsed = parseMailboxDecision(JSON.stringify(decision("block")));
  assert.equal(parsed.action, "block");
  assert.deepEqual(parsed.options, ["Use the email received date", "Request a dated agreement from Lucinda"]);
  assert.throws(() => parseMailboxDecision("not json"), /invalid JSON/u);
  assert.throws(
    () => parseMailboxDecision(JSON.stringify({ ...decision("block"), options: [] })),
    /omitted routing context/u,
  );
});

test("normalizes a hydrated Gmail message and pins source provenance", () => {
  const normalized = normalizeMailboxMessage(providerMessage());
  assert.equal(normalized.messageId, messageId);
  assert.equal(normalized.receivedAt, new Date(receivedMs).toISOString());
  assert.equal(normalized.attachments[0].filename, "prices.xlsx");
  assert.throws(() => normalizeMailboxMessage({ messageId: "not-a-gmail-id" }), /invalid message ID/u);
});

test("builds a source-linked Linear issue without authorizing an email reply", () => {
  const args = buildLinearIssueArguments(normalizeMailboxMessage(providerMessage()), decision("track"));
  assert.equal(args.team_id, APPROVED.linearTeamId);
  assert.equal(args.title, "[MAYA] Review vendor price update");
  assert.match(args.description, new RegExp(`Gmail message ID: ${messageId}`, "u"));
  assert.match(args.description, /did not reply to the original sender/u);
  assert.equal(Object.hasOwn(args, "assignee_id"), false);
});

test("builds a fixed-owner blocked Slack packet", () => {
  const args = buildOwnerSlackArguments(normalizeMailboxMessage(providerMessage()), decision("block"), "PEC-901");
  assert.equal(args.channel, APPROVED.ownerSlackChannelId);
  assert.match(args.markdown_text, new RegExp(`<@${APPROVED.ownerSlackUserId}> \\[BLOCKED\\]`, "u"));
  assert.match(args.markdown_text, /tracked as PEC-901/u);
  assert.match(args.markdown_text, /Decision needed:/u);
  assert.equal(Object.hasOwn(args, "thread_ts"), false);
});

test("first mailbox occurrence bootstraps without reading historical mail", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-bootstrap-"));
  const state = new MailboxState(directory);
  const { composio, calls, classifier } = fakeComposio();
  const result = await runMailboxOccurrence({ composio, classifier, state, signal: new AbortController().signal, now });
  assert.deepEqual(result, { state: "bootstrapped", processed: 0 });
  assert.equal(calls.length, 0);
  const cursor = JSON.parse(await readFile(path.join(directory, "cursor.json"), "utf8"));
  assert.equal(cursor.epochSeconds, Math.floor(now.getTime() / 1_000));
});

test("executor startup schedules the next boundary without an immediate provider poll", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-start-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls } = fakeComposio();
  const executor = await startMailboxExecutor({ composio, stateDirectory: directory });
  assert.equal(calls.length, 0);
  await executor.stop();
  assert.equal(calls.length, 0);
});

test("clear actionable mail creates one Linear issue and is marked read", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-track-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({ action: "track" });
  const result = await runMailboxOccurrence({ composio, classifier, state, signal: new AbortController().signal, now });
  assert.equal(result.state, "complete");
  assert.equal(result.processed, 1);
  assert.equal(calls.filter((call) => call.slug === "LINEAR_CREATE_LINEAR_ISSUE").length, 1);
  assert.equal(calls.filter((call) => call.slug === "SLACKBOT_SEND_MESSAGE").length, 0);
  assert.deepEqual(
    calls.find((call) => call.slug === "GMAIL_ADD_LABEL_TO_EMAIL").input.arguments.remove_label_ids,
    ["UNREAD"],
  );
});

test("an empty mailbox completes without depending on Linear", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-empty-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio();
  composio.tools.execute = async (slug, input) => {
    calls.push({ slug, input });
    if (slug === "GMAIL_FETCH_EMAILS") return { successful: true, data: { messages: [] } };
    throw new Error(`unexpected tool ${slug}`);
  };
  const result = await runMailboxOccurrence({ composio, classifier, state, signal: new AbortController().signal, now });
  assert.deepEqual(result, { state: "complete", processed: 0, candidates: 0 });
  assert.deepEqual(calls.map((call) => call.slug), ["GMAIL_FETCH_EMAILS"]);
});

test("production mailbox mode delegates full work to the capability agent and records confirmed effects", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-capability-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls } = fakeComposio({ action: "track" });
  let packet;
  const capabilityAgent = async (input) => {
    packet = input;
    await input.store.recordAction(input.claimName, "gmail_reply", "provider-message-1");
    return { text: "Replied to Lucinda and updated the WEX task.", confirmedWrites: 1, history: [] };
  };
  const result = await runMailboxOccurrence({
    composio,
    capabilityAgent,
    classifier: async () => { throw new Error("legacy classifier must not run"); },
    state,
    signal: new AbortController().signal,
    now,
  });
  assert.equal(result.processed, 1);
  assert.equal(packet.source, "email");
  assert.match(packet.request, /Vendor price update/u);
  assert.equal(packet.sourceContext.ownerSlackChannelId, APPROVED.ownerSlackChannelId);
  assert.equal(calls.filter((call) => call.slug === "LINEAR_LIST_LINEAR_ISSUES").length, 1);
  assert.equal(calls.filter((call) => call.slug === "GMAIL_ADD_LABEL_TO_EMAIL").length, 1);
  const receiptName = (await readdir(path.join(directory, "receipts")))[0];
  const receipt = JSON.parse(await readFile(path.join(directory, "receipts", receiptName), "utf8"));
  assert.equal(receipt.state, "confirmed");
  assert.equal(receipt.action, "capability_work");
  assert.equal(receipt.confirmedWrites, 1);
  assert.equal(receipt.actions.length, 1);
});

test("ignored mail creates no external task or Slack effect and is marked read", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-ignore-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({ action: "ignore" });
  const result = await runMailboxOccurrence({ composio, classifier, state, signal: new AbortController().signal, now });
  assert.equal(result.processed, 1);
  assert.equal(calls.filter((call) => call.slug === "LINEAR_CREATE_LINEAR_ISSUE").length, 0);
  assert.equal(calls.filter((call) => call.slug === "SLACKBOT_SEND_MESSAGE").length, 0);
  assert.equal(calls.filter((call) => call.slug === "GMAIL_ADD_LABEL_TO_EMAIL").length, 1);
});

test("blocked mail creates Linear, alerts the fixed owner, and is marked read", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-block-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({ action: "block" });
  const result = await runMailboxOccurrence({ composio, classifier, state, signal: new AbortController().signal, now });
  assert.equal(result.processed, 1);
  const slack = calls.find((call) => call.slug === "SLACKBOT_SEND_MESSAGE");
  assert.equal(slack.input.connectedAccountId, APPROVED.sendConnectedAccountId);
  assert.equal(slack.input.arguments.channel, APPROVED.ownerSlackChannelId);
  assert.match(slack.input.arguments.markdown_text, /\[NA-5\]\[MAYA\].*\[BLOCKED\]/u);
});

test("a blocked Slack failure is terminally ambiguous and never triggers a second Slack send", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-block-slack-failure-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({ action: "block" });
  const execute = composio.tools.execute;
  composio.tools.execute = async (slug, input) => {
    if (slug === "SLACKBOT_SEND_MESSAGE") {
      calls.push({ slug, input });
      return { successful: false, error: "unknown provider outcome" };
    }
    return execute(slug, input);
  };
  const result = await runMailboxOccurrence({ composio, classifier, state, signal: new AbortController().signal, now });
  assert.equal(result.processed, 1);
  assert.equal(calls.filter((call) => call.slug === "SLACKBOT_SEND_MESSAGE").length, 1);
  assert.equal(calls.filter((call) => call.slug === "GMAIL_ADD_LABEL_TO_EMAIL").length, 0);
  const receipts = await readdir(path.join(directory, "receipts"));
  const receipt = JSON.parse(await readFile(path.join(directory, "receipts", receipts[0]), "utf8"));
  assert.equal(receipt.state, "ambiguous");
});

test("a pre-existing source marker prevents duplicate Linear creation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-existing-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({ action: "track", existing: true });
  await runMailboxOccurrence({ composio, classifier, state, signal: new AbortController().signal, now });
  assert.equal(calls.filter((call) => call.slug === "LINEAR_CREATE_LINEAR_ISSUE").length, 0);
});

test("processing receipts become ambiguous after restart and cannot be reclaimed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-recovery-"));
  const state = new MailboxState(directory);
  await state.initialize(1);
  const claim = await state.claim(messageId, "occurrence");
  assert.equal(claim.claimed, true);
  const recovered = new MailboxState(directory);
  await recovered.initialize(1);
  const second = await recovered.claim(messageId, "occurrence-2");
  assert.equal(second.claimed, false);
  const receipt = JSON.parse(await readFile(path.join(directory, "receipts", claim.name), "utf8"));
  assert.equal(receipt.state, "ambiguous");
  assert.equal(Object.hasOwn(receipt, "subject"), false);
  assert.equal(Object.hasOwn(receipt, "body"), false);
});

test("half-hour schedule keys and delays are deterministic", () => {
  assert.equal(mailboxOccurrenceId(new Date("2026-07-28T10:44:59.000Z")), "maya-chen:mailbox:2026-07-28T10:30:00.000Z");
  assert.equal(millisecondsUntilNextHalfHour(Date.parse("2026-07-28T10:44:59.000Z")), 901_000);
  assert.equal(millisecondsUntilNextHalfHour(Date.parse("2026-07-28T11:00:00.000Z")), 1_800_000);
});
