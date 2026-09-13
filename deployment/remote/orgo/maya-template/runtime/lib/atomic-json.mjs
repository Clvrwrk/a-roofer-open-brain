import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";

export function canonicalJson(value) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function readJson(target) {
  return JSON.parse(await readFile(target, "utf8"));
}

export async function writeJsonAtomic(target, value, mode = 0o600) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", mode);
  try {
    await handle.writeFile(`${canonicalJson(value)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
  await syncDirectory(path.dirname(target));
}

export async function syncDirectory(target) {
  const directory = await open(target, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function moveAtomic(source, target) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await rename(source, target);
  await syncDirectory(path.dirname(source));
  if (path.dirname(target) !== path.dirname(source)) await syncDirectory(path.dirname(target));
}

export async function createJsonExclusive(target, value, mode = 0o600) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  let handle;
  let created = false;
  try {
    handle = await open(target, "wx", mode);
    await handle.writeFile(`${canonicalJson(value)}\n`);
    await handle.sync();
    created = true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  } finally {
    await handle?.close();
  }
  if (created) await syncDirectory(path.dirname(target));
  return created;
}
