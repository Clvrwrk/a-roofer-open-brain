import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

const isUuid = (v: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? ""));

// Records a line-level audit decision in the append-only invoice_line_audit
// history. Used by the Invoice Audit dashboard "mark passed" / disposition
// actions. Internal audit write only — never an external send.
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const invoiceLineId = String(body.invoiceLineId ?? body.invoice_line_id ?? "").trim();
  const invoiceNumber = String(body.invoiceNumber ?? body.invoice_number ?? "").trim();
  if (!isUuid(invoiceLineId) || !invoiceNumber) {
    return jsonApiResponse({ error: "invalid_request", error_description: "invoiceLineId (uuid) and invoiceNumber are required." }, { status: 400 });
  }

  const status = body.status === "disputed" ? "disputed" : "passed";
  const decision = body.decision ? String(body.decision).slice(0, 64) : null;
  const note = String(body.note ?? (status === "disputed" ? "Disputed by operator" : "Manually passed")).slice(0, 500);
  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const { data, error } = await client
    .from("invoice_line_audit")
    .insert({
      invoice_line_id: invoiceLineId,
      invoice_number: invoiceNumber,
      item_number: body.itemNumber ?? body.item_number ?? null,
      audit_status: status,
      decision,
      approved_by: who,
      approval_note: note,
      source: "manual",
      decided_by: who,
    })
    .select("id,audit_status,approved_by,approval_note,decided_at")
    .single();

  if (error) {
    return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
  }

  // Requested-credit-memo tracking (Item 1): a credit-memo disposition means we're requesting
  // a credit from the vendor for this invoice's overcharge. Recompute the invoice's
  // credit-flagged exposure from the audit ledger and upsert a 'requested' credit_memo_request
  // (preserving any existing lifecycle status). Best-effort — never fails the audit write.
  if (decision === "credit-flag" || decision === "credit-noflag") {
    try {
      const flagged = await client
        .from("v_invoice_line_audit_current")
        .select("invoice_line_id")
        .eq("invoice_number", invoiceNumber)
        .in("decision", ["credit-flag", "credit-noflag"]);
      const ids = (flagged.data as any[] | null)?.map((r) => r.invoice_line_id) ?? [];
      let credit = 0;
      let lineCount = 0;
      if (ids.length) {
        const lines = await client.from("v_invoice_audit_line").select("variance_ext").in("line_id", ids);
        for (const l of (lines.data as any[] | null) ?? []) {
          const v = Number(l.variance_ext) || 0;
          if (v > 0) credit += v;
          lineCount += 1;
        }
      }
      const existing = await client.from("credit_memo_requests").select("id,status").eq("invoice_number", invoiceNumber).maybeSingle();
      const packet = { source: "invoice-audit", decision, requested_by: who, requested_at: new Date().toISOString() };
      if (existing.data) {
        await client.from("credit_memo_requests").update({
          request_kind: "requested",
          expected_credit: Math.round(credit * 100) / 100,
          line_count: lineCount,
          packet,
          updated_at: new Date().toISOString(),
        }).eq("invoice_number", invoiceNumber);
      } else {
        await client.from("credit_memo_requests").insert({
          invoice_number: invoiceNumber,
          request_kind: "requested",
          status: "draft",
          expected_credit: Math.round(credit * 100) / 100,
          line_count: lineCount,
          assigned_to: who,
          packet,
        });
      }
    } catch {
      /* tracking is best-effort; the audit decision is already recorded */
    }
  }

  return jsonApiResponse({ ok: true, record: data });
};
