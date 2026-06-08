import type { APIRoute } from "astro";
import {
  actorCanAccessDepartment,
  buildUnauthorizedResponse,
  hasPermission,
  resolveCommandCenterActor,
  serializeActor,
  type WorkQueueDecision,
} from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadCommandCenterSurface, recordLiveWorkDecision, serializeLiveWorkQueueItem } from "@lib/live-work";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

function isWorkQueueDecision(value: unknown): value is WorkQueueDecision {
  return (
    value === "approve" ||
    value === "reject" ||
    value === "needs_more_evidence" ||
    value === "resume_agent"
  );
}

export const POST: APIRoute = async ({ request, params }) => {
  const actor = resolveCommandCenterActor(request, getRuntimeEnv());
  if (!actor) return buildUnauthorizedResponse();

  const surface = await loadCommandCenterSurface();
  const decodedWorkId = params.workId ? decodeURIComponent(params.workId) : "";
  const work = surface.items.find((candidate) => candidate.workKey === decodedWorkId || candidate.id === decodedWorkId);
  if (!work) {
    return jsonApiResponse(
      {
        error: "not_found",
        error_description: `No work queue item found for ${params.workId}.`,
      },
      { status: 404 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const decision = payload.decision;
  const note = typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : null;

  if (!isWorkQueueDecision(decision)) {
    return jsonApiResponse(
      {
        error: "invalid_decision",
        error_description:
          "decision must be approve, reject, needs_more_evidence, or resume_agent.",
      },
      { status: 400 },
    );
  }

  const allowedDecisions: WorkQueueDecision[] = [];
  if (work.approval !== "none" && hasPermission(actor, "approval.decide")) allowedDecisions.push("approve", "reject");
  if (hasPermission(actor, "approval.request_more_evidence")) allowedDecisions.push("needs_more_evidence");
  if (hasPermission(actor, "agent.resume")) allowedDecisions.push("resume_agent");

  if (!actorCanAccessDepartment(actor, work.department) || !allowedDecisions.includes(decision)) {
    return jsonApiResponse(
      {
        error: "forbidden",
        error_description: "This actor cannot submit that decision for this queue item.",
        actor: serializeActor(actor),
        allowedDecisions,
      },
      { status: 403 },
    );
  }

  const result = await recordLiveWorkDecision(work, actor, decision, note);

  return jsonApiResponse({
    status: "accepted",
    persistence: "supabase",
    action: result.action,
    workItem: result.workItem,
    item: serializeLiveWorkQueueItem(work, actor),
    next: {
      approve: "Human approval accepted; the owning agent may resume the run.",
      reject: "Human rejection accepted; the owning agent should close or rework the packet.",
      needs_more_evidence: "Evidence request accepted; the owning agent should attach more support.",
      resume_agent: "Agent resume signal accepted; the runtime may continue from the last approved gate.",
    }[decision],
  });
};
