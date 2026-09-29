// GET /api/operations/property-review/search?q=<address text>
// Find any active property by address when neither the suggestion nor the nearby candidates
// fit. public.properties is service-role only (docs/115), so this runs server-side. Read-only.

import * as Sentry from "@sentry/astro";
import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { ilikeTerm } from "@lib/property-review";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "operations")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This account cannot search properties." }, { status: 403 });
  }
  const q = ilikeTerm((url.searchParams.get("q") ?? "").slice(0, 80));
  if (q.length < 3) return jsonApiResponse({ error: "invalid_request", error_description: "Type at least 3 characters." }, { status: 400 });

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const { data, error } = await client
    .from("properties")
    .select("id,address_full,unit,property_type,geoid")
    .eq("status", "active")
    .ilike("address_full", `%${q}%`)
    .order("address_full")
    .limit(20);
  if (error) {
    Sentry.captureException(error, { tags: { route: "property-review.search" } });
    return jsonApiResponse({ error: "read_failed", error_description: "Search failed. Try again." }, { status: 500 });
  }
  return jsonApiResponse({
    results: ((data as any[] | null) ?? []).map((p) => ({
      propertyId: p.id, address: p.address_full, unit: p.unit, propertyType: p.property_type, geoid: p.geoid,
    })),
  });
};
