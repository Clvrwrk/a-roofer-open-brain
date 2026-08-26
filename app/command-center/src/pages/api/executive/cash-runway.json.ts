import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadCashFlowBoard } from "@lib/cash-flow";

export const prerender = false;

// Executive Cash Runway JSON (mig 281) — the same 13WCF board, gated on the
// executive department for the CEO surface.
export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "executive")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }
  return jsonApiResponse(await loadCashFlowBoard());
};
