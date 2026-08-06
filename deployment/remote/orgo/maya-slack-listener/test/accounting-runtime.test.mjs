import assert from "node:assert/strict";
import test from "node:test";
import { dueCadenceOccurrences, MAYA_CADENCE_LOOPS } from "../cadence-executor.mjs";
import { normalizeCapabilityAction } from "../capability-executor.mjs";
import { classifyAccountingAlias, recordCommandCenterIntake } from "../command-center-client.mjs";
import { sourceKeysForMessage } from "../linear-orchestration.mjs";
import { isExecutableMayaIssue } from "../linear-work-executor.mjs";
import { APPROVED } from "../policy.mjs";

test("same-day forwarded document copies share a content orchestration key", () => {
  const base = {
    receivedAt: "2026-08-06T00:42:10.000Z",
    subject: "Colorado 6/3-12/31/26",
    attachments: [
      { filename: "image.png" },
      { filename: "Pro Exteriors - Roof Load-POS-35943.pdf" },
    ],
  };
  const first = sourceKeysForMessage({ ...base, messageId: "19fd485771fd6658", threadId: "19fd485771fd6658" });
  const second = sourceKeysForMessage({ ...base, messageId: "19fd485d6c01c801", threadId: "19fd485d6c01c801", subject: "Fwd: Colorado 6/3-12/31/26" });
  assert.equal(first[0], second[0]);
  assert.notEqual(first[1], second[1]);
});

test("Maya has complete daily-through-annual loop coverage in Central time", () => {
  assert.deepEqual([...new Set(MAYA_CADENCE_LOOPS.map((loop) => loop.cadence))], [
    "daily", "weekly", "monthly", "quarterly", "annual",
  ]);
  const mondayMorning = dueCadenceOccurrences(new Date("2026-08-03T12:00:00.000Z"));
  assert.deepEqual(mondayMorning.map(({ loop }) => loop.id), ["morning-inbox-audit"]);
  const annual = dueCadenceOccurrences(new Date("2027-01-15T15:00:00.000Z"));
  assert.ok(annual.some(({ loop, period }) => loop.id === "intake-system-review" && period === "2027"));
});

test("Linear worker claims only CAT-linked Maya Agent Todo work", () => {
  const issue = {
    id: "22222222-2222-4222-8222-222222222222",
    identifier: "PEC-901",
    title: "[MAYA] Review WIP/AR",
    team: { id: APPROVED.linearWorkTeamId },
    state: { id: APPROVED.linearWorkTodoStateId },
    description: "CAT source issue: CAT-20\nMaya execution gate: Agent Todo\nMaya work type: wip_ar",
  };
  assert.equal(isExecutableMayaIssue(issue), true);
  assert.equal(isExecutableMayaIssue({ ...issue, state: { name: APPROVED.linearWorkTodoStateName } }), true);
  assert.equal(isExecutableMayaIssue({ ...issue, state: { name: "Todo" } }), false);
  assert.equal(isExecutableMayaIssue({ ...issue, state: { name: "Agent Working" } }), false);
  assert.equal(isExecutableMayaIssue({ ...issue, state: { id: APPROVED.linearWorkReviewStateId } }), false);
  assert.equal(isExecutableMayaIssue({ ...issue, description: "Maya execution gate: Agent Todo" }), false);
  assert.equal(isExecutableMayaIssue({ ...issue, title: "Unattributed work" }), false);
});

test("Linear work mode is read/evidence-only", () => {
  const mode = Object.freeze({ ...APPROVED, capabilityMode: "linear_work" });
  assert.throws(
    () => normalizeCapabilityAction({ name: "gmail_send", arguments: { recipientEmail: "vendor@example.test", subject: "x", body: "x" } }, mode),
    /forbids this capability/u,
  );
  assert.equal(normalizeCapabilityAction({ name: "command_center_wip_ar", arguments: {} }, mode).slug, "COMMAND_CENTER_GET");
  assert.equal(normalizeCapabilityAction({ name: "linear_comment", arguments: { issueId: "PEC-901", body: "Evidence attached." } }, mode).write, true);
});

test("mailbox work mode forbids arbitrary email and Linear writes", () => {
  const mode = Object.freeze({
    ...APPROVED,
    capabilityMode: "mailbox",
    allowedLinearIssueIds: ["CAT-901", "PEC-901"],
  });
  assert.throws(
    () => normalizeCapabilityAction({ name: "gmail_reply", arguments: { threadId: "19fabcdef7654321", body: "done" } }, mode),
    /forbids this capability/u,
  );
  assert.throws(
    () => normalizeCapabilityAction({ name: "linear_comment", arguments: { issueId: "PEC-999", body: "wrong issue" } }, mode),
    /restricts Linear actions/u,
  );
  assert.throws(
    () => normalizeCapabilityAction({ name: "slack_send", arguments: { channel: "C0OTHERCHANNEL", markdownText: "blocked" } }, mode),
    /pinned owner channel/u,
  );
  assert.equal(
    normalizeCapabilityAction({ name: "linear_comment", arguments: { issueId: "PEC-901", body: "Evidence attached." } }, mode).write,
    true,
  );
});

test("Command Center intake is pinned, authenticated, and provider-confirmed", async () => {
  assert.deepEqual(classifyAccountingAlias("PriceAgreement@cc.proexteriorsus.net"), {
    alias: "priceagreement@cc.proexteriorsus.net",
    classification: "price_agreement",
  });
  let request;
  const outcome = await recordCommandCenterIntake({
    payload: { sourceChannel: "linear", orchestrationKey: "linear-work:fixture" },
    signal: new AbortController().signal,
    expected: APPROVED,
    token: "fixture-token",
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({
        status: "accepted",
        workItem: { id: "work-item-1", work_key: "accounting:intake:linear:fixture" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(request.url, "https://cc.proexteriorsus.net/api/agent/intake");
  assert.equal(request.options.headers.authorization, "Bearer fixture-token");
  assert.equal(outcome.providerReference, "work-item-1");
});
