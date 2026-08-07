// POST /api/price-agreements/propose
// { officeId, vendorId, itemNumber, kind: 'gap'|'renewal', proposedPrice|null,
//   itemDescription?, uom?, currentPrice? }
// Persists a human target price for the monthly vendor request (docs/83 P1).
// Draft rows are unique per (office, vendor, item, kind); a null price clears.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot set price proposals." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const officeId = String(body.officeId ?? "").trim();
  const vendorId = String(body.vendorId ?? "").trim();
  const itemNumber = String(body.itemNumber ?? "").trim();
  const kind = body.kind === "renewal" ? "renewal" : body.kind === "gap" ? "gap" : "";
  const proposedPrice = body.proposedPrice == null || body.proposedPrice === "" ? null : Number(body.proposedPrice);
  if (!officeId || !vendorId || !itemNumber || !kind || (proposedPrice != null && (!Number.isFinite(proposedPrice) || proposedPrice < 0))) {
    return jsonApiResponse({ error: "invalid_request", error_description: "officeId, vendorId, itemNumber, kind ('gap'|'renewal') and a non-negative proposedPrice (or null to clear) are required." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const nowIso = new Date().toISOString();
  const { data: existing, error: existingError } = await client
    .from("price_agreement_proposals")
    .select("id")
    .eq("office_id", officeId).eq("vendor_id", vendorId).eq("item_number", itemNumber).eq("kind", kind).eq("status", "draft")
    .limit(1);
  if (existingError) return jsonApiResponse({ error: "read_failed", error_description: existingError.message }, { status: 500 });
  const row = (existing as any[] | null)?.[0] ?? null;

  if (proposedPrice == null) {
    if (row) {
      const { error: clearError } = await client.from("price_agreement_proposals").update({ status: "superseded", updated_at: nowIso }).eq("id", row.id);
      if (clearError) return jsonApiResponse({ error: "write_failed", error_description: clearError.message }, { status: 500 });
    }
    return jsonApiResponse({ ok: true, cleared: true });
  }

  const patch = {
    proposed_price: proposedPrice,
    current_price: body.currentPrice == null ? null : Number(body.currentPrice) || null,
    item_description: body.itemDescription ? String(body.itemDescription).slice(0, 300) : null,
    uom: body.uom ? String(body.uom).slice(0, 20) : null,
    proposed_by: actor.displayName,
    proposed_at: nowIso,
    updated_at: nowIso,
  };
  const result = row
    ? await client.from("price_agreement_proposals").update(patch).eq("id", row.id).select("id").single()
    : await client.from("price_agreement_proposals").insert({ office_id: officeId, vendor_id: vendorId, item_number: itemNumber, kind, status: "draft", ...patch }).select("id").single();
  if (result.error) return jsonApiResponse({ error: "write_failed", error_description: result.error.message }, { status: 500 });

  return jsonApiResponse({ ok: true, id: (result.data as any).id, proposedPrice });
};
