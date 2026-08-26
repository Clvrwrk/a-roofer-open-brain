import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadCashFlowBoard } from "@lib/cash-flow";
import { buildCashFlowWorkbook, cashFlowFileName, xlsxResponse } from "@lib/wcf-xlsx.server";

export const prerender = false;

// One-click 13WCF workbook — the SAME live data the surface renders, at the
// moment of the request, stamped as-of in the filename (mig 281).
export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }
  const board = await loadCashFlowBoard();
  if (board.status !== "live") {
    return jsonApiResponse({ error: "unavailable", error_description: board.error }, { status: 503 });
  }
  const buffer = await buildCashFlowWorkbook(board);
  return xlsxResponse(buffer, cashFlowFileName(board.generatedAt));
};
