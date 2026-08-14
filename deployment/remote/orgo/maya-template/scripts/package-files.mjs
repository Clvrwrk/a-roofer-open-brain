import { readdir } from "node:fs/promises";
import path from "node:path";

const ignored = new Set(["node_modules", ".git"]);

export function isProhibitedPlatformMetadata(name) {
  return name === ".DS_Store" || name.startsWith("._") || name === "__MACOSX";
}

export async function collectPackageFiles(root) {
  const files = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (isProhibitedPlatformMetadata(entry.name)) throw new Error("platform_metadata_prohibited");
      if (ignored.has(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) files.push(target);
      else throw new Error("non_regular_package_entry");
    }
  }

  await walk(root);
  return files;
}
