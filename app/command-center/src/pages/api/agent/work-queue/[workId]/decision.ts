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
import {
  mapPendingWriteToLiveWorkItem,
  type AcculynxPendingWriteRow,
} from "@lib/acculynx-pending-write";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv } from "@lib/runtime-env";

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

const ACCULYNX_WRITE_ACTION_PREFIX = "acculynx-write-action:";

/**
 * Fetch the full acculynx_pending_write row directly (bypassing the cached surface for
 * freshness) so both the acculynx-write-action:* fallback lookup AND the edge-function
 * invocation can share ONE source row — the edge invoke sends the COMPLETE body (lane,
 * accountKey, targetEnv, payload, idempotencyKey) from this exact row, never a
 * workKey-only body (Plan 01 contract: the edge function parses these directly from the
 * request body and does not look up the row itself by workKey).
 */
async function loadPendingWriteSourceRow(workKey: string): Promise<AcculynxPendingWriteRow | null> {
  const { client } = createServerSupabaseClient(getRuntimeEnv());
  if (!client) return null;

  const { data, error } = await client
    .from("acculynx_pending_write")
    .select(
      "id,work_key,lane,target_env,account_key,endpoint,payload,dry_run_render,idempotency_key,status,approver,exec_result,department,created_by,created_at,updated_at",
    )
    .eq("work_key", workKey)
    .maybeSingle();

  if (error || !data) return null;
  return data as AcculynxPendingWriteRow;
}

/**
 * acculynx-write-action:* fallback lookup — mirrors loadFallbackWorkItem's price-gap
 * pattern. Bypasses the cached surface for freshness, and maps via the SHARED
 * mapPendingWriteToLiveWorkItem (T-05-17: never duplicate the mapper).
 */
async function loadFallbackAcculynxWriteItem(decodedWorkId: string): Promise<LiveWorkItem | null> {
  if (!decodedWorkId.startsWith(ACCULYNX_WRITE_ACTION_PREFIX)) return null;

  const workKey = decodedWorkId.slice(ACCULYNX_WRITE_ACTION_PREFIX.length);
  const row = await loadPendingWriteSourceRow(workKey);
  return row ? mapPendingWriteToLiveWorkItem(row) : null;
}

interface EdgeInvokeResult {
  invoked: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}

/**
 * Synchronously invoke the acculynx-write-action edge function with the FULL request
 * body (OQ-3: no async/polling). The edge function self-persists to
 * acculynx_pending_write.status/exec_result and acculynx_write_action_log — this
 * function reflects the returned status, it does not re-persist (Plan 01 Task 3).
 */
async function invokeAcculynxWriteActionEdge(
  row: AcculynxPendingWriteRow,
  approver: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<EdgeInvokeResult> {
  const env = getRuntimeEnv();
  const supabaseUrl = (env.SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { invoked: false, error: "Supabase not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" };
  }

  const body = {
    lane: row.lane,
    accountKey: row.account_key,
    targetEnv: row.target_env,
    payload: row.payload,
    dryRun: false,
    workKey: row.work_key,
    idempotencyKey: row.idempotency_key,
    // Record WHO approved this execute (SC2 / T-05-23): the edge writes it to
    // acculynx_pending_write.approver and acculynx_write_action_log.actor.
    approver,
  };

  try {
    const res = await fetchImpl(`${supabaseUrl}/functions/v1/acculynx-write-action`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { invoked: true, status: res.status, body: json };
  } catch (error) {
    return { invoked: false, error: error instanceof Error ? error.message : "edge_fetch_failed" };
  }
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const surface = await loadCommandCenterSurface();
  const decodedWorkId = params.workId ? decodeURIComponent(params.workId) : "";
  let work = surface.items.find((candidate) => candidate.workKey === decodedWorkId || candidate.id === decodedWorkId) ?? null;
  work ??= await loadFallbackWorkItem(decodedWorkId);
  work ??= await loadFallbackAcculynxWriteItem(decodedWorkId);
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

  const isAcculynxWriteAction = work.workflow === "acculynx-write-action";
  const isApprove = decision === "approve";

  // Resolve the full acculynx_pending_write source row up front (reused for both the D-09
  // barrier #2 permission check below and the edge-function invocation after the decision
  // is recorded) — this is the SAME source row that supplied lane/accountKey/targetEnv/payload
  // to mapPendingWriteToLiveWorkItem, so barrier #2's target check and the eventual edge
  // request body can never diverge.
  const pendingWriteRow = isAcculynxWriteAction
    ? await loadPendingWriteSourceRow(work.workKey.slice(ACCULYNX_WRITE_ACTION_PREFIX.length))
    : null;

  // D-09 barrier #2: a prod-target acculynx-write-action item cannot be approved unless
  // the approver holds approval.decide_prod_write — enforced BEFORE any fetch, independent
  // of the edge function's own assertTarget (barrier #1).
  const isProdTarget = pendingWriteRow?.target_env === "prod";
  if (isAcculynxWriteAction && isApprove && isProdTarget && !hasPermission(actor, "approval.decide_prod_write")) {
    return jsonApiResponse(
      {
        error: "forbidden",
        error_description:
          "Approving a prod-target AccuLynx write requires the approval.decide_prod_write permission (D-09 barrier #2).",
        actor: serializeActor(actor),
      },
      { status: 403 },
    );
  }

  const result = await recordLiveWorkDecision(work, actor, decision, note, {
    actionIntent: typeof payload.intent === "string" ? payload.intent : null,
    actionLabel: typeof payload.label === "string" ? payload.label : null,
    nextStep: typeof payload.nextStep === "string" ? payload.nextStep : null,
  });

  // Synchronous edge-function invocation on approve only (SC4, OQ-3: no async/polling).
  // The edge function self-persists status/exec_result to acculynx_pending_write and the
  // audit row to acculynx_write_action_log — this endpoint reflects the returned status,
  // it does not re-persist.
  const approverIdentity = actor.email ?? actor.displayName ?? actor.id;
  let edgeInvocation: EdgeInvokeResult | null = null;
  if (isAcculynxWriteAction && isApprove) {
    edgeInvocation = pendingWriteRow
      ? await invokeAcculynxWriteActionEdge(pendingWriteRow, approverIdentity)
      : { invoked: false, error: "pending_write_row_not_found" };
  }

  // Reject closes the pending write (finding #2): the edge is never invoked on reject, so
  // nothing else transitions the row off pending_review — do it here. The schema already
  // permits the 'rejected' status; without this a rejected write lingers and could be
  // re-approved. Record the rejecter as the approver for a complete decision trail.
  if (isAcculynxWriteAction && decision === "reject" && pendingWriteRow) {
    try {
      const { client } = createServerSupabaseClient(getRuntimeEnv());
      if (client) {
        const { error: rejectError } = await client
          .from("acculynx_pending_write")
          .update({ status: "rejected", approver: approverIdentity, updated_at: new Date().toISOString() })
          .eq("work_key", pendingWriteRow.work_key);
        if (rejectError) {
          console.error("[work-queue/decision] pending-write reject-close failed:", rejectError.message);
        }
      }
    } catch (error) {
      console.error(
        "[work-queue/decision] pending-write reject-close threw:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return jsonApiResponse({
    status: "accepted",
    persistence: "supabase",
    action: result.action,
    memory: result.memory,
    workItem: result.workItem,
    item: serializeLiveWorkQueueItem(work, actor),
    edgeInvocation: edgeInvocation ?? undefined,
    next: {
      approve: isAcculynxWriteAction
        ? "Human approval accepted; the acculynx-write-action edge function was invoked synchronously (dryRun=false)."
        : "Human approval accepted; the owning agent may resume the run.",
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
