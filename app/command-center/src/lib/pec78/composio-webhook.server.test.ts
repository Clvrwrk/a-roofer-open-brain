import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptPec78SlackEvent, encryptPec78SlackEvent, verifyPec78ComposioWebhook } from "./composio-webhook.server";

const secret = "fixture-secret";
const now = 1_785_200_000;
const triggerId = "ti_new_maya_fixture";
const accountId = "ca_X9dQyRDSS0sa";
const userId = "maya-chen";

function envelope(data: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "msg_fixture_1",
    type: "composio.trigger.message",
    metadata: { log_id: "log_fixture", trigger_slug: "SLACKBOT_CHANNEL_MESSAGE_RECEIVED", trigger_id: triggerId, connected_account_id: accountId, auth_config_id: "ac_fixture", user_id: userId },
    data: { team_id: "T0B8QEGPVQW", channel: "C0BD7L43PC2", channel_type: "channel", ts: "1785200000.000001", text: "Maya, confirm the callback.", user: "U0B8SGJJZLJ", ...data },
    timestamp: new Date(now * 1_000).toISOString(),
  });
}

function headers(body: string, timestamp = String(now), signatureBody = body) {
  const id = "msg_delivery_fixture";
  const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${signatureBody}`).digest("base64");
  return new Headers({ "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` });
}

function verify(body = envelope(), h = headers(body), overrides: Record<string, unknown> = {}) {
  return verifyPec78ComposioWebhook({ rawBody: body, headers: h, secret, triggerId, connectedAccountId: accountId, composioUserId: userId, nowMs: now * 1_000, ...overrides });
}

describe("PEC-78 signed Composio ingress", () => {
  it("accepts an exact signed V3 owner message", () => expect(verify().ok).toBe(true));
  it("accepts an exact Maya mention", () => expect(verify(envelope({ text: "<@U0BD0Q0H55G> callback status?" })).ok).toBe(true));
  it.each([
    ["wrong trigger", { trigger_id: "ti_wrong" }],
    ["wrong account", { connected_account_id: "ca_wrong" }],
    ["wrong user", { user_id: "other" }],
  ])("rejects %s metadata", (_label, changed) => {
    const parsed = JSON.parse(envelope()); Object.assign(parsed.metadata, changed); const body = JSON.stringify(parsed);
    expect(verify(body, headers(body))).toMatchObject({ ok: false, code: "source_denied" });
  });
  it.each([
    ["wrong team", { team_id: "T_WRONG" }], ["wrong channel", { channel: "C_WRONG" }],
    ["wrong owner", { user: "U_WRONG" }], ["bot", { bot_id: "B_FIXTURE" }],
    ["subtype", { subtype: "message_changed" }], ["attachment", { files: [{ id: "F1" }] }],
    ["incidental name", { text: "Can Maya review this?" }], ["confusable", { text: "Mаya, status?" }],
  ])("rejects %s", (_label, changed) => expect(verify(envelope(changed), headers(envelope(changed)))).toMatchObject({ ok: false }));
  it("rejects a byte-changed body", () => { const body = envelope(); expect(verify(`${body} `, headers(body))).toMatchObject({ ok: false, code: "signature_invalid" }); });
  it("rejects stale and future timestamps", () => {
    expect(verify(envelope(), headers(envelope(), String(now - 301)))).toMatchObject({ ok: false, code: "signature_stale" });
    expect(verify(envelope(), headers(envelope(), String(now + 301)))).toMatchObject({ ok: false, code: "signature_stale" });
  });
  it("fails closed when any production identity or secret is absent", () => expect(verify(envelope(), headers(envelope()), { secret: undefined })).toMatchObject({ ok: false, status: 503 }));
  it("uses independent delivery and Slack-message digests", () => {
    const first = verify(); const secondBody = envelope(); const second = verify(secondBody, headers(secondBody).set ? headers(secondBody) : headers(secondBody));
    expect(first.ok && second.ok && first.event.deliveryDigest).not.toBe(first.ok && second.ok ? first.event.messageDigest : "");
  });
  it("encrypts the minimized event and authenticates AAD", () => {
    const result = verify(); expect(result.ok).toBe(true); if (!result.ok) return;
    const env = { PEC78_EVENT_ENCRYPTION_KEY: randomBytes(32).toString("base64"), PEC78_EVENT_ENCRYPTION_KEY_VERSION: "maya-v1" };
    const encrypted = encryptPec78SlackEvent(result.event, env);
    expect(JSON.stringify(encrypted)).not.toContain("confirm the callback");
    expect(decryptPec78SlackEvent({ ...encrypted, providerEventId: result.event.providerEventId, payloadDigest: result.event.payloadDigest }, env).messageText).toBe("Maya, confirm the callback.");
    expect(() => decryptPec78SlackEvent({ ...encrypted, providerEventId: "msg_changed", payloadDigest: result.event.payloadDigest }, env)).toThrow();
  });
});
