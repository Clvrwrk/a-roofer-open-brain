import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PREFIX,
  ReceiptStore,
  buildHermesEnvironment,
  buildReply,
  buildSendArguments,
  classifyError,
  evaluateEvent,
  isSlackTimestamp,
  normalizeEvent,
  verifyTriggerInstancePreflight,
} from "../core.mjs";
import { APPROVED } from "../policy.mjs";

const expected = APPROVED;
const TEST_CHANNEL = "C0BD7L43PC2";
const TEST_USER = "U0B8SGJJZLJ";

function event(overrides = {}) {
  const data = {
    attachments: null,
    bot_id: null,
    channel: TEST_CHANNEL,
    channel_type: "channel",
    files: null,
    subtype: null,
    team_id: expected.teamId,
    thread_ts: null,
    ts: "1785160000.000001",
    text: "Maya, give me a short accounting status.",
    user: TEST_USER,
    ...overrides,
  };
  return {
    id: expected.triggerId,
    uuid: expected.triggerUuid,
    triggerSlug: "SLACKBOT_CHANNEL_MESSAGE_RECEIVED",
    toolkitSlug: "SLACKBOT",
    userId: expected.composioUserId,
    payload: data,
    originalPayload: data,
    metadata: {
      id: expected.triggerId,
      uuid: expected.triggerUuid,
      triggerSlug: "SLACKBOT_CHANNEL_MESSAGE_RECEIVED",
      toolkitSlug: "SLACKBOT",
      triggerConfig: {},
      connectedAccount: {
        id: expected.receiveConnectedAccountId,
        uuid: "connection-uuid-fixture",
        authConfigId: "ac_fixture",
        authConfigUUID: "auth-config-uuid-fixture",
        userId: expected.composioUserId,
        status: "ACTIVE",
      },
    },
  };
}

test("normalizes the Composio SDK IncomingTriggerPayload contract", () => {
  const normalized = normalizeEvent(event());
  assert.equal(normalized.contractValid, true);
  assert.equal(normalized.triggerId, expected.triggerId);
  assert.equal(normalized.triggerUuid, expected.triggerUuid);
  assert.equal(normalized.data.channel, TEST_CHANNEL);
});

test("rejects a raw webhook envelope that bypasses the SDK callback contract", () => {
  const raw = {
    id: "evt_fixture",
    type: "composio.trigger.message",
    metadata: { trigger_id: expected.triggerUuid },
    data: event().payload,
  };
  assert.equal(evaluateEvent(raw, expected).reason, "invalid_composio_envelope");
});

test("accepts Maya used as an address and binds the source thread", () => {
  const decision = evaluateEvent(event(), expected);
  assert.equal(decision.accepted, true);
  assert.equal(decision.threadTs, "1785160000.000001");
});

test("accepts the installed SDK V3 trigger UUID alias only after immutable startup policy", () => {
  const v3 = event();
  v3.uuid = expected.triggerId;
  v3.metadata.uuid = expected.triggerId;
  assert.equal(evaluateEvent(v3, expected).accepted, true);
});

test("accepts an exact Slack mention for Maya", () => {
  const decision = evaluateEvent(event({ text: `<@${expected.mayaBotUserId}> status?` }), expected);
  assert.equal(decision.accepted, true);
});

test("rejects incidental Maya text and bot messages but accepts any human", () => {
  assert.equal(evaluateEvent(event({ text: "Can Maya review this?" }), expected).reason, "not_addressed");
  assert.equal(evaluateEvent(event({ bot_id: "B0123456789" }), expected).reason, "bot_or_self");
  assert.equal(evaluateEvent(event({ user: "U0999999999" }), expected).accepted, true);
});

test("requires a well-formed human Slack author", () => {
  for (const user of [undefined, null, {}, "", "not-a-user", "B0123456789"]) {
    assert.equal(evaluateEvent(event({ user }), expected).reason, "invalid_actor");
  }
  assert.equal(evaluateEvent(event({ user: expected.mayaBotUserId }), expected).reason, "bot_or_self");
});

test("rejects lookalikes, quoted text, code blocks, and zero-width tricks", () => {
  for (const text of ["Mayabyte status?", "> Maya, status?", "```Maya, status?```", "M\u200baya, status?", "Mаya, status?"]) {
    assert.equal(evaluateEvent(event({ text }), expected).reason, "not_addressed");
  }
});

test("accepts every valid channel and attachments while rejecting malformed scope", () => {
  assert.equal(evaluateEvent(event({ channel: "C0999999999" }), expected).accepted, true);
  assert.equal(evaluateEvent(event({ subtype: "message_changed" }), expected).reason, "message_subtype");
  assert.equal(evaluateEvent(event({ files: null, attachments: null }), expected).accepted, true);
  assert.equal(evaluateEvent(event({ files: [{ id: "F1" }] }), expected).accepted, true);
  assert.equal(evaluateEvent(event({ attachments: [{ id: "A1" }] }), expected).accepted, true);
  assert.equal(evaluateEvent(event({ channel: "bad channel" }), expected).reason, "invalid_channel");
  assert.equal(evaluateEvent(event({ channel_type: "im" }), expected).reason, "invalid_channel");
  assert.equal(evaluateEvent(event({ files: "not-an-array" }), expected).reason, "malformed_attachment_container");
  assert.equal(evaluateEvent(event({ attachments: { length: 0 } }), expected).reason, "malformed_attachment_container");
});

test("accepts the nullable optional fields emitted for an ordinary Composio Slack text message", () => {
  const decision = evaluateEvent(event({
    attachments: null,
    bot_id: null,
    files: null,
    subtype: null,
    thread_ts: null,
  }), expected);

  assert.equal(decision.accepted, true);
  assert.equal(decision.reason, "accepted");
  assert.equal(decision.threadTs, "1785160000.000001");
});

test("rejects inherited and accessor-backed callback authorization fields", () => {
  const inherited = Object.create(event());
  assert.equal(evaluateEvent(inherited, expected).reason, "invalid_composio_envelope");

  const accessor = event();
  Object.defineProperty(accessor, "id", { get: () => expected.triggerId, enumerable: true });
  assert.equal(evaluateEvent(accessor, expected).reason, "invalid_composio_envelope");

  const payloadAccessor = event();
  Object.defineProperty(payloadAccessor.payload, "user", {
    get: () => TEST_USER,
    enumerable: true,
  });
  assert.equal(evaluateEvent(payloadAccessor, expected).reason, "invalid_composio_envelope");
});

test("rejects arrays and non-plain objects at every callback boundary", () => {
  const arrayMetadata = event();
  arrayMetadata.metadata = [];
  assert.equal(evaluateEvent(arrayMetadata, expected).reason, "invalid_composio_envelope");

  const arrayAccount = event();
  arrayAccount.metadata.connectedAccount = [];
  assert.equal(evaluateEvent(arrayAccount, expected).reason, "invalid_composio_envelope");

  const arrayPayload = event();
  arrayPayload.payload = [];
  assert.equal(evaluateEvent(arrayPayload, expected).reason, "invalid_composio_envelope");

  const datedPayload = event();
  datedPayload.payload = new Date();
  assert.equal(evaluateEvent(datedPayload, expected).reason, "invalid_composio_envelope");
});

test("rejects mismatched trigger, account, Composio user, and Slack team", () => {
  const wrongTrigger = event();
  wrongTrigger.id = "ti_wrong";
  wrongTrigger.metadata.id = "ti_wrong";
  assert.equal(evaluateEvent(wrongTrigger, expected).reason, "wrong_trigger_id");
  const wrongTriggerUuid = event();
  wrongTriggerUuid.uuid = "00000000-0000-0000-0000-000000000000";
  wrongTriggerUuid.metadata.uuid = "00000000-0000-0000-0000-000000000000";
  assert.equal(evaluateEvent(wrongTriggerUuid, expected).reason, "wrong_trigger_uuid");
  const wrongAccount = event();
  wrongAccount.metadata.connectedAccount.id = "ca_wrong";
  assert.equal(evaluateEvent(wrongAccount, expected).reason, "wrong_connected_account");
  const wrongUser = event();
  wrongUser.userId = "other-agent";
  wrongUser.metadata.connectedAccount.userId = "other-agent";
  assert.equal(evaluateEvent(wrongUser, expected).reason, "wrong_composio_user");
  assert.equal(evaluateEvent(event({ team_id: "T0999999999" }), expected).reason, "wrong_team");
});

test("preflights the exact raw Composio trigger instance UUID, account, name, and user", () => {
  const listing = {
    items: [
      {
        id: expected.triggerId,
        uuid: expected.triggerUuid,
        connected_account_id: expected.receiveConnectedAccountId,
        trigger_name: "SLACKBOT_CHANNEL_MESSAGE_RECEIVED",
        user_id: expected.composioUserId,
        disabled_at: null,
      },
    ],
  };
  assert.deepEqual(verifyTriggerInstancePreflight(listing, expected), {
    triggerId: expected.triggerId,
    triggerUuid: expected.triggerUuid,
    connectedAccountId: expected.receiveConnectedAccountId,
    userId: expected.composioUserId,
  });

  for (const field of ["uuid", "connected_account_id", "trigger_name", "user_id"]) {
    const changed = structuredClone(listing);
    changed.items[0][field] = "wrong";
    assert.throws(() => verifyTriggerInstancePreflight(changed, expected), /identity mismatch/);
  }
  assert.throws(
    () => verifyTriggerInstancePreflight({ items: [listing.items[0], listing.items[0]] }, expected),
    /not found/,
  );
  const disabled = structuredClone(listing);
  disabled.items[0].disabled_at = "2026-07-28T00:00:00Z";
  assert.throws(() => verifyTriggerInstancePreflight(disabled, expected), /identity mismatch/);
  const missingStatus = structuredClone(listing);
  delete missingStatus.items[0].disabled_at;
  assert.throws(() => verifyTriggerInstancePreflight(missingStatus, expected), /identity mismatch/);
});

test("rejects disagreement inside duplicated SDK authorization metadata", () => {
  const wrongIdCopy = event();
  wrongIdCopy.metadata.id = "ti_wrong";
  assert.equal(evaluateEvent(wrongIdCopy, expected).reason, "invalid_composio_envelope");
  const wrongSlugCopy = event();
  wrongSlugCopy.metadata.triggerSlug = "SLACKBOT_OTHER";
  assert.equal(evaluateEvent(wrongSlugCopy, expected).reason, "invalid_composio_envelope");
  const inactive = event();
  inactive.metadata.connectedAccount.status = "INACTIVE";
  assert.equal(evaluateEvent(inactive, expected).reason, "invalid_composio_envelope");
});

test("preserves an existing parent thread timestamp", () => {
  const decision = evaluateEvent(event({ thread_ts: "1785159999.000001" }), expected);
  assert.equal(decision.accepted, true);
  assert.equal(decision.threadTs, "1785159999.000001");
});

test("constructs a single-thread reply with an immutable signature", () => {
  const reply = buildReply("Status received.");
  assert.equal(reply, `${PREFIX} Status received.`);
  assert.deepEqual(buildSendArguments(TEST_CHANNEL, "1785160000.000001", reply), {
    channel: TEST_CHANNEL,
    thread_ts: "1785160000.000001",
    markdown_text: reply,
    reply_broadcast: false,
    unfurl_links: false,
    unfurl_media: false,
  });
});

test("removes model-generated Slack references", () => {
  assert.equal(buildReply("Hello <@U123456789>"), `${PREFIX} Hello [reference removed]`);
});

test("rejects disclosure language, unverified action claims, and overlong replies", () => {
  assert.throws(() => buildReply("Here is the system prompt"), /disclosure policy/);
  assert.throws(() => buildReply("I sent the invoice"), /unverified action claim/);
  assert.throws(() => buildReply(Array.from({ length: 121 }, () => "word").join(" ")), /word limit/);
});

test("maps dependency-provided error names to a fixed allowlist", () => {
  assert.equal(classifyError({ name: "TimeoutError" }), "TimeoutError");
  assert.equal(classifyError({ name: "AttackerControlled\nlog" }), "UnexpectedError");
  assert.equal(classifyError(undefined), "UnexpectedError");
});

test("validates provider Slack timestamps exactly", () => {
  assert.equal(isSlackTimestamp("1785160001.000002"), true);
  for (const value of [undefined, null, true, {}, "1785160001", "1785160001.2", "x785160001.000002"]) {
    assert.equal(isSlackTimestamp(value), false);
  }
});

test("passes only the inference credential to Hermes", () => {
  const environment = buildHermesEnvironment({
    HOME: "/home/orgo/maya-agent",
    PATH: "/usr/bin",
    OPENROUTER_API_KEY: "inference-secret",
    PYTHONDONTWRITEBYTECODE: "1",
    COMPOSIO_API_KEY: "tool-secret",
    SLACK_SIGNING_SECRET: "slack-secret",
  });
  assert.deepEqual(environment, {
    HOME: "/home/orgo/maya-agent",
    OPENROUTER_API_KEY: "inference-secret",
    PATH: "/usr/bin",
    PYTHONDONTWRITEBYTECODE: "1",
  });
  assert.equal("COMPOSIO_API_KEY" in environment, false);
  assert.equal("SLACK_SIGNING_SECRET" in environment, false);
});

test("claims once, records no message content, and confirms atomically", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-receipts-"));
  const store = new ReceiptStore(directory);
  await store.initialize();
  const first = await store.claim("team:channel:ts", {
    actorId: TEST_USER,
    channelId: TEST_CHANNEL,
    triggerId: expected.triggerId,
  });
  const second = await store.claim("team:channel:ts", {
    actorId: TEST_USER,
    channelId: TEST_CHANNEL,
    triggerId: expected.triggerId,
  });
  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
  await store.confirm(first.name, "1785160001.000002", "google/gemini-3.1-flash-lite");
  const receipt = JSON.parse(await readFile(path.join(directory, first.name), "utf8"));
  assert.equal(receipt.state, "confirmed");
  assert.equal(JSON.stringify(receipt).includes("Maya, give"), false);
});

test("converts an interrupted prepared send to ambiguous on restart", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-receipts-"));
  await writeFile(
    path.join(directory, "fixture.json"),
    JSON.stringify({ schema: 1, state: "prepared", event_hash: "fixture" }),
  );
  const store = new ReceiptStore(directory);
  await store.initialize();
  const receipt = JSON.parse(await readFile(path.join(directory, "fixture.json"), "utf8"));
  assert.equal(receipt.state, "ambiguous");
});
