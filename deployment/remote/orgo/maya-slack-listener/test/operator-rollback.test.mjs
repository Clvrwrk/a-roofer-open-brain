import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStopRuntimeCommand,
  runRollback,
  validateRuntimeEvidence,
} from "../operator-rollback.mjs";

test("operator rollback enforces trigger-first order", async () => {
  const calls = [];
  const order = await runRollback({
    disableTrigger: async () => calls.push("trigger"),
    stopRuntime: async () => calls.push("runtime"),
    disableInference: async () => calls.push("inference"),
  });
  assert.deepEqual(calls, ["trigger", "runtime", "inference"]);
  assert.deepEqual(order, ["trigger_disabled", "runtime_stopped", "inference_disabled"]);
});

test("operator rollback refuses downstream mutation when trigger disable is unconfirmed", async () => {
  const calls = [];
  await assert.rejects(
    runRollback({
      disableTrigger: async () => { calls.push("trigger"); throw new Error("not confirmed"); },
      stopRuntime: async () => calls.push("runtime"),
      disableInference: async () => calls.push("inference"),
    }),
    /not confirmed/,
  );
  assert.deepEqual(calls, ["trigger"]);
});

test("operator rollback still disables inference when runtime quarantine fails", async () => {
  const calls = [];
  await assert.rejects(
    runRollback({
      disableTrigger: async () => calls.push("trigger"),
      stopRuntime: async () => { calls.push("runtime"); throw new Error("quarantine failed"); },
      disableInference: async () => calls.push("inference"),
    }),
    /Rollback incomplete/,
  );
  assert.deepEqual(calls, ["trigger", "runtime", "inference"]);
});

test("remote containment validates exact stopped and quarantine evidence", () => {
  const command = buildStopRuntimeCommand();
  assert.match(command, /check_dir \/opt\/pe-cc-agents\/rollback 0:0:700/);
  assert.match(command, /STOPPED\(\[\[:space:\]\]\.\*\)\?\$/);
  assert.match(command, /\[ "\$status_rc" -eq 3 \]/);
  assert.match(command, /check_file "\$quarantine" 0:0:600/);
  assert.doesNotMatch(command, /status=.*\|\| true/);
  assert.equal(validateRuntimeEvidence({
    program: "maya-slack-listener",
    state: "STOPPED",
    source_absent: true,
    credential_state: "quarantined",
    quarantine: "/opt/pe-cc-agents/rollback/listener.env.fixture",
    quarantine_stat: "0:0:600",
  }).credential_state, "quarantined");
});

test("remote containment rejects self-attested or inconsistent evidence", () => {
  for (const fixture of [
    "stopped-and-quarantined",
    { program: "maya-slack-listener", state: "RUNNING", source_absent: true },
    {
      program: "maya-slack-listener", state: "STOPPED", source_absent: true,
      credential_state: "quarantined", quarantine: "/tmp/redirect", quarantine_stat: "0:0:600",
    },
    {
      program: "maya-slack-listener", state: "STOPPED", source_absent: false,
      credential_state: "already_absent", quarantine: "", quarantine_stat: "",
    },
  ]) assert.throws(() => validateRuntimeEvidence(fixture));
});
