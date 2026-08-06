import type { APIRoute } from "astro";
import { hasPermission, serializeActor } from "@lib/access-control";
import { requireActor } from "@lib/api-guards";
import { jsonApiResponse } from "@lib/agent-api";
import { getCommandCenterWarmCadenceState } from "@lib/prewarm.server";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const { actor, response: authError } = requireActor(locals, {
    permission: "command_center.read",
    forbiddenMessage: "This actor cannot inspect Command Center performance cadence.",
    forbiddenExtra: (a) => ({ actor: serializeActor(a) }),
  });
  if (!actor) return authError;

  return jsonApiResponse({
    ok: true,
    actor: serializeActor(actor),
    cadence: getCommandCenterWarmCadenceState(),
  });
};
