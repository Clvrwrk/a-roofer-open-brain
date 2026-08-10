// GET /api/accounting/kpi-pills — the realtime feed for the invoice-audit KPI row
// (PEC-197). The client re-fetches after every mutating action and on a 60s
// visible-tab poll, then patches the pill DOM in place — no full reload.
// Read-only; command_center.read is enough (service agents may read it too).

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadKpiPills } from "@lib/kpi-pills";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot read accounting KPIs." }, { status: 403 });
  }
  return jsonApiResponse(await loadKpiPills());
};
