// Shared target resolution for the confirm-paid / return endpoints: a request
// may target a whole export batch (batchId) or an explicit invoice list.

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PaymentActionInput {
  batchId?: unknown;
  invoiceNumbers?: unknown;
  reason?: unknown;
}

export async function resolveTargetInvoiceNumbers(
  client: SupabaseClient,
  input: PaymentActionInput,
  statuses: string[],
): Promise<{ invoiceNumbers: string[]; batchId: string | null; error?: string }> {
  const batchId = typeof input.batchId === "string" && UUID_RE.test(input.batchId) ? input.batchId : null;
  const explicit = Array.isArray(input.invoiceNumbers)
    ? input.invoiceNumbers.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  if (batchId) {
    const { data, error } = await client
      .from("invoice_payment_processed")
      .select("invoice_number")
      .eq("batch_id", batchId)
      .in("status", statuses);
    if (error) return { batchId, error: error.message, invoiceNumbers: [] };
    return { batchId, invoiceNumbers: (data ?? []).map((row) => row.invoice_number as string) };
  }

  if (explicit.length) {
    const { data, error } = await client
      .from("invoice_payment_processed")
      .select("invoice_number")
      .in("invoice_number", explicit)
      .in("status", statuses);
    if (error) return { batchId: null, error: error.message, invoiceNumbers: [] };
    return { batchId: null, invoiceNumbers: (data ?? []).map((row) => row.invoice_number as string) };
  }

  return { batchId: null, invoiceNumbers: [] };
}
