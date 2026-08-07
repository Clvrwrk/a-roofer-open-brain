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

  // Agent guard (docs/83 decision 4): agents may only classify a line as VALID when it
  // is at-or-under the matched agreement price. Positive-variance and UOM-mismatch lines
  // require a human — the agent must classify them 'discrepancy' or leave them alone.
  const isAgent = actor.type === "named_agent" || actor.type === "service_agent" || actor.type === "runtime_named_agent";
  const validLineIds = lines.filter((l) => l.classification === "valid").map((l) => l.invoiceLineId);
  if (isAgent && validLineIds.length) {
    const { data: auditRows, error: auditError } = await client
      .from("v_invoice_audit_line")
      .select("line_id, negotiated_price, variance_ext, uom_mismatch")
      .in("line_id", validLineIds);
    if (auditError) {
      return jsonApiResponse({ error: "variance_check_failed", error_description: auditError.message }, { status: 500 });
    }
    const blocked = (auditRows ?? []).filter(
      (r: any) => r.uom_mismatch === true || (r.negotiated_price != null && Number(r.variance_ext ?? 0) > 0.05),
    );
    if (blocked.length) {
      return jsonApiResponse(
        {
          error: "agent_variance_review_required",
          error_description: `${blocked.length} line(s) are over the agreement price or UOM-mismatched — an agent cannot pass them; a human must review.`,
          blockedLineIds: blocked.map((r: any) => r.line_id),
        },
        { status: 409 },
      );
    }
  }

  const who = actor.displayName || actor.id || "agent";
  // Silo eval 2026-08-07: stamp the ledger's vendor discriminator (mig 221) and
  // refuse lines that do not belong to the named invoice — a caller must not be
  // able to file vendor A's lines under vendor B's invoice number.
  const { data: vendorRow } = await client.from("v_invoice_audit_invoice_vendor").select("vendor_slug").eq("invoice_number", invoiceNumber).limit(1);
  const vendorSlug = (vendorRow as any[] | null)?.[0]?.vendor_slug ?? "abc-supply";
  const lineIdsToCheck = lines.map((l) => l.invoiceLineId).filter(Boolean);
  const { data: lineOwners } = await client.from("v_invoice_audit_line").select("line_id,invoice_number").in("line_id", lineIdsToCheck);
  const ownerByLine = new Map(((lineOwners as any[] | null) ?? []).map((r) => [String(r.line_id), String(r.invoice_number)]));
  const foreign = lines.filter((l) => ownerByLine.get(String(l.invoiceLineId)) !== invoiceNumber);
  if (foreign.length) {
    return jsonApiResponse(
      { error: "line_invoice_mismatch", error_description: `Line(s) ${foreign.map((l) => l.invoiceLineId).join(", ")} do not belong to invoice ${invoiceNumber}.` },
      { status: 409 },
    );
  }
  const { data, error } = await client
    .from("invoice_line_audit")
    .insert(
      lines.map((l) => ({
        invoice_line_id: l.invoiceLineId,
        invoice_number: invoiceNumber,
        vendor_slug: vendorSlug,
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
