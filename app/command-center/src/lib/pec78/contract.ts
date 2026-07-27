import { createHash } from "node:crypto";

export const PEC78_CONTRACT_VERSION = "pec78-runtime-authorization-v1" as const;
export const PEC78_RUNTIME_PREFIX = "/api/agent/runtime/v1" as const;
export const PEC78_OPERATOR_PREFIX = "/api/operator/runtime/v1" as const;
export const PEC78_MAYA_SUBJECT = "named-agent:maya-chen" as const;
export const PEC78_MAYA_PERSONA = "maya-chen" as const;
export const PEC78_RUNTIME_OWNER = "runtime:maya-chen" as const;

export type Pec78AdapterMode = "disabled" | "shadow" | "enabled";
export type Pec78Capability =
  | "mailbox.read"
  | "mailbox.classify"
  | "command_center.record_decision"
  | "slack.send.christopher"
  | "email.send.admin";

export const PEC78_CAPABILITIES = new Set<Pec78Capability>([
  "mailbox.read",
  "mailbox.classify",
  "command_center.record_decision",
  "slack.send.christopher",
  "email.send.admin",
]);

export const PEC78_ROUTE_CAPABILITIES = new Map<string, Pec78Capability>([
  ["POST /api/agent/runtime/v1/occurrences/claim", "mailbox.read"],
  ["POST /api/agent/runtime/v1/intake", "mailbox.classify"],
  ["POST /api/agent/runtime/v1/effects", "email.send.admin"],
]);

export function pec78Mode(value: string | undefined): Pec78AdapterMode {
  return value === "shadow" || value === "enabled" ? value : "disabled";
}

export function pec78Json(status: number, code: string, traceId = crypto.randomUUID()) {
  return new Response(JSON.stringify({ contractVersion: PEC78_CONTRACT_VERSION, traceId, status: code }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function sha256Digest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function isPec78RuntimePath(pathname: string): boolean {
  return pathname === PEC78_RUNTIME_PREFIX || pathname.startsWith(`${PEC78_RUNTIME_PREFIX}/`);
}

export function isPec78OperatorPath(pathname: string): boolean {
  return pathname === PEC78_OPERATOR_PREFIX || pathname.startsWith(`${PEC78_OPERATOR_PREFIX}/`);
}

export function shouldStopPec78Request(pathname: string, mode: Pec78AdapterMode): boolean {
  return mode === "disabled" && pathname !== `${PEC78_RUNTIME_PREFIX}/readiness`;
}
