// GET /api/invoice-audit/pending-verification
// Invoice Audit v2 (docs/81 decisions 3+4): runs the idempotent 60-day sweep
// (Awaiting Payment + invoice_date >= 60 days old -> paid_pending_verification),
// then lists every invoice awaiting the human Paid-Verified toggle. Invoice-level
// only — no line detail by design.

import type { APIRoute } from "astro";
import { requireActor, requireSupabaseClient } from "@lib/api-guards";
import { jsonApiResponse } from "@lib/agent-api";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const { actor, response: authError } = requireActor(locals, { department: "accounting", forbiddenMessage: "This actor cannot view payment verification." });
  if (!actor) return authError;

  const { client, response: supabaseError } = requireSupabaseClient();
  if (!client) return supabaseError;

  const { data: swept, error: sweepError } = await client.rpc("invoice_payment_verification_sweep");
  if (sweepError) return jsonApiResponse({ error: "verification_sweep", error_description: sweepError.message }, { status: 409 });

  const { data, error } = await client
    .from("invoice_payment_processed")
    .select("invoice_number, invoice_date, total_due, vendor, batch_id, csv_file_name, updated_at")
    .eq("status", "paid_pending_verification")
    .order("invoice_date", { ascending: true })
    .limit(1000);
  if (error) return jsonApiResponse({ error: "invoice_payment_processed", error_description: error.message }, { status: 409 });

  return jsonApiResponse({
    swept: Number(swept ?? 0),
    invoices: (data ?? []).map((r) => ({
      invoiceNumber: r.invoice_number,
      invoiceDate: r.invoice_date,
      totalDue: Number(r.total_due ?? 0),
      vendor: r.vendor,
      batchId: r.batch_id,
      fileName: r.csv_file_name,
    })),
  });
};
