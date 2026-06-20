import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

// Lazy line loader for the Order Audit drill-down. The dashboard renders the
// office→branch→order summary tree without lines (so it never fetches the full
// 18.6k-line set); this returns one order's lines on expand. Read-only.
export const GET: APIRoute = async ({ url, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const orderNumber = String(url.searchParams.get("order") ?? "").trim();
  if (!orderNumber) {
    return jsonApiResponse({ error: "invalid_request", error_description: "order is required." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const { data, error } = await client
    .from("v_order_audit_line")
    .select("*")
    .eq("order_number", orderNumber);
  if (error) {
    return jsonApiResponse({ error: "query_failed", error_description: error.message }, { status: 500 });
  }

  // Current ABC API price per item at this order's branch (monthly seed, migration 134).
  const { data: ordRow } = await client.from("v_order_audit_order").select("branch_number").eq("order_number", orderNumber).limit(1).maybeSingle();
  const branchNorm = String((ordRow as any)?.branch_number ?? "").replace(/^0+/, "");
  const apiByItem = new Map<string, { price: number; uom: string }>();
  if (branchNorm) {
    const { data: apiRows } = await client.from("v_branch_item_api_price").select("item_number,api_price,api_uom").eq("branch_number_norm", branchNorm);
    for (const r of (apiRows as any[] | null) ?? []) apiByItem.set(r.item_number, { price: num(r.api_price), uom: r.api_uom ?? "" });
  }

  const lines = ((data as any[] | null) ?? []).map((l) => ({
    lineId: l.line_id,
    lineKey: l.line_key ?? "",
    itemNumber: l.item_number ?? "",
    itemDescription: l.item_description ?? "",
    qty: num(l.quantity),
    uom: l.uom ?? "",
    unitPrice: num(l.unit_price),
    extendedPrice: num(l.extended_price),
    apiPrice: apiByItem.get(l.item_number ?? "")?.price ?? null,
    apiUom: apiByItem.get(l.item_number ?? "")?.uom ?? "",
    negotiatedPrice: l.negotiated_price == null ? null : num(l.negotiated_price),
    variancePct: l.variance_pct == null ? null : num(l.variance_pct),
    varianceExt: l.variance_ext == null ? null : num(l.variance_ext),
    covered: !!l.covered,
    uomMismatch: l.uom_mismatch === true,
    negotiatedUom: l.negotiated_uom ?? "",
    categoryKey: l.category_key ?? "uncategorized",
  })).sort((a, b) => Math.abs(b.variancePct ?? -1) - Math.abs(a.variancePct ?? -1));

  return jsonApiResponse({ ok: true, lines });
};
