// GET /api/operations/property-review/candidates?jobId=<uuid>
// Up to 8 properties a review row could belong to: the suggested one, same zip + house
// number, and within 150 m of the job's geocoded point (acculynx_job_property_candidates,
// migration 312). Read-only.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ locals, url }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "operations")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This account cannot read the property review queue." }, { status: 403 });
  }
  const jobId = (url.searchParams.get("jobId") ?? "").trim();
  if (!UUID.test(jobId)) return jsonApiResponse({ error: "invalid_request", error_description: "jobId is required." }, { status: 400 });

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const { data, error } = await client.rpc("acculynx_job_property_candidates", { p_job_id: jobId });
  if (error) return jsonApiResponse({ error: "read_failed", error_description: "Candidates could not be loaded." }, { status: 500 });
  return jsonApiResponse({
    candidates: ((data as any[] | null) ?? []).map((c) => ({
      propertyId: c.property_id,
      address: c.address_full,
      unit: c.unit,
      propertyType: c.property_type,
      geoid: c.geoid,
      distanceM: c.distance_m == null ? null : Number(c.distance_m),
      why: c.why,
    })),
  });
};
