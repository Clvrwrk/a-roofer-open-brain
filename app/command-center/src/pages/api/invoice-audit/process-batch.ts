// POST /api/invoice-audit/process-batch
// Phase 1 of the two-phase payment flow. Marks every fully-reviewed,
// not-yet-paid invoice as EXPORTED (Awaiting Payment) and records the exact
// QuickBooks CSV rows in invoice_payment_processed. It does NOT mark anything
// paid — that happens later via confirm-paid or ABC AR reconciliation.
//
// Returns JSON { batchId, fileName, count, downloadUrl }. The browser then GETs
// downloadUrl (batch/[batchId].csv) to fetch the file — a separate, idempotent,
// side-effect-free request, so a prefetch/retry can never re-trigger the export.

import { randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission, serializeActor } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache, isInvoiceToBePaid, loadInvoiceAuditSummary } from "@lib/invoice-audit";
import { type AbcInvoicePayRow, buildFileName, buildLedgerRows, csvRows } from "@lib/invoice-payment";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot export invoices for payment." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const data = await loadInvoiceAuditSummary(undefined, { force: true });
  const invoices = data.offices.flatMap((o) => o.branches.flatMap((b) => b.invoices)).filter((inv) => isInvoiceToBePaid(inv));
  if (!invoices.length) {
    return jsonApiResponse({ error: "nothing_to_process", error_description: "No fully reviewed invoices are ready to be paid." }, { status: 409 });
  }

  const invoiceNumbers = invoices.map((inv) => inv.invoiceNumber);
  const { data: invoiceRows, error: invoiceError } = await client
    .from("abc_invoices")
    .select("invoice_number,invoice_date,total_amount,purchase_order_number,due_date,ar_total_due,raw")
    .in("invoice_number", invoiceNumbers);
  if (invoiceError) return jsonApiResponse({ error: "abc_invoices", error_description: invoiceError.message }, { status: 409 });

  const detailByInvoice = new Map<string, AbcInvoicePayRow>();
  for (const row of (invoiceRows ?? []) as AbcInvoicePayRow[]) detailByInvoice.set(row.invoice_number, row);

  const now = new Date();
  const nowIso = now.toISOString();
  const batchId = randomUUID();
  const fileName = buildFileName(now);
  const rows = csvRows(invoices, detailByInvoice);

  // status='exported' only — no abc_invoices / invoice_documents paid mutation.
  // onConflict=invoice_number lets a previously 'returned' invoice be re-exported.
  const { error: ledgerError } = await client
    .from("invoice_payment_processed")
    .upsert(buildLedgerRows(rows, { actorPacket: serializeActor(actor), batchId, fileName, nowIso, processedBy: actor.displayName }), {
      onConflict: "invoice_number",
    });
  if (ledgerError) return jsonApiResponse({ error: "invoice_payment_processed", error_description: ledgerError.message }, { status: 409 });

  await client.from("dashboard_action_log").insert({
    action_type: "invoice_export_batch",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision: "export",
    department: "accounting",
    note: `Exported ${rows.length} invoice(s) for payment as ${fileName}.`,
    payload: { batchId, fileName, invoiceNumbers, source: "invoice-audit" },
    source_pk: batchId,
    source_table: "invoice_payment_processed",
    workflow: "invoice-payment-export",
  });

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({
    batchId,
    count: rows.length,
    downloadUrl: `/api/invoice-audit/batch/${batchId}.csv`,
    fileName,
    invoiceNumbers,
  });
};
