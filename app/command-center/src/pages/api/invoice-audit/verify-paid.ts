// POST /api/invoice-audit/verify-paid { invoiceNumber }
// Invoice Audit v2 (docs/81 §2): the human one-click toggle in the Manage panel —
// paid_pending_verification -> paid_verified, stamped with verifier + time.

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
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot verify payments." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { invoiceNumber?: string };
  const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  if (!invoiceNumber) return jsonApiResponse({ error: "invalid_request", error_description: "invoiceNumber is required." }, { status: 400 });

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("invoice_payment_processed")
    .update({ status: "paid_verified", updated_at: nowIso, verified_at: nowIso, verified_by: actor.displayName })
    .eq("invoice_number", invoiceNumber)
    .eq("status", "paid_pending_verification")
    .select("invoice_number");
  if (error) return jsonApiResponse({ error: "invoice_payment_processed", error_description: error.message }, { status: 409 });
  if (!data?.length) {
    return jsonApiResponse({ error: "not_pending_verification", error_description: "Invoice is not in Paid-pending verification." }, { status: 409 });
  }

  await client.from("dashboard_action_log").insert({
    action_type: "invoice_payment_verified",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision: "mark_done",
    department: "accounting",
    payload: { invoiceNumber },
    source_pk: invoiceNumber,
    source_table: "invoice_payment_processed",
    workflow: "invoice-audit-v2",
  });

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({ invoiceNumber, status: "paid_verified" });
};
