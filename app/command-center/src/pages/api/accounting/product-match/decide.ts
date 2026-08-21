import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Categorization decisions: bind a vendor price-line to a PE product, or
// reject a proposed binding.
//
// Approving writes products.id onto the source row and REJECTS the line's
// other candidates — a line has exactly one product, so leaving siblings
// pending would let the same line be bound twice by two reviewers.
//
// Taxonomy is never written here. It is read through the product, so a line's
// category cannot drift from the product it is.

const SOURCE_TABLES = new Set(["abc_price_list_items", "price_agreement_items"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  if (action !== "approve" && action !== "reject") {
    return jsonApiResponse({ error: "invalid_request", error_description: "action must be approve or reject." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";
  const nowIso = new Date().toISOString();
  const note = String(body.note ?? "").trim().slice(0, 500) || null;

  // ── Manual bind: the reviewer picked a product the matcher never proposed.
  if (!body.candidateId) {
    const sourceTable = String(body.sourceTable ?? "").trim();
    const sourceId = String(body.sourceId ?? "").trim();
    const productId = String(body.productId ?? "").trim();
    if (!SOURCE_TABLES.has(sourceTable) || !sourceId || !UUID.test(productId)) {
      return jsonApiResponse(
        { error: "invalid_request", error_description: "Manual bind needs sourceTable, sourceId and a product uuid." },
        { status: 400 },
      );
    }
    const written = await writeBinding(client, sourceTable, sourceId, productId, "manual");
    if (written.error) {
      return jsonApiResponse({ error: "write_failed", error_description: written.error }, { status: 500 });
    }
    await client
      .from("product_match_candidate")
      .update({ review_status: "rejected", reviewed_by: who, reviewed_at: nowIso, review_note: "superseded by a manual bind" })
      .eq("source_table", sourceTable)
      .eq("source_id", sourceId)
      .eq("review_status", "pending");
    return jsonApiResponse({ ok: true, bound: productId });
  }

  const candidateId = String(body.candidateId).trim();
  if (!UUID.test(candidateId)) {
    return jsonApiResponse({ error: "invalid_request", error_description: "candidateId must be a uuid." }, { status: 400 });
  }

  const { data: cand } = await client
    .from("product_match_candidate")
    .select("id,source_table,source_id,proposed_product_id,match_tier,review_status")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand) {
    return jsonApiResponse({ error: "not_found", error_description: "No such candidate." }, { status: 404 });
  }
  if (cand.review_status !== "pending") {
    return jsonApiResponse(
      { error: "already_decided", error_description: `This candidate is already ${cand.review_status}.` },
      { status: 409 },
    );
  }

  if (action === "reject") {
    const { error } = await client
      .from("product_match_candidate")
      .update({ review_status: "rejected", reviewed_by: who, reviewed_at: nowIso, review_note: note })
      .eq("id", candidateId);
    if (error) return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
    return jsonApiResponse({ ok: true, status: "rejected" });
  }

  const written = await writeBinding(
    client,
    String(cand.source_table),
    String(cand.source_id),
    String(cand.proposed_product_id),
    String(cand.match_tier),
  );
  if (written.error) {
    return jsonApiResponse({ error: "write_failed", error_description: written.error }, { status: 500 });
  }

  await client
    .from("product_match_candidate")
    .update({ review_status: "approved", reviewed_by: who, reviewed_at: nowIso, review_note: note })
    .eq("id", candidateId);

  // One line, one product: everything else proposed for this line is now moot.
  await client
    .from("product_match_candidate")
    .update({ review_status: "rejected", reviewed_by: who, reviewed_at: nowIso, review_note: "another candidate was approved for this line" })
    .eq("source_table", cand.source_table)
    .eq("source_id", cand.source_id)
    .eq("review_status", "pending")
    .neq("id", candidateId);

  return jsonApiResponse({ ok: true, status: "approved", bound: cand.proposed_product_id });
};

async function writeBinding(
  client: any,
  sourceTable: string,
  sourceId: string,
  productId: string,
  matchType: string,
): Promise<{ error?: string }> {
  if (sourceTable === "abc_price_list_items") {
    // abc_price_list_items.id is an integer; the queue stores it as text.
    const numeric = Number(sourceId);
    if (!Number.isInteger(numeric)) return { error: `Bad abc_price_list_items id '${sourceId}'.` };
    const { error } = await client
      .from("abc_price_list_items")
      .update({ product_id: productId, product_match_type: matchType })
      .eq("id", numeric);
    return { error: error?.message };
  }
  if (!UUID.test(sourceId)) return { error: `Bad price_agreement_items id '${sourceId}'.` };
  const { error } = await client
    .from("price_agreement_items")
    .update({ product_id: productId, match_type: "manual", updated_at: new Date().toISOString() })
    .eq("id", sourceId);
  return { error: error?.message };
}
