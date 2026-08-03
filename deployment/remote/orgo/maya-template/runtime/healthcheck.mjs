import { readFile } from "node:fs/promises";

const target = process.env.MAYA_HEALTH_PATH ?? "/home/orgo/maya-agent-v1/state/health.json";
const maximumAgeMs = 120_000;
const health = JSON.parse(await readFile(target, "utf8"));
const age = Date.now() - Date.parse(health.observed_at);
if (!["paused", "blocked_unconfigured", "active"].includes(health.status)) throw new Error("health_status_invalid");
if (!Number.isFinite(age) || age < 0 || age > maximumAgeMs) throw new Error("health_stale");
process.stdout.write(`${JSON.stringify({ status: health.status, runtime_version: health.runtime_version })}\n`);
