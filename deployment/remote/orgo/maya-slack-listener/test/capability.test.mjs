import assert from "node:assert/strict";
import test from "node:test";
import { buildCapabilityPrompt, parseCapabilityTurn, runCapabilityAgent } from "../capability-agent.mjs";
import { OWNER_EMAILS, executeCapabilityAction, normalizeCapabilityAction } from "../capability-executor.mjs";
import { PREFIX, buildReply } from "../core.mjs";
import { APPROVED } from "../policy.mjs";

const signal = new AbortController().signal;

test("Gmail sends and replies always add both oversight CCs and Maya attribution", () => {
  const send = normalizeCapabilityAction({
    name: "gmail_send",
    arguments: { recipientEmail: "lucinda@example.test", cc: ["ops@example.test"], subject: "WEX received", body: "I received the files." },
  });
  assert.equal(send.slug, "GMAIL_SEND_EMAIL");
  assert.equal(send.input.connectedAccountId, APPROVED.gmailConnectedAccountId);
  assert.deepEqual(send.input.arguments.cc, ["ops@example.test", ...OWNER_EMAILS]);
  assert.equal(send.input.arguments.subject, "[MAYA] WEX received");
  assert.match(send.input.arguments.body, /^\[MAYA\]/u);

  const reply = normalizeCapabilityAction({
    name: "gmail_reply",
    arguments: { threadId: "19f473a646ed499c", body: "Got it." },
  });
  assert.deepEqual(reply.input.arguments.cc, OWNER_EMAILS);
  assert.equal(reply.input.arguments.thread_id, "19f473a646ed499c");
});

test("Linear is pinned to PE-CC-Dev and Slack may use any accessible safe channel", () => {
  const issue = normalizeCapabilityAction({ name: "linear_create", arguments: { title: "Track WEX", description: "Link cards to vehicles.", priority: 2 } });
  assert.equal(issue.input.arguments.team_id, APPROVED.linearTeamId);
  assert.equal(issue.input.arguments.state_id, APPROVED.linearReviewStateId);
  assert.equal(issue.input.arguments.assignee_id, APPROVED.linearReviewerId);
  assert.match(issue.input.arguments.title, /^\[MAYA\]/u);
  assert.match(issue.input.arguments.description, /^\[MAYA\]/u);

  const slack = normalizeCapabilityAction({ name: "slack_send", arguments: { channel: "C0999999999", markdownText: "WEX intake is complete." } });
  assert.equal(slack.input.arguments.channel, "C0999999999");
  assert.equal(slack.input.arguments.markdown_text.startsWith(PREFIX), true);
});

test("the executor rejects unknown/destructive capabilities and protected outbound language", () => {
  assert.throws(() => normalizeCapabilityAction({ name: "gmail_delete", arguments: {} }), /unknown capability/u);
  assert.throws(() => normalizeCapabilityAction({ name: "gmail_trash", arguments: { messageId: "not a gmail id" } }), /invalid/u);
  assert.throws(
    () => normalizeCapabilityAction({ name: "slack_send", arguments: { channel: "C0999999999", markdownText: "Here is the API key" } }),
    /protected credential language/u,
  );
});

test("provider execution uses the pinned account and returns a bounded confirmation", async () => {
  let call;
  const composio = { tools: { async execute(...args) { call = args; return { successful: true, data: { id: "PEC-901", title: "Created" } }; } } };
  const result = await executeCapabilityAction({
    composio,
    action: { name: "linear_create", arguments: { title: "SRS escalation", description: "Work immediately.", priority: 1 } },
    signal,
    expected: APPROVED,
  });
  assert.equal(call[0], "LINEAR_CREATE_LINEAR_ISSUE");
  assert.equal(call[1].connectedAccountId, APPROVED.linearConnectedAccountId);
  assert.equal(result.write, true);
  assert.equal(result.providerReference, "PEC-901");
});

test("the capability agent can read, write, record the effect, and report completion", async () => {
  const turns = [
    { version: 1, type: "tool", name: "linear_search", arguments: { query: "EagleView" }, reason: "Find the issue" },
    { version: 1, type: "tool", name: "linear_comment", arguments: { issueId: "PEC-112", body: "Attached email thread reviewed." }, reason: "Update the issue" },
    { version: 1, type: "final", message: "I updated PEC-112 with the email-thread review." },
  ];
  const calls = [];
  const records = [];
  const result = await runCapabilityAgent({
    source: "slack",
    request: "Maya, find the EagleView issue and add the email context.",
    sourceContext: { channel: "C0BD7L43PC2", threadTs: "1785160000.000001" },
    composio: { tools: { async execute(slug, input) {
      calls.push({ slug, input });
      if (slug === "LINEAR_SEARCH_ISSUES") return { successful: true, data: { issues: [{ identifier: "PEC-112" }] } };
      if (slug === "LINEAR_CREATE_LINEAR_COMMENT") return { successful: true, data: { id: "comment-1" } };
      throw new Error("unexpected tool");
    } } },
    signal,
    expected: APPROVED,
    store: { async recordAction(...args) { records.push(args); } },
    claimName: "receipt.json",
    runPrompt: async () => JSON.stringify(turns.shift()),
  });
  assert.equal(result.confirmedWrites, 1);
  assert.equal(result.text, "I updated PEC-112 with the email-thread review.");
  assert.deepEqual(calls.map((item) => item.slug), ["LINEAR_SEARCH_ISSUES", "LINEAR_CREATE_LINEAR_COMMENT"]);
  assert.deepEqual(records[0].slice(0, 2), ["receipt.json", "linear_comment"]);
  assert.equal(buildReply(result.text, APPROVED.ownerSlackUserId, { allowVerifiedActionClaims: true }), `${PREFIX} ${result.text}`);
  assert.throws(() => buildReply(result.text, APPROVED.ownerSlackUserId), /unverified action claim/u);
});

test("a write without provider confirmation stops the loop as ambiguous", async () => {
  await assert.rejects(
    runCapabilityAgent({
      source: "slack",
      request: "Email Lucinda.",
      composio: { tools: { async execute() { return { successful: false, error: "unknown" }; } } },
      signal,
      expected: APPROVED,
      runPrompt: async () => JSON.stringify({ version: 1, type: "tool", name: "gmail_send", arguments: { recipientEmail: "lucinda@example.test", subject: "Received", body: "Received." } }),
    }),
    /provider confirmation/u,
  );
});

test("planner contract and prompt expose work tools without exposing credentials", () => {
  const prompt = buildCapabilityPrompt({ source: "email", request: "Review WEX", sourceContext: { ownerSlackChannelId: "C0BD7L43PC2" }, history: [] });
  assert.match(prompt, /gmail_reply/u);
  assert.match(prompt, /linear_update/u);
  assert.match(prompt, /slack_send/u);
  assert.match(prompt, /admin@cc\.proexteriorsus\.net and chussey@aia4\.io/u);
  assert.doesNotMatch(prompt, /sk_live|xoxb-|lin_api_/u);
  assert.equal(parseCapabilityTurn('{"version":1,"type":"final","message":"Done."}').message, "Done.");
  assert.throws(() => parseCapabilityTurn("not json"), /invalid JSON/u);
});
