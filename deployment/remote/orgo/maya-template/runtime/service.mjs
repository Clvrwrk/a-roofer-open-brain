import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluateActivation } from "./lib/activation.mjs";
import { readJson, sha256, writeJsonAtomic } from "./lib/atomic-json.mjs";

export const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));

async function readOptional(target) {
  try {
    return await readFile(target, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readOptionalJson(target) {
  try {
    return await readJson(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function evaluateRuntimeState({ packageRoot = PACKAGE_ROOT, env = process.env, now = new Date() } = {}) {
  const manifest = await readJson(path.join(packageRoot, "manifest.yaml"));
  const permissionsPath = path.join(packageRoot, "permissions.yaml");
  const permissionsRaw = await readFile(permissionsPath, "utf8");
  const permissions = JSON.parse(permissionsRaw);
  const receiptPath = env.MAYA_ACTIVATION_RECEIPT ?? manifest.activation.receipt_path;
  const publicKeyPath = env.MAYA_ACTIVATION_PUBLIC_KEY ?? manifest.activation.public_key_path;
  const activation = evaluateActivation({
    enabledFlag: env.MAYA_ENABLED,
    receipt: await readOptionalJson(receiptPath),
    publicKey: await readOptional(publicKeyPath),
    manifest,
    releaseDigest: env.MAYA_RELEASE_DIGEST,
    policyDigest: sha256(permissionsRaw),
    now,
  });
  if (!activation.active) return { status: "paused", reason: activation.reason, manifest, permissions };
  if (permissions.claims !== true || permissions.schedules !== true || permissions.provider_adapters.length === 0) {
    return { status: "blocked_unconfigured", reason: "activation_verified_but_capabilities_disabled", manifest, permissions, activation };
  }
  return { status: "active", reason: "activation_and_capabilities_verified", manifest, permissions, activation };
}

export async function writeHealth({ packageRoot = PACKAGE_ROOT, env = process.env, now = new Date() } = {}) {
  const state = await evaluateRuntimeState({ packageRoot, env, now });
  const stateRoot = env.MAYA_STATE_ROOT ?? state.manifest.runtime.state_root;
  const healthPath = env.MAYA_HEALTH_PATH ?? path.join(stateRoot, "health.json");
  await writeJsonAtomic(healthPath, {
    schema: 1,
    status: state.status,
    reason: state.reason,
    runtime_version: state.manifest.runtime_version,
    agent_id: state.manifest.identity.persona_id,
    client_id: state.manifest.memory.required_client_id,
    observed_at: now.toISOString(),
  });
  return { ...state, healthPath };
}

async function main() {
  const once = process.argv.includes("--once");
  let stopping = false;
  const heartbeat = async () => {
    if (stopping) return;
    const state = await writeHealth();
    process.stdout.write(`${JSON.stringify({ event: "maya_runtime_health", status: state.status, reason: state.reason, ts: new Date().toISOString() })}\n`);
  };
  await heartbeat();
  if (once) return;
  const timer = setInterval(() => heartbeat().catch((error) => {
    process.stderr.write(`${JSON.stringify({ event: "maya_runtime_health_failed", error_class: error?.name ?? "Error", ts: new Date().toISOString() })}\n`);
  }), 60_000);
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    process.exitCode = 0;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
