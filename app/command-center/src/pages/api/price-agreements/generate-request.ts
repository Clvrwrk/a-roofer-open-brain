// POST /api/price-agreements/generate-request { vendorSlug }
// docs/83 P2: freezes this month's vendor ask — every gap item (with any human
// proposed price) + every currently negotiated item (with proposed updates) —
// into price_agreement_requests.payload, and marks the included proposals
// status='included' for the month. The HTML/CSV/MD outputs render from the
// snapshot. Re-generating in the same month supersedes the prior snapshot.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadPriceAgreementManagement } from "@lib/price-agreement-management";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { reportWriteFailure } from "@lib/supabase-write";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot generate price agreement requests." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { vendorSlug?: string };
  const vendorSlug = String(body.vendorSlug ?? "").trim();
  if (!vendorSlug) return jsonApiResponse({ error: "invalid_request", error_description: "vendorSlug is required." }, { status: 400 });

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const data = await loadPriceAgreementManagement();
  const monthLabel = new Date().toISOString().slice(0, 7);
  const nowIso = new Date().toISOString();

  const offices = data.offices
    .map((o) => ({
      officeId: o.officeId,
      officeName: o.officeName,
      vendor: o.vendors.find((v) => v.vendorSlug === vendorSlug) ?? null,
    }))
    .filter((o) => o.vendor);
  if (!offices.length) return jsonApiResponse({ error: "not_found", error_description: `No data for vendor '${vendorSlug}'.` }, { status: 404 });

  const vendorId = offices[0]!.vendor!.vendorId;
  const vendorName = offices[0]!.vendor!.vendorName;
  let gapCount = 0;
  let renewalCount = 0;
  const payloadOffices = offices.map((o) => {
    const v = o.vendor!;
    gapCount += v.gapItems.length;
    renewalCount += v.renewalItems.length;
    return {
      officeName: o.officeName,
      agreements: v.agreements,
      gapItems: v.gapItems,
      renewalItems: v.renewalItems,
    };
  });

  // Supersede any earlier snapshot for the same vendor+month, then freeze this one.
  const { error: supersedeError } = await client.from("price_agreement_requests").update({ status: "superseded", updated_at: nowIso })
    .eq("vendor_id", vendorId).eq("month_label", monthLabel).eq("status", "generated");
  if (supersedeError) return jsonApiResponse({ error: "write_failed", error_description: supersedeError.message }, { status: 500 });
  const { data: inserted, error } = await client
    .from("price_agreement_requests")
    .insert({
      vendor_id: vendorId,
      month_label: monthLabel,
      generated_by: actor.displayName,
      gap_count: gapCount,
      renewal_count: renewalCount,
      payload: { vendorName, vendorSlug, monthLabel, generatedAt: nowIso, generatedBy: actor.displayName, offices: payloadOffices },
    })
    .select("id")
    .single();
  if (error) return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });

  // The snapshot is already committed, so failing the request here would make a retry
  // supersede a request the caller never learned about. Report it instead.
  const { error: includeError } = await client.from("price_agreement_proposals").update({ status: "included", month_label: monthLabel, updated_at: nowIso })
    .eq("vendor_id", vendorId).eq("status", "draft");
  reportWriteFailure("price-agreements/generate-request price_agreement_proposals", includeError);

  return jsonApiResponse({ ok: true, requestId: (inserted as any).id, monthLabel, gapCount, renewalCount, proposalsMarkedIncluded: !includeError });
};
