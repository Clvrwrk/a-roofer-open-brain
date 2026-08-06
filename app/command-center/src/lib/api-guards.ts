// Shared API-route plumbing. Every `/api/*` route repeats the same four steps —
// resolve the actor, gate on department + permission, get a configured Supabase
// client, shape errors as `{ error, error_description }` — and the dashboard
// write paths all append the same `dashboard_action_log` row. These helpers are
// the single definition of those shapes so a route never drifts from the gate.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  actorCanAccessDepartment,
  buildUnauthorizedResponse,
  hasPermission,
  type CommandCenterActor,
  type CommandCenterPermission,
} from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import type { DepartmentId } from "@lib/cadence";
import { createServerSupabaseClient } from "@lib/supabase.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown) {
  return UUID_RE.test(String(value ?? ""));
}

export function apiError(
  error: string,
  description: string | null,
  status: number,
  extra: Record<string, unknown> = {},
) {
  return jsonApiResponse(
    { error, ...(description ? { error_description: description } : {}), ...extra },
    { status },
  );
}

/** The name a write path stamps into `*_by` columns. */
export function actorDisplayName(actor: CommandCenterActor | null, fallback = "operator") {
  return actor?.displayName || actor?.id || fallback;
}

/** Body of a JSON request, or `{}` when absent/malformed. */
export async function readJsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}

export interface RequireActorOptions {
  /** Actor must be able to access this department (or any one of them). */
  department?: DepartmentId | DepartmentId[];
  /** Actor must hold this permission (or all of them). */
  permission?: CommandCenterPermission | CommandCenterPermission[];
  /** `error_description` on the 403. */
  forbiddenMessage?: string;
  /** Extra fields merged into the 403 body (e.g. `{ actor: serializeActor(actor) }`). */
  forbiddenExtra?: (actor: CommandCenterActor) => Record<string, unknown>;
}

export type ActorGuardResult =
  | { actor: CommandCenterActor; response: null }
  | { actor: null; response: Response };

/**
 * 401 when unauthenticated, 403 when the actor fails the department/permission
 * gate, otherwise the actor. Usage:
 *
 *   const { actor, response } = requireActor(locals, { department: "accounting" });
 *   if (!actor) return response;
 */
export function requireActor(locals: App.Locals, options: RequireActorOptions = {}): ActorGuardResult {
  const actor = locals.actor;
  if (!actor) return { actor: null, response: buildUnauthorizedResponse() };

  const departments = options.department
    ? Array.isArray(options.department) ? options.department : [options.department]
    : [];
  const permissions = options.permission
    ? Array.isArray(options.permission) ? options.permission : [options.permission]
    : [];

  const departmentOk = departments.length === 0 || departments.some((d) => actorCanAccessDepartment(actor, d));
  const permissionOk = permissions.every((p) => hasPermission(actor, p));
  if (departmentOk && permissionOk) return { actor, response: null };

  return {
    actor: null,
    response: apiError(
      "forbidden",
      options.forbiddenMessage ?? "This actor cannot perform this action.",
      403,
      options.forbiddenExtra?.(actor) ?? {},
    ),
  };
}

export type SupabaseGuardResult =
  | { client: SupabaseClient; response: null }
  | { client: null; response: Response };

/** 503 with the missing env vars when Supabase is unconfigured. */
export function requireSupabaseClient(): SupabaseGuardResult {
  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return { client: null, response: apiError("supabase_unconfigured", config.missing.join(", "), 503) };
  }
  return { client, response: null };
}

export interface DashboardActionEntry {
  action_type: string;
  decision?: string;
  department: DepartmentId | string;
  note?: string | null;
  payload?: Record<string, unknown>;
  source_pk?: string | null;
  source_table?: string;
  work_item_id?: string | null;
  work_key?: string | null;
  workflow: string;
}

/** The actor-stamped `dashboard_action_log` row, for callers that need the insert back. */
export function dashboardActionRow(actor: CommandCenterActor, entry: DashboardActionEntry) {
  return {
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    ...entry,
  };
}

/**
 * Append the actor-stamped audit row. Best-effort by design: the caller's write
 * already succeeded, so a logging failure is reported, never thrown.
 */
export async function logDashboardAction(
  client: SupabaseClient,
  actor: CommandCenterActor,
  entry: DashboardActionEntry,
) {
  const { error } = await client.from("dashboard_action_log").insert(dashboardActionRow(actor, entry));
  if (error) console.error(`[${entry.workflow}] dashboard_action_log insert failed:`, error.message);
  return { error: error ?? null };
}
