import path from "node:path";
import { createJsonExclusive, readJson, sha256, writeJsonAtomic } from "./atomic-json.mjs";

export function occurrenceId(scheduleName, localDate, window) {
  if (!/^[a-z][a-z0-9-]{2,80}$/u.test(scheduleName)) throw new Error("schedule_name_invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(localDate)) throw new Error("schedule_date_invalid");
  if (!/^[a-z0-9:-]{1,40}$/u.test(window)) throw new Error("schedule_window_invalid");
  return `maya:${scheduleName}:${localDate}:${window}`;
}

export async function reserveOccurrence(registryRoot, fields, now = new Date()) {
  const id = occurrenceId(fields.schedule_name, fields.local_date, fields.window);
  const digest = sha256(id);
  const target = path.join(registryRoot, `${digest}.json`);
  const reserved = await createJsonExclusive(target, {
    schema: 1,
    state: "reserved",
    occurrence_digest: digest,
    schedule_name: fields.schedule_name,
    local_date: fields.local_date,
    window: fields.window,
    reserved_at: now.toISOString(),
  });
  return { reserved, digest, target };
}

export async function transitionOccurrence(target, state, fields = {}, now = new Date()) {
  if (!new Set(["completed", "parked", "ambiguous"]).has(state)) throw new Error("occurrence_terminal_state_invalid");
  const receipt = await readJson(target);
  if (receipt.state !== "reserved") throw new Error("occurrence_transition_rejected");
  await writeJsonAtomic(target, { ...receipt, ...fields, state, updated_at: now.toISOString() });
  return await readJson(target);
}
