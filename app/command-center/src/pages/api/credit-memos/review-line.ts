// POST /api/credit-memos/review-line { lineId, reviewed }
// Invoice Audit v2 (Chris 2026-08-05): the human-in-the-loop acknowledgment that a
// specific credit-memo claim line has been reviewed. Every claim line of an invoice
// must carry this stamp before /api/credit-memos/approve will admit the invoice into
// the weekly vendor email.

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
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot review credit memo lines." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

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
  // PEC-194 insurance: a reaudit claim without a line link (wave/ad-hoc runs) would never
  // get a ledger stamp, leaving the line "to audit" forever. Resolve it by unique
  // (invoice_number, item_number) against the audit lines view before stamping.
  if (!claim.line_id && claim.item_number) {
    const { data: cand } = await client
      .from("v_invoice_audit_line")
      .select("line_id")
      .eq("invoice_number", claim.invoice_number)
      .eq("item_number", claim.item_number)
      .limit(2);
    if (cand?.length === 1) claim.line_id = String((cand[0] as any).line_id);
  }
  if (claim.line_id) {
    try {
      const { data: vRow } = await client.from("v_invoice_audit_invoice_vendor").select("vendor_slug").eq("invoice_number", claim.invoice_number).limit(1);
      await client.from("invoice_line_audit").insert({
        invoice_line_id: claim.line_id,
        invoice_number: claim.invoice_number,
        vendor_slug: (vRow as any[] | null)?.[0]?.vendor_slug ?? "abc-supply",
        item_number: claim.item_number,
        audit_status: reviewed ? "disputed" : "pending",
        decision: reviewed ? "discrepancy" : "reset",
        approved_by: actor.displayName,
        approval_note: reviewed ? "Claim line reviewed — in credit memo request" : "Claim review removed — back to pending",
        source: "manual",
        decided_by: actor.displayName,
      });
      invalidateInvoiceAuditSummaryCache();
    } catch (err) { console.error("review-line audit stamp failed:", err instanceof Error ? err.message : err); }
  }

  return jsonApiResponse({ lineId, invoiceNumber: claim.invoice_number, reviewed });
};
