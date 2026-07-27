import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function typeOf(stat) {
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  if (stat.isSymbolicLink()) return "symlink";
  return "unsupported";
}

export async function hashTree(root, { modeOverrides = {} } = {}) {
  const hash = createHash("sha256");

  async function visit(target, relative) {
    const stat = await lstat(target);
    const type = typeOf(stat);
    if (type === "unsupported") throw new Error(`Unsupported filesystem entry: ${target}`);
    const mode = modeOverrides[relative] ?? (stat.mode & 0o777);
    hash.update(`${relative}\0${type}\0${mode.toString(8)}\0${stat.uid}:${stat.gid}\0`);
    if (type === "symlink") {
      hash.update(`${await readlink(target)}\0`);
      return;
    }
    if (type === "file") {
      for await (const chunk of createReadStream(target)) hash.update(chunk);
      hash.update("\0");
      return;
    }
    const entries = await readdir(target);
    entries.sort();
    for (const entry of entries) await visit(path.join(target, entry), relative === "." ? entry : `${relative}/${entry}`);
  }

  await visit(root, ".");
  return hash.digest("hex");
}

if (process.env.TREE_INTEGRITY_MAIN === "1") {
  const results = {};
  for (const root of process.argv.slice(1)) {
    const modeOverrides = process.env.TREE_INTEGRITY_NORMALIZE_HERMES_LOCK === "1" && root.endsWith("/venv")
      ? { ".lock": 0o644 }
      : {};
    results[root] = await hashTree(root, { modeOverrides });
  }
  process.stdout.write(`${JSON.stringify(results)}\n`);
} else if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw new Error("exactly one tree path is required");
  process.stdout.write(`${await hashTree(process.argv[2])}\n`);
}
