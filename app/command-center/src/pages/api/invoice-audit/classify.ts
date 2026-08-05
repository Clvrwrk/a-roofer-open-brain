import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

const isUuid = (v: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? ""));

interface ClassifyLine {
  invoiceLineId: string;
  itemNumber: string | null;
  classification: "valid" | "discrepancy";
  note: string | null;
  paexpTag: string | null;
}

// v2 agent classification write path (docs/82 decision §5.2) — replaces the retired
// mark/run-disposition disposition routes. Binary model (docs/81 decision 7): a line
// is either VALID (billed at/under the matched agreement price, or no agreement) or a
// DISCREPANCY (billed over). Appends to the invoice_line_audit history — never
// updates or deletes (hard rule 1). Internal audit write only, never an external send.
//
// Body: { invoiceNumber, lines: [{ invoiceLineId, classification: "valid"|"discrepancy",
//         itemNumber?, note?, paexpTag? }] }  — or the same fields flat for one line.
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const invoiceNumber = String(body.invoiceNumber ?? body.invoice_number ?? "").trim();
  const rawLines: any[] = Array.isArray(body.lines) ? body.lines : [body];

  const lines: ClassifyLine[] = [];
  for (const raw of rawLines) {
    const invoiceLineId = String(raw.invoiceLineId ?? raw.invoice_line_id ?? "").trim();
    const classification = String(raw.classification ?? "").trim();
    if (!isUuid(invoiceLineId) || (classification !== "valid" && classification !== "discrepancy")) {
      return jsonApiResponse(
        { error: "invalid_request", error_description: "Each line needs invoiceLineId (uuid) and classification 'valid' or 'discrepancy'." },
        { status: 400 },
      );
    }
    lines.push({
      invoiceLineId,
      itemNumber: raw.itemNumber ?? raw.item_number ?? null,
      classification,
      note: raw.note ? String(raw.note).slice(0, 500) : null,
      paexpTag: raw.paexpTag ?? raw.paexp_tag ?? null,
    });
  }
  if (!invoiceNumber || !lines.length) {
    return jsonApiResponse({ error: "invalid_request", error_description: "invoiceNumber and at least one line are required." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const who = actor.displayName || actor.id || "agent";
  const { data, error } = await client
    .from("invoice_line_audit")
    .insert(
      lines.map((l) => ({
        invoice_line_id: l.invoiceLineId,
        invoice_number: invoiceNumber,
        item_number: l.itemNumber,
        audit_status: l.classification === "valid" ? "passed" : "disputed",
        decision: l.classification,
        approved_by: who,
        approval_note: l.note ?? (l.classification === "valid" ? "Classified valid" : "Classified discrepancy"),
        paexp_tag: l.paexpTag,
        source: "pipeline_v2",
        decided_by: who,
      })),
    )
    .select("id,invoice_line_id,audit_status,decision,decided_at");

  if (error) {
    return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
  }

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({ ok: true, invoiceNumber, recorded: data?.length ?? 0, records: data });
};
