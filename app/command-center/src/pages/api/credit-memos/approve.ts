// POST /api/credit-memos/approve { invoiceNumber, approve }
// Invoice Audit v2 R2 (docs/82): the human approval that admits an invoice's credit-memo
// request into this week's vendor email. draft -> approved (approve=true) or
// approved -> draft (approve=false). Once a request is 'sent' it is immutable here.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot approve credit memos." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { invoiceNumber?: string; approve?: boolean };
  const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  const approve = body.approve !== false;
  if (!invoiceNumber) return jsonApiResponse({ error: "invalid_request", error_description: "invoiceNumber is required." }, { status: 400 });

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("credit_memo_requests")
    .update(approve
      ? { status: "approved", approved_by: actor.displayName, approved_at: nowIso, updated_at: nowIso }
      : { status: "draft", approved_by: null, approved_at: null, updated_at: nowIso })
    .eq("invoice_number", invoiceNumber)
    .eq("request_kind", "requested")
    .eq("status", approve ? "draft" : "approved")
    .select("invoice_number, status");
  if (error) return jsonApiResponse({ error: "credit_memo_requests", error_description: error.message }, { status: 409 });
  if (!data?.length) {
    return jsonApiResponse({ error: "not_actionable", error_description: approve ? "No draft credit memo request for this invoice." : "No approved (un-sent) credit memo request for this invoice." }, { status: 409 });
  }

  await client.from("dashboard_action_log").insert({
    action_type: approve ? "credit_memo_approved" : "credit_memo_unapproved",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision: approve ? "approve" : "return",
    department: "accounting",
    payload: { invoiceNumber },
    source_pk: invoiceNumber,
    source_table: "credit_memo_requests",
    workflow: "invoice-audit-v2",
  });

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({ invoiceNumber, status: data[0].status });
};
