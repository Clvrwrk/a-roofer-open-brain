import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// decision -> credit_memo_requests.status (CHECK: draft|approved|sent|received|rejected|
// needs_more_evidence|closed). Internal disposition of a RECEIVED credit memo audited against
// its original invoice — NOT an external send (that stays human-gated per SOUL).
const DECISION_STATUS: Record<string, string> = {
  approve: "approved",
  review: "needs_more_evidence",
  reject: "rejected",
};

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const invoiceNumber = String(body.invoiceNumber ?? body.invoice_number ?? "").trim();
  const decision = String(body.decision ?? "").trim();
  const note = String(body.note ?? "").slice(0, 500);
  const status = DECISION_STATUS[decision];
  if (!invoiceNumber || !status) {
    return jsonApiResponse({ error: "invalid_request", error_description: "invoiceNumber and a valid decision (approve|review|reject) are required." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }
  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";

  // Recompute the credit/line facts server-side from the audit view (don't trust the client).
  const { data: cm } = await client.from("v_credit_memo_audit").select("*").eq("invoice_number", invoiceNumber).maybeSingle();
  if (!cm) {
    return jsonApiResponse({ error: "not_found", error_description: `No credit memo ${invoiceNumber}.` }, { status: 404 });
  }
  const nowIso = new Date().toISOString();
  const approved = status === "approved";

  const { data, error } = await client
    .from("credit_memo_requests")
    .upsert({
      invoice_number: invoiceNumber,
      status,
      expected_credit: Math.abs(Number((cm as any).credit_amount) || 0),
      line_count: Number((cm as any).line_count) || 0,
      external_credit_memo_number: invoiceNumber,
      approved_by: approved ? who : null,
      approved_at: approved ? nowIso : null,
      packet: {
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
    }, { onConflict: "invoice_number" })
    .select("invoice_number,status,approved_by,approved_at,expected_credit")
    .single();

  if (error) {
    return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
  }
  return jsonApiResponse({ ok: true, record: data });
};
