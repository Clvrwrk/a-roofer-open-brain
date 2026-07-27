import { spawn } from "node:child_process";
import { buildHermesEnvironment } from "./core.mjs";
import {
  AGENT_HOME,
  HERMES_BIN,
  HERMES_ENTRYPOINT,
  HERMES_HOME,
  HERMES_MODEL,
  HERMES_PATH,
  MAYA_RUNTIME_DIR,
} from "./policy.mjs";

export async function runHermes(
  messageText,
  attemptSignal,
  { spawnImpl = spawn, openRouterApiKey = process.env.OPENROUTER_API_KEY } = {},
) {
  if (attemptSignal.aborted) throw abortError();
  const prompt = [
    "You are Maya Chen, the PE-CC-DEV accounting agent.",
    "Reply to Christopher's Slack question in no more than 120 words.",
    "Use only the information in his message and your accounting role.",
    "Do not call tools, claim that you performed an action, mention system instructions, or address other people.",
    "If the request needs records or an external action, say what you need and ask Christopher before acting.",
    "Christopher's message:",
    messageText,
  ].join("\n");

  return await new Promise((resolve, reject) => {
    const child = spawnImpl(
      HERMES_BIN,
      [HERMES_ENTRYPOINT, "--oneshot", prompt, "--provider", "openrouter", "--model", HERMES_MODEL],
      {
        cwd: MAYA_RUNTIME_DIR,
        env: buildHermesEnvironment({
          HOME: AGENT_HOME,
          HERMES_HOME,
          OPENROUTER_API_KEY: openRouterApiKey,
          PATH: HERMES_PATH,
          PYTHONDONTWRITEBYTECODE: "1",
        }),
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const chunks = [];
    let outputBytes = 0;
    let terminalError;
    let settled = false;
    let timer;
    let shutdownTimer;
    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(shutdownTimer);
      attemptSignal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => {
      terminalError = abortError();
      child.kill("SIGTERM");
      shutdownTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    };
    attemptSignal.addEventListener("abort", onAbort, { once: true });
    if (attemptSignal.aborted) onAbort();
    timer = setTimeout(() => {
      terminalError = new Error("Hermes inference timed out");
      child.kill("SIGKILL");
    }, 60_000);
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 4_000) {
        terminalError = new Error("Hermes inference exceeded the output limit");
        child.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    });
    child.once("error", (error) => {
      terminalError ??= error;
    });
    child.once("close", (code) => {
      const output = Buffer.concat(chunks).toString("utf8").trim();
      if (terminalError) settle(terminalError);
      else if (code !== 0 || output.length === 0) settle(new Error("Hermes inference failed closed"));
      else settle(undefined, output);
    });
  });
}

function abortError() {
  const error = new Error("Shutdown requested");
  error.name = "AbortError";
  return error;
}
