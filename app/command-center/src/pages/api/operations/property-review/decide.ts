// POST /api/operations/property-review/decide
//   { jobId, decision: "link"|"source_fix"|"dismiss"|"reopen", propertyId?, correctedAddress?, note? }
// Records a person's call on one acculynx_job_property_review row (docs/117). The write and
// the dashboard_action_log entry happen inside record_acculynx_job_property_decision()
// (migration 312) so they cannot drift apart. approval.decide keeps service tokens out:
// these decisions are logged as human, instruction-grade (hard rule 4).

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { decisionErrorMessage, parseDecisionBody } from "@lib/property-review";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "operations") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This account cannot record property review decisions." }, { status: 403 });
  }
  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const parsed = parseDecisionBody(await request.json().catch(() => ({})));
  if (!parsed.ok) return jsonApiResponse({ error: "invalid_request", error_description: parsed.error }, { status: 400 });
  const d = parsed.value;

  const { data, error } = await client.rpc("record_acculynx_job_property_decision", {
    p_job_id: d.jobId,
    p_decision: d.decision,
    p_property_id: d.propertyId,
    p_corrected_address: d.correctedAddress,
    p_note: d.note,
    p_actor_id: actor.id,
    p_actor_name: actor.displayName,
  });
  if (error) {
    return jsonApiResponse({ error: "write_failed", error_description: decisionErrorMessage(null) }, { status: 500 });
  }
  const result = (data ?? {}) as { ok?: boolean; error?: string; status?: string };
  if (!result.ok) {
    const status = result.error === "review_row_not_found" || result.error === "property_not_found" ? 404 : 409;
    return jsonApiResponse({ error: result.error ?? "rejected", error_description: decisionErrorMessage(result.error) }, { status });
  }
  return jsonApiResponse({
    ok: true,
    jobId: d.jobId,
    decision: d.decision,
    status: result.status,
    decidedBy: actor.displayName,
    decidedAt: new Date().toISOString(),
  });
};
