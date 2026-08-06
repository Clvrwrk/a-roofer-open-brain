// POST /api/credit-memos/add-line { invoiceNumber, lineId }
// Invoice Audit v2 (Chris 2026-08-05): checking a negotiated-variance line in the
// audit tree ADDS it to the invoice's credit-memo claim set (it does NOT accept the
// price). Inserts an invoice_line_reaudit discrepancy row into the invoice's LATEST
// run (so the pending/approve latest-run logic sees one coherent claim set), stamps
// it reviewed by the actor, and retotals the draft credit_memo_requests row.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot build credit memo claims." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { invoiceNumber?: string; lineId?: string };
  const invoiceNumber = String(body.invoiceNumber ?? "").trim();
  const lineId = String(body.lineId ?? "").trim();
  if (!invoiceNumber || !lineId) {
    return jsonApiResponse({ error: "invalid_request", error_description: "invoiceNumber and lineId are required." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  // The line must be a real negotiated-variance discrepancy per the LIVE engine.
  const { data: lineRows, error: lineError } = await client
    .from("v_invoice_audit_line")
    .select("line_id, invoice_number, item_number, item_description, quantity, uom, unit_price, negotiated_price, variance_ext, uom_mismatch")
    .eq("line_id", lineId)
    .limit(1);
  if (lineError) return jsonApiResponse({ error: "line_lookup_failed", error_description: lineError.message }, { status: 500 });
  const line = (lineRows as any[] | null)?.[0];
  if (!line || line.invoice_number !== invoiceNumber) {
    return jsonApiResponse({ error: "not_found", error_description: "Invoice line not found." }, { status: 404 });
  }
  if (line.uom_mismatch || line.negotiated_price == null || Number(line.variance_ext ?? 0) < 0.05) {
    return jsonApiResponse(
      { error: "not_a_claim", error_description: "Only lines billed over a matched agreement price can join a credit memo claim." },
      { status: 409 },
    );
  }

  // A sent/received CM is history — the claim set can only change while un-sent.
  const { data: cmRows } = await client
    .from("credit_memo_requests")
    .select("id, status")
    .eq("invoice_number", invoiceNumber)
    .eq("request_kind", "requested")
    .limit(1);
  const existingCm = (cmRows as any[] | null)?.[0] ?? null;
  if (existingCm && !["draft", "approved", "cancelled"].includes(existingCm.status)) {
    return jsonApiResponse(
      { error: "cm_locked", error_description: `The credit memo request is already '${existingCm.status}' — it can no longer be changed.` },
      { status: 409 },
    );
  }

  // Join the invoice's latest re-audit run (or start a UI-origin one).
  const { data: runRows } = await client
    .from("invoice_line_reaudit")
    .select("run_label, created_at")
    .eq("invoice_number", invoiceNumber)
    .order("created_at", { ascending: false })
    .limit(1);
  const runLabel = (runRows as any[] | null)?.[0]?.run_label ?? "audit_ui";
  const nowIso = new Date().toISOString();

  // Idempotent: if the line already has a row in this run, refresh it to the LIVE
  // engine's numbers and make it a reviewed claim. (Wave runs can predate the
  // migration-205 office pricing — a line the wave saw as no_price may now carry a
  // real negotiated variance; the human's add wins with current data.)
  const { data: existingRows } = await client
    .from("invoice_line_reaudit")
    .select("id")
    .eq("invoice_number", invoiceNumber)
    .eq("run_label", runLabel)
    .eq("line_id", lineId)
    .limit(1);
  let claimId: number;
  if ((existingRows as any[] | null)?.length) {
    claimId = (existingRows as any[])[0].id;
    await client
      .from("invoice_line_reaudit")
      .update({
        classification: "discrepancy",
        invoiced_price: line.unit_price,
        office_price: line.negotiated_price,
        variance_ext: line.variance_ext,
        reviewed_by: actor.displayName,
        reviewed_at: nowIso,
      })
      .eq("id", claimId);
  } else {
    const { data: inserted, error: insertError } = await client
      .from("invoice_line_reaudit")
      .insert({
        run_label: runLabel,
        invoice_number: invoiceNumber,
        line_id: lineId,
        item_number: line.item_number,
        item_description: line.item_description,
        quantity: line.quantity,
        uom: line.uom,
        invoiced_price: line.unit_price,
        office_price: line.negotiated_price,
        variance_ext: line.variance_ext,
        classification: "discrepancy",
        match_method: "audit_ui",
        reviewed_by: actor.displayName,
        reviewed_at: nowIso,
      })
      .select("id")
      .single();
    if (insertError) return jsonApiResponse({ error: "claim_insert_failed", error_description: insertError.message }, { status: 500 });
    claimId = (inserted as any).id;
  }

  // Retotal the draft from the latest-run claim set (same math as pending/approve).
  const { data: claimRows, error: claimRowsError } = await client
    .from("invoice_line_reaudit")
    .select("variance_ext")
    .eq("invoice_number", invoiceNumber)
    .eq("run_label", runLabel)
    .eq("classification", "discrepancy");
  // Retotalling off a failed read would silently write a $0 credit memo.
  if (claimRowsError) return jsonApiResponse({ error: "invoice_line_reaudit", error_description: claimRowsError.message }, { status: 500 });
  let expectedCredit = 0;
  let lineCount = 0;
  for (const r of (claimRows as any[] | null) ?? []) {
    const v = Number(r.variance_ext ?? 0);
    if (v < 0.05) continue;
    expectedCredit += v;
    lineCount += 1;
  }
  expectedCredit = Math.round(expectedCredit * 100) / 100;

  const packetNote = { line_added_by: actor.displayName, line_added_at: nowIso, source: "invoice-audit-tree" };
  const { error: cmError } = existingCm
    ? await client
      .from("credit_memo_requests")
      .update({
        status: existingCm.status === "cancelled" ? "draft" : existingCm.status,
        expected_credit: expectedCredit,
        line_count: lineCount,
        updated_at: nowIso,
      })
      .eq("id", existingCm.id)
    : await client.from("credit_memo_requests").insert({
      invoice_number: invoiceNumber,
      request_kind: "requested",
      status: "draft",
      expected_credit: expectedCredit,
      line_count: lineCount,
      assigned_to: actor.displayName,
      packet: packetNote,
    });
  if (cmError) return jsonApiResponse({ error: "credit_memo_write_failed", error_description: cmError.message }, { status: 500 });

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({ ok: true, invoiceNumber, claimId, runLabel, expectedCredit, lineCount });
};
