import type { APIRoute } from "astro";
import {
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
} from "@lib/access-control";
import { buildAgentIntakeRows, type AgentIntakeMessage } from "@lib/agent-intake";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

/** POST /api/agent/intake
 *
 * Maya (ob-accounting service agent) posts here after classifying a Gmail
 * message.  We upsert a dashboard_work_items row and append a
 * dashboard_action_log row.  Returns the work item id so the agent can
 * thread later evidence attachments.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  // Only service agents and named agents in the accounting department may create intake items.
  if (
    actor.type !== "service_agent" &&
    actor.type !== "named_agent" &&
    actor.type !== "local_operator"
  ) {
    return jsonApiResponse(
      { error: "forbidden", error_description: "Only agent actors may create intake items." },
      { status: 403 },
    );
  }

  if (
    actor.departmentAccess !== "all" &&
    !actor.departmentAccess.includes("accounting")
  ) {
    return jsonApiResponse(
      { error: "forbidden", error_description: "This actor does not have access to accounting intake." },
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
  const required: Array<keyof AgentIntakeMessage> = [
    "messageId",
    "alias",
    "classification",
    "subject",
    "from",
    "receivedAt",
  ];
  for (const key of required) {
    if (!payload[key]) {
      return jsonApiResponse(
        { error: "invalid_body", error_description: `Missing required field: ${key}.` },
        { status: 400 },
      );
    }
  }

  const msg: AgentIntakeMessage = {
    messageId: String(payload.messageId),
    alias: String(payload.alias),
    classification: String(payload.classification),
    subject: String(payload.subject),
    from: String(payload.from),
    receivedAt: String(payload.receivedAt),
    attachments: Array.isArray(payload.attachments) ? payload.attachments.map(String) : [],
    gmailLabels: Array.isArray(payload.gmailLabels) ? payload.gmailLabels.map(String) : [],
    slackChannelId: typeof payload.slackChannelId === "string" ? payload.slackChannelId : "",
    slackThreadTs: typeof payload.slackThreadTs === "string" ? payload.slackThreadTs : "",
  };

  const { rows } = { rows: buildAgentIntakeRows(msg, actor) };
  const env = getRuntimeEnv();
  const { client, config } = createServerSupabaseClient(env);

  if (!client) {
    return jsonApiResponse(
      { error: "service_unavailable", error_description: `Supabase not configured: ${config.missing.join(", ")}.` },
      { status: 503 },
    );
  }

  // Upsert work item.
  const { data: workItem, error: wiError } = await client
    .from("dashboard_work_items")
    .upsert(rows.workItem as Record<string, unknown>, { onConflict: "work_key" })
    .select("id, work_key, status, created_at, updated_at")
    .single();

  if (wiError) {
    return jsonApiResponse(
      { error: "database_error", error_description: wiError.message },
      { status: 500 },
    );
  }

  // Append action log.
  const actionLogRow = { ...rows.actionLog, work_item_id: workItem?.id ?? null };
  const { data: actionLog, error: alError } = await client
    .from("dashboard_action_log")
    .insert(actionLogRow)
    .select("id, created_at")
    .single();

  if (alError) {
    // Non-fatal: work item was created, log failed.
    console.error("[agent-intake] dashboard_action_log insert failed:", alError.message);
  }

  return jsonApiResponse({
    status: "accepted",
    workItem: {
      id: workItem?.id,
      work_key: workItem?.work_key,
      status: workItem?.status,
      created_at: workItem?.created_at,
      updated_at: workItem?.updated_at,
    },
    actionLog: actionLog ? { id: actionLog.id, created_at: actionLog.created_at } : null,
    actor: serializeActor(actor),
    next: "Work item created. Post evidence attachments via POST /api/agent/work-queue/:workKey/evidence, or request human review via the Command Center.",
  });
};
