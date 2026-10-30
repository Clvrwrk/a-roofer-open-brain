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

  // Silo (docs/87): resolve the invoice's vendor once and scope every read/write —
  // invoice numbers are NOT globally unique across vendors.
  const { data: vRow } = await client.from("v_invoice_audit_invoice_vendor").select("vendor_slug").eq("invoice_number", invoiceNumber).limit(1);
  const vendorSlug = (vRow as any[] | null)?.[0]?.vendor_slug ?? "abc-supply";

  // Hard gate (Chris 2026-08-05): every claim line of the invoice's latest re-audit run
  // must carry a human review acknowledgment before approval.
  if (approve) {
    const { data: lines, error: lineError } = await client
      .from("invoice_line_reaudit")
      .select("run_label, variance_ext, reviewed_at, created_at")
      .eq("invoice_number", invoiceNumber)
      .eq("vendor_slug", vendorSlug)
      .eq("classification", "discrepancy")
      .order("created_at", { ascending: false })
      .limit(500);
    if (lineError) return jsonApiResponse({ error: "invoice_line_reaudit", error_description: lineError.message }, { status: 409 });
    const latestRun = lines?.[0]?.run_label;
    const claims = (lines ?? []).filter((l) => l.run_label === latestRun && Number(l.variance_ext ?? 0) >= 0.05);
    if (claims.length === 0) {
      return jsonApiResponse({
        error: "no_claim_lines",
        error_description: "No claim lines on file under the current pricing engine — a re-audit run must back this request before it can be approved.",
      }, { status: 409 });
    }
    const unreviewed = claims.filter((l) => !l.reviewed_at).length;
    if (unreviewed > 0) {
      return jsonApiResponse({
        error: "lines_not_reviewed",
        error_description: `${unreviewed} of ${claims.length} claim line(s) have not been reviewed yet. Check every line to activate Approve.`,
        claimLines: claims.length,
        reviewedLines: claims.length - unreviewed,
      }, { status: 409 });
    }
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("credit_memo_requests")
    .update(approve
      ? { status: "approved", approved_by: actor.displayName, approved_at: nowIso, updated_at: nowIso }
      : { status: "draft", approved_by: null, approved_at: null, updated_at: nowIso })
    .eq("invoice_number", invoiceNumber)
    .eq("vendor_slug", vendorSlug)
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
