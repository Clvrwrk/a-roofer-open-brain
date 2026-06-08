import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type RuntimeEnv = Partial<Record<string, string | undefined>>;

let cachedLocalEnv: RuntimeEnv | null = null;

function parseDotenv(source: string): RuntimeEnv {
  const parsed: RuntimeEnv = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value.replace(/\\n/g, "\n");
  }

  return parsed;
}

function loadLocalEnv(): RuntimeEnv {
  if (cachedLocalEnv) return cachedLocalEnv;

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = new Set<string>();
  const startingPoints = [resolve(globalThis.process?.cwd?.() ?? "."), here];

  for (const start of startingPoints) {
    let current = start;
    for (let depth = 0; depth < 8; depth += 1) {
      candidates.add(join(current, ".env"));
      candidates.add(join(current, ".env.local"));

      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  cachedLocalEnv = {};

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    cachedLocalEnv = {
      ...cachedLocalEnv,
      ...parseDotenv(readFileSync(file, "utf8")),
    };
  }

  return cachedLocalEnv;
}

export function getRuntimeEnv(): RuntimeEnv {
  return {
    ...loadLocalEnv(),
    ...(globalThis.process?.env ?? {}),
  };
}
