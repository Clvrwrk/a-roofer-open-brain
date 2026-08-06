// POST /api/credit-memos/review-line { lineId, reviewed }
// Invoice Audit v2 (Chris 2026-08-05): the human-in-the-loop acknowledgment that a
// specific credit-memo claim line has been reviewed. Every claim line of an invoice
// must carry this stamp before /api/credit-memos/approve will admit the invoice into
// the weekly vendor email.

import type { APIRoute } from "astro";
import { requireActor, requireSupabaseClient } from "@lib/api-guards";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const { actor, response: authError } = requireActor(locals, { department: "accounting", permission: "approval.decide", forbiddenMessage: "This actor cannot review credit memo lines." });
  if (!actor) return authError;

  const { client, response: supabaseError } = requireSupabaseClient();
  if (!client) return supabaseError;

  const body = (await request.json().catch(() => ({}))) as { lineId?: number | string; reviewed?: boolean };
  const lineId = Number(body.lineId);
  const reviewed = body.reviewed !== false;
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return jsonApiResponse({ error: "invalid_request", error_description: "lineId is required." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("invoice_line_reaudit")
    .update(reviewed ? { reviewed_by: actor.displayName, reviewed_at: nowIso } : { reviewed_by: null, reviewed_at: null })
    .eq("id", lineId)
    .eq("classification", "discrepancy")
    .select("id, invoice_number, line_id, item_number");
  if (error) return jsonApiResponse({ error: "invoice_line_reaudit", error_description: error.message }, { status: 409 });
  if (!data?.length) return jsonApiResponse({ error: "not_found", error_description: "Claim line not found." }, { status: 404 });

  // Chris 2026-08-05 QA: reviewing a claim line IS the audit decision on that line —
  // it must leave the "to audit" count. Append-only: reviewed → 'disputed'
  // (discrepancy, in the CM); un-reviewed → back to 'pending'. Best-effort.
  const claim = data[0] as { invoice_number: string; line_id: string | null; item_number: string | null };
  if (claim.line_id) {
    try {
      await client.from("invoice_line_audit").insert({
        invoice_line_id: claim.line_id,
        invoice_number: claim.invoice_number,
        item_number: claim.item_number,
        audit_status: reviewed ? "disputed" : "pending",
        decision: reviewed ? "discrepancy" : "reset",
        approved_by: actor.displayName,
        approval_note: reviewed ? "Claim line reviewed — in credit memo request" : "Claim review removed — back to pending",
        source: "manual",
        decided_by: actor.displayName,
      });
      invalidateInvoiceAuditSummaryCache();
    } catch { /* the review stamp is already recorded */ }
  }

  return jsonApiResponse({ lineId, invoiceNumber: claim.invoice_number, reviewed });
};
