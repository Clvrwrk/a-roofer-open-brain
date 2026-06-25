import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, serializeActor } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { compactVendorTerritoryMapPayload, loadVendorTerritorySurface } from "@lib/vendor-territories";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse(
      {
        actor: serializeActor(actor),
        error: "forbidden",
        error_description: "This actor cannot access vendor territory data.",
      },
      { status: 403 },
    );
  }

  return jsonApiResponse(compactVendorTerritoryMapPayload(await loadVendorTerritorySurface()));
};
