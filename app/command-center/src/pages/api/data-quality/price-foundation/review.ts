import type { APIRoute } from "astro";
import {
  actorCanAccessDepartment,
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
} from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import {
  RESOLUTION_STATUSES,
  reviewKey,
  type QueueType,
  type ResolutionStatus,
} from "@lib/price-foundation";

export const prerender = false;

const QUEUE_TYPES: QueueType[] = ["sku", "branch", "business_rule"];

const DECISION_BY_STATUS: Record<ResolutionStatus, string> = {
  resolved: "approve",
  rejected: "reject",
  deferred: "snooze",
  open: "assign",
};

function textOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  // Price foundation lives under the accounting/pricing surface. Edit requires the
  // same decide permission used elsewhere; Auditor/Viewer roles lack it (read-only).
  const canAccess =
    actorCanAccessDepartment(actor, "accounting") || actorCanAccessDepartment(actor, "system");
  if (!canAccess || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse(
      {
        actor: serializeActor(actor),
        error: "forbidden",
        error_description: "This actor cannot resolve price foundation review items.",
      },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));

  const queue = body.queue as QueueType;
  if (!QUEUE_TYPES.includes(queue)) {
    return jsonApiResponse(
      { error: "invalid_queue", error_description: `queue must be one of ${QUEUE_TYPES.join(", ")}.` },
      { status: 400 },
    );
  }

  const status = body.status as ResolutionStatus;
  if (!RESOLUTION_STATUSES.includes(status)) {
    return jsonApiResponse(
      { error: "invalid_status", error_description: `status must be one of ${RESOLUTION_STATUSES.join(", ")}.` },
      { status: 400 },
    );
  }

  const sourceTable = textOrNull(body.sourceTable);
  const sourcePk = textOrNull(body.sourcePk);
  if (!sourceTable || !sourcePk) {
    return jsonApiResponse(
      { error: "missing_source", error_description: "sourceTable and sourcePk are required." },
      { status: 400 },
    );
  }

  const note = textOrNull(body.note);
  const resolution = textOrNull(body.resolution);
  const problemCategory = textOrNull(body.problemCategory);
  const deferUntil = status === "deferred" ? textOrNull(body.deferUntil) : null;

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse(
      { error: "supabase_unconfigured", error_description: config.missing.join(", ") },
      { status: 503 },
    );
  }

  const key = reviewKey(queue, sourceTable, sourcePk);
  const now = new Date().toISOString();
  const payload = {
    actor: serializeActor(actor),
    queue,
    reviewKey: key,
    resolution,
    resolutionStatus: status,
    sourcePk,
    sourceTable,
  };

  // 1. Immutable audit row (shared with Slack mirror + other dashboards).
  const { data: action, error: actionError } = await client
    .from("dashboard_action_log")
    .insert({
      action_type: `price_foundation_${status}`,
      actor_display_name: actor.displayName,
      actor_id: actor.id,
      actor_type: actor.type,
      decision: DECISION_BY_STATUS[status],
      department: "accounting",
      note,
      payload,
      source_pk: sourcePk,
      source_table: sourceTable,
      work_key: key,
      workflow: "price-foundation-review",
    })
    .select("id,created_at")
    .single();

  if (actionError) {
    return jsonApiResponse(
      { error: "action_log_failed", error_description: `dashboard_action_log: ${actionError.message}` },
      { status: 409 },
    );
  }

  // 2. Current-state overlay (latest decision wins, keyed by review_key).
  const { data: overlay, error: overlayError } = await client
    .from("price_foundation_review_actions")
    .upsert(
      {
        action_log_id: action?.id ?? null,
        defer_until: deferUntil,
        note,
        problem_category: problemCategory,
        queue_type: queue,
        resolution,
        resolution_status: status,
        reviewed_at: now,
        reviewed_by: actor.displayName,
        review_key: key,
        source_pk: sourcePk,
        source_table: sourceTable,
      },
      { onConflict: "review_key" },
    )
    .select("id,resolution_status,reviewed_at")
    .single();

  if (overlayError) {
    return jsonApiResponse(
      {
        error: "review_overlay_failed",
        error_description: `price_foundation_review_actions: ${overlayError.message}`,
        actionId: action?.id ?? null,
      },
      { status: 409 },
    );
  }

  return jsonApiResponse({
    action,
    overlay,
    reviewKey: key,
    status,
  });
};
