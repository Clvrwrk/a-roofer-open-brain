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
  return jsonApiResponse({ ok: true, record: data });
};
