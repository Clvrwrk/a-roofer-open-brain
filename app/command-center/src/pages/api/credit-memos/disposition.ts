import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// decision -> credit_memo_requests.status (CHECK: draft|approved|sent|received|rejected|
// needs_more_evidence|closed). Two flows: RECEIVED-CM disposition (audited vs original) and
// REQUESTED-CM lifecycle (a credit we asked the vendor for). No external send here — that
// stays human-gated per SOUL; "mark-sent" only records that a human sent it.
const RECEIVED_STATUS: Record<string, string> = { approve: "approved", review: "needs_more_evidence", reject: "rejected" };
const REQUESTED_STATUS: Record<string, string> = { "mark-sent": "sent", "mark-received": "received", close: "closed" };

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const invoiceNumber = String(body.invoiceNumber ?? body.invoice_number ?? "").trim();
  const decision = String(body.decision ?? "").trim();
  const note = String(body.note ?? "").slice(0, 500);
  if (!invoiceNumber || (!RECEIVED_STATUS[decision] && !REQUESTED_STATUS[decision])) {
    return jsonApiResponse({ error: "invalid_request", error_description: "invoiceNumber and a valid decision (approve|review|reject|mark-sent|mark-received|close) are required." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }
  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";
  const nowIso = new Date().toISOString();

  // Silo (docs/87): resolve the invoice's vendor and scope every write — a
  // colliding number must never advance the other vendor's request.
  const { data: vRow } = await client.from("v_invoice_audit_invoice_vendor").select("vendor_slug").eq("invoice_number", invoiceNumber).limit(2);
  const vSlugs = ((vRow as any[] | null) ?? []).map((r) => String(r.vendor_slug));
  if (vSlugs.length > 1) {
    return jsonApiResponse({ error: "ambiguous_vendor", error_description: `Invoice ${invoiceNumber} exists for ${vSlugs.join(" and ")} — vendor disambiguation required.` }, { status: 409 });
  }
  const vendorSlug = vSlugs[0] ?? "abc-supply";

  // REQUESTED-CM lifecycle: advance an existing request (no audit-view lookup).
  if (REQUESTED_STATUS[decision]) {
    const status = REQUESTED_STATUS[decision];
    const patch: Record<string, unknown> = { status, updated_at: nowIso };
    if (status === "sent") { patch.sent_by = who; patch.sent_at = nowIso; patch.follow_up_due_at = new Date(Date.now() + 14 * 864e5).toISOString(); }
    if (status === "received") { patch.received_by = who; patch.received_at = nowIso; }
    const { data, error } = await client.from("credit_memo_requests").update(patch).eq("invoice_number", invoiceNumber).eq("vendor_slug", vendorSlug).eq("request_kind", "requested").select("invoice_number,status,sent_at,received_at").maybeSingle();
    if (error) return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
    if (!data) return jsonApiResponse({ error: "not_found", error_description: `No credit-memo request for ${invoiceNumber}.` }, { status: 404 });
    // PEC-198 pill 2: marking the vendor email SENT is the moment the audit work on
    // this invoice is done — auto-fire the per-invoice Process stamp (same flip the
    // Process button does in bulk). Best-effort; the button remains the manual path.
    if (status === "sent") {
      try {
        await client
          .from("invoice_pipeline_status")
          .update({ pipeline_status: "invoice_audit_complete", audit_completed_at: nowIso, note: `stamped complete on CM mark-sent by ${who}` })
          .eq("invoice_number", invoiceNumber)
          .eq("pipeline_status", "invoice_audit_pending");
        invalidateInvoiceAuditSummaryCache();
      } catch (err) { console.error("mark-sent auto process-stamp failed:", err instanceof Error ? err.message : err); }
    }
    return jsonApiResponse({ ok: true, record: data });
  }

  // RECEIVED-CM disposition: recompute credit/line facts server-side from the audit view.
  // v_credit_memo_audit is ABC-only today (mig 115) — refuse other vendors honestly
  // instead of silently filing their CM under ABC (docs/87; SRS arm is a tracked gap).
  const status = RECEIVED_STATUS[decision];
  if (vendorSlug !== "abc-supply") {
    return jsonApiResponse({ error: "vendor_not_supported", error_description: `Received-CM disposition for ${vendorSlug} is not wired yet — v_credit_memo_audit only covers ABC (docs/87 gap).` }, { status: 409 });
  }
  const { data: cm } = await client.from("v_credit_memo_audit").select("*").eq("invoice_number", invoiceNumber).maybeSingle();
  if (!cm) {
    return jsonApiResponse({ error: "not_found", error_description: `No credit memo ${invoiceNumber}.` }, { status: 404 });
  }
  const approved = status === "approved";
  const { data, error } = await client
    .from("credit_memo_requests")
    .upsert({
      invoice_number: invoiceNumber,
      vendor_slug: "abc-supply",
      request_kind: "received",
      status,
      expected_credit: Math.abs(Number((cm as any).credit_amount) || 0),
      line_count: Number((cm as any).line_count) || 0,
      external_credit_memo_number: invoiceNumber,
      approved_by: approved ? who : null,
      approved_at: approved ? nowIso : null,
      packet: {
        vendor: "ABC Supply",
        match_status: (cm as any).match_status,
        matched_lines: (cm as any).matched_lines,
        mismatch_lines: (cm as any).mismatch_lines,
        unmatched_lines: (cm as any).unmatched_lines,
        original_invoice_number: (cm as any).original_invoice_number,
        decided_by: who,
        decided_at: nowIso,
        note,
      },
      updated_at: nowIso,
    }, { onConflict: "vendor_slug,invoice_number,request_kind" })
    .select("invoice_number,status,approved_by,approved_at,expected_credit")
    .single();

  if (error) {
    return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
  }
  return jsonApiResponse({ ok: true, record: data });
};
