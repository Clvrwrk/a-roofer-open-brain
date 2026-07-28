import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { MAILBOX_INTERVAL_MS } from "./policy.mjs";

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function now() {
  return new Date().toISOString();
}

export class MailboxState {
  constructor(directory) {
    this.directory = directory;
    this.receiptDirectory = path.join(directory, "receipts");
    this.cursorPath = path.join(directory, "cursor.json");
  }

  async initialize(epochSeconds = Math.floor(Date.now() / 1_000)) {
    await mkdir(this.receiptDirectory, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.receiptDirectory)) {
      if (!name.endsWith(".json")) continue;
      const target = path.join(this.receiptDirectory, name);
      const receipt = JSON.parse(await readFile(target, "utf8"));
      if (receipt.state === "processing") {
        await this.#write(target, { ...receipt, state: "ambiguous", recoveredAt: now() });
      }
    }
    try {
      const cursor = JSON.parse(await readFile(this.cursorPath, "utf8"));
      if (!Number.isSafeInteger(cursor.epochSeconds) || cursor.epochSeconds < 0) {
        throw new Error("Invalid mailbox cursor");
      }
      return { bootstrapped: false, epochSeconds: cursor.epochSeconds };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await this.advanceCursor(epochSeconds);
      return { bootstrapped: true, epochSeconds };
    }
  }

  async advanceCursor(epochSeconds) {
    if (!Number.isSafeInteger(epochSeconds) || epochSeconds < 0) {
      throw new TypeError("Mailbox cursor must be a non-negative safe integer");
    }
    await this.#write(this.cursorPath, { schema: 1, epochSeconds, updatedAt: now() });
  }

  async claim(messageId, occurrenceId) {
    const messageDigest = digest(messageId);
    const name = `${messageDigest}.json`;
    const target = path.join(this.receiptDirectory, name);
    let handle;
    try {
      handle = await open(target, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({
        schema: 1,
        messageDigest,
        occurrenceDigest: digest(occurrenceId),
        state: "processing",
        createdAt: now(),
      })}\n`);
      await handle.sync();
      return { claimed: true, name, messageDigest };
    } catch (error) {
      if (error?.code === "EEXIST") return { claimed: false, name, messageDigest };
      throw error;
    } finally {
      await handle?.close();
    }
  }

  async confirm(name, fields) {
    await this.#transition(name, "processing", {
      state: "confirmed",
      confirmedAt: now(),
      ...fields,
    });
  }

  async ambiguous(name, errorClass, fields = {}) {
    await this.#transition(name, "processing", {
      state: "ambiguous",
      ambiguousAt: now(),
      errorClass,
      ...fields,
    });
  }

  async #transition(name, expectedState, fields) {
    const target = path.join(this.receiptDirectory, name);
    const receipt = JSON.parse(await readFile(target, "utf8"));
    if (receipt.state !== expectedState) throw new Error("Mailbox receipt transition rejected");
    await this.#write(target, { ...receipt, ...fields });
  }

  async #write(target, value) {
    const temporary = `${target}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
  }
}

export function mailboxOccurrenceId(date = new Date()) {
  const epoch = date.getTime();
  const boundary = Math.floor(epoch / MAILBOX_INTERVAL_MS) * MAILBOX_INTERVAL_MS;
  return `maya-chen:mailbox:${new Date(boundary).toISOString()}`;
}

export function millisecondsUntilNextHalfHour(nowMs = Date.now()) {
  return MAILBOX_INTERVAL_MS - (nowMs % MAILBOX_INTERVAL_MS);
}
