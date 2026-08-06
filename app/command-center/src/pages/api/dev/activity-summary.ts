import type { APIRoute } from "astro";
import { fetchActivitySummary } from "@lib/activity-rollups.server";
import { jsonApiResponse } from "@lib/agent-api";
import { requireActor } from "@lib/api-guards";

export const prerender = false;

/** DevTeam plane — session-analyst / dev-conductor service token only. */
export const GET: APIRoute = async ({ locals }) => {
  const { actor, response: authError } = requireActor(locals);
  if (!actor) return authError;

  if (actor.id !== "dev-conductor" && actor.id !== "session-analyst") {
    return jsonApiResponse({ error: "forbidden", message: "DevTeam token required" }, { status: 403 });
  }

  const summary = await fetchActivitySummary();
  return jsonApiResponse({
    status: "ok",
    actor: actor.id,
    summary,
    generatedAt: new Date().toISOString(),
  });
};
