import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claimOne, finishClaim, renewForProgress } from "../runtime/lib/queue.mjs";
import { runBoundedRetry } from "../runtime/lib/retry.mjs";
import { occurrenceId, reserveOccurrence, transitionOccurrence } from "../runtime/lib/scheduler.mjs";

test("one-task queue rejects a concurrent second claim", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-queue-"));
  const task = { issue_id: "CAT-999", agent_id: "maya-chen", client_id: "pe-finance", artifact_revision: 0 };
  const first = await claimOne(directory, task, new Date("2026-08-03T00:00:00Z"));
  const second = await claimOne(directory, { ...task, issue_id: "CAT-1000" });
  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
  await assert.rejects(() => renewForProgress(first.target, 0), /lease_progress_required/u);
  assert.equal((await renewForProgress(first.target, 1)).artifact_revision, 1);
  const finished = await finishClaim(first.target, "completed");
  assert.equal(finished.state, "completed");
  assert.match(finished.archivePath, /history/u);
  assert.equal((await claimOne(directory, { ...task, issue_id: "CAT-1000" })).claimed, true);
});

test("schedule occurrence identity and reservation are deterministic", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-schedule-"));
  assert.equal(occurrenceId("saturday-review", "2026-08-08", "10:00"), "maya:saturday-review:2026-08-08:10:00");
  const fields = { schedule_name: "saturday-review", local_date: "2026-08-08", window: "10:00" };
  const first = await reserveOccurrence(directory, fields);
  assert.equal(first.reserved, true);
  assert.equal((await reserveOccurrence(directory, fields)).reserved, false);
  assert.equal((await transitionOccurrence(first.target, "completed")).state, "completed");
  await assert.rejects(() => transitionOccurrence(first.target, "completed"), /occurrence_transition_rejected/u);
});

test("three identical failures park without a fourth call", async () => {
  let calls = 0;
  let parked;
  const result = await runBoundedRetry({
    operation: async () => {
      calls += 1;
      const error = new Error("fixture failure");
      error.name = "FixtureFailure";
      throw error;
    },
    onPark: async (receipt) => { parked = receipt; },
  });
  assert.equal(calls, 3);
  assert.equal(result.state, "parked");
  assert.equal(result.attempts, 3);
  assert.equal(parked.fingerprint, "FixtureFailure");
});
