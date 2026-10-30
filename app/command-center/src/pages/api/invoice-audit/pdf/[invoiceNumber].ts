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

  // Silo (docs/87): resolve the invoice's vendor FIRST — invoice_documents is
  // (vendor_id, invoice_number)-unique, so an un-scoped lookup on a colliding
  // number serves whichever vendor's PDF sorts first.
  const { data: vRow } = await client.from("v_invoice_audit_invoice_vendor").select("vendor_slug").eq("invoice_number", invoiceNumber).limit(2);
  const slugs = ((vRow as any[] | null) ?? []).map((r) => String(r.vendor_slug));
  if (slugs.length > 1) {
    return jsonApiResponse({ error: "ambiguous_vendor", error_description: `Invoice ${invoiceNumber} exists for ${slugs.join(" and ")} — cannot pick a PDF.` }, { status: 409 });
  }
  let docQuery = client
    .from("invoice_documents")
    .select("storage_bucket,storage_path,vendor_id")
    .eq("invoice_number", invoiceNumber)
    .not("storage_path", "is", null);
  if (slugs.length === 1) {
    const { data: vend } = await client.from("vendors").select("id").eq("slug", slugs[0]).maybeSingle();
    if ((vend as any)?.id) docQuery = docQuery.eq("vendor_id", (vend as any).id);
  }
  let doc = (await docQuery.limit(1).maybeSingle()).data as { storage_bucket: string | null; storage_path: string | null } | null;

  // On-demand: no PDF on file → fetch live from ABC, store, and serve it.
  // Silo eval 2026-08-07: the live-fetch path is the ABC API — only take it for
  // ABC invoices, or a colliding SRS/QXO number would serve ABC's PDF.
  if (!doc?.storage_path) {
    if (slugs.length === 0 || slugs.includes("abc-supply")) {
      const fetched = await fetchAndStoreInvoicePdf(client, invoiceNumber).catch(() => null);
      if (fetched) doc = { storage_bucket: fetched.bucket, storage_path: fetched.path };
    }
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
