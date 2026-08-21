import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Resolves a stored price-agreement PDF (abc_price_agreements.pdf_storage_bucket/path)
// into a short-lived signed URL and redirects the browser to it — the purple Agreement
// pill on the Price Agreement Audit opens the source document this way (migration 136).
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.actor) return buildUnauthorizedResponse();
  const agreementId = String(params.agreementId ?? "").trim();
  if (!agreementId) return jsonApiResponse({ error: "invalid_request", error_description: "agreementId required" }, { status: 400 });

  const { client } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured" }, { status: 503 });

  // ABC agreements are integer-keyed (abc_price_agreements); every other vendor's live in
  // the uuid-keyed price_agreements, which stores a source URL rather than a bucket path.
  // Sending a uuid to the integer column used to blow up as a 500 — answer honestly instead.
  if (!/^\d+$/.test(agreementId)) {
    const alt = (await client
      .from("price_agreements")
      .select("source_pdf_url,source_file")
      .eq("id", agreementId)
      .maybeSingle()).data as { source_pdf_url: string | null; source_file: string | null } | null;

    const ref = alt?.source_pdf_url?.trim();
    if (ref) {
      // scripts/upload-agreement-pdf.mjs binds this column to a BUCKET-RELATIVE path
      // ("agreements/wichita-quote-0049828559.pdf"), not a URL. Redirecting to that
      // verbatim produced a relative Location that resolved against the app host and
      // 404'd — so the link would have stayed broken even after a PDF was uploaded.
      // Absolute URLs still pass straight through.
      if (/^https?:\/\//i.test(ref)) {
        return new Response(null, { status: 302, headers: { Location: ref } });
      }
      const slash = ref.indexOf("/");
      const bucket = slash > 0 ? ref.slice(0, slash) : "agreements";
      const path = slash > 0 ? ref.slice(slash + 1) : ref;
      const { data: signed, error } = await client.storage.from(bucket).createSignedUrl(path, 300);
      if (error || !signed?.signedUrl) {
        return jsonApiResponse({
          error: "sign_failed",
          error_description: `${bucket}/${path} is bound to this agreement but could not be signed: ${error?.message ?? "not in the bucket"}.`,
        }, { status: 404 });
      }
      return new Response(null, { status: 302, headers: { Location: signed.signedUrl } });
    }

    return jsonApiResponse({
      error: "not_found",
      error_description: alt
        ? `No copy of this agreement is stored${alt.source_file ? ` — the record names it as "${alt.source_file}". Upload it with scripts/upload-agreement-pdf.mjs --agreement ${agreementId}` : ""}.`
        : "Unknown agreement.",
    }, { status: 404 });
  }

  const doc = (await client
    .from("abc_price_agreements")
    .select("pdf_storage_bucket,pdf_storage_path")
    .eq("id", agreementId)
    .not("pdf_storage_path", "is", null)
    .limit(1)
    .maybeSingle()).data as { pdf_storage_bucket: string | null; pdf_storage_path: string | null } | null;

  if (!doc?.pdf_storage_path) {
    return jsonApiResponse({ error: "not_found", error_description: "No stored PDF for this agreement." }, { status: 404 });
  }

  const { data: signed, error } = await client.storage
    .from(doc.pdf_storage_bucket || "agreements")
    .createSignedUrl(doc.pdf_storage_path, 300);

  if (error || !signed?.signedUrl) {
    return jsonApiResponse({ error: "sign_failed", error_description: error?.message ?? "could not sign url" }, { status: 500 });
  }
  return new Response(null, { status: 302, headers: { Location: signed.signedUrl } });
};
