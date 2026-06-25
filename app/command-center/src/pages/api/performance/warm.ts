import type { APIRoute } from "astro";
import { buildUnauthorizedResponse, hasPermission, serializeActor } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { warmCommandCenterCaches } from "@lib/prewarm.server";

export const prerender = false;

async function runWarm(locals: App.Locals) {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!hasPermission(actor, "command_center.read")) {
    return jsonApiResponse(
      {
        actor: serializeActor(actor),
        error: "forbidden",
        error_description: "This actor cannot warm Command Center caches.",
      },
      { status: 403 },
    );
  }

  const started = Date.now();
  const results = await warmCommandCenterCaches();
  return jsonApiResponse({
    ok: results.every((result) => result.ok),
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    actor: serializeActor(actor),
    results,
  });
}

export const GET: APIRoute = async ({ locals }) => runWarm(locals);
export const POST: APIRoute = async ({ locals }) => runWarm(locals);
