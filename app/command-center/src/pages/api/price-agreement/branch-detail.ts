import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadAgreementBuilder } from "@lib/agreement-package";

export const prerender = false;

// Lazy per-branch detail for the Agreement Builder tree: returns the branch's negotiable
// families (with roof-system category + per-variation prefilled prices) so the client can
// render Category → Item → Variation on demand. Heavy to compute, so loaded only on expand.
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.actor) return buildUnauthorizedResponse();
  const branch = (url.searchParams.get("branch") ?? "").trim();
  if (!branch) return jsonApiResponse({ error: "invalid_request", error_description: "branch required" }, { status: 400 });

  const data = await loadAgreementBuilder(branch);
  if (data.status !== "live" || !data.branch) {
    return jsonApiResponse({ error: "not_found", error_description: "No negotiable detail for this branch." }, { status: 404 });
  }
  return jsonApiResponse({
    ok: true,
    branch: data.branch,
    packageId: data.packageId,
    recipient: data.recipient,
    families: data.families,
    totals: data.totals,
  });
};
