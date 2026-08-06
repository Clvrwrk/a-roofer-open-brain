import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// v2 "Go back" reset (docs/82 R4, migration 203). Append-only by design: re-pends
// every decided line (never deletes), cancels the DRAFT/APPROVED (un-sent) credit-memo
// request, clears the claim-line review acknowledgments, and returns the pipeline
// status to Audit Pending / Processed — all in one transaction. Refuses paid /
// exported / paid-pending-verification / paid-verified / credit-memo invoices.
// Sent communications and sent requests are never reversed here.
const RESET_ERRORS: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: "Invoice not found." },
  credit_memo_not_resettable: { status: 409, message: "A vendor credit memo cannot be reset." },
  invoice_paid: { status: 409, message: "A paid invoice cannot be reset." },
  invoice_exported: { status: 409, message: "An invoice already exported for payment cannot be reset." },
  invoice_paid_pending_verification: { status: 409, message: "This invoice is in payment verification — verify or return it before resetting." },
  invoice_paid_verified: { status: 409, message: "A payment-verified invoice cannot be reset." },
};

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot reset invoice audit state." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const invoiceNumber = String(body.invoiceNumber ?? body.invoice_number ?? "").trim();
  if (!invoiceNumber) {
    return jsonApiResponse({ error: "invalid_request", error_description: "invoiceNumber is required." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const { data, error } = await client.rpc("invoice_audit_reset", {
    p_invoice_number: invoiceNumber,
    p_actor_id: actor.id,
    p_actor_type: actor.type,
    p_actor_display: actor.displayName || actor.id || "operator",
  });

  if (error) {
    return jsonApiResponse({ error: "reset_failed", error_description: error.message }, { status: 500 });
  }

  const result = (data ?? {}) as { ok?: boolean; error?: string; lines_reset?: number; credit_memos_cancelled?: number; reviews_cleared?: number; pipeline_status?: string; action_id?: string };
  if (!result.ok) {
    const mapped = RESET_ERRORS[result.error ?? ""] ?? { status: 400, message: "Reset failed." };
    return jsonApiResponse({ error: result.error ?? "reset_failed", error_description: mapped.message }, { status: mapped.status });
  }

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({
    ok: true,
    linesReset: result.lines_reset ?? 0,
    creditMemosCancelled: result.credit_memos_cancelled ?? 0,
    reviewsCleared: result.reviews_cleared ?? 0,
    pipelineStatus: result.pipeline_status ?? null,
    actionId: result.action_id ?? null,
  });
};
