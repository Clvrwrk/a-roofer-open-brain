// POST /api/credit-memos/receipt-review { cmInvoiceNumber, action: "approve"|"rerequest", note? }
// Docs/87: a vendor credit memo arrived but didn't exactly match an open request
// (credit_memo_receipts.review_status = 'pending'). Approve = accept the credit
// as satisfying its closest request (marks the request received/satisfied).
// Re-request = keep our request open (it stays in the weekly vendor email).

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot review credit memo receipts." }, { status: 403 });
  }
  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { cmInvoiceNumber?: string; action?: string; note?: string };
  const cmInvoiceNumber = typeof body.cmInvoiceNumber === "string" ? body.cmInvoiceNumber.trim() : "";
  const action = body.action === "approve" || body.action === "rerequest" ? body.action : "";
  if (!cmInvoiceNumber || !action) {
    return jsonApiResponse({ error: "invalid_request", error_description: "cmInvoiceNumber and action (approve|rerequest) are required." }, { status: 400 });
  }

  // Silo (docs/87): refuse a cross-vendor CM-number collision rather than
  // reviewing whichever row matches first.
  const { data: pendRows } = await client
    .from("credit_memo_receipts")
    .select("vendor_slug")
    .eq("cm_invoice_number", cmInvoiceNumber)
    .eq("review_status", "pending")
    .limit(2);
  const pendVendors = [...new Set(((pendRows as any[] | null) ?? []).map((r) => String(r.vendor_slug)))];
  if (pendVendors.length > 1) {
    return jsonApiResponse({ error: "ambiguous_vendor", error_description: `Credit memo ${cmInvoiceNumber} is pending for ${pendVendors.join(" and ")} — vendor disambiguation required.` }, { status: 409 });
  }
  const { data: receipt, error: rErr } = await client
    .from("credit_memo_receipts")
    .update({
      review_status: action === "approve" ? "approved" : "rerequest",
      reviewed_by: actor.displayName,
      reviewed_at: new Date().toISOString(),
      review_note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    })
    .eq("cm_invoice_number", cmInvoiceNumber)
    .eq("review_status", "pending")
    .select("cm_invoice_number, matched_request_id, cm_total")
    .single();
  if (rErr || !receipt) {
    return jsonApiResponse({ error: "not_pending", error_description: rErr?.message ?? "Receipt is not pending review." }, { status: 409 });
  }

  if (action === "approve" && receipt.matched_request_id) {
    await client
      .from("credit_memo_requests")
      .update({
        status: "received",
        received_at: new Date().toISOString(),
        received_by: actor.displayName,
        external_credit_memo_number: cmInvoiceNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receipt.matched_request_id)
      .in("status", ["approved", "sent"]);
  }

  await client.from("dashboard_action_log").insert({
    work_key: `cm-receipt:${cmInvoiceNumber}`,
    action_type: "credit_memo_receipt_reviewed",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision: action === "approve" ? "approve" : "reject",
    department: "accounting",
    payload: { cmInvoiceNumber, action, matchedRequestId: receipt.matched_request_id, cmTotal: receipt.cm_total },
    source_pk: cmInvoiceNumber,
    source_table: "credit_memo_receipts",
    workflow: "credit-memo-reconcile",
  });

  return jsonApiResponse({ cmInvoiceNumber, action, requestSatisfied: action === "approve" && !!receipt.matched_request_id });
};
