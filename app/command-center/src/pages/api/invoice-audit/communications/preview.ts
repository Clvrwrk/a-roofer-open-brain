import type { APIRoute } from "astro";
import {
  actorCanAccessDepartment,
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
} from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import {
  deriveAuditStatus,
  upsertInvoiceAuditCommunicationPreview,
  type InvoiceAuditCommunicationInput,
} from "@lib/invoice-audit-communications";

export const prerender = false;

const isUuid = (v: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? ""));

const ALLOWED_ACTIONS = new Set([
  "accept-neg",
  "accept-tbn",
  "accept-30d",
  "accept-nochallenge",
  "credit-flag",
  "credit-noflag",
]);

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse(
      {
        actor: serializeActor(actor),
        error: "forbidden",
        error_description: "This actor cannot create accounting communication previews.",
      },
      { status: 403 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const invoiceLineId = String(body.invoiceLineId ?? "").trim();
  const invoiceNumber = String(body.invoiceNumber ?? "").trim();
  const triggerAction = String(body.triggerAction ?? "").trim();
  const note = String(body.note ?? body.label ?? "").trim();
  if (!isUuid(invoiceLineId) || !invoiceNumber) {
    return jsonApiResponse(
      { error: "invalid_request", error_description: "invoiceLineId and invoiceNumber required." },
      { status: 400 },
    );
  }
  if (!ALLOWED_ACTIONS.has(triggerAction)) {
    return jsonApiResponse({ error: "invalid_action", error_description: "Unsupported triggerAction." }, { status: 400 });
  }
  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  const { data: line, error: lineError } = await client
    .from("v_invoice_audit_line")
    .select("line_id,invoice_number,item_number,item_description,unit_price,negotiated_price,variance_pct,variance_ext")
    .eq("line_id", invoiceLineId)
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();
  if (lineError) {
    return jsonApiResponse({ error: "line_lookup_failed", error_description: lineError.message }, { status: 500 });
  }
  if (!line) {
    return jsonApiResponse(
      { error: "invalid_request", error_description: "invoiceLineId does not belong to invoiceNumber in audit line view." },
      { status: 400 },
    );
  }
  const input: InvoiceAuditCommunicationInput = {
    invoiceLineId,
    invoiceNumber,
    itemNumber: String((line as any).item_number ?? ""),
    itemDescription: String((line as any).item_description ?? ""),
    triggerAction,
    note: note || `Disposition queued by ${actor.displayName || actor.id}`,
    unitPrice: Number((line as any).unit_price ?? 0),
    negotiatedPrice: (line as any).negotiated_price == null ? null : Number((line as any).negotiated_price),
    variancePct: (line as any).variance_pct == null ? null : Number((line as any).variance_pct),
    varianceExt: (line as any).variance_ext == null ? null : Number((line as any).variance_ext),
  };
  // Trigger-action derives the canonical audit status; never trust client-provided status.
  const expectedStatus = deriveAuditStatus(triggerAction);
  if (expectedStatus === "disputed" && !["credit-flag", "credit-noflag"].includes(triggerAction)) {
    return jsonApiResponse({ error: "invalid_action", error_description: "Unexpected disputed action." }, { status: 400 });
  }
  try {
    const preview = await upsertInvoiceAuditCommunicationPreview(client, actor, input);
    return jsonApiResponse({ ok: true, preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate preview.";
    if (message.startsWith("thread_locked:")) {
      return jsonApiResponse({ error: "thread_locked", error_description: message }, { status: 409 });
    }
    return jsonApiResponse(
      {
        error: "preview_failed",
        error_description: message,
      },
      { status: 500 },
    );
  }
};
