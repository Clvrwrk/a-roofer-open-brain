import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Persists Price Agreement Builder edits (proposed prices, overrides, exclusions)
// into a per-branch draft package (agreement_packages → agreement_package_items,
// schema 110). Get-or-create the draft package for the branch, then upsert the
// changed items. INTERNAL only — this writes drafts; nothing is sent anywhere.
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";

  const body = await request.json().catch(() => ({}));
  const branchNumber = String(body.branchNumber ?? "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!branchNumber) return jsonApiResponse({ error: "invalid_request", error_description: "branchNumber is required." }, { status: 400 });
  if (items.length === 0) return jsonApiResponse({ error: "invalid_request", error_description: "no items to save." }, { status: 400 });
  if (items.length > 2000) return jsonApiResponse({ error: "too_many_items", error_description: "max 2000 items per save." }, { status: 400 });

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  // Get-or-create the draft package for this branch (vendor-scoped, latest version).
  const { data: existing } = await client
    .from("agreement_packages")
    .select("id,status")
    .eq("branch_number", branchNumber)
    .eq("vendor", "ABC Supply Co.")
    .order("package_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  let packageId = (existing as any)?.id ?? null;
  if (!packageId) {
    const { data: created, error: cErr } = await client
      .from("agreement_packages")
      .insert({
        vendor: "ABC Supply Co.",
        branch_number: branchNumber,
        branch_name: String(body.branchName ?? "").slice(0, 200) || null,
        office: String(body.office ?? "").slice(0, 200) || null,
        status: "draft",
        created_by: who,
      })
      .select("id")
      .single();
    if (cErr) {
      // Concurrent create lost the unique-index race — re-fetch the winner.
      const { data: raced } = await client
        .from("agreement_packages")
        .select("id")
        .eq("branch_number", branchNumber)
        .eq("vendor", "ABC Supply Co.")
        .order("package_version", { ascending: false })
        .limit(1)
        .maybeSingle();
      packageId = (raced as any)?.id ?? null;
      if (!packageId) return jsonApiResponse({ error: "write_failed", error_description: cErr.message }, { status: 500 });
    } else {
      packageId = (created as any).id;
    }
  }

  const nowIso = new Date().toISOString();
  const PRICE_CEILING = 1_000_000; // a per-unit price above $1M is a fat-finger
  const clampNum = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > PRICE_CEILING) return null;
    return Math.round(n * 100) / 100;
  };
  const rows = items.slice(0, 2000).map((it: any) => ({
    package_id: packageId,
    item_number: String(it.itemNumber ?? "").slice(0, 80),
    family_id: it.familyId ? String(it.familyId).slice(0, 120) : null,
    family_name: it.familyName ? String(it.familyName).slice(0, 300) : null,
    description: it.description ? String(it.description).slice(0, 500) : null,
    uom: it.uom ? String(it.uom).slice(0, 20) : null,
    review_class: it.reviewClass ? String(it.reviewClass).slice(0, 4) : null,
    prior_price: clampNum(it.priorPrice),
    prior_price_source: it.priorPriceSource === "agreement" || it.priorPriceSource === "invoice_60d" ? it.priorPriceSource : null,
    proposed_price: clampNum(it.proposedPrice),
    is_override: !!it.isOverride,
    item_status: it.excluded ? "excluded" : "included",
    updated_by: who,
    updated_at: nowIso,
  })).filter((r) => r.item_number);

  const { error: upErr } = await client
    .from("agreement_package_items")
    .upsert(rows, { onConflict: "package_id,item_number" });
  if (upErr) return jsonApiResponse({ error: "write_failed", error_description: upErr.message }, { status: 500 });

  // Touch the package so its updated_at reflects the edit.
  await client.from("agreement_packages").update({ updated_at: nowIso }).eq("id", packageId);

  return jsonApiResponse({ ok: true, packageId, saved: rows.length, savedBy: who });
};
