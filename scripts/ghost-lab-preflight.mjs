#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  const opts = {
    database: "pro-exteriors-open-brain-lab",
    format: "markdown",
    offline: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--database") opts.database = argv[++i];
    else if (arg === "--format") opts.format = argv[++i];
    else if (arg === "--offline") opts.offline = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!opts.database) throw new Error("--database is required");
  if (!["markdown", "json"].includes(opts.format)) throw new Error("--format must be markdown or json");
  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/ghost-lab-preflight.mjs [options]

Options:
  --database NAME    Ghost database name or id (default: pro-exteriors-open-brain-lab)
  --format FORMAT    markdown | json (default: markdown)
  --offline          Skip networked Ghost account/database checks
  --help             Show help

This script is intentionally non-destructive. It never calls ghost connect,
ghost password, ghost delete, ghost fork, or any command that prints database
credentials.`);
}

function run(command, args, cwd = process.cwd()) {
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

function parseDatabaseList(text) {
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.databases)) return parsed.databases;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.data)) return parsed.data;
  return [];
}

function findDatabase(databases, requested) {
  return databases.find((database) => {
    const values = [database.name, database.id, database.database, database.slug].filter(Boolean);
    return values.some((value) => String(value) === requested);
  });
}

function printMarkdown(results, opts) {
  console.log("== Ghost lab preflight ==");
  console.log(`database: ${opts.database}`);
  console.log("");

  for (const result of results) {
    const suffix = result.detail ? ` - ${result.detail}` : "";
    console.log(`${result.status.toUpperCase()}: ${result.label}${suffix}`);
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
        database: opts.database,
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
  const version = run("ghost", ["version"]);
  check(results, version.ok ? "pass" : "fail", "Ghost CLI available", version.ok ? version.stdout : version.stderr);

  const mcp = run("codex", ["mcp", "list"]);
  check(
    results,
    mcp.ok && /\bghost\b/i.test(mcp.stdout) ? "pass" : "warn",
    "Codex Ghost MCP entry present",
    mcp.ok ? "checked configured MCP servers" : mcp.stderr,
  );

  if (opts.offline) {
    check(results, "warn", "networked Ghost checks skipped", "--offline");
  } else {
    const id = run("ghost", ["id"]);
    check(results, id.ok ? "pass" : "fail", "Ghost identity readable", id.ok ? "authenticated" : id.stderr);

    const list = run("ghost", ["list", "--json"]);
    if (!list.ok) {
      check(results, "fail", "Ghost database list readable", list.stderr || list.stdout);
    } else {
      let databases = [];
      try {
        databases = parseDatabaseList(list.stdout);
        check(results, "pass", "Ghost database list readable", `${databases.length} database(s) visible`);
      } catch (error) {
        check(results, "fail", "Ghost database list JSON parseable", error.message);
      }

      const database = findDatabase(databases, opts.database);
      if (!database) {
        check(results, "fail", "target Ghost lab database exists", opts.database);
      } else {
        const status = String(database.status || database.state || "unknown");
        const detail = [database.name || database.id || opts.database, status].filter(Boolean).join(" / ");
        check(results, status.toLowerCase() === "running" ? "pass" : "warn", "target Ghost lab database available", detail);

        const schema = run("ghost", ["schema", String(database.id || database.name || opts.database)]);
        check(results, schema.ok ? "pass" : "warn", "Ghost schema command can inspect target", schema.ok ? "readable" : schema.stderr);
      }
    }
  }

  if (opts.format === "json") printJson(results, opts);
  else printMarkdown(results, opts);

  if (results.some((result) => result.status === "fail")) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`ghost-lab-preflight: ${error.message}`);
  process.exit(1);
}
