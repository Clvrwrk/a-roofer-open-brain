// POST /api/credit-memos/review-line { lineId, reviewed }
// Invoice Audit v2 (Chris 2026-08-05): the human-in-the-loop acknowledgment that a
// specific credit-memo claim line has been reviewed. Every claim line of an invoice
// must carry this stamp before /api/credit-memos/approve will admit the invoice into
// the weekly vendor email.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot review credit memo lines." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { lineId?: number | string; reviewed?: boolean };
  const lineId = Number(body.lineId);
  const reviewed = body.reviewed !== false;
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return jsonApiResponse({ error: "invalid_request", error_description: "lineId is required." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("invoice_line_reaudit")
    .update(reviewed ? { reviewed_by: actor.displayName, reviewed_at: nowIso } : { reviewed_by: null, reviewed_at: null })
    .eq("id", lineId)
    .eq("classification", "discrepancy")
    .select("id, invoice_number");
  if (error) return jsonApiResponse({ error: "invoice_line_reaudit", error_description: error.message }, { status: 409 });
  if (!data?.length) return jsonApiResponse({ error: "not_found", error_description: "Claim line not found." }, { status: 404 });

  return jsonApiResponse({ lineId, invoiceNumber: data[0].invoice_number, reviewed });
};
