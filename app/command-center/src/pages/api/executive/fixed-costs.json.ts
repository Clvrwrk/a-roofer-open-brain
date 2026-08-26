import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadFixedCostBoard } from "@lib/fixed-costs";

export const prerender = false;

// Executive Fixed-Cost board JSON (mig 281). basis_version 0 is provisional —
// the payload carries `provisional` and the surface must banner it until the
// CPA rulings land.
export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "executive")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }
  return jsonApiResponse(await loadFixedCostBoard());
};
