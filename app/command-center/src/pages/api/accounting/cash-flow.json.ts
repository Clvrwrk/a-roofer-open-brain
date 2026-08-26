import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadCashFlowBoard } from "@lib/cash-flow";

export const prerender = false;

// 13WCF board JSON (mig 281) — same loader as /accounting/cash-flow and the
// executive Cash Runway surface. No query params reach Supabase (T-07-04:
// nothing to allowlist — the board is one fixed population).
export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }
  return jsonApiResponse(await loadCashFlowBoard());
};
