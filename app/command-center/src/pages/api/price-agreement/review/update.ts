import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Confirm / correct / reject a staged price-list match row (migration 139). Body:
// { id, itemNumber?, status }  status ∈ confirmed | rejected | review.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.actor) return buildUnauthorizedResponse();
  let body: any;
  try { body = await request.json(); } catch { return jsonApiResponse({ error: "invalid_request", error_description: "bad json" }, { status: 400 }); }
  const id = String(body?.id ?? "").trim();
  const status = String(body?.status ?? "").trim();
  if (!id || !["confirmed", "rejected", "review"].includes(status)) {
    return jsonApiResponse({ error: "invalid_request", error_description: "id + valid status required" }, { status: 400 });
  }

  const { client } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured" }, { status: 503 });

  const patch: any = { match_status: status };
  if (typeof body.itemNumber === "string") patch.matched_item_number = body.itemNumber.trim() || null;

  const { error } = await client.from("price_list_pdf_staging").update(patch).eq("id", id);
  if (error) return jsonApiResponse({ error: "update_failed", error_description: error.message }, { status: 500 });
  return jsonApiResponse({ ok: true });
};
