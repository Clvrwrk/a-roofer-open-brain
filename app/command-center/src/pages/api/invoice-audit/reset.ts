import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// docs/59 Task 6 — per-invoice "Go back" reset. Append-only by design: the
// invoice_audit_reset() RPC re-pends every non-pending line (never deletes),
// cancels only DRAFT credit-memo candidates, logs the action, and refuses
// paid / exported / credit-memo invoices — all in one transaction (RT-2).
// Never touches communications: sent comms are never reversed here.
const RESET_ERRORS: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: "Invoice not found." },
  credit_memo_not_resettable: { status: 409, message: "A credit memo cannot be reset." },
  invoice_paid: { status: 409, message: "A paid invoice cannot be reset." },
  invoice_exported: { status: 409, message: "An invoice already exported for payment cannot be reset." },
};

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const invoiceNumber = String(body.invoiceNumber ?? body.invoice_number ?? "").trim();
  if (!invoiceNumber) {
    return jsonApiResponse({ error: "invalid_request", error_description: "invoiceNumber is required." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const { data, error } = await client.rpc("invoice_audit_reset", {
    p_invoice_number: invoiceNumber,
    p_actor_id: actor.id,
    p_actor_type: actor.type,
    p_actor_display: actor.displayName || actor.id || "operator",
  });

  if (error) {
    return jsonApiResponse({ error: "reset_failed", error_description: error.message }, { status: 500 });
  }

  const result = (data ?? {}) as { ok?: boolean; error?: string; lines_reset?: number; credit_memos_cancelled?: number; action_id?: string };
  if (!result.ok) {
    const mapped = RESET_ERRORS[result.error ?? ""] ?? { status: 400, message: "Reset failed." };
    return jsonApiResponse({ error: result.error ?? "reset_failed", error_description: mapped.message }, { status: mapped.status });
  }

  return jsonApiResponse({
    ok: true,
    linesReset: result.lines_reset ?? 0,
    creditMemosCancelled: result.credit_memos_cancelled ?? 0,
    actionId: result.action_id ?? null,
  });
};
