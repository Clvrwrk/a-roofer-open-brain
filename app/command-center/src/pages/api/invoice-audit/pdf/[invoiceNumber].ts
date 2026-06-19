import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { fetchAndStoreInvoicePdf } from "@lib/abc-invoice-pdf.server";

export const prerender = false;

// Resolves the stored invoice PDF (invoice_documents.storage_bucket/path) into a
// short-lived signed URL and redirects the browser to it, so the user can view
// the actual ABC invoice from the Invoice Audit dashboard. When no PDF is stored
// yet, fetches it on demand from ABC (if creds are configured) and stores it.
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.actor) return buildUnauthorizedResponse();
  const invoiceNumber = String(params.invoiceNumber ?? "").trim();
  if (!invoiceNumber) return jsonApiResponse({ error: "invalid_request", error_description: "invoiceNumber required" }, { status: 400 });

  const { client } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured" }, { status: 503 });

  let doc = (await client
    .from("invoice_documents")
    .select("storage_bucket,storage_path")
    .eq("invoice_number", invoiceNumber)
    .not("storage_path", "is", null)
    .limit(1)
    .maybeSingle()).data as { storage_bucket: string | null; storage_path: string | null } | null;

  // On-demand: no PDF on file → fetch live from ABC, store, and serve it.
  if (!doc?.storage_path) {
    const fetched = await fetchAndStoreInvoicePdf(client, invoiceNumber).catch(() => null);
    if (fetched) doc = { storage_bucket: fetched.bucket, storage_path: fetched.path };
  }

  if (!doc?.storage_path) {
    return jsonApiResponse({ error: "not_found", error_description: "No stored PDF for this invoice, and on-demand fetch is unavailable." }, { status: 404 });
  }

  const { data: signed, error } = await client.storage
    .from(doc.storage_bucket || "invoices")
    .createSignedUrl(doc.storage_path, 300);

  if (error || !signed?.signedUrl) {
    return jsonApiResponse({ error: "sign_failed", error_description: error?.message ?? "could not sign url" }, { status: 500 });
  }
  return new Response(null, { status: 302, headers: { Location: signed.signedUrl } });
};
