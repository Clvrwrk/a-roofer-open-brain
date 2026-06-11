#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const opts = {
    repo: process.cwd(),
    format: "markdown",
    offline: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo") opts.repo = argv[++i];
    else if (arg === "--format") opts.format = argv[++i];
    else if (arg === "--offline") opts.offline = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  opts.repo = path.resolve(opts.repo);
  if (!["markdown", "json"].includes(opts.format)) throw new Error("--format must be markdown or json");
  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/dolt-lab-preflight.mjs [options]

Options:
  --repo PATH       Dolt repo path to inspect (default: cwd)
  --format FORMAT   markdown | json (default: markdown)
  --offline         Skip networked DoltHub credential check
  --help            Show help

This script is intentionally non-destructive. It checks local Dolt readiness
and warns when the selected path is not a Dolt repo.`);
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

function printMarkdown(results, opts) {
  console.log("== Dolt lab preflight ==");
  console.log(`repo: ${opts.repo}`);
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
        repo: opts.repo,
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
  const version = run("dolt", ["version"]);
  check(results, version.ok ? "pass" : "fail", "Dolt CLI available", version.ok ? version.stdout : version.stderr);

  const userName = run("dolt", ["config", "--global", "--get", "user.name"]);
  check(results, userName.ok && userName.stdout ? "pass" : "warn", "Dolt author name configured", userName.stdout || userName.stderr);

  const userEmail = run("dolt", ["config", "--global", "--get", "user.email"]);
  check(results, userEmail.ok && userEmail.stdout ? "pass" : "warn", "Dolt author email configured", userEmail.stdout || userEmail.stderr);

  const creds = run("dolt", ["creds", "ls", "-v"]);
  check(results, creds.ok && creds.stdout ? "pass" : "warn", "Dolt credential keypairs visible", creds.ok ? "credential list checked" : creds.stderr);

  if (opts.offline) {
    check(results, "warn", "networked DoltHub credential check skipped", "--offline");
  } else {
    const credsCheck = run("dolt", ["creds", "check"]);
    check(results, credsCheck.ok ? "pass" : "warn", "DoltHub credential check", credsCheck.ok ? "authenticated" : credsCheck.stderr || credsCheck.stdout);
  }

  if (!fs.existsSync(opts.repo)) {
    check(results, "fail", "repo path exists", opts.repo);
  } else if (!fs.existsSync(path.join(opts.repo, ".dolt"))) {
    check(results, "warn", "target path is a Dolt repository", "no .dolt directory found");
  } else {
    const status = run("dolt", ["status"], opts.repo);
    check(results, status.ok ? "pass" : "fail", "Dolt repo status readable", status.ok ? "status checked" : status.stderr);
  }

  if (opts.format === "json") printJson(results, opts);
  else printMarkdown(results, opts);

  if (results.some((result) => result.status === "fail")) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`dolt-lab-preflight: ${error.message}`);
  process.exit(1);
}
