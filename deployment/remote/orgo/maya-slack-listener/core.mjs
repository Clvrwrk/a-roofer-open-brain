import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";

export const TRIGGER_SLUG = "SLACKBOT_CHANNEL_MESSAGE_RECEIVED";
export const TOOL_SLUG = "SLACKBOT_SEND_MESSAGE";
export const TOOL_VERSION = "20260721_00";
export const PREFIX = "[NA-5][MAYA] -";

const SLACK_TS = /^\d{10}\.\d{6}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{3,128}$/;
const SLACK_USER_ID = /^[UW][A-Z0-9]{8,}$/;
const ERROR_CLASSES = new Set([
  "AbortError",
  "ComposioRequestCancelledError",
  "Error",
  "TimeoutError",
  "TypeError",
]);

export function hashId(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function isSlackTimestamp(value) {
  return typeof value === "string" && SLACK_TS.test(value);
}

export function classifyError(error) {
  return ERROR_CLASSES.has(error?.name) ? error.name : "UnexpectedError";
}

export function normalizeEvent(raw) {
  const rawRecord = isPlainRecord(raw) ? raw : {};
  const metadata = ownDataValue(rawRecord, "metadata");
  const connectedAccount = ownDataValue(metadata, "connectedAccount");
  const data = ownDataValue(rawRecord, "payload");
  const rawId = ownDataValue(rawRecord, "id");
  const rawUuid = ownDataValue(rawRecord, "uuid");
  const rawTriggerSlug = ownDataValue(rawRecord, "triggerSlug");
  const rawToolkitSlug = ownDataValue(rawRecord, "toolkitSlug");
  const rawUserId = ownDataValue(rawRecord, "userId");
  const contractValid =
    isPlainRecord(raw) &&
    isPlainRecord(metadata) &&
    isPlainRecord(connectedAccount) &&
    isPlainRecord(data) &&
    typeof rawId === "string" &&
    typeof rawUuid === "string" &&
    typeof rawTriggerSlug === "string" &&
    typeof rawToolkitSlug === "string" &&
    typeof rawUserId === "string" &&
    ownDataValue(metadata, "id") === rawId &&
    ownDataValue(metadata, "uuid") === rawUuid &&
    ownDataValue(metadata, "triggerSlug") === rawTriggerSlug &&
    ownDataValue(metadata, "toolkitSlug") === rawToolkitSlug &&
    ownDataValue(connectedAccount, "userId") === rawUserId &&
    ownDataValue(connectedAccount, "status") === "ACTIVE" &&
    hasOwnDataProperties(data, ["team_id", "channel", "channel_type", "ts", "text", "user"]) &&
    hasOnlyDataPropertiesWhenPresent(data, [
      "subtype",
      "bot_id",
      "files",
      "attachments",
      "thread_ts",
    ]);

  return {
    contractValid,
    messageId: rawId ?? "",
    triggerSlug: rawTriggerSlug ?? "",
    triggerId: rawId ?? "",
    triggerUuid: rawUuid ?? "",
    connectedAccountId: ownDataValue(connectedAccount, "id") ?? "",
    userId: rawUserId ?? "",
    data: isPlainRecord(data) ? data : {},
  };
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataValue(record, name) {
  if (!isPlainRecord(record)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, name);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function hasOwnDataProperties(record, names) {
  return names.every((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, name);
    return Boolean(descriptor && Object.hasOwn(descriptor, "value"));
  });
}

function hasOnlyDataPropertiesWhenPresent(record, names) {
  return names.every((name) => {
    if (!Object.hasOwn(record, name)) return true;
    return Object.hasOwn(Object.getOwnPropertyDescriptor(record, name), "value");
  });
}

function addressedToMaya(text, mayaBotUserId) {
  if (typeof text !== "string" || text.length === 0 || text.length > 2_000) {
    return false;
  }
  const mention = new RegExp(`^\\s*<@${escapeRegex(mayaBotUserId)}>(?:[,:;.!?]|\\s|$)`, "u");
  const plain = /^\s*maya(?:[,:;.!?]|\s)/iu;
  return mention.test(text) || plain.test(text);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isOptionalArray(value) {
  return value === undefined || value === null || Array.isArray(value);
}

export function evaluateEvent(raw, expected) {
  const event = normalizeEvent(raw);
  const data = event.data ?? {};
  const reject = (reason) => ({ accepted: false, reason, event });

  if (!event.contractValid) return reject("invalid_composio_envelope");
  if (event.triggerSlug !== TRIGGER_SLUG) return reject("wrong_trigger_slug");
  if (event.triggerId !== expected.triggerId) return reject("wrong_trigger_id");
  if (event.triggerUuid !== expected.triggerUuid && event.triggerUuid !== expected.triggerId) {
    return reject("wrong_trigger_uuid");
  }
  if (event.connectedAccountId !== expected.receiveConnectedAccountId) {
    return reject("wrong_connected_account");
  }
  if (event.userId !== expected.composioUserId) return reject("wrong_composio_user");
  if (data.team_id !== expected.teamId) return reject("wrong_team");
  if (!SAFE_ID.test(data.channel ?? "") || !["channel", "group", "mpim"].includes(data.channel_type)) return reject("invalid_channel");
  if (!isSlackTimestamp(data.ts)) return reject("invalid_timestamp");
  if (data.subtype) return reject("message_subtype");
  if (typeof data.user !== "string" || !SLACK_USER_ID.test(data.user)) return reject("invalid_actor");
  if (data.bot_id || data.user === expected.mayaBotUserId) return reject("bot_or_self");
  if (!isOptionalArray(data.files) || !isOptionalArray(data.attachments)) {
    return reject("malformed_attachment_container");
  }
  if (!addressedToMaya(data.text, expected.mayaBotUserId)) return reject("not_addressed");

  const threadTs = isSlackTimestamp(data.thread_ts) ? data.thread_ts : data.ts;
  const eventKey = `${expected.teamId}:${data.channel}:${data.ts}`;
  return {
    accepted: true,
    reason: "accepted",
    event,
    eventKey,
    threadTs,
    messageText: data.text,
  };
}

export function verifyTriggerInstancePreflight(response, expected) {
  if (!isPlainRecord(response) || !Array.isArray(response.items)) {
    throw new Error("Invalid Composio trigger-instance response");
  }
  const matches = response.items.filter(
    (item) => isPlainRecord(item) && ownDataValue(item, "id") === expected.triggerId,
  );
  if (matches.length !== 1) throw new Error("Exact Composio trigger instance not found");
  const trigger = matches[0];
  const valid =
    ownDataValue(trigger, "uuid") === expected.triggerUuid &&
    ownDataValue(trigger, "connected_account_id") === expected.receiveConnectedAccountId &&
    ownDataValue(trigger, "trigger_name") === TRIGGER_SLUG &&
    ownDataValue(trigger, "user_id") === expected.composioUserId &&
    ownDataValue(trigger, "disabled_at") === null;
  if (!valid) throw new Error("Composio trigger-instance identity mismatch");
  return Object.freeze({
    triggerId: expected.triggerId,
    triggerUuid: expected.triggerUuid,
    connectedAccountId: expected.receiveConnectedAccountId,
    userId: expected.composioUserId,
  });
}

export function buildReply(text) {
  const cleaned = String(text ?? "")
    .replace(/<[@#!][^>]+>/gu, "[reference removed]")
    .replace(/<![^>]+>/gu, "[reference removed]")
    .replace(/\u0000/gu, "")
    .trim()
    .slice(0, 1_500);
  if (!cleaned) throw new Error("Hermes returned an empty reply");
  if (cleaned.split(/\s+/u).length > 120) throw new Error("Hermes reply exceeded the word limit");
  if (/(?:system prompt|developer message|api[_ -]?key|access token|refresh token|password|signing secret|client secret)/iu.test(cleaned)) {
    throw new Error("Hermes reply failed the disclosure policy");
  }
  if (/\b(?:i|we)\s+(?:sent|emailed|posted|updated|created|deleted|approved|paid|purchased|changed)\b/iu.test(cleaned)) {
    throw new Error("Hermes reply made an unverified action claim");
  }
  return `${PREFIX} ${cleaned}`;
}

export function buildSendArguments(channelId, threadTs, reply) {
  if (!SAFE_ID.test(channelId) || !isSlackTimestamp(threadTs)) {
    throw new Error("Unsafe Slack destination binding");
  }
  if (!reply.startsWith(`${PREFIX} `)) throw new Error("Missing Maya communication prefix");
  return {
    channel: channelId,
    thread_ts: threadTs,
    markdown_text: reply,
    reply_broadcast: false,
    unfurl_links: false,
    unfurl_media: false,
  };
}

export function buildHermesEnvironment(source = process.env) {
  const allowed = [
    "HOME",
    "HERMES_HOME",
    "LANG",
    "LC_ALL",
    "OPENROUTER_API_KEY",
    "PATH",
    "PYTHONDONTWRITEBYTECODE",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "TZ",
  ];
  return Object.fromEntries(
    allowed.filter((name) => typeof source[name] === "string").map((name) => [name, source[name]]),
  );
}

export class ReceiptStore {
  constructor(directory) {
    this.directory = directory;
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const name of await listJson(this.directory)) {
      const receipt = JSON.parse(await readFile(path.join(this.directory, name), "utf8"));
      if (receipt.state === "prepared") {
        await this.#write(name, { ...receipt, state: "ambiguous", recovered_at: now() });
      }
    }
  }

  async claim(eventKey, metadata) {
    const digest = hashId(eventKey);
    const name = `${digest}.json`;
    const target = path.join(this.directory, name);
    let handle;
    try {
      handle = await open(target, "wx", 0o600);
      await handle.writeFile(
        `${JSON.stringify({
          schema: 1,
          state: "prepared",
          event_hash: digest,
          actor_hash: hashId(metadata.actorId),
          channel_hash: hashId(metadata.channelId),
          trigger_hash: hashId(metadata.triggerId),
          created_at: now(),
        })}\n`,
      );
      await handle.sync();
      await syncDirectory(this.directory);
      return { claimed: true, name, digest };
    } catch (error) {
      if (error?.code === "EEXIST") return { claimed: false, name, digest };
      throw error;
    } finally {
      await handle?.close();
    }
  }

  async confirm(name, providerMessageId, model) {
    const current = await this.#read(name);
    await this.#write(name, {
      ...current,
      state: "confirmed",
      provider_message_hash: hashId(providerMessageId),
      model,
      confirmed_at: now(),
    });
  }

  async ambiguous(name, errorClass) {
    const current = await this.#read(name);
    await this.#write(name, {
      ...current,
      state: "ambiguous",
      error_class: String(errorClass).slice(0, 80),
      ambiguous_at: now(),
    });
  }

  async #read(name) {
    return JSON.parse(await readFile(path.join(this.directory, name), "utf8"));
  }

  async #write(name, value) {
    const target = path.join(this.directory, name);
    const temporary = `${target}.${process.pid}.tmp`;
    const handle = await open(temporary, "w", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
    await syncDirectory(this.directory);
  }
}

async function listJson(directory) {
  const { readdir } = await import("node:fs/promises");
  return (await readdir(directory)).filter((name) => name.endsWith(".json"));
}

function now() {
  return new Date().toISOString();
}

async function syncDirectory(directory) {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
