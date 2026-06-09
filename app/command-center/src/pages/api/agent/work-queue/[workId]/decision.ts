import type { APIRoute } from "astro";
import {
  actorCanAccessDepartment,
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
  type WorkQueueDecision,
} from "@lib/access-control";
import { formatCurrency, loadAgreementGapSurface, type AgreementGapRow } from "@lib/abc-price-gaps";
import { jsonApiResponse } from "@lib/agent-api";
import {
  loadCommandCenterSurface,
  recordLiveWorkDecision,
  serializeLiveWorkQueueItem,
  type LiveWorkItem,
  type LiveWorkPriority,
} from "@lib/live-work";

export const prerender = false;

const WORK_QUEUE_DECISIONS: WorkQueueDecision[] = [
  "approve",
  "reject",
  "needs_more_evidence",
  "resume_agent",
  "assign",
  "snooze",
  "mark_done",
  "external_sent",
  "external_received",
];

function isWorkQueueDecision(value: unknown): value is WorkQueueDecision {
  return typeof value === "string" && WORK_QUEUE_DECISIONS.includes(value as WorkQueueDecision);
}

function priorityForGap(row: AgreementGapRow): LiveWorkPriority {
  if (row.severity === "critical") return "critical";
  if (row.severity === "blocked") return "high";
  return "normal";
}

function statusForPriority(priority: LiveWorkPriority): LiveWorkItem["status"] {
  return priority === "critical" ? "blocked" : "needs_review";
}

function buildPriceGapWorkItem(row: AgreementGapRow): LiveWorkItem {
  const priority = priorityForGap(row);
  const valueAtRisk = Math.abs(row.variance ?? 0) * Math.max(row.quantity ?? 1, 1);
  const workKey = `accounting:price-gap:${row.id}`;

  return {
    action: "Resolve price authority",
    approval: "before_write",
    auditTrail: [
      "Source row resolved from the live ABC price gap surface.",
      row.evidenceStatusLabel,
      `Invoice price: ${formatCurrency(row.invoicePrice)}; reference price: ${formatCurrency(row.referencePrice)}.`,
      `Branch/region: ${row.branchNumber} / ${row.branchRegion}.`,
      "Product identity is mandatory before price approval.",
      "Products is the final branch pricing catalog after Lucinda approval.",
    ],
    auditorRequired: priority !== "normal",
    cadence: "daily",
    department: "accounting",
    detail: row.humanAction,
    evidence: `${row.vendorName} / ${row.invoiceNumber} / ${row.itemNumber} / ${row.evidenceStatusLabel}`,
    href: `/accounting/invoices?invoice=${encodeURIComponent(row.invoiceNumber)}`,
    id: `price-gap:${row.id}`,
    nextRun: row.invoiceDate ?? "Ready now",
    owner: "@ob-accounting",
    primaryHuman: "Lucinda",
    priority,
    sourceLabel: "ABC price gap",
    sourcePk: row.id,
    sourceTable: "abc_invoice_lines",
    status: statusForPriority(priority),
    title: `Price gap / ${row.invoiceNumber} / ${row.itemNumber}`,
    valueAtRisk,
    workflow: "price-agreement-gap",
    workKey,
  };
}

async function loadFallbackWorkItem(decodedWorkId: string): Promise<LiveWorkItem | null> {
  const prefix = "accounting:price-gap:";
  if (!decodedWorkId.startsWith(prefix)) return null;

  const rowId = decodedWorkId.slice(prefix.length);
  const gapSurface = await loadAgreementGapSurface();
  const row = gapSurface.rows.find((candidate) => candidate.id === rowId);
  return row ? buildPriceGapWorkItem(row) : null;
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const surface = await loadCommandCenterSurface();
  const decodedWorkId = params.workId ? decodeURIComponent(params.workId) : "";
  let work = surface.items.find((candidate) => candidate.workKey === decodedWorkId || candidate.id === decodedWorkId) ?? null;
  work ??= await loadFallbackWorkItem(decodedWorkId);
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
        error_description: `decision must be one of: ${WORK_QUEUE_DECISIONS.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const allowedDecisions: WorkQueueDecision[] = [];
  if (work.approval !== "none" && hasPermission(actor, "approval.decide")) allowedDecisions.push("approve", "reject");
  if (hasPermission(actor, "approval.decide")) allowedDecisions.push("assign", "snooze", "mark_done", "external_sent", "external_received");
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

  const result = await recordLiveWorkDecision(work, actor, decision, note, {
    actionIntent: typeof payload.intent === "string" ? payload.intent : null,
    actionLabel: typeof payload.label === "string" ? payload.label : null,
    nextStep: typeof payload.nextStep === "string" ? payload.nextStep : null,
  });

  return jsonApiResponse({
    status: "accepted",
    persistence: "supabase",
    action: result.action,
    memory: result.memory,
    workItem: result.workItem,
    item: serializeLiveWorkQueueItem(work, actor),
    next: {
      approve: "Human approval accepted; the owning agent may resume the run.",
      reject: "Human rejection accepted; the owning agent should close or rework the packet.",
      needs_more_evidence: "Evidence request accepted; the owning agent should attach more support.",
      resume_agent: "Agent resume signal accepted; the runtime may continue from the last approved gate.",
      assign: "Assignment accepted; Conductor should route the work to the named owner.",
      snooze: "Snooze accepted; the owning agent should suppress this item until the next evidence change.",
      mark_done: "Completion accepted; the owning agent should close the work item.",
      external_sent: "External-send confirmation accepted; the owning agent should track the outside-party response.",
      external_received: "External-received confirmation accepted; the owning agent should release the next internal gate.",
    }[decision],
  });
};
