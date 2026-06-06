import type { APIRoute } from "astro";
import {
  buildUnauthorizedResponse,
  canSubmitDecision,
  getAllowedDecisions,
  resolveCommandCenterActor,
  serializeActor,
  type WorkQueueDecision,
} from "@lib/access-control";
import { buildDecisionAuditEvent, jsonApiResponse, serializeWorkQueueItem } from "@lib/agent-api";
import { workDefinitions } from "@lib/cadence";
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

  const work = workDefinitions.find((candidate) => candidate.id === params.workId);
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

  if (!canSubmitDecision(actor, work, decision)) {
    return jsonApiResponse(
      {
        error: "forbidden",
        error_description: "This actor cannot submit that decision for this queue item.",
        actor: serializeActor(actor),
        allowedDecisions: getAllowedDecisions(actor, work),
      },
      { status: 403 },
    );
  }

  const auditEvent = buildDecisionAuditEvent(work, actor, decision, note);

  return jsonApiResponse({
    status: "accepted",
    persistence: "phase_1_ephemeral",
    auditEvent,
    item: serializeWorkQueueItem(work, actor),
    next: {
      approve: "Human approval accepted; the owning agent may resume the run.",
      reject: "Human rejection accepted; the owning agent should close or rework the packet.",
      needs_more_evidence: "Evidence request accepted; the owning agent should attach more support.",
      resume_agent: "Agent resume signal accepted; the runtime may continue from the last approved gate.",
    }[decision],
  });
};
