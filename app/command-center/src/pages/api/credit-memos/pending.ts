// GET /api/credit-memos/pending
// Invoice Audit v2 R2 (docs/82): the draft/approved credit-memo requests that feed the
// weekly vendor emails. Used by the invoice-audit tree to decorate rows with the
// Approve button + CM pill, and by the weekly view header.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot view credit memos." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const { data, error } = await client
    .from("credit_memo_requests")
    .select("invoice_number, status, request_kind, expected_credit, line_count, packet, approved_by, approved_at")
    .eq("request_kind", "requested")
    .in("status", ["draft", "approved"])
    .order("invoice_number")
    .limit(1000);
  if (error) return jsonApiResponse({ error: "credit_memo_requests", error_description: error.message }, { status: 409 });

  return jsonApiResponse({
    requests: (data ?? []).map((r) => ({
      invoiceNumber: r.invoice_number,
      status: r.status,
      expectedCredit: Number(r.expected_credit ?? 0),
      lineCount: Number(r.line_count ?? 0),
      vendor: (r.packet as Record<string, unknown> | null)?.vendor ?? "ABC Supply",
      approvedBy: r.approved_by,
      approvedAt: r.approved_at,
    })),
  });
};
