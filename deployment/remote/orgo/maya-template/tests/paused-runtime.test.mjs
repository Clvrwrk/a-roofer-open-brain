import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PACKAGE_ROOT, evaluateRuntimeState, writeHealth } from "../runtime/service.mjs";

test("package is paused with no activation material", async () => {
  const state = await evaluateRuntimeState({ packageRoot: PACKAGE_ROOT, env: { MAYA_ENABLED: "false" } });
  assert.equal(state.status, "paused");
  assert.equal(state.reason, "environment_disabled");
  assert.equal(state.manifest.identity.destination, "INJECT_AT_LAUNCH");
  assert.equal(state.permissions.provider_adapters.length, 0);
});

test("paused health receipt is local and contains no credential", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maya-health-"));
  const healthPath = path.join(root, "health.json");
  const state = await writeHealth({
    packageRoot: PACKAGE_ROOT,
    env: { MAYA_ENABLED: "false", MAYA_STATE_ROOT: root, MAYA_HEALTH_PATH: healthPath },
    now: new Date("2026-08-03T12:00:00Z"),
  });
  assert.equal(state.status, "paused");
  const raw = await readFile(healthPath, "utf8");
  const health = JSON.parse(raw);
  assert.equal(health.status, "paused");
  assert.equal(health.agent_id, "maya-chen");
  assert.doesNotMatch(raw, /credential|token|password|secret/iu);
});
