import { Composio } from "@composio/core";
import { pathToFileURL } from "node:url";
import { APPROVED } from "./policy.mjs";

const ORGO_API_BASE = "https://www.orgo.ai/api";
const ORGO_COMPUTER_ID = "37b262e0-a915-47e6-8c3b-f180a32ab6fe";
const OPENROUTER_KEY_HASH = "92dfa8f038572546c16bf6957ccab76b9219834601090f9da89bdf93946df8ae";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function jsonRequest(url, { token, ...options }) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${url} failed with ${response.status}`);
  return body;
}

export async function runRollback({ disableTrigger, fenceDatabase, stopRuntime, disableInference }) {
  const order = [];
  await disableTrigger();
  order.push("trigger_disabled");

  const errors = [];
  try {
    await fenceDatabase();
    order.push("database_fenced");
  } catch (error) {
    errors.push(error);
    order.push("database_fence_failed");
  }
  try {
    await stopRuntime();
    order.push("runtime_stopped");
  } catch (error) {
    errors.push(error);
    order.push("runtime_stop_failed");
  }
  try {
    await disableInference();
    order.push("inference_disabled");
  } catch (error) {
    errors.push(error);
    order.push("inference_disable_failed");
  }
  if (errors.length > 0) throw new AggregateError(errors, `Rollback incomplete: ${order.join(",")}`);
  return order;
}

export function buildStopRuntimeCommand() {
  return String.raw`set -eu
check_dir() {
  [ ! -L "$1" ] && [ -d "$1" ] && [ "$(/usr/bin/stat -c '%u:%g:%a' "$1")" = "$2" ]
}
check_file() {
  [ ! -L "$1" ] && [ -f "$1" ] && [ "$(/usr/bin/stat -c '%u:%g:%a' "$1")" = "$2" ]
}
check_dir / 0:0:755
check_dir /opt 0:0:755
check_dir /opt/pe-cc-agents 0:0:755
check_dir /opt/pe-cc-agents/rollback 0:0:700
if stop_output=$(/usr/bin/supervisorctl stop maya-slack-listener 2>&1); then
  stop_rc=0
else
  stop_rc=$?
fi
if [ "$stop_rc" -ne 0 ] && [ "$stop_output" != "maya-slack-listener: ERROR (not running)" ]; then
  exit 1
fi
if status_output=$(/usr/bin/supervisorctl status maya-slack-listener 2>&1); then
  status_rc=0
else
  status_rc=$?
fi
[ "$status_rc" -eq 3 ]
printf '%s' "$status_output" | /usr/bin/grep -Eq '^maya-slack-listener[[:space:]]+STOPPED([[:space:]].*)?$'
[ "$(printf '%s' "$status_output" | /usr/bin/wc -l)" -eq 0 ]
maya_uid=$(/usr/bin/id -u maya-agent)
maya_gid=$(/usr/bin/id -g maya-agent)
check_dir /home 0:0:755
check_dir /home/orgo 1001:1001:750
check_dir /home/orgo/maya-agent "$maya_uid:$maya_gid:700"
check_dir /home/orgo/maya-agent/secrets "$maya_uid:$maya_gid:700"
env_file=/home/orgo/maya-agent/secrets/listener.env
credential_state=already_absent
quarantine=
quarantine_stat=
if [ -e "$env_file" ] || [ -L "$env_file" ]; then
  check_file "$env_file" "$maya_uid:$maya_gid:600"
  quarantine=$(/usr/bin/mktemp /opt/pe-cc-agents/rollback/listener.env.XXXXXXXX)
  /usr/bin/mv "$env_file" "$quarantine"
  /usr/bin/chown root:root "$quarantine"
  /usr/bin/chmod 0600 "$quarantine"
  credential_state=quarantined
  quarantine_stat=$(/usr/bin/stat -c '%u:%g:%a' "$quarantine")
fi
[ ! -e "$env_file" ] && [ ! -L "$env_file" ]
if [ "$credential_state" = quarantined ]; then
  check_file "$quarantine" 0:0:600
  [ "$quarantine_stat" = 0:0:600 ]
fi
printf '{"program":"maya-slack-listener","state":"STOPPED","source_absent":true,"credential_state":"%s","quarantine":"%s","quarantine_stat":"%s"}\n' "$credential_state" "$quarantine" "$quarantine_stat"`;
}

export function validateRuntimeEvidence(value) {
  const evidence = typeof value === "string" ? JSON.parse(value) : value;
  if (evidence?.program !== "maya-slack-listener" || evidence?.state !== "STOPPED") {
    throw new Error("Orgo did not prove the exact Maya Supervisor program stopped");
  }
  if (evidence.source_absent !== true) throw new Error("Orgo did not prove the credential source absent");
  if (evidence.credential_state === "quarantined") {
    if (!String(evidence.quarantine).startsWith("/opt/pe-cc-agents/rollback/listener.env.")) {
      throw new Error("Orgo returned an untrusted quarantine path");
    }
    if (evidence.quarantine_stat !== "0:0:600") throw new Error("Orgo returned an untrusted quarantine file");
  } else if (evidence.credential_state === "already_absent") {
    if (evidence.quarantine !== "" || evidence.quarantine_stat !== "") {
      throw new Error("Orgo returned inconsistent absent-credential evidence");
    }
  } else {
    throw new Error("Orgo returned an unknown credential state");
  }
  return evidence;
}

async function disableTrigger() {
  const triggerId = APPROVED.triggerId;
  const composio = new Composio({ apiKey: requiredEnv("COMPOSIO_API_KEY") });
  await composio.triggers.disable(triggerId, { signal: AbortSignal.timeout(30_000) });
  const listing = await composio.triggers.listActive(
    { triggerIds: [triggerId], showDisabled: true, limit: 10 },
    { signal: AbortSignal.timeout(30_000) },
  );
  const trigger = listing.items.find((item) => item.id === triggerId);
  if (!trigger?.disabledAt) throw new Error("Composio did not confirm the Maya trigger as disabled");
}

async function fenceDatabase() {
  const body = await jsonRequest("https://cc.proexteriorsus.net/api/agent/runtime/v1/operator/rollback", {
    method: "POST",
    token: requiredEnv("PEC78_ROLLBACK_TOKEN"),
    body: JSON.stringify({ reason: "Trigger-first operator rollback for Maya Composio runtime" }),
  });
  if (body?.status !== "fenced" || !Number.isSafeInteger(body?.fenceEpoch)) {
    throw new Error("Command Center did not confirm the Maya database fence");
  }
}

async function stopRuntime() {
  const command = buildStopRuntimeCommand();
  const result = await jsonRequest(`${ORGO_API_BASE}/computers/${ORGO_COMPUTER_ID}/bash`, {
    method: "POST",
    token: requiredEnv("ORGO_API_KEY"),
    body: JSON.stringify({ command }),
  });
  if (result?.success !== true || result?.exit_code !== 0) throw new Error("Orgo runtime containment command failed");
  validateRuntimeEvidence(String(result?.output ?? "").trim());
}

async function disableInference() {
  const body = await jsonRequest(`https://openrouter.ai/api/v1/keys/${OPENROUTER_KEY_HASH}`, {
    method: "PATCH",
    token: requiredEnv("OPENROUTER_MANAGEMENT_KEY"),
    body: JSON.stringify({ disabled: true }),
  });
  if (body?.data?.disabled !== true) throw new Error("OpenRouter did not confirm the Maya key as disabled");
}

async function main() {
  const order = await runRollback({ disableTrigger, fenceDatabase, stopRuntime, disableInference });
  process.stdout.write(`${JSON.stringify({ status: "rolled_back", order, at: new Date().toISOString() })}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
