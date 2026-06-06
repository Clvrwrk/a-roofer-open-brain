import type { WorkDefinition } from "@lib/cadence";
import { formatApproval, formatStatus, getCadence, getDepartment } from "@lib/cadence";
import {
  getAllowedDecisions,
  type CommandCenterActor,
  type WorkQueueDecision,
} from "@lib/access-control";

export function jsonApiResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

export function serializeWorkQueueItem(work: WorkDefinition, actor: CommandCenterActor) {
  const department = getDepartment(work.department);
  const cadence = getCadence(work.cadence);
  const allowedDecisions = getAllowedDecisions(actor, work);

  return {
    id: work.id,
    title: work.title,
    department: work.department,
    departmentLabel: department?.label ?? work.department,
    cadence: work.cadence,
    cadenceLabel: cadence?.label ?? work.cadence,
    owner: work.owner,
    nextRun: work.nextRun,
    status: work.status,
    statusLabel: formatStatus(work.status),
    approval: work.approval,
    approvalLabel: formatApproval(work.approval),
    auditorRequired: work.auditorRequired,
    evidence: work.evidence,
    action: work.action,
    detail: work.detail,
    auditTrail: work.auditTrail,
    allowedDecisions,
    requiresHumanApproval: work.approval !== "none",
  };
}

export function buildDecisionAuditEvent(
  work: WorkDefinition,
  actor: CommandCenterActor,
  decision: WorkQueueDecision,
  note: string | null,
) {
  return {
    event: "work_queue.decision.accepted",
    workId: work.id,
    decision,
    note,
    actor: {
      id: actor.id,
      type: actor.type,
      source: actor.source,
      roles: actor.roles,
    },
    timestamp: new Date().toISOString(),
  };
}
