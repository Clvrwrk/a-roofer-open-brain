// GET /api/invoice-audit/batch/[batchId].csv
// Idempotent, side-effect-free download of a previously-exported batch. Streams
// the stored csv_row payloads, so the file is byte-stable and re-downloadable
// (a prefetch or retry changes nothing). Phase-1 mutation lives in process-batch.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { buildFileName, type ProcessedCsvRow, renderCsv } from "@lib/invoice-payment";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LedgerRow {
  csv_row: ProcessedCsvRow | null;
  csv_file_name: string | null;
  invoice_number: string;
}

export const GET: APIRoute = async ({ locals, params }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return new Response("Forbidden", { status: 403 });
  }

  const batchId = (params.batchId ?? "").replace(/\.csv$/i, "");
  if (!UUID_RE.test(batchId)) return new Response("Invalid batch id", { status: 400 });

  const { client, config } = createServerSupabaseClient();
  if (!client) return new Response(`Supabase unconfigured: ${config.missing.join(", ")}`, { status: 503 });

  const { data, error } = await client
    .from("invoice_payment_processed")
    .select("csv_row,csv_file_name,invoice_number")
    .eq("batch_id", batchId)
    .order("invoice_number", { ascending: true });
  if (error) return new Response(`invoice_payment_processed: ${error.message}`, { status: 409 });

  const ledgerRows = (data ?? []) as LedgerRow[];
  if (!ledgerRows.length) return new Response("Batch not found.", { status: 404 });

  const rows = ledgerRows
    .map((row) => row.csv_row)
    .filter((row): row is ProcessedCsvRow => !!row && typeof row === "object");
  const fileName = ledgerRows.find((row) => row.csv_file_name)?.csv_file_name ?? buildFileName(new Date());
  const csv = renderCsv(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "content-disposition": `attachment; filename="${fileName}"`,
      "content-type": "text/csv; charset=utf-8",
    },
  });
};
