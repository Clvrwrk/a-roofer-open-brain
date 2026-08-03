import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authorizeTool } from "../runtime/lib/tool-router.mjs";

const read = async (name) => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), "utf8"));

test("manifest, permissions, and schedules are disabled by default", async () => {
  const manifest = await read("manifest.yaml");
  const permissions = await read("permissions.yaml");
  const schedules = await read("schedules.yaml");
  assert.equal(manifest.activation.enabled_by_default, false);
  assert.ok(Object.values(manifest.communications).every((mode) => mode === "off"));
  assert.equal(permissions.default, "deny");
  assert.equal(permissions.claims, false);
  assert.equal(permissions.schedules, false);
  assert.deepEqual(permissions.provider_adapters, []);
  assert.equal(schedules.enabled, false);
});

test("signed activation still cannot route an absent provider adapter", async () => {
  const permissions = await read("permissions.yaml");
  const router = await read("tool-router.yaml");
  const context = Object.fromEntries(router.required_effect_context.map((key) => [key, `fixture-${key}`]));
  Object.assign(context, { issue_id: "CAT-999", agent_id: "maya-chen", client_id: "pe-finance" });
  assert.throws(() => authorizeTool({ permissions, router, activation: { active: true }, context }), /tool_adapter_not_installed/u);
});

test("Supervisor auto-starts a disabled service shell", async () => {
  const config = await readFile(new URL("../runtime/maya-runtime-v1.conf", import.meta.url), "utf8");
  assert.match(config, /^autostart=true$/mu);
  assert.match(config, /MAYA_ENABLED="false"/u);
  assert.match(config, /^user=maya-agent$/mu);
  assert.match(config, /^startretries=2$/mu);
  assert.match(config, /^command=\/usr\/local\/bin\/node /mu);
});

test("Maya writable state is isolated from the interactive Orgo home", async () => {
  const installer = await readFile(new URL("../runtime/install-paused.sh", import.meta.url), "utf8");
  const manifest = await read("manifest.yaml");
  const config = await readFile(new URL("../runtime/maya-runtime-v1.conf", import.meta.url), "utf8");
  assert.equal(manifest.runtime.state_root, "/var/lib/cleverwork/maya-agent-v1/state");
  assert.match(installer, /agent_root="\/var\/lib\/cleverwork\/maya-agent-v1"/u);
  assert.doesNotMatch(installer, /usermod/u);
  assert.match(config, /^directory=\/opt\/cleverwork\/maya-runtime-v1\/runtime$/mu);
  assert.doesNotMatch(config, /\/home\/orgo/u);
});
