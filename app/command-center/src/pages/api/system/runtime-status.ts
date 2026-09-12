import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadRuntimeBoard } from "@lib/runtime-status";

export const prerender = false;

// The runtime board behind /agents (docs/109 D6). Server-computed so every token
// (Supabase service role, Better Stack, GitHub) stays server-side; the page polls
// this every 30 s. No query parameters are accepted.
export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "system")) {
    return jsonApiResponse(
      { error: "forbidden", error_description: "This actor cannot read runtime status." },
      { status: 403 },
    );
  }
  return jsonApiResponse(await loadRuntimeBoard());
};
