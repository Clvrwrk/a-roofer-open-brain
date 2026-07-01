import { createHash } from "node:crypto";
import type { APIRoute } from "astro";
import {
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
} from "@lib/access-control";
import {
  buildPendingWriteRows,
  departmentForLane,
  WRITE_LANES,
  type BuildPendingWriteInput,
  type PendingWriteTargetEnv,
  type WriteLane,
} from "@lib/acculynx-pending-write";
import { jsonApiResponse } from "@lib/agent-api";
import { postSlackMessage } from "@lib/slack.server";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

/** POST /api/agent/acculynx-write-action/enqueue
 *
 * The RQ-1 enqueue-gap closure. An agent (service bearer token, per the
 * workos-agent-auth skill) posts a write request here. We validate the lane
 * against the 17 proven-safe lanes, build the pending-write row via the
 * shared buildPendingWriteRows (acculynx-pending-write.ts), upsert into
 * acculynx_pending_write, mirror into dashboard_action_log (RQ-4), and post
 * a notify-only Slack message (D-08 — the dashboard stays the authoritative
 * approve/reject + audit surface; Slack never carries approval authority).
 *
 * Mirrors intake.ts's exact gate shape: agent-actor-type only + evidence.attach
 * permission + a required-field validation loop.
 */

function isWriteLane(value: unknown): value is WriteLane {
  return typeof value === "string" && (WRITE_LANES as readonly string[]).includes(value);
}

function isTargetEnv(value: unknown): value is PendingWriteTargetEnv {
  return value === "sandbox" || value === "prod";
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  // Only agent actors (service/named/local) may enqueue a pending AccuLynx write.
  if (
    actor.type !== "service_agent" &&
    actor.type !== "named_agent" &&
    actor.type !== "local_operator"
  ) {
    return jsonApiResponse(
      { error: "forbidden", error_description: "Only agent actors may enqueue AccuLynx writes." },
      { status: 403 },
    );
  }

  if (!hasPermission(actor, "evidence.attach")) {
    return jsonApiResponse(
      { error: "forbidden", error_description: "evidence.attach permission required." },
      { status: 403 },
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return jsonApiResponse({ error: "invalid_body", error_description: "JSON body required." }, { status: 400 });
  }

  // Validate required fields.
  const required = ["lane", "accountKey", "targetEnv", "payload"] as const;
  for (const key of required) {
    if (payload[key] === undefined || payload[key] === null || payload[key] === "") {
      return jsonApiResponse(
        { error: "invalid_body", error_description: `Missing required field: ${key}.` },
        { status: 400 },
      );
    }
  }

  if (!isWriteLane(payload.lane)) {
    return jsonApiResponse(
      {
        error: "invalid_body",
        error_description: `lane must be one of the 17 proven-safe lanes: ${WRITE_LANES.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  if (!isTargetEnv(payload.targetEnv)) {
    return jsonApiResponse(
      { error: "invalid_body", error_description: `targetEnv must be "sandbox" or "prod".` },
      { status: 400 },
    );
  }

  if (typeof payload.payload !== "object" || Array.isArray(payload.payload)) {
    return jsonApiResponse(
      { error: "invalid_body", error_description: "payload must be a JSON object." },
      { status: 400 },
    );
  }

  const lane = payload.lane as WriteLane;
  const targetEnv = payload.targetEnv as PendingWriteTargetEnv;
  const department = departmentForLane(lane);

  // Agents are department-scoped: an agent may only enqueue writes for a lane whose
  // derived department is within its own departmentAccess (mirrors intake.ts's
  // accounting-only gate, generalized to the lane-derived department).
  if (actor.departmentAccess !== "all" && !actor.departmentAccess.includes(department)) {
    return jsonApiResponse(
      {
        error: "forbidden",
        error_description: `This actor does not have access to the ${department} department (required for lane "${lane}").`,
      },
      { status: 403 },
    );
  }

  const accountKey = String(payload.accountKey);
  const endpoint = typeof payload.endpoint === "string" && payload.endpoint ? payload.endpoint : lane;
  const workKey =
    typeof payload.workKey === "string" && payload.workKey
      ? payload.workKey
      : hashText(`${lane}|${accountKey}|${targetEnv}|${JSON.stringify(payload.payload)}|${Date.now()}`);
  const idempotencyKey =
    typeof payload.idempotencyKey === "string" && payload.idempotencyKey
      ? payload.idempotencyKey
      : hashText(`${lane}|${accountKey}|${targetEnv}|${JSON.stringify(payload.payload)}`);

  const buildInput: BuildPendingWriteInput = {
    lane,
    accountKey,
    targetEnv,
    payload: payload.payload as Record<string, unknown>,
    endpoint,
    idempotencyKey,
    workKey,
    actor,
    dryRunRender: payload.dryRunRender && typeof payload.dryRunRender === "object" ? payload.dryRunRender : null,
  };

  const { pendingWrite, actionLog } = buildPendingWriteRows(buildInput);

  const env = getRuntimeEnv();
  const { client, config } = createServerSupabaseClient(env);

  if (!client) {
    return jsonApiResponse(
      { error: "service_unavailable", error_description: `Supabase not configured: ${config.missing.join(", ")}.` },
      { status: 503 },
    );
  }

  const { data: pendingRow, error: pwError } = await client
    .from("acculynx_pending_write")
    .upsert(pendingWrite, { onConflict: "work_key" })
    .select("id, work_key, lane, target_env, status, created_at, updated_at")
    .single();

  if (pwError) {
    return jsonApiResponse(
      { error: "database_error", error_description: pwError.message },
      { status: 500 },
    );
  }

  // Append the dashboard_action_log mirror row (non-fatal on error, RQ-4).
  const { data: actionLogRow, error: alError } = await client
    .from("dashboard_action_log")
    .insert(actionLog)
    .select("id, created_at")
    .single();

  if (alError) {
    console.error("[acculynx-write-action/enqueue] dashboard_action_log insert failed:", alError.message);
  }

  // D-08 notify-only Slack message: links to the dashboard, states this is a
  // notification (not an approval surface — the dashboard remains authoritative).
  const isProd = targetEnv === "prod";
  const slackChannel = env.SLACK_OB_AGENT_AUDIT_LOG_CHANNEL_ID ?? env.SLACK_OB_CONDUCTOR_DIGEST_CHANNEL_ID;
  let slackResult: { ok: boolean; error?: string } = { ok: false, error: "channel_unset" };
  if (slackChannel) {
    slackResult = await postSlackMessage({
      channel: slackChannel,
      text: [
        `${isProd ? "*** PROD WRITE PENDING ***" : "AccuLynx write pending"} — \`${lane}\` / ${accountKey}`,
        `Enqueued by ${actor.displayName} (${actor.type}). Work key: \`${workKey}\`.`,
        "This is a notification only — approve or reject from the Command Center dashboard.",
        `${env.COMMAND_CENTER_PUBLIC_URL ?? "https://cc.proexteriorsus.net"}/system/actions?work=${encodeURIComponent(`acculynx-write-action:${workKey}`)}`,
      ].join("\n"),
    });
  }

  return jsonApiResponse({
    status: "accepted",
    pendingWrite: {
      id: pendingRow?.id,
      work_key: pendingRow?.work_key,
      lane: pendingRow?.lane,
      target_env: pendingRow?.target_env,
      status: pendingRow?.status,
      created_at: pendingRow?.created_at,
      updated_at: pendingRow?.updated_at,
    },
    actionLog: actionLogRow ? { id: actionLogRow.id, created_at: actionLogRow.created_at } : null,
    slack: { posted: slackResult.ok, error: slackResult.ok ? undefined : slackResult.error },
    actor: serializeActor(actor),
    next: "Pending write created. A human approver must approve or reject it via POST /api/agent/work-queue/:workKey/decision or the Command Center dashboard.",
  });
};
