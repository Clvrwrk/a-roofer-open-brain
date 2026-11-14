/**
 * Enqueue a Linear-triggered agent pickup as a dashboard_work_items row (department=system).
 * Idempotent on the Linear delivery id. Queue-only lanes are marked so no runner starts a paid session.
 */
import type { DispatchDecision } from "@lib/linear-agent-dispatch";
import { createServerSupabaseClient } from "@lib/supabase.server";

type Dispatch = Extract<DispatchDecision, { kind: "dispatch" }>;

export function buildDispatchWorkItem(d: Dispatch, deliveryId: string) {
  return {
    work_key: `dev:linear-dispatch:${d.issueId}:${deliveryId}`,
    department: "system",
    workflow: "linear-agent-dispatch",
    source_system: "linear",
    source_table: "linear_webhooks",
    source_pk: deliveryId,
    title: `Agent pickup (${d.trigger}) → lane:${d.lane}`,
    summary: d.paidSession
      ? `Linear ${d.trigger} on issue ${d.issueId}; lane ${d.lane} should pick it up.`
      : `Linear ${d.trigger} on issue ${d.issueId}; lane ${d.lane} is queue-only — no paid session is started.`,
    priority: "normal",
    status: "open",
    approval_required: false,
    assigned_to: `lane:${d.lane}`,
    value_at_risk: 0,
    evidence: [],
    source_data: { ...d, deliveryId, queueOnly: !d.paidSession },
  };
}

export async function enqueueAgentDispatch(d: Dispatch, deliveryId: string) {
  const row = buildDispatchWorkItem(d, deliveryId);
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("dashboard_work_items").upsert(row, { onConflict: "work_key", ignoreDuplicates: true });
  if (error) throw new Error(`enqueue failed: ${error.message}`);
  return { workKey: row.work_key };
}
