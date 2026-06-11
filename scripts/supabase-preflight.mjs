#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SECRET_PATTERNS = [
  "sb_secret_[A-Za-z0-9_-]{20,}",
  "sb_publishable_[A-Za-z0-9_-]{20,}",
  "sbp_[A-Za-z0-9_]{20,}",
  "SUPABASE_SERVICE_ROLE_KEY=eyJ[A-Za-z0-9_-]{20,}",
  "postgres(?:ql)?://postgres:[^@\\s]+@db\\.[a-z0-9]+\\.supabase\\.co",
];

const DESTRUCTIVE_SQL = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\bdrop\s+column\b/i,
  /\btruncate\s+table\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\b[\s\S]{0,120}\bdrop\b/i,
  /\bdisable\s+row\s+level\s+security\b/i,
  /\balter\s+policy\b/i,
  /\bdrop\s+policy\b/i,
  /\brevoke\b/i,
];

function parseArgs(argv) {
  const opts = {
    root: process.cwd(),
    target: "branch",
    projectRef: "",
    backupProof: "",
    format: "markdown",
    offline: false,
    allowDirty: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") opts.root = argv[++i];
    else if (arg === "--target") opts.target = argv[++i];
    else if (arg === "--project-ref") opts.projectRef = argv[++i];
    else if (arg === "--backup-proof") opts.backupProof = argv[++i];
    else if (arg === "--format") opts.format = argv[++i];
    else if (arg === "--offline") opts.offline = true;
    else if (arg === "--allow-dirty") opts.allowDirty = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  opts.root = path.resolve(opts.root);
  if (!["branch", "staging", "ghost", "prod"].includes(opts.target)) {
    throw new Error("--target must be branch, staging, ghost, or prod");
  }
  if (!["markdown", "json"].includes(opts.format)) {
    throw new Error("--format must be markdown or json");
  }
  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/supabase-preflight.mjs [options]

Options:
  --target TARGET       branch | staging | ghost | prod (default: branch)
  --project-ref REF     Expected Supabase project ref
  --backup-proof TEXT   Backup id, dump manifest path, or restore/clone proof
  --format FORMAT       markdown | json (default: markdown)
  --offline             Skip networked CLI checks
  --allow-dirty         Do not fail on unrelated dirty git status
  --root PATH           Repo root (default: cwd)
  --help                Show help

This script is intentionally non-destructive. It checks local guardrails before
Supabase schema or infrastructure changes. Production targets require backup
proof before the check can pass.`);
}

function run(command, args, cwd) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || "").trim(),
      stderr: String(error.stderr || error.message || "").trim(),
    };
  }
}

function check(results, status, label, detail = "") {
  results.push({ status, label, detail });
}

function fileExists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function listChangedFiles(root) {
  const result = run("git", ["status", "--short"], root);
  if (!result.ok) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

function trackedSecretHits(root) {
  const pattern = SECRET_PATTERNS.join("|");
  const result = run(
    "git",
    [
      "grep",
      "-nIE",
      pattern,
      "--",
      ".",
      ":!config/.env.example",
      ":!scripts/supabase-preflight.mjs",
      ":!docs/29-connection-and-access-checklist.md",
      ":!docs/36-supabase-infrastructure-ops.md",
    ],
    root,
  );
  if (!result.ok) return "";
  return result.stdout;
}

function readTextSafe(filename) {
  try {
    return fs.readFileSync(filename, "utf8");
  } catch {
    return "";
  }
}

function sqlFilesToInspect(root, changedFiles) {
  const candidates = new Set();
  for (const file of changedFiles) {
    if (
      file.endsWith(".sql") &&
      (file.startsWith("supabase/") || file.startsWith("schemas/") || file.startsWith("server/"))
    ) {
      candidates.add(path.join(root, file));
    }
  }

  const migrationDir = path.join(root, "supabase", "migrations");
  if (fs.existsSync(migrationDir)) {
    for (const entry of fs.readdirSync(migrationDir)) {
      if (entry.endsWith(".sql")) candidates.add(path.join(migrationDir, entry));
    }
  }
  return Array.from(candidates);
}

function destructiveSqlHits(root, files) {
  const hits = [];
  for (const file of files) {
    const text = readTextSafe(file);
    for (const pattern of DESTRUCTIVE_SQL) {
      if (pattern.test(text)) {
        hits.push(path.relative(root, file));
        break;
      }
    }
  }
  return hits;
}

function changedSqlFiles(root, changedFiles) {
  return changedFiles
    .filter((file) => file.endsWith(".sql"))
    .map((file) => path.join(root, file))
    .filter((file) => fs.existsSync(file));
}

function dataApiGrantWarnings(root, files) {
  const hits = [];
  for (const file of files) {
    const text = readTextSafe(file);
    const createsPublicTable = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)/i.test(text);
    const hasGrant = /\bgrant\s+(?:select|insert|update|delete|all|usage)\b/i.test(text);
    const hasRls = /\benable\s+row\s+level\s+security\b/i.test(text);
    if (createsPublicTable && (!hasGrant || !hasRls)) {
      hits.push(`${path.relative(root, file)}${!hasGrant ? " missing GRANT review" : ""}${!hasRls ? " missing RLS enable" : ""}`);
    }
  }
  return hits;
}

function linkedProjectRef(root) {
  const tempRef = path.join(root, "supabase", ".temp", "project-ref");
  const text = readTextSafe(tempRef).trim();
  return text || "";
}

function printMarkdown(results, opts) {
  console.log("== Supabase infrastructure preflight ==");
  console.log(`target: ${opts.target}`);
  if (opts.projectRef) console.log(`expected project: ${opts.projectRef}`);
  console.log("");

  for (const result of results) {
    const symbol = result.status === "pass" ? "✓" : result.status === "fail" ? "✗" : "!";
    const suffix = result.detail ? ` — ${result.detail}` : "";
    console.log(`${symbol} ${result.label}${suffix}`);
  }

  const failures = results.filter((result) => result.status === "fail").length;
  const warnings = results.filter((result) => result.status === "warn").length;
  console.log("");
  console.log(`summary: ${failures} failed, ${warnings} warning(s)`);
  console.log(failures ? "go/no-go: BLOCKED" : "go/no-go: CLEAR");
}

function printJson(results, opts) {
  const failures = results.filter((result) => result.status === "fail").length;
  const warnings = results.filter((result) => result.status === "warn").length;
  console.log(
    JSON.stringify(
      {
        target: opts.target,
        expectedProjectRef: opts.projectRef || null,
        ok: failures === 0,
        failures,
        warnings,
        checks: results,
      },
      null,
      2,
    ),
  );
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const results = [];
  const root = opts.root;

  check(results, fileExists(root, "AGENTS.md") ? "pass" : "fail", "repo root contains AGENTS.md", root);
  check(results, fileExists(root, "supabase/config.toml") ? "pass" : "warn", "supabase/config.toml present");
  check(results, fileExists(root, "config/.env.example") ? "pass" : "fail", "env contract present");

  const gitStatus = run("git", ["status", "--short"], root);
  if (gitStatus.ok && gitStatus.stdout && !opts.allowDirty) {
    check(results, "warn", "git worktree has uncommitted changes", "review before production apply");
  } else if (gitStatus.ok) {
    check(results, "pass", "git status readable", gitStatus.stdout ? "dirty allowed" : "clean");
  } else {
    check(results, "fail", "git status readable", gitStatus.stderr);
  }

  const secretHits = trackedSecretHits(root);
  check(
    results,
    secretHits ? "fail" : "pass",
    "tracked files have no obvious Supabase secret values",
    secretHits ? "run git grep review before continuing" : "",
  );

  const envExample = readTextSafe(path.join(root, "config", ".env.example"));
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL", "SUPABASE_DB_PASSWORD"]) {
    check(results, envExample.includes(`${key}=`) ? "pass" : "warn", `env contract includes ${key}`);
  }

  const linkedRef = linkedProjectRef(root);
  if (opts.projectRef && linkedRef && linkedRef !== opts.projectRef) {
    check(results, "fail", "linked Supabase project matches expected ref", `linked=${linkedRef}`);
  } else if (linkedRef) {
    check(results, "pass", "Supabase checkout linked", linkedRef);
  } else {
    check(results, "warn", "Supabase checkout linked", "no supabase/.temp/project-ref found");
  }

  const changedFiles = listChangedFiles(root);
  const destructiveHits = destructiveSqlHits(root, sqlFilesToInspect(root, changedFiles));
  check(
    results,
    destructiveHits.length ? "warn" : "pass",
    "changed SQL has no obvious destructive statements",
    destructiveHits.join(", "),
  );

  const grantWarnings = dataApiGrantWarnings(root, changedSqlFiles(root, changedFiles));
  check(
    results,
    grantWarnings.length ? "warn" : "pass",
    "changed public table SQL includes Data API grant/RLS review",
    grantWarnings.join(", "),
  );

  if (opts.target === "prod" && !opts.backupProof) {
    check(results, "fail", "production target has backup proof", "pass --backup-proof <backup-id-or-manifest>");
  } else if (opts.target === "prod") {
    check(results, "pass", "production target has backup proof", opts.backupProof);
  } else {
    check(results, "pass", "non-production target selected", opts.target);
  }

  if (!opts.offline) {
    const cli = run("supabase", ["--version"], root);
    check(results, cli.ok ? "pass" : "fail", "Supabase CLI available", cli.ok ? cli.stdout : cli.stderr);

    const projects = run("supabase", ["projects", "list", "--output", "json"], root);
    check(
      results,
      projects.ok ? "pass" : "warn",
      "Supabase CLI can list projects",
      projects.ok ? "authenticated" : projects.stderr || projects.stdout,
    );

    const mcp = run("codex", ["mcp", "get", "supabase"], root);
    check(results, mcp.ok ? "pass" : "warn", "Codex Supabase MCP entry readable", mcp.ok ? "configured" : mcp.stderr);
  } else {
    check(results, "warn", "networked CLI checks skipped", "--offline");
  }

  if (opts.format === "json") printJson(results, opts);
  else printMarkdown(results, opts);

  if (results.some((result) => result.status === "fail")) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`supabase-preflight: ${error.message}`);
  process.exit(1);
}
