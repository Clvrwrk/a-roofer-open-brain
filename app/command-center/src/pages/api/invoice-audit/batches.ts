// GET /api/invoice-audit/batches
// Recent export batches grouped for the Payments management panel. Read-only.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

interface LedgerRow {
  batch_id: string;
  csv_file_name: string | null;
  vendor: string | null;
  invoice_number: string;
  status: string;
  total_due: number | null;
  processed_at: string | null;
  paid_at: string | null;
  paid_source: string | null;
}

export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot view payment batches." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const { data, error } = await client
    .from("invoice_payment_processed")
    .select("batch_id,csv_file_name,vendor,invoice_number,status,total_due,processed_at,paid_at,paid_source")
    .neq("status", "void")
    .order("processed_at", { ascending: false })
    .limit(1000);
  if (error) return jsonApiResponse({ error: "invoice_payment_processed", error_description: error.message }, { status: 409 });

  interface VendorFile { vendor: string; fileName: string | null; count: number; downloadUrl: string }
  const byBatch = new Map<string, {
    batchId: string;
    processedAt: string | null;
    counts: { exported: number; paid: number; returned: number };
    totalDue: number;
    files: Map<string, VendorFile>;
    invoices: Array<{ invoiceNumber: string; vendor: string | null; status: string; totalDue: number | null; paidAt: string | null; paidSource: string | null }>;
  }>();

  for (const row of (data ?? []) as LedgerRow[]) {
    let batch = byBatch.get(row.batch_id);
    if (!batch) {
      batch = { batchId: row.batch_id, counts: { exported: 0, paid: 0, returned: 0 }, files: new Map(), invoices: [], processedAt: row.processed_at, totalDue: 0 };
      byBatch.set(row.batch_id, batch);
    }
    if (row.status === "exported") batch.counts.exported += 1;
    else if (row.status === "paid") batch.counts.paid += 1;
    else if (row.status === "returned") batch.counts.returned += 1;
    batch.totalDue += Number(row.total_due ?? 0);
    batch.invoices.push({ invoiceNumber: row.invoice_number, paidAt: row.paid_at, paidSource: row.paid_source, status: row.status, totalDue: row.total_due, vendor: row.vendor });
    const vendor = row.vendor ?? "ABC Supply";
    let file = batch.files.get(vendor);
    if (!file) {
      file = { count: 0, downloadUrl: `/api/invoice-audit/batch/${row.batch_id}.csv?vendor=${encodeURIComponent(vendor)}`, fileName: row.csv_file_name, vendor };
      batch.files.set(vendor, file);
    }
    file.count += 1;
  }

  const batches = Array.from(byBatch.values())
    .sort((a, b) => String(b.processedAt ?? "").localeCompare(String(a.processedAt ?? "")))
    .slice(0, 50)
    // detailUrl = Deliverable 2 (decision-detail CSV) for the batch (docs/57 §3c).
    .map((batch) => ({ ...batch, files: Array.from(batch.files.values()), detailUrl: `/api/invoice-audit/batch/${batch.batchId}.csv?kind=detail` }));

  return jsonApiResponse({ batches });
};
