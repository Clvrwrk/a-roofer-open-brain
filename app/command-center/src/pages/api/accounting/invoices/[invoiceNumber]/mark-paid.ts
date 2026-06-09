import { createHash } from "node:crypto";
import type { APIRoute } from "astro";
import {
  actorCanAccessDepartment,
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
} from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

interface InvoiceDocumentRow {
  id: string;
  invoice_number: string | null;
  payment_status: string | null;
  original_filename: string | null;
}

interface InvoiceRow {
  invoice_number: string;
  order_number: string | null;
  ship_to_number: string | null;
  purchase_order_number: string | null;
  total_amount: number | string | null;
}

interface InvoiceLineRow {
  invoice_number: string;
  line_key: string | null;
  line_number: string | null;
  item_number: string | null;
  item_description: string | null;
  raw: Record<string, unknown> | null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["value", "amount", "price", "unitPrice", "unit_price", "pricePerUnitAmount", "extendedPriceAmount"]) {
      const parsed = toNumber(record[key]);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function textOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function invoiceLineQuantity(raw: Record<string, unknown> | null) {
  return toNumber(raw?.shippedQty) ?? toNumber(raw?.orderedQty) ?? toNumber(raw?.priceQty);
}

function invoiceLineUom(raw: Record<string, unknown> | null) {
  const priceQty = raw?.priceQty;
  if (priceQty && typeof priceQty === "object") return textOrNull((priceQty as Record<string, unknown>).uom);
  return null;
}

function invoiceLinePrice(raw: Record<string, unknown> | null) {
  return toNumber(raw?.pricePerUnitAmount);
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse(
      {
        actor: serializeActor(actor),
        error: "forbidden",
        error_description: "This actor cannot mark accounting invoices paid.",
      },
      { status: 403 },
    );
  }

  const invoiceNumber = params.invoiceNumber ? decodeURIComponent(params.invoiceNumber) : "";
  if (!invoiceNumber) {
    return jsonApiResponse({ error: "missing_invoice", error_description: "Invoice number is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse(
      { error: "supabase_unconfigured", error_description: config.missing.join(", ") },
      { status: 503 },
    );
  }

  const { data: invoiceDocument, error: documentError } = await client
    .from("invoice_documents")
    .select("id,invoice_number,payment_status,original_filename")
    .eq("invoice_number", invoiceNumber)
    .order("uploaded_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<InvoiceDocumentRow>();

  if (documentError) throw new Error(`invoice_documents: ${documentError.message}`);
  if (!invoiceDocument?.id) {
    return jsonApiResponse(
      { error: "invoice_document_not_found", error_description: `${invoiceNumber} is not linked to invoice_documents.` },
      { status: 404 },
    );
  }

  const [{ data: invoice }, { data: lines, error: linesError }] = await Promise.all([
    client
      .from("abc_invoices")
      .select("invoice_number,order_number,ship_to_number,purchase_order_number,total_amount")
      .eq("invoice_number", invoiceNumber)
      .maybeSingle<InvoiceRow>(),
    client
      .from("abc_invoice_lines")
      .select("invoice_number,line_key,line_number,item_number,item_description,raw")
      .eq("invoice_number", invoiceNumber)
      .order("line_number", { ascending: true, nullsFirst: false }),
  ]);

  if (linesError) throw new Error(`abc_invoice_lines: ${linesError.message}`);
  const invoiceLines = (lines ?? []) as InvoiceLineRow[];
  if (!invoiceLines.length) {
    return jsonApiResponse(
      { error: "invoice_lines_not_found", error_description: `${invoiceNumber} has no ABC invoice lines to record.` },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const observationBody = {
    actor: serializeActor(actor),
    invoice,
    invoiceDocument: {
      id: invoiceDocument.id,
      invoiceNumber: invoiceDocument.invoice_number,
      originalFilename: invoiceDocument.original_filename,
      priorPaymentStatus: invoiceDocument.payment_status,
    },
    lines: invoiceLines.map((line) => ({
      description: textOrNull(line.item_description ?? line.raw?.itemDescription),
      itemNumber: textOrNull(line.item_number),
      lineKey: textOrNull(line.line_key),
      lineNumber: textOrNull(line.line_number),
      price: invoiceLinePrice(line.raw),
      quantity: invoiceLineQuantity(line.raw),
      uom: invoiceLineUom(line.raw),
    })),
    note,
    observedAt: now,
    purpose: "invoice_paid_by_lucinda",
  };
  const requestHash = `invoice-paid:${invoiceNumber}:${hashJson(observationBody).slice(0, 32)}`;

  const { data: observationRows, error: observationError } = await client
    .from("abc_price_observations")
    .upsert(
      [
        {
          branch_number: null,
          line_count: invoiceLines.length,
          ok_line_count: invoiceLines.length,
          observed_at: now,
          purpose: "invoice_paid_by_lucinda",
          request_body: observationBody,
          request_hash: requestHash,
          request_id: invoiceNumber,
          response_raw: {
            actor: serializeActor(actor),
            invoiceNumber,
            invoice_document_id: invoiceDocument.id,
            note,
            source: "command_center_mark_paid",
          },
          status_code: 200,
        },
      ],
      { onConflict: "request_hash" },
    )
    .select("id")
    .single();

  if (observationError) {
    return jsonApiResponse(
      {
        error: "price_observation_failed",
        error_description: `abc_price_observations: ${observationError.message}`,
      },
      { status: 409 },
    );
  }

  const observationId = observationRows?.id;
  const observationLineRows = invoiceLines.map((line, index) => {
    const price = invoiceLinePrice(line.raw);
    const quantity = invoiceLineQuantity(line.raw);
    const lineId = textOrNull(line.line_key ?? line.line_number) ?? String(index + 1);
    return {
      extended_price: price !== null && quantity !== null ? price * quantity : null,
      item_number: textOrNull(line.item_number),
      line_id: lineId,
      matched_price_list_item_id: null,
      observation_id: observationId,
      price,
      price_raw: {
        invoiceNumber,
        itemDescription: textOrNull(line.item_description ?? line.raw?.itemDescription),
        lineKey: line.line_key,
        lineNumber: line.line_number,
        source: "invoice_paid_by_lucinda",
      },
      product_catalog_item_number: textOrNull(line.item_number),
      quantity,
      request_hash: requestHash,
      requested_uom: invoiceLineUom(line.raw),
      response_uom: invoiceLineUom(line.raw),
      status_code: "PAID_OBSERVED",
      status_message: "Lucinda marked invoice paid; line captured as part of one invoice-paid price observation.",
      unit_price: price,
    };
  });

  const { error: observationLinesError } = await client
    .from("abc_price_observation_lines")
    .upsert(observationLineRows, { onConflict: "request_hash,line_id" });

  if (observationLinesError) {
    return jsonApiResponse(
      {
        error: "price_observation_lines_failed",
        error_description: `abc_price_observation_lines: ${observationLinesError.message}`,
        observationId,
      },
      { status: 409 },
    );
  }

  const { error: paidError } = await client
    .from("invoice_documents")
    .update({
      gate_override: true,
      paid_at: now,
      payment_blocked_reason: null,
      payment_status: "paid",
    })
    .eq("id", invoiceDocument.id);

  if (paidError) {
    return jsonApiResponse(
      {
        error: "payment_gate_rejected",
        error_description: `invoice_documents: ${paidError.message}`,
        observationId,
      },
      { status: 409 },
    );
  }

  const workKey = `accounting:invoice-paid:${invoiceNumber}`;
  const actionPayload = {
    actor: serializeActor(actor),
    gateOverride: true,
    inheritance: "Invoice paid closes the invoice-level gate. The paid invoice leaves the unpaid exception queue on refresh.",
    invoiceNumber,
    lineCount: invoiceLines.length,
    note,
    observationId,
    requestHash,
  };
  const { data: workItem } = await client
    .from("dashboard_work_items")
    .upsert(
      {
        approval_required: true,
        assigned_to: "@ob-accounting",
        department: "accounting",
        evidence: observationLineRows.map((row) => ({ text: `${row.line_id} / ${row.item_number ?? "missing SKU"} / ${row.price ?? "missing price"}` })),
        primary_human: "Lucinda",
        priority: "normal",
        source_data: actionPayload,
        source_pk: invoiceDocument.id,
        source_system: "Invoice document",
        source_table: "invoice_documents",
        status: "done",
        summary: "Lucinda marked invoice paid and recorded all invoice lines as a single price observation.",
        title: `Invoice paid / ${invoiceNumber}`,
        value_at_risk: toNumber(invoice?.total_amount) ?? 0,
        workflow: "invoice-payment-gate",
        work_key: workKey,
      },
      { onConflict: "work_key" },
    )
    .select("id")
    .single();

  const { data: action } = await client
    .from("dashboard_action_log")
    .insert({
      action_type: "invoice_paid",
      actor_display_name: actor.displayName,
      actor_id: actor.id,
      actor_type: actor.type,
      decision: "mark_done",
      department: "accounting",
      note,
      payload: actionPayload,
      source_pk: invoiceDocument.id,
      source_table: "invoice_documents",
      work_item_id: workItem?.id ?? null,
      work_key: workKey,
      workflow: "invoice-payment-gate",
    })
    .select("id,created_at")
    .single();

  return jsonApiResponse({
    action,
    invoiceDocumentId: invoiceDocument.id,
    lineCount: invoiceLines.length,
    observationId,
    requestHash,
    status: "paid",
    workItem,
  });
};
