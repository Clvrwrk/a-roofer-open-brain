/**
 * acculynx-pending-write.ts
 *
 * Phase 5 Plan 03 — the RQ-1 enqueue-gap closure. This is the SINGLE shared module for:
 *  - buildPendingWriteRows(input): builds the acculynx_pending_write row + a dashboard_action_log
 *    mirror row from an agent-authored enqueue payload (mirrors agent-intake.ts's row builder).
 *  - mapPendingWriteToLiveWorkItem(row): the ONE mapper from an acculynx_pending_write row to a
 *    LiveWorkItem — imported by both live-work.ts (surface loader) and decision.ts (fallback
 *    lookup) so the display surface and the decision lookup can never diverge (T-05-17).
 *  - loadPendingAccuLynxWriteSurface(client): reads pending_review rows and maps them into
 *    LiveWorkItem[] for splicing into loadFreshCommandCenterSurface's aggregate.
 *
 * The 17-lane WriteLane enumeration mirrors supabase/functions/acculynx-write-action/action.ts's
 * LANES (Deno tier) and the 184 migration's lane CHECK constraint verbatim — this file cannot
 * import across the Deno/Node boundary, so the lane list is duplicated here as the source of
 * truth for the Command Center (Astro/Node) tier. Keep both lists in sync if a lane is added.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommandCenterActor } from "@lib/access-control";
import type { DepartmentId } from "@lib/cadence";
import type { LiveWorkItem } from "@lib/live-work";

export const WRITE_LANES = [
  "postContact",
  "postJob",
  "postJobPaymentReceived",
  "postJobPaymentExpense",
  "putJobAddress",
  "putJobInitialAppointment",
  "putJobInsurance",
  "putJobInsuranceCompany",
  "putJobLeadSource",
  "putJobPriority",
  "deleteJobArOwner",
  "deleteJobSalesOwner",
  "postWorksheetItem",
  "postJobMessage",
  "postJobPhotosVideos",
  "postJobRepresentativeCompany",
  "postJobExternalReference",
] as const;

export type WriteLane = (typeof WRITE_LANES)[number];

export type PendingWriteTargetEnv = "sandbox" | "prod";

export type PendingWriteStatus = "pending_review" | "approved" | "executed" | "rejected" | "failed";

/** Lane -> department mapping used to scope enqueue.ts's department gate and the pending-write
 * row's department column (RESEARCH: "department should come from the lane, not be hardcoded"). */
const LANE_DEPARTMENT: Record<WriteLane, DepartmentId> = {
  postContact: "sales",
  postJob: "sales",
  postJobPaymentReceived: "accounting",
  postJobPaymentExpense: "accounting",
  putJobAddress: "operations",
  putJobInitialAppointment: "operations",
  putJobInsurance: "operations",
  putJobInsuranceCompany: "operations",
  putJobLeadSource: "sales",
  putJobPriority: "operations",
  deleteJobArOwner: "accounting",
  deleteJobSalesOwner: "sales",
  postWorksheetItem: "accounting",
  postJobMessage: "operations",
  postJobPhotosVideos: "operations",
  postJobRepresentativeCompany: "operations",
  postJobExternalReference: "operations",
};

export function departmentForLane(lane: WriteLane): DepartmentId {
  return LANE_DEPARTMENT[lane] ?? "operations";
}

export interface AcculynxPendingWriteRow {
  id: number;
  work_key: string;
  lane: WriteLane;
  target_env: PendingWriteTargetEnv;
  account_key: string;
  endpoint: string;
  payload: Record<string, unknown>;
  dry_run_render: Record<string, unknown> | null;
  idempotency_key: string;
  status: PendingWriteStatus;
  approver: string | null;
  exec_result: Record<string, unknown> | null;
  department: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BuildPendingWriteInput {
  lane: WriteLane;
  accountKey: string;
  targetEnv: PendingWriteTargetEnv;
  payload: Record<string, unknown>;
  endpoint: string;
  idempotencyKey: string;
  workKey: string;
  actor: CommandCenterActor;
  dryRunRender?: Record<string, unknown> | null;
}

export interface BuildPendingWriteRowsResult {
  pendingWrite: Record<string, unknown>;
  actionLog: Record<string, unknown>;
}

/**
 * Builds the acculynx_pending_write row + a dashboard_action_log mirror row from an
 * enqueue payload. Mirrors agent-intake.ts's buildAgentIntakeRows shape (upsert + mirror-row).
 * Every pending write mirrors into dashboard_action_log at enqueue time (RQ-4) while its
 * authoritative row lives in acculynx_pending_write.
 */
export function buildPendingWriteRows(input: BuildPendingWriteInput): BuildPendingWriteRowsResult {
  const department = departmentForLane(input.lane);
  const isProd = input.targetEnv === "prod";

  const pendingWrite: Record<string, unknown> = {
    work_key: input.workKey,
    lane: input.lane,
    target_env: input.targetEnv,
    account_key: input.accountKey,
    endpoint: input.endpoint,
    payload: input.payload,
    dry_run_render: input.dryRunRender ?? null,
    idempotency_key: input.idempotencyKey,
    status: "pending_review",
    department,
    created_by: input.actor.id,
  };

  const actionLog: Record<string, unknown> = {
    work_key: input.workKey,
    department,
    workflow: "acculynx-write-action",
    action_type: "agent_enqueue",
    decision: null,
    actor_id: input.actor.id,
    actor_type: input.actor.type,
    actor_display_name: input.actor.displayName,
    note: `${isProd ? "PROD" : "sandbox"} AccuLynx write enqueued: ${input.lane} (${input.accountKey}).`,
    payload: {
      lane: input.lane,
      accountKey: input.accountKey,
      targetEnv: input.targetEnv,
      endpoint: input.endpoint,
      idempotencyKey: input.idempotencyKey,
    },
    source_table: "acculynx_pending_write",
    source_pk: input.workKey,
  };

  return { pendingWrite, actionLog };
}

function renderDryRunSummary(row: AcculynxPendingWriteRow): string[] {
  const isProd = row.target_env === "prod";
  const targetMarker = isProd ? "*** PROD TARGET ***" : "sandbox target";
  return [
    `Source row is live in acculynx_pending_write.`,
    `Lane: ${row.lane} / Account: ${row.account_key} / ${targetMarker}`,
    `Endpoint: ${row.endpoint}`,
    row.dry_run_render
      ? `Dry-run render: ${JSON.stringify(row.dry_run_render)}`
      : "Dry-run render not yet computed.",
    "Approving this item synchronously invokes the acculynx-write-action edge function with dryRun=false.",
    isProd
      ? "PROD TARGET: approving requires the approval.decide_prod_write permission (D-09 barrier #2)."
      : "Sandbox target: no additional prod-write permission required.",
  ];
}

/**
 * The SINGLE shared mapper from an acculynx_pending_write row to a LiveWorkItem. Both
 * live-work.ts (surface loader) and decision.ts (fallback lookup) call this — never
 * duplicate the mapping (T-05-17 / shared-mapper-drift mitigation).
 */
export function mapPendingWriteToLiveWorkItem(row: AcculynxPendingWriteRow): LiveWorkItem {
  const isProd = row.target_env === "prod";
  const workKey = `acculynx-write-action:${row.work_key}`;
  const department = (row.department as DepartmentId) ?? departmentForLane(row.lane);
  const title = `${isProd ? "PROD WRITE" : "AccuLynx write"} / ${row.lane}`;

  return {
    id: workKey,
    workKey,
    title,
    department,
    workflow: "acculynx-write-action",
    cadence: "ad-hoc" as LiveWorkItem["cadence"],
    owner: "@ob-conductor",
    primaryHuman: isProd ? "Chris" : "Roberto",
    nextRun: "Ready now",
    status: row.status === "pending_review" ? "needs_review" : row.status === "failed" ? "blocked" : "queued",
    priority: isProd ? "high" : "normal",
    approval: "before_write",
    auditorRequired: isProd,
    evidence: `${row.lane} / ${row.account_key} / ${row.target_env}`,
    action: "Approve/reject pending AccuLynx write",
    detail: `${title} — endpoint ${row.endpoint}. ${isProd ? "PROD target: requires prod-write permission before approve." : "Sandbox target."}`,
    href: `/system/actions?work=${encodeURIComponent(workKey)}`,
    sourceLabel: "AccuLynx pending write",
    sourceTable: "acculynx_pending_write",
    sourcePk: String(row.id),
    valueAtRisk: 0,
    auditTrail: renderDryRunSummary(row),
  };
}

/**
 * Reads acculynx_pending_write WHERE status = 'pending_review' and maps each row into a
 * LiveWorkItem. Executed/rejected rows are excluded — only pending_review rows render on
 * the dashboard (RQ-1 closes the enqueue gap: this is the new surface-loading branch).
 */
export async function loadPendingAccuLynxWriteSurface(
  client: SupabaseClient,
): Promise<{ items: LiveWorkItem[]; errors: string[] }> {
  const { data, error } = await client
    .from("acculynx_pending_write")
    .select(
      "id,work_key,lane,target_env,account_key,endpoint,payload,dry_run_render,idempotency_key,status,approver,exec_result,department,created_by,created_at,updated_at",
    )
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return { items: [], errors: [`acculynx_pending_write: ${error.message}`] };
  }

  const rows = (data ?? []) as AcculynxPendingWriteRow[];
  return { items: rows.map(mapPendingWriteToLiveWorkItem), errors: [] };
}
