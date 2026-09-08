import { jsonApiResponse } from "@lib/agent-api";
import { getRuntimeEnv } from "@lib/runtime-env";

// Call only after the route's existing actor and department checks. The legacy
// board has no canonical cycle/version lineage, including its cached exports.
export function canonicalFridayLegacyConflict(): Response | null {
  if (getRuntimeEnv().CRM_WEEKLY_CANONICAL_ENABLED !== "true") return null;
  return jsonApiResponse({
    error: "canonical_friday_required",
    error_description: "Legacy Friday data and actions are unavailable while the canonical weekly workspace is enabled. Open the Friday workspace to review the current week.",
    workspace: "/accounting/friday-wip",
  }, { status: 409 });
}
