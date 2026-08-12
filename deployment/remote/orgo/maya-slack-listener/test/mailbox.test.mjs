import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildLinearIssueArguments,
  buildLinearSourceIssueArguments,
  buildOwnerSlackArguments,
  enforceMailboxPolicy,
  mailboxLabelPlan,
  normalizeMailboxMessage,
  runInboxCleanup,
  runMailboxOccurrence,
  senderCanReceiveAcknowledgement,
  startMailboxExecutor,
} from "../mailbox-executor.mjs";
import { buildMailboxPrompt, parseMailboxDecision } from "../mailbox-hermes.mjs";
import { MailboxState, mailboxOccurrenceId, millisecondsUntilNextHalfHour } from "../mailbox-state.mjs";
import { ACKNOWLEDGEMENT_DOMAINS, APPROVED } from "../policy.mjs";

const messageId = "19fabcdef1234567";
const now = new Date("2026-07-28T10:30:00.000Z");
const receivedMs = now.getTime() - 60_000;
const fakeRecordIntake = async ({ payload }) => ({
  workKey: `accounting:intake:${payload.sourceChannel}:${payload.orchestrationKey}`,
  providerReference: "command-center-work-1",
});
const fakeRecordLinearPair = async () => ({
  source: { id: "58961032-e114-47f0-b5ff-de3ce8591c3c", reference: "CAT-901", created: true },
  work: {
    id: "68961032-e114-47f0-b5ff-de3ce8591c3c",
    reference: "PEC-901",
    created: true,
    parentRepaired: false,
  },
});

function providerMessage(overrides = {}) {
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
    ...overrides,
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

function fakeComposio({ action = "track", existing = false, sender, messageOverrides = {} } = {}) {
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
            issues: existing ? [
              { id: "11111111-1111-4111-8111-111111111111", identifier: "CAT-900", description: `Maya CAT source: true\nMaya source key: gmail-thread:19fabcdef7654321` },
              { id: "22222222-2222-4222-8222-222222222222", identifier: "PEC-900", description: `CAT source issue: CAT-900\nMaya source key: gmail-thread:19fabcdef7654321` },
            ] : [],
            page_info: { hasNextPage: false },
          },
        };
      }
      if (slug === "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID") {
        return { successful: true, data: providerMessage({ ...messageOverrides, ...(sender ? { sender } : {}) }) };
      }
      if (slug === "LINEAR_CREATE_LINEAR_ISSUE") {
        return input.arguments.team_id === APPROVED.linearSourceTeamId
          ? { successful: true, data: { id: "58961032-e114-47f0-b5ff-de3ce8591c3c" } }
          : { successful: true, data: { id: "68961032-e114-47f0-b5ff-de3ce8591c3c" } };
      }
      if (slug === "LINEAR_GET_LINEAR_ISSUE") {
        return input.arguments.issue_id.startsWith("5896")
          ? { successful: true, data: { id: input.arguments.issue_id, identifier: "CAT-901" } }
          : { successful: true, data: { id: input.arguments.issue_id, identifier: "PEC-901" } };
      }
      if (slug === "LINEAR_UPDATE_ISSUE") return { successful: true, data: { id: input.arguments.issueId } };
      if (slug === "LINEAR_CREATE_LINEAR_COMMENT") return { successful: true, data: { id: "comment-1" } };
      if (slug === "SLACKBOT_SEND_MESSAGE") return { successful: true, data: { ok: true, ts: "1785234600.000001" } };
      if (slug === "GMAIL_REPLY_TO_THREAD") return { successful: true, data: { messageId: "19facknowledged1234" } };
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

test("builds a CAT source and linked downstream issue assigned to Agent Review", () => {
  const message = normalizeMailboxMessage(providerMessage());
  const sourceKeys = [`gmail-thread:${message.threadId}`];
  const source = buildLinearSourceIssueArguments(message, decision("track"), sourceKeys);
  const args = buildLinearIssueArguments(message, decision("track"), { id: "58961032-e114-47f0-b5ff-de3ce8591c3c", reference: "CAT-901" }, sourceKeys);
  assert.equal(source.team_id, APPROVED.linearSourceTeamId);
  assert.equal(source.project_id, APPROVED.linearSourceProjectId);
  assert.match(source.description, /Maya CAT source: true/u);
  assert.equal(args.team_id, APPROVED.linearWorkTeamId);
  assert.equal(args.parent_id, "58961032-e114-47f0-b5ff-de3ce8591c3c");
  assert.equal(args.title, "[MAYA] Review vendor price update");
  assert.match(args.description, new RegExp(`Gmail message ID: ${messageId}`, "u"));
  assert.match(args.description, /standard receipt acknowledgement/u);
  assert.equal(args.assignee_id, APPROVED.linearReviewerId);
  assert.equal(args.state_id, APPROVED.linearWorkReviewStateId);
});

test("builds a fixed-owner blocked Slack packet", () => {
  const args = buildOwnerSlackArguments(normalizeMailboxMessage(providerMessage()), decision("block"), "PEC-901");
  assert.equal(args.channel, APPROVED.ownerSlackChannelId);
  assert.match(args.markdown_text, new RegExp(`<@${APPROVED.ownerSlackUserId}> \\[BLOCKED\\]`, "u"));
  assert.match(args.markdown_text, /tracked as PEC-901/u);
  assert.match(args.markdown_text, /Decision needed:/u);
  assert.equal(Object.hasOwn(args, "thread_ts"), false);
});

test("never exposes a raw Linear UUID in a Slack packet", () => {
  const uuid = "58961032-e114-47f0-b5ff-de3ce8591c3c";
  const args = buildOwnerSlackArguments(normalizeMailboxMessage(providerMessage()), decision("block"), uuid);
  assert.doesNotMatch(args.markdown_text, new RegExp(uuid, "u"));
  assert.match(args.markdown_text, /tracked as the new CAT-first accounting issue pair/u);
});

test("first mailbox occurrence bootstraps without reading historical mail", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-bootstrap-"));
  const state = new MailboxState(directory);
  const { composio, calls, classifier } = fakeComposio();
  const result = await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair: fakeRecordLinearPair, state, signal: new AbortController().signal, now });
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

test("clear actionable mail records a Command Center Linear pair, notifies Slack, stars it, and archives it", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-track-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({ action: "track" });
  let pairPayload;
  const recordLinearPair = async ({ payload }) => {
    pairPayload = payload;
    return fakeRecordLinearPair();
  };
  const result = await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair, state, signal: new AbortController().signal, now });
  assert.equal(result.state, "complete");
  assert.equal(result.processed, 1);
  const gmailQuery = calls.find((call) => call.slug === "GMAIL_FETCH_EMAILS").input.arguments.query;
  assert.match(gmailQuery, /-in:sent/u);
  assert.match(gmailQuery, /-from:maya\.chen@cc\.proexteriorsus\.net/u);
  assert.equal(calls.filter((call) => call.slug === "LINEAR_CREATE_LINEAR_ISSUE").length, 0);
  assert.deepEqual(pairPayload.sourceKeys.slice(1), ["gmail-thread:19fabcdef7654321", `gmail-message:${messageId}`]);
  assert.equal(pairPayload.subject, "Vendor price update");
  assert.equal(calls.filter((call) => call.slug === "SLACKBOT_SEND_MESSAGE").length, 1);
  const slackText = calls.find((call) => call.slug === "SLACKBOT_SEND_MESSAGE").input.arguments.markdown_text;
  assert.match(slackText, /\[REVIEW\].*CODEX AGENT TEAM.*CAT-901/u);
  assert.doesNotMatch(slackText, /58961032-e114-47f0-b5ff-de3ce8591c3c/u);
  const labelCall = calls.find((call) => call.slug === "GMAIL_ADD_LABEL_TO_EMAIL");
  assert.deepEqual(labelCall.input.arguments.add_label_ids, ["STARRED"]);
  assert.deepEqual(
    labelCall.input.arguments.remove_label_ids,
    ["UNREAD", "INBOX"],
  );
});

test("a Command Center pair with an unresolved display reference never exposes its UUID", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-linear-display-fallback-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({ action: "track" });
  const recordLinearPair = async () => ({
    source: { id: "58961032-e114-47f0-b5ff-de3ce8591c3c", reference: "58961032-e114-47f0-b5ff-de3ce8591c3c" },
    work: { id: "68961032-e114-47f0-b5ff-de3ce8591c3c", reference: "68961032-e114-47f0-b5ff-de3ce8591c3c" },
  });
  const result = await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair, state, signal: new AbortController().signal, now });
  assert.equal(result.state, "complete");
  const slackText = calls.find((call) => call.slug === "SLACKBOT_SEND_MESSAGE").input.arguments.markdown_text;
  assert.match(slackText, /as the new CAT-first accounting issue pair/u);
  assert.doesNotMatch(slackText, /58961032-e114-47f0-b5ff-de3ce8591c3c/u);
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
  const result = await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair: fakeRecordLinearPair, state, signal: new AbortController().signal, now });
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
    recordIntake: fakeRecordIntake,
    recordLinearPair: fakeRecordLinearPair,
    classifier: async () => decision("track"),
    state,
    signal: new AbortController().signal,
    now,
  });
  assert.equal(result.processed, 1);
  assert.equal(packet.source, "email");
  assert.match(packet.request, /Vendor price update/u);
  assert.equal(packet.sourceContext.ownerSlackChannelId, APPROVED.ownerSlackChannelId);
  assert.equal(packet.sourceContext.catSourceIssue, "CAT-901");
  assert.equal(calls.filter((call) => call.slug === "LINEAR_LIST_LINEAR_ISSUES").length, 0);
  assert.equal(calls.filter((call) => call.slug === "GMAIL_ADD_LABEL_TO_EMAIL").length, 1);
  const receiptName = (await readdir(path.join(directory, "receipts")))[0];
  const receipt = JSON.parse(await readFile(path.join(directory, "receipts", receiptName), "utf8"));
  assert.equal(receipt.state, "confirmed");
  assert.equal(receipt.action, "capability_work");
  assert.equal(receipt.confirmedWrites, 1);
  assert.ok(receipt.actions.length >= 6);
});

test("ignored mail creates no external task or Slack effect and is marked read", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-ignore-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({
    action: "ignore",
    messageOverrides: {
      subject: "Newsletter",
      messageText: "A general non-actionable update.",
      attachmentList: [],
    },
  });
  const result = await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair: fakeRecordLinearPair, state, signal: new AbortController().signal, now });
  assert.equal(result.processed, 1);
  assert.equal(calls.filter((call) => call.slug === "LINEAR_CREATE_LINEAR_ISSUE").length, 0);
  assert.equal(calls.filter((call) => call.slug === "SLACKBOT_SEND_MESSAGE").length, 0);
  assert.equal(calls.filter((call) => call.slug === "GMAIL_ADD_LABEL_TO_EMAIL").length, 1);
});

test("deterministic policy prevents a classifier from ignoring accounting documents", () => {
  const message = normalizeMailboxMessage(providerMessage());
  const enforced = enforceMailboxPolicy(message, decision("ignore"));
  assert.equal(enforced.action, "track");
  assert.match(enforced.reason, /document/u);
});

test("Google security alerts become exact owner-authorization checks", () => {
  const message = normalizeMailboxMessage(providerMessage({
    sender: "Google <no-reply@accounts.google.com>",
    subject: "Security alert",
    messageText: "A new security key was added to maya.chen@cc.proexteriorsus.net.",
    attachmentList: [],
  }));
  const enforced = enforceMailboxPolicy(message, {
    ...decision("block"),
    title: "[MAYA] Generic security alert",
    summary: "Generic summary.",
    reason: "Generic reason.",
    question: "Who should handle this?",
    options: ["Start recovery"],
  });
  assert.equal(enforced.action, "block");
  assert.equal(enforced.title, "[MAYA] Google security-key authorization check");
  assert.match(enforced.question, /Did you authorize.*security key/iu);
  assert.doesNotMatch(enforced.reason, /reactivat/iu);
});

test("Slack login notices never become invented deactivation or recovery work", () => {
  const message = normalizeMailboxMessage(providerMessage({
    sender: "Slack <feedback@slack.com>",
    subject: "Your recent login attempt on pe-command-center's team",
    messageText: "We noticed a recent login attempt.",
    attachmentList: [],
  }));
  const enforced = enforceMailboxPolicy(message, {
    ...decision("block"),
    title: "[MAYA] Slack account deactivation notice",
    summary: "The account was deactivated.",
    reason: "Contact support for account recovery.",
    question: "Who should reactivate the account?",
    options: ["Contact Slack support"],
  });
  assert.equal(enforced.title, "[MAYA] Slack login authorization check");
  assert.match(enforced.summary, /does not say.*deactivated/iu);
  assert.equal(enforced.question, "Did you authorize the reported Slack login attempt?");
  assert.doesNotMatch(`${enforced.reason} ${enforced.options.join(" ")}`, /reactivat|contact support/iu);
});

test("Maya's own sent mail cannot create accounting work or receipt loops", () => {
  const message = normalizeMailboxMessage(providerMessage({
    sender: "Maya Chen <maya.chen@cc.proexteriorsus.net>",
    subject: "Fwd: Vendor price update",
    messageText: "[MAYA]\n\nReceived — thank you. I have received your email and added it to Maya's accounting intake queue.",
  }));
  const enforced = enforceMailboxPolicy(message, decision("track"));
  assert.equal(enforced.action, "ignore");
  assert.match(enforced.reason, /prevent receipt and task loops/u);
  assert.equal(senderCanReceiveAcknowledgement(message.senderEmail), false);
});

test("every legacy accounting alias is a deterministic review route", () => {
  for (const alias of ["invoices", "ap", "creditmemos", "priceagreement", "ar"]) {
    const message = normalizeMailboxMessage(providerMessage({
      to: `${alias}@cc.proexteriorsus.net`,
      subject: "Hello",
      messageText: "See note.",
      attachmentList: [],
    }));
    assert.equal(enforceMailboxPolicy(message, decision("ignore")).action, "track");
  }
  for (const alias of ["hr", "payroll"]) {
    const message = normalizeMailboxMessage(providerMessage({
      to: `${alias}@cc.proexteriorsus.net`,
      subject: "Hello",
      messageText: "See note.",
      attachmentList: [],
    }));
    assert.equal(enforceMailboxPolicy(message, decision("ignore")).action, "block");
  }
});

test("automatic receipts are limited to approved domains and always include both CCs", async () => {
  assert.deepEqual(ACKNOWLEDGEMENT_DOMAINS, [
    "proexteriorsus.com",
    "proexteriorsus.net",
    "cleverwork.io",
    "aia4.io",
  ]);
  assert.equal(senderCanReceiveAcknowledgement("person@cc.proexteriorsus.net"), true);
  assert.equal(senderCanReceiveAcknowledgement("person@sub.cc.proexteriorsus.net"), true);
  assert.equal(senderCanReceiveAcknowledgement("accounting@proexteriorsus.com"), true);
  assert.equal(senderCanReceiveAcknowledgement("person@mail.proexteriorsus.com"), true);
  assert.equal(senderCanReceiveAcknowledgement("person@aia4.io"), true);
  assert.equal(senderCanReceiveAcknowledgement("person@ops.aia4.io"), true);
  assert.equal(senderCanReceiveAcknowledgement("person@mail.proexteriorsus.net"), true);
  assert.equal(senderCanReceiveAcknowledgement("person@cleverwork.io"), true);
  assert.equal(senderCanReceiveAcknowledgement("chussey@cleverwork.io"), true);
  assert.equal(senderCanReceiveAcknowledgement("person@proexteriorsus.com.example"), false);
  assert.equal(senderCanReceiveAcknowledgement("person@aia4.io.example"), false);
  assert.equal(senderCanReceiveAcknowledgement("person@evil-cleverwork.io.example"), false);
  assert.equal(senderCanReceiveAcknowledgement("person@example.com"), false);
  assert.equal(senderCanReceiveAcknowledgement("maya.chen@cc.proexteriorsus.net"), false);

  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-ack-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({ sender: "Lucinda Dunn <accounting@proexteriorsus.com>" });
  await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair: fakeRecordLinearPair, state, signal: new AbortController().signal, now });
  const reply = calls.find((call) => call.slug === "GMAIL_REPLY_TO_THREAD");
  assert.equal(reply.input.arguments.recipient_email, "accounting@proexteriorsus.com");
  assert.deepEqual(reply.input.arguments.cc, ["admin@cc.proexteriorsus.net", "chussey@aia4.io"]);
  assert.match(reply.input.arguments.message_body, /I've received your email and opened ticket PEC-\d+ to track it/u);
  assert.match(reply.input.arguments.message_body, /https:\/\/linear\.app\/cleverwork\/issue\/PEC-\d+/u);
  assert.match(reply.input.arguments.message_body, /Maya Chen\nAccounting Assistant \| Pro Exteriors/u);
});

test("approved internal mail is tracked and acknowledged when classification fails", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-internal-fallback-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls } = fakeComposio({ sender: "Lucinda Dunn <accounting@proexteriorsus.com>" });
  const result = await runMailboxOccurrence({
    composio,
    classifier: async () => { throw new Error("classifier unavailable"); },
    recordIntake: fakeRecordIntake,
    recordLinearPair: fakeRecordLinearPair,
    state,
    signal: new AbortController().signal,
    now,
  });
  assert.equal(result.processed, 1);
  const slugs = calls.map((call) => call.slug);
  const replyIndex = slugs.indexOf("GMAIL_REPLY_TO_THREAD");
  assert.ok(replyIndex > slugs.lastIndexOf("LINEAR_CREATE_LINEAR_ISSUE"));
  assert.ok(replyIndex < slugs.indexOf("SLACKBOT_SEND_MESSAGE"));
  const receiptName = (await readdir(path.join(directory, "receipts")))[0];
  const receipt = JSON.parse(await readFile(path.join(directory, "receipts", receiptName), "utf8"));
  assert.equal(receipt.state, "confirmed");
  assert.ok(receipt.acknowledgementHash);
});

test("approved internal mail is tracked and acknowledged when classification says ignore", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-internal-ignore-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls } = fakeComposio({ sender: "Lucinda Dunn <accounting@proexteriorsus.com>" });
  const result = await runMailboxOccurrence({
    composio,
    classifier: async () => decision("ignore"),
    recordIntake: fakeRecordIntake,
    recordLinearPair: fakeRecordLinearPair,
    state,
    signal: new AbortController().signal,
    now,
  });
  assert.equal(result.processed, 1);
  assert.equal(calls.filter((call) => call.slug === "LINEAR_CREATE_LINEAR_ISSUE").length, 0);
  assert.equal(calls.filter((call) => call.slug === "GMAIL_REPLY_TO_THREAD").length, 1);
  const receiptName = (await readdir(path.join(directory, "receipts")))[0];
  const receipt = JSON.parse(await readFile(path.join(directory, "receipts", receiptName), "utf8"));
  assert.equal(receipt.state, "confirmed");
  assert.ok(receipt.acknowledgementHash);
});

test("a downstream accounting failure does not suppress a confirmed internal receipt", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-ack-before-work-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls } = fakeComposio({ sender: "Lucinda Dunn <accounting@proexteriorsus.com>" });
  await runMailboxOccurrence({
    composio,
    capabilityAgent: async () => { throw new Error("downstream accounting blocker"); },
    classifier: async () => decision("track"),
    recordIntake: fakeRecordIntake,
    recordLinearPair: fakeRecordLinearPair,
    state,
    signal: new AbortController().signal,
    now,
  });
  assert.equal(calls.filter((call) => call.slug === "GMAIL_REPLY_TO_THREAD").length, 1);
  const receiptName = (await readdir(path.join(directory, "receipts")))[0];
  const receipt = JSON.parse(await readFile(path.join(directory, "receipts", receiptName), "utf8"));
  assert.equal(receipt.state, "ambiguous");
  assert.equal(receipt.actions.length, 4);
});

test("an unknown internal acknowledgement outcome is fenced and never retried", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-ack-ambiguous-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({ sender: "Lucinda Dunn <accounting@proexteriorsus.com>" });
  const execute = composio.tools.execute;
  composio.tools.execute = async (slug, input) => {
    if (slug === "GMAIL_REPLY_TO_THREAD") {
      calls.push({ slug, input });
      return { successful: false, error: "unknown provider outcome" };
    }
    return execute(slug, input);
  };
  await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair: fakeRecordLinearPair, state, signal: new AbortController().signal, now });
  await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair: fakeRecordLinearPair, state, signal: new AbortController().signal, now: new Date(now.getTime() + 1_800_000) });
  assert.equal(calls.filter((call) => call.slug === "GMAIL_REPLY_TO_THREAD").length, 1);
  assert.equal(calls.filter((call) => call.slug === "GMAIL_ADD_LABEL_TO_EMAIL").length, 0);
  const receiptName = (await readdir(path.join(directory, "receipts")))[0];
  const receipt = JSON.parse(await readFile(path.join(directory, "receipts", receiptName), "utf8"));
  assert.equal(receipt.state, "ambiguous");
});

test("historical cleanup never sends late acknowledgements", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-cleanup-"));
  const state = new MailboxState(directory);
  const { composio, calls, classifier } = fakeComposio({ sender: "Lucinda <lucinda@aia4.io>" });
  const result = await runInboxCleanup({
    composio,
    classifier,
    recordIntake: fakeRecordIntake,
    recordLinearPair: fakeRecordLinearPair,
    state,
    signal: new AbortController().signal,
    now,
  });
  assert.equal(result.processed, 1);
  assert.equal(calls.filter((call) => call.slug === "GMAIL_REPLY_TO_THREAD").length, 0);
});

test("blocked mail creates Linear, alerts the fixed owner, and is marked read", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-mailbox-block-"));
  const state = new MailboxState(directory);
  await state.initialize(Math.floor((now.getTime() - 120_000) / 1_000));
  const { composio, calls, classifier } = fakeComposio({ action: "block" });
  const result = await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair: fakeRecordLinearPair, state, signal: new AbortController().signal, now });
  assert.equal(result.processed, 1);
  const slack = calls.find((call) => call.slug === "SLACKBOT_SEND_MESSAGE");
  assert.equal(slack.input.connectedAccountId, APPROVED.sendConnectedAccountId);
  assert.equal(slack.input.arguments.channel, APPROVED.ownerSlackChannelId);
  assert.match(slack.input.arguments.markdown_text, /\[NA-5\]\[MAYA\].*\[BLOCKED\]/u);
  const labels = calls.find((call) => call.slug === "GMAIL_ADD_LABEL_TO_EMAIL").input.arguments;
  assert.deepEqual(labels.add_label_ids, ["STARRED", "IMPORTANT"]);
  assert.deepEqual(labels.remove_label_ids, ["UNREAD"]);
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
  const result = await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair: fakeRecordLinearPair, state, signal: new AbortController().signal, now });
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
  await runMailboxOccurrence({ composio, classifier, recordIntake: fakeRecordIntake, recordLinearPair: fakeRecordLinearPair, state, signal: new AbortController().signal, now });
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

test("mailbox label plans preserve blocked mail for owner visibility", () => {
  assert.deepEqual(mailboxLabelPlan("ignore"), { add: [], remove: ["UNREAD", "INBOX"] });
  assert.deepEqual(mailboxLabelPlan("track"), { add: ["STARRED"], remove: ["UNREAD", "INBOX"] });
  assert.deepEqual(mailboxLabelPlan("block"), { add: ["STARRED", "IMPORTANT"], remove: ["UNREAD"] });
});
