// POST /api/invoice-audit/confirm-paid
// Phase 2: a human confirms an exported batch (or invoice list) actually paid.
// Flips the ledger exported -> paid (paid_source='manual') and sets the
// canonical paid signal on invoice_documents (mirrors mark-paid.ts). Reconcile
// (ABC AR sync) is the automated counterpart that does the same transition.

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
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot confirm invoice payments." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as PaymentActionInput;
  const note = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  const { batchId, invoiceNumbers, error: resolveError } = await resolveTargetInvoiceNumbers(client, body, ["exported"]);
  if (resolveError) return jsonApiResponse({ error: "invoice_payment_processed", error_description: resolveError }, { status: 409 });
  if (!invoiceNumbers.length) {
    return jsonApiResponse({ error: "nothing_to_confirm", error_description: "No exported invoices match this request." }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const { error: ledgerError } = await client
    .from("invoice_payment_processed")
    .update({
      paid_at: nowIso,
      paid_confirmed_actor: serializeActor(actor),
      paid_confirmed_by: actor.displayName,
      paid_source: "manual",
      reconciled_at: nowIso,
      status: "paid",
      updated_at: nowIso,
    })
    .in("invoice_number", invoiceNumbers)
    .eq("status", "exported");
  if (ledgerError) return jsonApiResponse({ error: "invoice_payment_processed", error_description: ledgerError.message }, { status: 409 });

  // Canonical paid signal (same fields mark-paid.ts sets) so the invoice leaves
  // the open/exception queues on refresh.
  const { error: docError } = await client
    .from("invoice_documents")
    .update({ gate_override: true, paid_at: nowIso, payment_blocked_reason: null, payment_status: "paid" })
    .in("invoice_number", invoiceNumbers);
  if (docError) return jsonApiResponse({ error: "invoice_documents", error_description: docError.message }, { status: 409 });

  await client.from("dashboard_action_log").insert({
    action_type: "invoice_payment_confirmed",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision: "mark_done",
    department: "accounting",
    note,
    payload: { batchId, invoiceNumbers, paidSource: "manual" },
    source_pk: batchId,
    source_table: "invoice_payment_processed",
    workflow: "invoice-payment-export",
  });

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({ batchId, confirmed: invoiceNumbers.length, invoiceNumbers, status: "paid" });
};
