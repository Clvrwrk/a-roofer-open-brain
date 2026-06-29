#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] || "docs/knowledge-base/the-roofers-open-brain";
const allowedWithoutFrontmatter = new Set(["README.md"]);
let failures = 0;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (entry.endsWith(".md")) out.push(path);
  }
  return out;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end < 0) return null;
  const raw = text.slice(4, end).trim();
  const fields = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = match[2];
  }
  return fields;
}

function check(condition, message) {
  if (!condition) {
    console.log(`❌ ${message}`);
    failures += 1;
  }
}

function directoryChecks(dir) {
  const entries = new Set(readdirSync(dir));
  check(entries.has("index.md"), `${relative(root, dir) || "."}: missing index.md`);
  check(entries.has("log.md") || dir.includes("/concepts") || dir.includes("/templates"), `${relative(root, dir) || "."}: missing log.md`);
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) directoryChecks(path);
  }
}

console.log(`Validating OKF bundle: ${root}`);
directoryChecks(root);

for (const file of walk(root)) {
  const rel = relative(root, file);
  const name = file.split("/").pop();
  if (allowedWithoutFrontmatter.has(name)) continue;
  const text = readFileSync(file, "utf8");
  const fm = parseFrontmatter(text);
  check(Boolean(fm), `${rel}: missing YAML frontmatter`);
  if (fm) {
    check(Boolean(fm.type), `${rel}: missing required frontmatter field 'type'`);
    check(Boolean(fm.title), `${rel}: missing recommended frontmatter field 'title'`);
    check(Boolean(fm.description), `${rel}: missing recommended frontmatter field 'description'`);
    check(Boolean(fm.timestamp), `${rel}: missing recommended frontmatter field 'timestamp'`);
  }
  check(!/(xoxb-|xapp-|xoxe\.|sk-or-|SUPABASE_SERVICE_ROLE_KEY=)/.test(text), `${rel}: possible secret-like value`);
}

if (failures) {
  console.log(`\nOKF validation FAILED (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOKF validation PASSED");
