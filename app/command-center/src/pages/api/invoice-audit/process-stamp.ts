// POST /api/invoice-audit/process-stamp
// Invoice Audit v2 (docs/81 decision 9): the Process button is a pure status stamp —
// every invoice in 'invoice_audit_pending' flips to 'invoice_audit_complete' with a
// completion date. No CSV export, no payment side effects (those moved to the weekly
// INV-PROCESSED file, docs/81 decision 2).

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { reportWriteFailure } from "@lib/supabase-write";

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot stamp audits complete." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const { data, error } = await client.rpc("invoice_audit_process_stamp", { p_actor: actor.displayName });
  if (error) return jsonApiResponse({ error: "process_stamp", error_description: error.message }, { status: 409 });
  const stamped = Number(data ?? 0);

  const { error: logError } = await client.from("dashboard_action_log").insert({
    action_type: "invoice_audit_process_stamp",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision: "mark_done",
    department: "accounting",
    payload: { stamped },
    source_table: "invoice_pipeline_status",
    workflow: "invoice-audit-v2",
  });
  reportWriteFailure("invoice-audit/process-stamp dashboard_action_log", logError);

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({ stamped });
};
