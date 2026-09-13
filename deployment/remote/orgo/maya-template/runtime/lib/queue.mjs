import path from "node:path";
import { createJsonExclusive, moveAtomic, readJson, sha256, writeJsonAtomic } from "./atomic-json.mjs";

export async function claimOne(queueRoot, task, now = new Date(), leaseSeconds = 900) {
  if (!task || !/^CAT-\d+$/u.test(String(task.issue_id))) throw new Error("queue_issue_invalid");
  if (task.agent_id !== "maya-chen" || task.client_id !== "pe-finance") throw new Error("queue_identity_mismatch");
  const target = path.join(queueRoot, "active-claim.json");
  const claimed = await createJsonExclusive(target, {
    schema: 1,
    state: "claimed",
    issue_id: task.issue_id,
    agent_id: task.agent_id,
    client_id: task.client_id,
    artifact_revision: task.artifact_revision ?? 0,
    claimed_at: now.toISOString(),
    lease_until: new Date(now.getTime() + leaseSeconds * 1_000).toISOString(),
  });
  return { claimed, target };
}

export async function renewForProgress(target, artifactRevision, now = new Date(), leaseSeconds = 900) {
  const claim = await readJson(target);
  if (claim.state !== "claimed" || !Number.isInteger(artifactRevision) || artifactRevision <= claim.artifact_revision) {
    throw new Error("lease_progress_required");
  }
  await writeJsonAtomic(target, {
    ...claim,
    artifact_revision: artifactRevision,
    renewed_at: now.toISOString(),
    lease_until: new Date(now.getTime() + leaseSeconds * 1_000).toISOString(),
  });
  return await readJson(target);
}

export async function finishClaim(target, state, now = new Date()) {
  if (!new Set(["completed", "parked"]).has(state)) throw new Error("queue_terminal_state_invalid");
  const claim = await readJson(target);
  if (claim.state !== "claimed") throw new Error("queue_transition_rejected");
  const terminal = { ...claim, state, finished_at: now.toISOString() };
  await writeJsonAtomic(target, terminal);
  const archivePath = path.join(path.dirname(target), "history", `${sha256(`${claim.issue_id}:${terminal.finished_at}`)}.json`);
  await moveAtomic(target, archivePath);
  return { ...terminal, archivePath };
}
