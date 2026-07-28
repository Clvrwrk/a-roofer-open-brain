import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AGENT_HOME,
  APPROVED,
  HERMES_BIN,
  HERMES_ENTRYPOINT,
  HERMES_HOME,
  HERMES_MODEL,
  HERMES_PATH,
  MAYA_RECEIPT_DIR,
  MAYA_RUNTIME_DIR,
  RELEASE_DIR,
} from "../policy.mjs";
import { composioSendRequestOptions } from "../request-options.mjs";

const root = new URL("../", import.meta.url);

test("Supervisor keeps the Maya open listener installed disabled with bounded restart", async () => {
  const config = await readFile(new URL("maya-slack-listener.conf", root), "utf8");
  assert.match(config, /^user=maya-agent$/m);
  assert.match(config, /^autostart=false$/m);
  assert.match(config, /^autorestart=unexpected$/m);
  assert.match(config, /^startretries=0$/m);
  assert.match(config, /^stopsignal=TERM$/m);
  assert.match(config, /^stopasgroup=true$/m);
  assert.match(config, /^killasgroup=true$/m);
  assert.doesNotMatch(config, /(?:TOKEN|SECRET|KEY)=/);
});

test("installer converges only to a stopped Supervisor program", async () => {
  const installer = await readFile(new URL("install-disabled.sh", root), "utf8");
  assert.match(installer, /^set -euo pipefail$/m);
  assert.match(installer, /source_dir="\/root\/pec78-maya-slack-listener-staging"/);
  assert.match(installer, /staging directory trust check failed/);
  assert.match(installer, /node "\$source_dir\/installer-preflight\.mjs"/);
  assert.match(installer, /refusing replacement without exact stopped-state proof/);
  assert.match(installer, /supervisor-status\.mjs" "\$1" "\$supervisor_rc" "\$supervisor_output"/);
  assert.match(installer, /rollback_dir="\$\{release_parent\}\/rollback"/);
  assert.match(installer, /log_file="\$\{log_dir\}\/maya-slack-listener\.log"/);
  assert.match(installer, /npm ci --omit=dev --ignore-scripts/);
  assert.match(installer, /chmod 0755 "\$incoming_dir\/start-listener\.sh" "\$incoming_dir\/hermes-no-file-logging\.py"/);
  assert.match(installer, /find "\$incoming_dir" -type l -print -quit/);
  assert.match(installer, /chmod 0644 \/usr\/local\/lib\/hermes-agent\/venv\/\.lock/);
  assert.match(installer, /"\$release_dir\/config\.yaml" "\$hermes_home\/config\.yaml"/);
  assert.match(installer, /"\$hermes_home\/sessions" "\$hermes_home\/logs"/);
  for (const required of [
    "logs/curator",
    "memories",
    "pairing",
    "hooks",
    "image_cache",
    "audio_cache",
    "skills",
  ]) assert.match(installer, new RegExp(`"\\$hermes_home/${required}"`));
  assert.match(installer, /verify-hermes-no-tools\.py" "\$hermes_home\/config\.yaml"/);
  assert.ok(installer.indexOf("rollback_armed=1") < installer.indexOf('/usr/bin/install -d -o root -g root -m 0755 "$hermes_home"'));
  assert.match(installer, /"\$backup_dir\/hermes-home"/);
  assert.match(installer, /"\$backup_dir\/failed-hermes-home"/);
  assert.match(installer, /"\$hermes_lock_mode" "\$restored_expected"/);
  assert.match(installer, /supervisorctl reread/);
  assert.match(installer, /supervisorctl update/);
  assert.match(installer, /installed-disabled invariant failed/);
  assert.match(installer, /install-restoration\.mjs/);
  assert.match(installer, /rollback is incomplete/);
  assert.doesNotMatch(installer, /supervisorctl stop maya-slack-listener/);
  assert.doesNotMatch(installer, /supervisorctl start maya-slack-listener/);
});

test("Hermes uses the root-owned zero-tool policy without a CLI override", async () => {
  const config = JSON.parse(await readFile(new URL("config.yaml", root), "utf8"));
  assert.deepEqual(config, {
    platform_toolsets: { cli: ["no_mcp"] },
    agent: { disabled_toolsets: ["kanban"] },
  });
  const runner = await readFile(new URL("hermes-runner.mjs", root), "utf8");
  assert.doesNotMatch(runner, /--toolsets/);
  assert.match(runner, /\[HERMES_ENTRYPOINT, "--oneshot", prompt/);
  const shim = await readFile(new URL("hermes-no-file-logging.py", root), "utf8");
  assert.match(shim, /hermes_logging\.setup_logging = no_file_logging/);
  assert.match(shim, /sys\.argv\[3:7\] != \["--provider", EXPECTED_PROVIDER, "--model", EXPECTED_MODEL\]/);
  assert.doesNotMatch(shim, /open\(|write_text|write_bytes|unlink|mkdir|subprocess|os\.system/);
  const verifier = await readFile(new URL("verify-trust-chain.mjs", root), "utf8");
  assert.match(verifier, /verifyHermesIntegrityBeforeSelector\(\)/);
  assert.match(verifier, /verify-hermes-no-tools\.py/);
});

test("rollback is trigger-first, fences the database, and remotely revokes the inference key", async () => {
  const rollback = await readFile(new URL("operator-rollback.mjs", root), "utf8");
  assert.match(rollback, /await disableTrigger\(\)/);
  assert.match(rollback, /await fenceDatabase\(\)/);
  assert.match(rollback, /await stopRuntime\(\)/);
  assert.match(rollback, /await disableInference\(\)/);
  assert.match(rollback, /composio\.triggers\.disable\(triggerId/);
  assert.match(rollback, /api\/agent\/runtime\/v1\/operator\/rollback/);
  assert.match(rollback, /PEC78_ROLLBACK_TOKEN/);
  assert.match(rollback, /showDisabled: true/);
  assert.match(rollback, /\/computers\/\$\{ORGO_COMPUTER_ID\}\/bash/);
  assert.match(rollback, /JSON\.stringify\(\{ disabled: true \}\)/);
  assert.doesNotMatch(rollback, /(?:xapp-|xox[bp]-|sk_live_|ak_)/);
});

test("launcher strictly reads only two credentials and execs the pinned open listener", async () => {
  const launcher = await readFile(new URL("start-listener.sh", root), "utf8");
  assert.match(launcher, /^set -euo pipefail$/m);
  assert.match(launcher, /^umask 077$/m);
  assert.match(launcher, /^require_owned_path "\$agent_home" directory 700$/m);
  assert.match(launcher, /^require_owned_path "\$secrets_dir" directory 700$/m);
  assert.match(launcher, /^require_owned_path "\$env_file" file 600$/m);
  assert.match(launcher, /^require_static_path \/usr\/bin\/node file 755$/m);
  assert.match(launcher, /^require_static_path "\$verifier" file 644$/m);
  assert.match(launcher, /^\/usr\/bin\/node "\$verifier"$/m);
  assert.match(launcher, /^\s*\[\[ ! -L "\$path" \]\] \|\| return 1$/m);
  assert.match(launcher, /\/usr\/bin\/stat -c '%u:%g:%a'/);
  assert.match(launcher, /^while IFS= read -r line \|\| \[\[ -n "\$line" \]\]; do$/m);
  assert.match(launcher, /^    COMPOSIO_API_KEY=\*\)$/m);
  assert.match(launcher, /^    OPENROUTER_API_KEY=\*\)$/m);
  assert.match(launcher, /^    \*\) exit 1 ;;$/m);
  assert.match(launcher, /^done < "\$env_file"$/m);
  assert.doesNotMatch(launcher, /(?:source|^\.) .*listener\.env/m);
  assert.match(launcher, /^exec \/usr\/bin\/env -i \\/m);
  assert.match(launcher, /^  COMPOSIO_API_KEY="\$COMPOSIO_API_KEY" \\/m);
  assert.match(launcher, /^  OPENROUTER_API_KEY="\$OPENROUTER_API_KEY" \\/m);
  assert.match(
    launcher,
    /^  \/usr\/bin\/node \/opt\/pe-cc-agents\/maya-slack-listener\/listener\.mjs$/m,
  );
  assert.doesNotMatch(launcher, /(?:xapp-|xox[bp]-|sk_live_|ak_)/);
});

test("the package start command is the same open listener used by Supervisor", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(manifest.scripts.start, "node listener.mjs");
});

test("authorization identities and runtime choices are immutable reviewed literals", () => {
  assert.deepEqual(APPROVED, {
    composioUserId: "maya-chen",
    receiveConnectedAccountId: "ca_X9dQyRDSS0sa",
    sendConnectedAccountId: "ca_V3cdfxA1veTS",
    triggerId: "ti_G_lnPrrKPhWj",
    triggerUuid: "32f67255-b604-419b-8f86-85b92c9dbe30",
    teamId: "T0B8QEGPVQW",
    mayaBotUserId: "U0BD0Q0H55G",
  });
  assert.equal(Object.isFrozen(APPROVED), true);
  assert.equal(AGENT_HOME, "/home/orgo/maya-agent");
  assert.equal(HERMES_HOME, "/opt/pe-cc-agents/maya-hermes-home");
  assert.equal(HERMES_BIN, "/usr/local/lib/hermes-agent/venv/bin/python3");
  assert.equal(HERMES_ENTRYPOINT, "/opt/pe-cc-agents/maya-slack-listener/hermes-no-file-logging.py");
  assert.equal(HERMES_MODEL, "google/gemini-3.1-flash-lite");
  assert.equal(HERMES_PATH, "/usr/local/bin:/usr/bin:/bin");
  assert.equal(MAYA_RUNTIME_DIR, "/home/orgo/maya-agent/runtime");
  assert.equal(MAYA_RECEIPT_DIR, "/home/orgo/maya-agent/state/receipts");
  assert.equal(RELEASE_DIR, "/opt/pe-cc-agents/maya-slack-listener");
});

test("open listener accepts only its two provider credentials", async () => {
  const listener = await readFile(new URL("listener.mjs", root), "utf8");
  const hermesRunner = await readFile(new URL("hermes-runner.mjs", root), "utf8");
  const references = [...`${listener}\n${hermesRunner}`.matchAll(/process\.env\.([A-Z0-9_]+)/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(references, ["COMPOSIO_API_KEY", "OPENROUTER_API_KEY"]);
  assert.doesNotMatch(
    listener,
    /process\.env\.(?:COMPOSIO_USER_ID|COMPOSIO_CONNECTED_ACCOUNT_ID|COMPOSIO_TRIGGER_ID|SLACK_TEAM_ID|SLACK_CHANNEL_ID|SLACK_MAYA_BOT_USER_ID|SLACK_OWNER_USER_ID|HERMES_BIN|HERMES_MODEL|MAYA_RUNTIME_DIR|MAYA_RECEIPT_DIR)/,
  );
});

test("Composio sends time out with an abort signal", async () => {
  const { signal } = composioSendRequestOptions(5);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(signal.aborted, true);
  assert.equal(signal.reason?.name, "TimeoutError");
});

test("legacy preinstall quarantine is recoverable and fails closed", async () => {
  const script = await readFile(new URL("quarantine-legacy-preinstall.sh", root), "utf8");
  assert.match(script, /\/usr\/bin\/mountpoint -q "\$source_dir"/);
  assert.match(script, /\/usr\/bin\/id maya-agent/);
  assert.match(script, /expected_top_level=\$'node_modules\\npackage-lock\.json\\npackage\.json'/);
  assert.match(script, /supervisor-status\.mjs/);
  assert.match(script, /stat -c '%d' "\$source_dir"/);
  assert.match(script, /stat -c '%d' "\$rollback_dir"/);
  assert.match(script, /legacy-quarantine-transaction\.mjs/);
});

test("operator shutdown is combined with the send timeout", () => {
  const controller = new AbortController();
  const { signal } = composioSendRequestOptions(30_000, controller.signal);
  controller.abort(new Error("shutdown"));
  assert.equal(signal.aborted, true);
});
