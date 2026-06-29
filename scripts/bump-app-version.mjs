#!/usr/bin/env node
/**
 * Bump Command Center app version (app/command-center/src/lib/version.ts).
 * Policy: docs/62-app-versioning.md
 *
 * Usage:
 *   node scripts/bump-app-version.mjs auto [--message "..."]
 *   node scripts/bump-app-version.mjs patch|minor|beta|ga
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_REL = "app/command-center/src/lib/version.ts";

const FIELD = {
  major: /export const APP_VERSION_MAJOR = (\d+);/,
  minor: /export const APP_VERSION_MINOR = (\d+);/,
  patch: /export const APP_VERSION_PATCH = (\d+);/,
  stage: /export const APP_VERSION_STAGE(?:: [^=]+)? = (?:"([AB])"|null);/,
  date: /export const APP_VERSION_DATE = "(\d{4}-\d{2}-\d{2})";/,
};

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseStage(content) {
  const m = content.match(FIELD.stage);
  if (!m) throw new Error("Could not parse APP_VERSION_STAGE");
  return m[1] ?? null;
}

function readVersion(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const major = Number(content.match(FIELD.major)?.[1]);
  const minor = Number(content.match(FIELD.minor)?.[1]);
  const patch = Number(content.match(FIELD.patch)?.[1]);
  const stage = parseStage(content);
  const date = content.match(FIELD.date)?.[1];
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch) || !date) {
    throw new Error(`Could not parse version fields in ${filePath}`);
  }
  return { content, major, minor, patch, stage, date };
}

function renderVersion({ major, minor, patch, stage, date }) {
  const stageType = stage === null ? "null" : `"${stage}"`;
  return `// Auto-maintained by scripts/bump-app-version.mjs — do not edit by hand.
// Policy: docs/62-app-versioning.md
export const APP_VERSION_MAJOR = ${major};
export const APP_VERSION_MINOR = ${minor};
export const APP_VERSION_PATCH = ${patch};
export const APP_VERSION_STAGE: "A" | "B" | null = ${stageType};
export const APP_VERSION = \`\${APP_VERSION_MAJOR}.\${APP_VERSION_MINOR}.\${APP_VERSION_PATCH}\${APP_VERSION_STAGE ?? ""}\`;
export const APP_VERSION_DATE = "${date}";
`;
}

function writeVersion(filePath, state) {
  fs.writeFileSync(filePath, renderVersion(state), "utf8");
}

function label({ major, minor, patch, stage }) {
  return `${major}.${minor}.${patch}${stage ?? ""}`;
}

function wantsMinor(message) {
  if (!message) return false;
  return /\[(minor|feature)\]/i.test(message) || /\bversion:minor\b/i.test(message);
}

function applyAuto(state, message) {
  const next = { ...state, date: todayLocal() };
  if (wantsMinor(message)) {
    next.minor += 1;
    next.patch = 0;
    return next;
  }
  next.patch += 1;
  return next;
}

function applyPatch(state) {
  return { ...state, patch: state.patch + 1, date: todayLocal() };
}

function applyMinor(state) {
  return { ...state, minor: state.minor + 1, patch: 0, date: todayLocal() };
}

function applyBeta(state) {
  if (state.stage !== "A") {
    throw new Error(`beta promotion requires alpha stage (current: ${state.stage ?? "GA"})`);
  }
  return { ...state, stage: "B", date: todayLocal() };
}

function applyGa(state) {
  if (state.stage !== "B") {
    throw new Error(`GA (1.0.0) requires beta stage (current: ${state.stage ?? "none"})`);
  }
  return { major: 1, minor: 0, patch: 0, stage: null, date: todayLocal() };
}

function assertValid(state) {
  if (state.major >= 1 && state.stage !== null) {
    throw new Error("Refusing 1.x while alpha/beta stage is set — run beta then ga promotion");
  }
  if (state.major === 0 && state.stage === null) {
    throw new Error("Pre-GA builds must carry stage A or B — use ga promotion for 1.0.0");
  }
}

function main() {
  const [mode = "auto", ...rest] = process.argv.slice(2);
  let message = "";
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--message" && rest[i + 1]) {
      message = rest[i + 1];
      break;
    }
  }

  const filePath = path.join(repoRoot(), VERSION_REL);
  const current = readVersion(filePath);
  let next;

  switch (mode) {
    case "auto":
      next = applyAuto(current, message);
      break;
    case "patch":
      next = applyPatch(current);
      break;
    case "minor":
      next = applyMinor(current);
      break;
    case "beta":
      next = applyBeta(current);
      break;
    case "ga":
      next = applyGa(current);
      break;
    default:
      console.error(`Unknown mode: ${mode}. Use auto|patch|minor|beta|ga`);
      process.exit(1);
  }

  assertValid(next);
  writeVersion(filePath, next);
  console.log(`${label(current)} · ${current.date} → ${label(next)} · ${next.date}`);
}

main();
