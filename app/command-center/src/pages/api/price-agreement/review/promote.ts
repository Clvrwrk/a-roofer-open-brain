import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Promote the confirmed/high-confidence rows of a staged price-list PDF into a live agreement
// (abc_price_agreements + abc_price_list_items + branch match), link the stored PDF, mark the rows
// promoted, and refresh the version-comparison. Only runs once a human has reviewed the matches.
const META: Record<string, { agreement_number: string; branch: string; effective: string; expiry: string | null; pdf: string }> = {
  "denver-branch49-pricelist-2024": { agreement_number: "PE-DENVER-49", branch: "49", effective: "2024-09-01", expiry: null, pdf: "denver-branch49-pricelist-2024.pdf" },
  "dallas-pricelist-apr2025": { agreement_number: "PE-DALLAS-41", branch: "41", effective: "2025-04-21", expiry: null, pdf: "dallas-pricelist-apr2025.pdf" },
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.actor) return buildUnauthorizedResponse();
  let body: any;
  try { body = await request.json(); } catch { return jsonApiResponse({ error: "invalid_request", error_description: "bad json" }, { status: 400 }); }
  const sourceDoc = String(body?.sourceDoc ?? "").trim();
  const meta = META[sourceDoc];
  if (!meta) return jsonApiResponse({ error: "invalid_request", error_description: "unknown sourceDoc" }, { status: 400 });

  const { client } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured" }, { status: 503 });

  // confirmed + high rows with a resolved item id.
  const { data: rows } = await client
    .from("price_list_pdf_staging")
    .select("id,raw_description,price,uom,matched_item_number,match_status")
    .eq("source_doc", sourceDoc)
    .in("match_status", ["confirmed", "high"])
    .not("matched_item_number", "is", null);
  const promote = (rows as any[] | null) ?? [];
  if (!promote.length) return jsonApiResponse({ error: "nothing_to_promote", error_description: "no confirmed/high rows with an item id" }, { status: 400 });

  // Reuse an existing agreement for this source (idempotent re-promote), else create one.
  let agreementId: number;
  const { data: existing } = await client.from("abc_price_agreements").select("id").eq("agreement_number", meta.agreement_number).limit(1).maybeSingle();
  if ((existing as any)?.id) {
    agreementId = (existing as any).id;
    await client.from("abc_price_list_items").delete().eq("agreement_id", agreementId); // replace items
  } else {
    const { data: ins, error: aerr } = await client.from("abc_price_agreements").insert({
      agreement_number: meta.agreement_number, effective_date: meta.effective, expiry_date: meta.expiry,
      source_file: meta.pdf, pdf_storage_bucket: "agreements", pdf_storage_path: meta.pdf, ceo_verified: false,
    }).select("id").single();
    if (aerr || !ins) return jsonApiResponse({ error: "agreement_insert_failed", error_description: aerr?.message }, { status: 500 });
    agreementId = (ins as any).id;
  }

  // Items (deduped by item_number, lowest price wins).
  const byItem = new Map<string, any>();
  for (const r of promote) {
    const prev = byItem.get(r.matched_item_number);
    if (!prev || Number(r.price) < Number(prev.unit_price)) byItem.set(r.matched_item_number, { agreement_id: agreementId, item_number: r.matched_item_number, description: r.raw_description, unit: r.uom, unit_price: Number(r.price) || null });
  }
  const items = [...byItem.values()];
  const { error: ierr } = await client.from("abc_price_list_items").insert(items);
  if (ierr) return jsonApiResponse({ error: "items_insert_failed", error_description: ierr.message }, { status: 500 });

  // Branch match (idempotent): ship_to derived from a PE Ship-To covering this branch.
  const { data: st } = await client.from("abc_regions").select("ship_to_number,branch_numbers").eq("account_type", "Ship-To").like("ship_to_number", "2036874%");
  const shipTo = ((st as any[] | null) ?? []).find((r) => Array.isArray(r.branch_numbers) && r.branch_numbers.map(String).includes(meta.branch))?.ship_to_number ?? null;
  await client.from("abc_price_agreement_branch_matches").upsert(
    { abc_price_agreement_id: agreementId, branch_number: meta.branch, ship_to_number: shipTo, confidence_score: 100 },
    { onConflict: "abc_price_agreement_id,branch_number" },
  );

  await client.from("price_list_pdf_staging").update({ match_status: "promoted" }).eq("source_doc", sourceDoc).in("match_status", ["confirmed", "high"]);
  await client.rpc("refresh_agreement_version_review");

  return jsonApiResponse({ ok: true, agreementId, items: items.length, branch: meta.branch, shipTo });
};
