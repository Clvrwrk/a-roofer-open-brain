import type { APIRoute } from "astro";
import { hasPermission, serializeActor } from "@lib/access-control";
import { requireActor } from "@lib/api-guards";
import { jsonApiResponse } from "@lib/agent-api";
import { warmCommandCenterCaches } from "@lib/prewarm.server";

export const prerender = false;

async function runWarm(locals: App.Locals) {
  const { actor, response: authError } = requireActor(locals, {
    permission: "command_center.read",
    forbiddenMessage: "This actor cannot warm Command Center caches.",
    forbiddenExtra: (a) => ({ actor: serializeActor(a) }),
  });
  if (!actor) return authError;

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
