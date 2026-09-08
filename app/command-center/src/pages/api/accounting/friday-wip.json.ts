import type { APIRoute } from "astro";
import { canonicalFridayLegacyConflict } from "@lib/friday-wip-legacy-guard";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadFridayWipBoard } from "@lib/friday-wip";

export const prerender = false;

// Friday WIP/AR board JSON — same loader as the page, re-exposed for
// client-side refresh (executive/pipeline pattern). No query params are
// forwarded to Supabase (T-07-04: nothing to allowlist — the board is one
// fixed population).
export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }
  const canonicalConflict = canonicalFridayLegacyConflict();
  if (canonicalConflict) return canonicalConflict;
  const board = await loadFridayWipBoard();
  return jsonApiResponse(board);
};
