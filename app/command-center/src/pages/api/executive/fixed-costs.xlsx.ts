import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadFixedCostBoard } from "@lib/fixed-costs";
import { buildFixedCostWorkbook, fixedCostFileName, xlsxResponse } from "@lib/wcf-xlsx.server";

export const prerender = false;

// One-click Fixed-Cost workbook — Pools / Register / Allocation Preview tabs,
// live data at the moment of the request, as-of stamped filename (mig 281).
export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "executive")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }
  const board = await loadFixedCostBoard();
  if (board.status !== "live") {
    return jsonApiResponse({ error: "unavailable", error_description: board.error }, { status: 503 });
  }
  const buffer = await buildFixedCostWorkbook(board);
  return xlsxResponse(buffer, fixedCostFileName(board.generatedAt));
};
