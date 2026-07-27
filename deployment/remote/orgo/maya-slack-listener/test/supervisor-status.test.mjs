import assert from "node:assert/strict";
import test from "node:test";
import { assertSupervisorStatus } from "../supervisor-status.mjs";

test("Supervisor parser accepts only exact stopped or absent states", () => {
  assert.equal(assertSupervisorStatus({
    output: "maya-slack-listener   STOPPED   Not started",
    exitCode: 3,
    expected: "stopped",
  }), "stopped");
  assert.equal(assertSupervisorStatus({
    output: "maya-slack-listener: ERROR (no such process)",
    exitCode: 4,
    expected: "absent",
  }), "absent");
});

test("Supervisor parser rejects indeterminate, active, failed, and lookalike output", () => {
  for (const fixture of [
    { output: "", exitCode: 0 },
    { output: "maya-slack-listener   RUNNING pid 1", exitCode: 0 },
    { output: "maya-slack-listener   STARTING", exitCode: 0 },
    { output: "maya-slack-listener   BACKOFF exited", exitCode: 0 },
    { output: "maya-slack-listener   STOPPING", exitCode: 0 },
    { output: "maya-slack-listener   EXITED expected", exitCode: 0 },
    { output: "maya-slack-listener   FATAL exited", exitCode: 0 },
    { output: "maya-slack-listener   UNKNOWN", exitCode: 0 },
    { output: "other maya-slack-listener STOPPED", exitCode: 0 },
    { output: "\nmaya-slack-listener STOPPED Not started", exitCode: 0 },
    { output: "maya-slack-listener STOPPED Not started\n\n", exitCode: 0 },
    { output: "maya-slack-listener STOPPED\nother STOPPED", exitCode: 0 },
    { output: " maya-slack-listener STOPPED Not started", exitCode: 0 },
    { output: "maya-slack-listener STOPPED Not started ", exitCode: 0 },
    { output: "maya-slack-listener STOPPED Not started", exitCode: 0 },
    { output: "maya-slack-listener STOPPED Not started", exitCode: 1 },
    { output: "maya-slack-listener STOPPED Not started", exitCode: 4 },
    { output: "maya-slack-listener: ERROR (no such process)", exitCode: 0 },
    { output: "maya-slack-listener: ERROR (no such process)", exitCode: 1 },
    { output: "transport failed", exitCode: 4 },
  ]) {
    assert.throws(
      () => assertSupervisorStatus({ ...fixture, expected: "stopped-or-absent" }),
      /not exactly|multiple lines|noncanonical outer whitespace/,
    );
  }
});
