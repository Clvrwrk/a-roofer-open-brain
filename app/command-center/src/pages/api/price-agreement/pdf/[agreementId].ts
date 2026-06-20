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
