// POST /api/invoice-audit/process-stamp
// Invoice Audit v2 (docs/81 decision 9): the Process button is a pure status stamp —
// every invoice in 'invoice_audit_pending' flips to 'invoice_audit_complete' with a
// completion date. No CSV export, no payment side effects (those moved to the weekly
// INV-PROCESSED file, docs/81 decision 2).

import type { APIRoute } from "astro";
import { logDashboardAction, requireActor, requireSupabaseClient } from "@lib/api-guards";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const { actor, response: authError } = requireActor(locals, { department: "accounting", permission: "approval.decide", forbiddenMessage: "This actor cannot stamp audits complete." });
  if (!actor) return authError;

  const { client, response: supabaseError } = requireSupabaseClient();
  if (!client) return supabaseError;

  const { data, error } = await client.rpc("invoice_audit_process_stamp", { p_actor: actor.displayName });
  if (error) return jsonApiResponse({ error: "process_stamp", error_description: error.message }, { status: 409 });
  const stamped = Number(data ?? 0);

  await logDashboardAction(client, actor, {
    action_type: "invoice_audit_process_stamp",
    decision: "mark_done",
    department: "accounting",
    payload: { stamped },
    source_table: "invoice_pipeline_status",
    workflow: "invoice-audit-v2",
  });

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({ stamped });
};
