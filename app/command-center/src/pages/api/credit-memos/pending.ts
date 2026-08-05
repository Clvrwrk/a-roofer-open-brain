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

  // Per-line human review progress (Chris 2026-08-05): Approve activates only once
  // every claim line of the invoice's LATEST re-audit run is acknowledged.
  const invoiceNumbers = (data ?? []).map((r) => r.invoice_number);
  const claimTotals = new Map<string, { total: number; reviewed: number }>();
  const claimsByInvoice = new Map<string, { id: number; lineId: string | null; reviewed: boolean }[]>();
  if (invoiceNumbers.length) {
    const { data: lines, error: lineError } = await client
      .from("invoice_line_reaudit")
      .select("id, line_id, run_label, invoice_number, variance_ext, reviewed_at, created_at")
      .in("invoice_number", invoiceNumbers)
      .eq("classification", "discrepancy")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (lineError) return jsonApiResponse({ error: "invoice_line_reaudit", error_description: lineError.message }, { status: 409 });
    const latestRun = new Map<string, string>();
    for (const l of lines ?? []) if (!latestRun.has(l.invoice_number)) latestRun.set(l.invoice_number, l.run_label);
    for (const l of lines ?? []) {
      if (latestRun.get(l.invoice_number) !== l.run_label) continue;
      if (Number(l.variance_ext ?? 0) < 0.05) continue;
      const agg = claimTotals.get(l.invoice_number) ?? { total: 0, reviewed: 0 };
      agg.total += 1;
      if (l.reviewed_at) agg.reviewed += 1;
      claimTotals.set(l.invoice_number, agg);
      // Per-line claim detail so the invoice-audit tree can render its own review
      // checkboxes (Chris 2026-08-05: the check-off must live on the audit lines too).
      const list = claimsByInvoice.get(l.invoice_number) ?? [];
      list.push({ id: l.id, lineId: l.line_id ?? null, reviewed: Boolean(l.reviewed_at) });
      claimsByInvoice.set(l.invoice_number, list);
    }
  }

  return jsonApiResponse({
    requests: (data ?? []).map((r) => ({
      invoiceNumber: r.invoice_number,
      status: r.status,
      expectedCredit: Number(r.expected_credit ?? 0),
      lineCount: Number(r.line_count ?? 0),
      claimLines: claimTotals.get(r.invoice_number)?.total ?? 0,
      reviewedLines: claimTotals.get(r.invoice_number)?.reviewed ?? 0,
      claims: claimsByInvoice.get(r.invoice_number) ?? [],
      vendor: (r.packet as Record<string, unknown> | null)?.vendor ?? "ABC Supply",
      approvedBy: r.approved_by,
      approvedAt: r.approved_at,
    })),
  });
};
