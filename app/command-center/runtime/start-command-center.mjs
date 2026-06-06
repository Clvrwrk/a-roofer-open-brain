import { spawn } from "node:child_process";

const children = new Map();
let shuttingDown = false;
let slackRestartAttempts = 0;
let slackRestartTimer = null;

function hasSlackRuntimeEnv() {
  return Boolean(
    process.env.SLACK_BOT_TOKEN &&
      process.env.SLACK_APP_TOKEN &&
      process.env.SLACK_SIGNING_SECRET,
  );
}

function log(event, details = {}) {
  console.log(
    JSON.stringify({
      service: "command-center-start",
      event,
      ...details,
      timestamp: new Date().toISOString(),
    }),
  );
}

function spawnChild(name, args) {
  log("spawn", { name, args });

  const child = spawn(process.execPath, args, {
    env: process.env,
    stdio: "inherit",
  });

  children.set(name, child);

  child.on("exit", (code, signal) => {
    children.delete(name);

    if (shuttingDown) return;

    log("exit", {
      name,
      code,
      signal,
    });

    if (name === "web") {
      shutdown(code ?? 1);
      return;
    }

    if (name === "slack") {
      scheduleSlackRestart();
    }
  });

  return child;
}

function scheduleSlackRestart() {
  if (shuttingDown || !hasSlackRuntimeEnv()) return;

  slackRestartAttempts += 1;
  const delayMs = Math.min(30000, 1000 * 2 ** Math.min(slackRestartAttempts, 5));

  log("slack_restart_scheduled", {
    attempt: slackRestartAttempts,
    delayMs,
  });

  slackRestartTimer = setTimeout(() => {
    slackRestartTimer = null;
    spawnChild("slack", ["runtime/slack-socket-runtime.mjs"]);
  }, delayMs);
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (slackRestartTimer) {
    clearTimeout(slackRestartTimer);
    slackRestartTimer = null;
  }

  for (const [name, child] of children.entries()) {
    log("terminate", { name });
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    for (const [name, child] of children.entries()) {
      log("kill", { name });
      child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 8000).unref();
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

spawnChild("web", ["dist/server/entry.mjs"]);

if (hasSlackRuntimeEnv()) {
  spawnChild("slack", ["runtime/slack-socket-runtime.mjs"]);
} else {
  log("slack_skipped_missing_env");
}
