// POST /api/invoice-audit/return-batch
// Undo / payment reversal. Moves a batch (or invoice list) from exported|paid
// back to 'returned', which makes the invoices eligible for the To-Be-Paid
// queue again. Any paid signal we set on invoice_documents is reverted.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission, serializeActor } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";
import { type PaymentActionInput, resolveTargetInvoiceNumbers } from "@lib/invoice-payment-targets";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot return invoice payments." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as PaymentActionInput;
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  const { batchId, invoiceNumbers, error: resolveError } = await resolveTargetInvoiceNumbers(client, body, ["exported", "paid"]);
  if (resolveError) return jsonApiResponse({ error: "invoice_payment_processed", error_description: resolveError }, { status: 409 });
  if (!invoiceNumbers.length) {
    return jsonApiResponse({ error: "nothing_to_return", error_description: "No exported or paid invoices match this request." }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const { error: ledgerError } = await client
    .from("invoice_payment_processed")
    .update({
      paid_at: null,
      paid_confirmed_actor: null,
      paid_confirmed_by: null,
      paid_source: null,
      reconciled_at: null,
      returned_at: nowIso,
      returned_reason: reason,
      status: "returned",
      updated_at: nowIso,
    })
    .in("invoice_number", invoiceNumbers)
    .in("status", ["exported", "paid"]);
  if (ledgerError) return jsonApiResponse({ error: "invoice_payment_processed", error_description: ledgerError.message }, { status: 409 });

  // Only revert docs we (or a prior confirm) set to paid; leave pending/blocked alone.
  const { error: docError } = await client
    .from("invoice_documents")
    .update({ gate_override: false, paid_at: null, payment_status: "pending" })
    .in("invoice_number", invoiceNumbers)
    .eq("payment_status", "paid");
  if (docError) return jsonApiResponse({ error: "invoice_documents", error_description: docError.message }, { status: 409 });

  await client.from("dashboard_action_log").insert({
    action_type: "invoice_payment_returned",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision: "reopen",
    department: "accounting",
    note: reason,
    payload: { actor: serializeActor(actor), batchId, invoiceNumbers },
    source_pk: batchId,
    source_table: "invoice_payment_processed",
    workflow: "invoice-payment-export",
  });

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({ batchId, invoiceNumbers, returned: invoiceNumbers.length, status: "returned" });
};
