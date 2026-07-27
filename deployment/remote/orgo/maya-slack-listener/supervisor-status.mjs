import { pathToFileURL } from "node:url";
import path from "node:path";

const PROGRAM = "maya-slack-listener";
const ABSENT = `${PROGRAM}: ERROR (no such process)`;
const STOPPED = new RegExp(`^${PROGRAM}\\s+STOPPED(?:\\s+.*)?$`);
const LSB_NOT_RUNNING = 3;
const LSB_UNKNOWN = 4;

export function assertSupervisorStatus({ output, exitCode, expected }) {
  const value = String(output ?? "");
  if (value.includes("\n") || value.includes("\r")) throw new Error("Supervisor returned multiple lines");
  if (value !== value.trim()) throw new Error("Supervisor returned noncanonical outer whitespace");
  if (expected === "stopped" && exitCode === LSB_NOT_RUNNING && STOPPED.test(value)) return "stopped";
  if (expected === "absent" && exitCode === LSB_UNKNOWN && value === ABSENT) return "absent";
  if (expected === "stopped-or-absent") {
    if (exitCode === LSB_NOT_RUNNING && STOPPED.test(value)) return "stopped";
    if (exitCode === LSB_UNKNOWN && value === ABSENT) return "absent";
  }
  throw new Error(`Supervisor state is not exactly ${expected}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [, , expected, exitCode, output] = process.argv;
  assertSupervisorStatus({ output, exitCode: Number(exitCode), expected });
}
