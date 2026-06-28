// GET /api/invoice-audit/batch/[batchId].csv
// Idempotent, side-effect-free download of a previously-exported batch. Streams
// the stored csv_row payloads, so the file is byte-stable and re-downloadable
// (a prefetch or retry changes nothing). Phase-1 mutation lives in process-batch.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { type ProcessedCsvRow, renderCsv } from "@lib/invoice-payment";
import { loadDecisionDetailCsv } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LedgerRow {
  csv_row: ProcessedCsvRow | null;
  csv_file_name: string | null;
  invoice_number: string;
}

export const GET: APIRoute = async ({ locals, params, url }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return new Response("Forbidden", { status: 403 });
  }

  const batchId = (params.batchId ?? "").replace(/\.csv$/i, "");
  if (!UUID_RE.test(batchId)) return new Response("Invalid batch id", { status: 400 });
  const vendor = url.searchParams.get("vendor");
  const kind = url.searchParams.get("kind");

  const { client, config } = createServerSupabaseClient();
  if (!client) return new Response(`Supabase unconfigured: ${config.missing.join(", ")}`, { status: 503 });

  // Deliverable 2 (docs/57 §3c): the decision-detail / explainability CSV — one row per
  // reviewed line in the batch with benchmark, variance, decision, note, agent, decided-at.
  if (kind === "detail") {
    const { data: batchRows, error: batchErr } = await client
      .from("invoice_payment_processed")
      .select("invoice_number,csv_file_name")
      .eq("batch_id", batchId);
    if (batchErr) return new Response(`invoice_payment_processed: ${batchErr.message}`, { status: 409 });
    const invoiceNumbers = [...new Set((batchRows ?? []).map((r: { invoice_number: string }) => r.invoice_number))];
    if (!invoiceNumbers.length) return new Response("Batch not found.", { status: 404 });
    const payName = (batchRows ?? []).find((r: { csv_file_name: string | null }) => r.csv_file_name)?.csv_file_name ?? "batch";
    const detailName = String(payName).replace(/\.csv$/i, "").replace(/invoices-to-be-paid/i, "decision-detail") + (/decision-detail/i.test(String(payName)) ? "" : "-decision-detail") + ".csv";
    const csv = await loadDecisionDetailCsv(client, invoiceNumbers);
    return new Response(csv, {
      status: 200,
      headers: {
        "content-disposition": `attachment; filename="${detailName.replace(/[^a-z0-9._-]/gi, "-")}"`,
        "content-type": "text/csv; charset=utf-8",
      },
    });
  }

  // One file per vendor: when a vendor is specified, return only that vendor's
  // rows so a multi-vendor batch downloads as separate per-vendor CSV files.
  let query = client
    .from("invoice_payment_processed")
    .select("csv_row,csv_file_name,invoice_number")
    .eq("batch_id", batchId);
  if (vendor) query = query.eq("vendor", vendor);
  const { data, error } = await query.order("invoice_number", { ascending: true });
  if (error) return new Response(`invoice_payment_processed: ${error.message}`, { status: 409 });

  const ledgerRows = (data ?? []) as LedgerRow[];
  if (!ledgerRows.length) return new Response("Batch not found.", { status: 404 });

  const rows = ledgerRows
    .map((row) => row.csv_row)
    .filter((row): row is ProcessedCsvRow => !!row && typeof row === "object");
  const fileName = ledgerRows.find((row) => row.csv_file_name)?.csv_file_name ?? "invoices-to-be-paid.csv";
  const csv = renderCsv(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "content-disposition": `attachment; filename="${fileName}"`,
      "content-type": "text/csv; charset=utf-8",
    },
  });
};
