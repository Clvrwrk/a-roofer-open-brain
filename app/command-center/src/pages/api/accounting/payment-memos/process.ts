// POST /api/accounting/payment-memos/process — vendor payment memo intake (docs/86).
//
// Monthly flow: a vendor's payment memo (ABC Billtrust PDF) lists every invoice
// paid in full. Maya (or a human) extracts the rows and posts them here. The
// raw memo lands VENDOR-AGNOSTIC in vendor_payment_memos(+_lines) keyed by
// (vendor_slug, invoice_number); vendor_payment_memo_apply() then drives the
// working table (invoice_payment_processed) to paid_verified and stamps a
// per-line outcome (migration 218). Idempotent on (vendorSlug, confirmationNumber).
//
// The poster must supply the memo's own printed totals — the endpoint refuses
// a memo whose line sums do not tie to them (transcription guard; the same
// check that validated the May/June/August backfill to the penny).

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

interface MemoLineInput {
  invoiceNumber?: string;
  poNumber?: string;
  documentDate?: string;
  paymentAmount?: number;
}

interface MemoInput {
  vendorSlug?: string;
  confirmationNumber?: string;
  accountNumber?: string;
  paymentMethod?: string;
  paymentDate?: string;
  subtotalAmount?: number;
  discountApplied?: number;
  creditMemoAmount?: number;
  processingFee?: number;
  totalPaymentAmount?: number;
  sourceFile?: string;
  linearIssue?: string;
  lines?: MemoLineInput[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot process payment memos." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as MemoInput;
  const vendorSlug = typeof body.vendorSlug === "string" ? body.vendorSlug.trim() : "";
  const confirmationNumber = typeof body.confirmationNumber === "string" ? body.confirmationNumber.trim() : "";
  const paymentDate = typeof body.paymentDate === "string" ? body.paymentDate.trim() : "";
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!vendorSlug || !confirmationNumber || !paymentDate || lines.length === 0) {
    return jsonApiResponse(
      { error: "invalid_request", error_description: "vendorSlug, confirmationNumber, paymentDate and a non-empty lines array are required." },
      { status: 400 },
    );
  }

  const cleanLines: { invoiceNumber: string; poNumber: string | null; documentDate: string | null; paymentAmount: number }[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const invoiceNumber = typeof raw.invoiceNumber === "string" ? raw.invoiceNumber.trim() : "";
    const paymentAmount = Number(raw.paymentAmount);
    if (!invoiceNumber || !Number.isFinite(paymentAmount)) {
      return jsonApiResponse(
        { error: "invalid_line", error_description: `Every line needs invoiceNumber and a numeric paymentAmount (bad line: ${JSON.stringify(raw)}).` },
        { status: 400 },
      );
    }
    if (seen.has(invoiceNumber)) {
      return jsonApiResponse({ error: "duplicate_line", error_description: `Duplicate invoiceNumber in lines: ${invoiceNumber}.` }, { status: 400 });
    }
    seen.add(invoiceNumber);
    cleanLines.push({
      invoiceNumber,
      poNumber: typeof raw.poNumber === "string" && raw.poNumber.trim() ? raw.poNumber.trim() : null,
      documentDate: typeof raw.documentDate === "string" && raw.documentDate.trim() ? raw.documentDate.trim() : null,
      paymentAmount,
    });
  }

  // Transcription guard: line sums must tie to the memo's printed totals.
  const sumPositive = round2(cleanLines.filter((l) => l.paymentAmount > 0).reduce((s, l) => s + l.paymentAmount, 0));
  const sumNegative = round2(cleanLines.filter((l) => l.paymentAmount < 0).reduce((s, l) => s + l.paymentAmount, 0));
  const subtotal = Number(body.subtotalAmount);
  const creditMemoAmount = Number(body.creditMemoAmount ?? 0);
  if (!Number.isFinite(subtotal)) {
    return jsonApiResponse({ error: "invalid_request", error_description: "subtotalAmount (the memo's printed subtotal) is required." }, { status: 400 });
  }
  if (round2(subtotal) !== sumPositive || round2(creditMemoAmount) !== sumNegative) {
    return jsonApiResponse(
      {
        error: "totals_mismatch",
        error_description:
          `Line sums do not tie to the memo totals: positive lines ${sumPositive} vs subtotal ${round2(subtotal)}; ` +
          `negative lines ${sumNegative} vs credit memo amount ${round2(creditMemoAmount)}. Re-check the extraction.`,
      },
      { status: 422 },
    );
  }

  const { data: memoRow, error: memoError } = await client
    .from("vendor_payment_memos")
    .upsert(
      {
        vendor_slug: vendorSlug,
        confirmation_number: confirmationNumber,
        account_number: body.accountNumber ?? null,
        payment_method: body.paymentMethod ?? null,
        payment_date: paymentDate,
        subtotal_amount: subtotal,
        discount_applied: Number.isFinite(Number(body.discountApplied)) ? Number(body.discountApplied) : null,
        credit_memo_amount: creditMemoAmount,
        processing_fee: Number.isFinite(Number(body.processingFee)) ? Number(body.processingFee) : null,
        total_payment_amount: Number.isFinite(Number(body.totalPaymentAmount)) ? Number(body.totalPaymentAmount) : null,
        source_file: body.sourceFile ?? null,
        linear_issue: body.linearIssue ?? null,
        created_by: actor.displayName,
      },
      { onConflict: "vendor_slug,confirmation_number" },
    )
    .select("id")
    .single();
  if (memoError || !memoRow) {
    return jsonApiResponse({ error: "memo_upsert_failed", error_description: memoError?.message ?? "no row" }, { status: 409 });
  }

  const { error: linesError } = await client.from("vendor_payment_memo_lines").upsert(
    cleanLines.map((l) => ({
      memo_id: memoRow.id,
      vendor_slug: vendorSlug,
      invoice_number: l.invoiceNumber,
      po_number: l.poNumber,
      document_date: l.documentDate,
      payment_amount: l.paymentAmount,
    })),
    { onConflict: "memo_id,invoice_number" },
  );
  if (linesError) {
    return jsonApiResponse({ error: "lines_upsert_failed", error_description: linesError.message }, { status: 409 });
  }

  const { data: applied, error: applyError } = await client.rpc("vendor_payment_memo_apply", {
    p_vendor: vendorSlug,
    p_confirmation: confirmationNumber,
    p_actor: actor.displayName,
  });
  if (applyError) {
    return jsonApiResponse({ error: "apply_failed", error_description: applyError.message }, { status: 409 });
  }

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({
    memoId: memoRow.id,
    vendorSlug,
    confirmationNumber,
    lineCount: cleanLines.length,
    result: applied,
  });
};
