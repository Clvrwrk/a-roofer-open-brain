import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { RuntimeEnv } from "@lib/runtime-env";

export const PEC78_COMPOSIO_WEBHOOK_PATH = "/api/integrations/composio/v1/webhook";
export const PEC78_COMPOSIO_EVENT_TYPE = "composio.trigger.message";
export const PEC78_SLACK_TRIGGER_SLUG = "SLACKBOT_CHANNEL_MESSAGE_RECEIVED";
export const PEC78_SLACK_TEAM_ID = "T0B8QEGPVQW";
export const PEC78_SLACK_CHANNEL_ID = "C0BD7L43PC2";
export const PEC78_SLACK_MAYA_BOT_ID = "U0BD0Q0H55G";
export const PEC78_SLACK_OWNER_ID = "U0B8SGJJZLJ";
export const PEC78_WEBHOOK_TOLERANCE_SECONDS = 300;

const SLACK_TS = /^\d{10}\.\d{6}$/;
const PROVIDER_ID = /^[A-Za-z0-9_-]{3,160}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

type JsonRecord = Record<string, unknown>;

export interface Pec78SlackIngressEvent {
  providerEventId: string;
  deliveryDigest: string;
  messageDigest: string;
  payloadDigest: string;
  channelDigest: string;
  threadDigest: string;
  triggerId: string;
  connectedAccountId: string;
  composioUserId: string;
  teamId: typeof PEC78_SLACK_TEAM_ID;
  channelId: typeof PEC78_SLACK_CHANNEL_ID;
  ownerUserId: typeof PEC78_SLACK_OWNER_ID;
  messageTs: string;
  threadTs: string;
  occurredAt: string;
  messageText: string;
}

export interface Pec78EncryptedEvent {
  algorithm: "aes-256-gcm";
  keyVersion: string;
  nonce: string;
  authTag: string;
  ciphertext: string;
}

export type Pec78WebhookResult =
  | { ok: true; event: Pec78SlackIngressEvent }
  | { ok: false; status: number; code: string };

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
    ? value as JsonRecord
    : null;
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function equalBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function webhookTimestampSeconds(value: string): number | null {
  if (!/^\d{10}$/.test(value)) return null;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function signatureValue(value: string): string | null {
  const parts = value.split(" ").flatMap((item) => item.split(","));
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (parts[index] === "v1" && BASE64.test(parts[index + 1])) return parts[index + 1];
  }
  const candidate = value.startsWith("v1,") ? value.slice(3) : value;
  return BASE64.test(candidate) ? candidate : null;
}

function addressedToMaya(text: string): boolean {
  if (!text || text.length > 2_000) return false;
  const mention = new RegExp(`^\\s*<@${PEC78_SLACK_MAYA_BOT_ID}>(?:[,:;.!?]|\\s|$)`, "u");
  return mention.test(text) || /^\s*maya(?:[,:;.!?]|\s)/iu.test(text);
}

export function verifyPec78ComposioWebhook(input: {
  rawBody: string;
  headers: Headers;
  secret: string | undefined;
  triggerId: string | undefined;
  connectedAccountId: string | undefined;
  composioUserId: string | undefined;
  nowMs?: number;
}): Pec78WebhookResult {
  const { rawBody, headers } = input;
  if (!input.secret || !input.triggerId || !input.connectedAccountId || !input.composioUserId) {
    return { ok: false, status: 503, code: "ingress_configuration_missing" };
  }
  if (rawBody.length === 0 || Buffer.byteLength(rawBody) > 32_768) return { ok: false, status: 413, code: "payload_rejected" };
  const webhookId = headers.get("webhook-id") ?? "";
  const timestampText = headers.get("webhook-timestamp") ?? "";
  const signatureText = headers.get("webhook-signature") ?? "";
  if (!PROVIDER_ID.test(webhookId) || signatureText.length > 256) return { ok: false, status: 401, code: "signature_required" };
  const timestamp = webhookTimestampSeconds(timestampText);
  const signature = signatureValue(signatureText);
  if (timestamp === null || !signature) return { ok: false, status: 401, code: "signature_invalid" };
  const now = Math.floor((input.nowMs ?? Date.now()) / 1_000);
  if (Math.abs(now - timestamp) > PEC78_WEBHOOK_TOLERANCE_SECONDS) return { ok: false, status: 401, code: "signature_stale" };
  const expected = createHmac("sha256", input.secret).update(`${webhookId}.${timestampText}.${rawBody}`).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64"); }
  catch { return { ok: false, status: 401, code: "signature_invalid" }; }
  if (!equalBytes(expected, received)) return { ok: false, status: 401, code: "signature_invalid" };

  let envelope: JsonRecord | null;
  try { envelope = record(JSON.parse(rawBody)); }
  catch { return { ok: false, status: 422, code: "envelope_invalid" }; }
  if (!envelope || envelope.type !== PEC78_COMPOSIO_EVENT_TYPE || typeof envelope.id !== "string" || !PROVIDER_ID.test(envelope.id)) {
    return { ok: false, status: 422, code: "envelope_invalid" };
  }
  const metadata = record(envelope.metadata);
  const data = record(envelope.data);
  if (!metadata || !data || metadata.trigger_slug !== PEC78_SLACK_TRIGGER_SLUG || metadata.trigger_id !== input.triggerId ||
      metadata.connected_account_id !== input.connectedAccountId || metadata.user_id !== input.composioUserId) {
    return { ok: false, status: 403, code: "source_denied" };
  }
  if (data.team_id !== PEC78_SLACK_TEAM_ID || data.channel !== PEC78_SLACK_CHANNEL_ID || data.channel_type !== "channel" ||
      data.user !== PEC78_SLACK_OWNER_ID || typeof data.ts !== "string" || !SLACK_TS.test(data.ts) ||
      typeof data.text !== "string" || data.subtype || data.bot_id || data.user === PEC78_SLACK_MAYA_BOT_ID) {
    return { ok: false, status: 403, code: "slack_event_denied" };
  }
  if ((data.files !== undefined && !Array.isArray(data.files)) || (data.attachments !== undefined && !Array.isArray(data.attachments)) ||
      (Array.isArray(data.files) && data.files.length > 0) || (Array.isArray(data.attachments) && data.attachments.length > 0) ||
      !addressedToMaya(data.text)) {
    return { ok: false, status: 403, code: "message_denied" };
  }
  const threadTs = typeof data.thread_ts === "string" && SLACK_TS.test(data.thread_ts) ? data.thread_ts : data.ts;
  const occurredAt = typeof envelope.timestamp === "string" && !Number.isNaN(Date.parse(envelope.timestamp))
    ? new Date(envelope.timestamp).toISOString()
    : new Date(timestamp * 1_000).toISOString();
  const messageKey = `${PEC78_SLACK_TEAM_ID}|${PEC78_SLACK_CHANNEL_ID}|${data.ts}`;
  return {
    ok: true,
    event: {
      providerEventId: envelope.id,
      deliveryDigest: digest(webhookId),
      messageDigest: digest(messageKey),
      payloadDigest: digest(rawBody),
      channelDigest: digest(PEC78_SLACK_CHANNEL_ID),
      threadDigest: digest(`${PEC78_SLACK_CHANNEL_ID}|${threadTs}`),
      triggerId: input.triggerId,
      connectedAccountId: input.connectedAccountId,
      composioUserId: input.composioUserId,
      teamId: PEC78_SLACK_TEAM_ID,
      channelId: PEC78_SLACK_CHANNEL_ID,
      ownerUserId: PEC78_SLACK_OWNER_ID,
      messageTs: data.ts,
      threadTs,
      occurredAt,
      messageText: data.text,
    },
  };
}

function encryptionKey(value: string | undefined): Buffer {
  if (!value) throw new Error("event_encryption_unavailable");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("event_encryption_unavailable");
  return key;
}

export function encryptPec78SlackEvent(event: Pec78SlackIngressEvent, env: RuntimeEnv): Pec78EncryptedEvent {
  const keyVersion = env.PEC78_EVENT_ENCRYPTION_KEY_VERSION?.trim();
  if (!keyVersion || !/^[A-Za-z0-9._-]{1,64}$/.test(keyVersion)) throw new Error("event_encryption_unavailable");
  const key = encryptionKey(env.PEC78_EVENT_ENCRYPTION_KEY);
  const nonce = randomBytes(12);
  const aad = Buffer.from(`${event.providerEventId}|${event.payloadDigest}|${keyVersion}`);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const plaintext = Buffer.from(JSON.stringify({
    schema: 1,
    teamId: event.teamId,
    channelId: event.channelId,
    ownerUserId: event.ownerUserId,
    messageTs: event.messageTs,
    threadTs: event.threadTs,
    messageText: event.messageText,
  }));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { algorithm: "aes-256-gcm", keyVersion, nonce: nonce.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

export function decryptPec78SlackEvent(input: Pec78EncryptedEvent & { providerEventId: string; payloadDigest: string }, env: RuntimeEnv): JsonRecord {
  if (input.algorithm !== "aes-256-gcm" || input.keyVersion !== env.PEC78_EVENT_ENCRYPTION_KEY_VERSION) throw new Error("event_decryption_denied");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env.PEC78_EVENT_ENCRYPTION_KEY), Buffer.from(input.nonce, "base64"), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(`${input.providerEventId}|${input.payloadDigest}|${input.keyVersion}`));
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(input.ciphertext, "base64")), decipher.final()]).toString("utf8");
  const value = record(JSON.parse(plaintext));
  if (!value || value.schema !== 1) throw new Error("event_decryption_denied");
  return value;
}

export function composioIngressMode(env: RuntimeEnv): "disabled" | "validation" | "enabled" {
  return env.PEC78_COMPOSIO_INGRESS_MODE === "validation" || env.PEC78_COMPOSIO_INGRESS_MODE === "enabled"
    ? env.PEC78_COMPOSIO_INGRESS_MODE
    : "disabled";
}
