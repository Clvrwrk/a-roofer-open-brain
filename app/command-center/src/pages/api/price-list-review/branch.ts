import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

const num = (v: unknown) => (v == null ? null : Number(v));
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");

// Lazy branch detail for the Global Price List drill-down (Price List Review hierarchy, P4).
// Returns the branch's CURRENT negotiated price list (with the immediate-prior price + delta per
// item, from v_price_list_branch_pricing) plus its agreement history (current → archived, from
// v_price_list_branch_agreements). Prices are already in the item canonical price_uom. Read-only.
export const GET: APIRoute = async ({ url, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const branch = String(url.searchParams.get("branch") ?? "").trim().replace(/^0+/, "");
  if (!branch) {
    return jsonApiResponse({ error: "invalid_request", error_description: "branch is required." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const [{ data: itemData, error: itemErr }, { data: agData }] = await Promise.all([
    client.from("v_price_list_branch_pricing").select("*").eq("branch_number", branch),
    client.from("v_price_list_branch_agreements").select("*").eq("branch_number", branch),
  ]);
  if (itemErr) {
    return jsonApiResponse({ error: "query_failed", error_description: itemErr.message }, { status: 500 });
  }

  const items = ((itemData as any[] | null) ?? []).map((r) => ({
    itemNumber: r.item_number ?? "",
    description: r.description ?? "",
    manufacturer: r.manufacturer ?? "",
    categoryKey: r.category_key ?? "uncategorized",
    uom: r.canonical_uom ?? "",
    currentPrice: num(r.current_price),
    currentActive: !!r.current_active,
    currentAgreementNumber: r.current_agreement_number ?? "",
    currentEffective: d10(r.current_effective_date),
    currentExpiry: d10(r.current_expiry_date),
    priorPrice: num(r.prior_price),
    priorAgreementNumber: r.prior_agreement_number ?? "",
    priorEffective: d10(r.prior_effective_date),
    priceDelta: num(r.price_delta),
    priceDeltaPct: num(r.price_delta_pct),
  })).sort((a, b) => (a.categoryKey || "").localeCompare(b.categoryKey || "") || a.itemNumber.localeCompare(b.itemNumber));

  const agreements = ((agData as any[] | null) ?? []).map((r) => ({
    agreementId: r.agreement_id,
    agreementNumber: r.agreement_number ?? "",
    versionLabel: r.version_label ?? "",
    effective: d10(r.effective_date),
    expiry: d10(r.expiry_date),
    active: !!r.agreement_active,
    stalenessStatus: r.staleness_status ?? "",
    itemCount: r.item_count == null ? 0 : Number(r.item_count) || 0,
    recencyRank: r.recency_rank == null ? 0 : Number(r.recency_rank) || 0,
    isCurrent: Number(r.recency_rank) === 1,
  })).sort((a, b) => a.recencyRank - b.recencyRank);

  return jsonApiResponse({ ok: true, branch, items, agreements });
};
