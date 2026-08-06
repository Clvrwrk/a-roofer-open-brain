import type { APIRoute } from "astro";
import { actorCanAccessDepartment, serializeActor } from "@lib/access-control";
import { requireActor } from "@lib/api-guards";
import { jsonApiResponse } from "@lib/agent-api";
import { compactVendorTerritoryMapPayload, loadVendorTerritorySurface } from "@lib/vendor-territories";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const { actor, response: authError } = requireActor(locals, {
    department: "accounting",
    forbiddenMessage: "This actor cannot access vendor territory data.",
    forbiddenExtra: (a) => ({ actor: serializeActor(a) }),
  });
  if (!actor) return authError;

  return jsonApiResponse(compactVendorTerritoryMapPayload(await loadVendorTerritorySurface()));
};
