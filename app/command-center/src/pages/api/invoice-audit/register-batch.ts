// POST /api/invoice-audit/register-batch
// docs/63 Change 1b — the QuickBooks REGISTER export. Loads every fully-processed invoice
// (incl. do-not-pay holds and Service/Warranty transfers) to the accounting register exactly
// once, recording the CSV rows in invoice_register_export. It does NOT pay anything — the
// payment export (process-batch) handles approved-to-pay invoices separately.
//
// Returns JSON { batchId, files, invoiceNumbers }. The browser then GETs
// batch/[batchId].csv?kind=register&vendor=... — idempotent, side-effect-free.

import { randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission, serializeActor } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache, type Invoice, isInvoiceRegisterExportable, loadInvoiceAuditSummary } from "@lib/invoice-audit";
import { type AbcInvoicePayRow, buildRegisterFileName, buildRegisterLedgerRows, invoiceVendor, registerCsvRows } from "@lib/invoice-payment";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot export the invoice register." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const data = await loadInvoiceAuditSummary(undefined, { force: true });
  // Register set = fully-processed, not-yet-register-exported invoices (incl. held + transferred).
  const invoices = data.offices.flatMap((o) => o.branches.flatMap((b) => b.invoices)).filter((inv) => isInvoiceRegisterExportable(inv));
  if (!invoices.length) {
    return jsonApiResponse({ error: "nothing_to_register", error_description: "No processed invoices are waiting to load to the register." }, { status: 409 });
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
  const actorPacket = serializeActor(actor);

  const byVendor = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const vendor = invoiceVendor(inv);
    const list = byVendor.get(vendor) ?? [];
    list.push(inv);
    byVendor.set(vendor, list);
  }

  const ledgerRows: ReturnType<typeof buildRegisterLedgerRows> = [];
  const files: Array<{ vendor: string; fileName: string; count: number; downloadUrl: string }> = [];
  for (const [vendor, vendorInvoices] of byVendor) {
    const fileName = buildRegisterFileName(vendor, now);
    const rows = registerCsvRows(vendorInvoices, detailByInvoice);
    ledgerRows.push(...buildRegisterLedgerRows(rows, { actorPacket, batchId, exportedBy: actor.displayName, fileName, nowIso, vendor }));
    files.push({ count: rows.length, downloadUrl: `/api/invoice-audit/batch/${batchId}.csv?kind=register&vendor=${encodeURIComponent(vendor)}`, fileName, vendor });
  }

  // Load-once: a previously-exported invoice keeps its first register_exported_at (ignoreDuplicates).
  const { error: ledgerError } = await client
    .from("invoice_register_export")
    .upsert(ledgerRows, { onConflict: "invoice_number", ignoreDuplicates: true });
  if (ledgerError) return jsonApiResponse({ error: "invoice_register_export", error_description: ledgerError.message }, { status: 409 });

  await client.from("dashboard_action_log").insert({
    action_type: "invoice_register_batch",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision: "register_export",
    department: "accounting",
    note: `Loaded ${invoiceNumbers.length} invoice(s) to the QuickBooks register across ${files.length} vendor file(s).`,
    payload: { batchId, files: files.map((f) => ({ count: f.count, fileName: f.fileName, vendor: f.vendor })), invoiceNumbers, source: "invoice-audit" },
    source_pk: batchId,
    source_table: "invoice_register_export",
    workflow: "invoice-register-export",
  });

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({ batchId, count: invoiceNumbers.length, files, invoiceNumbers });
};
