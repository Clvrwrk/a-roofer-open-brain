import type { APIRoute } from "astro";
import { buildUnauthorizedResponse, hasPermission, serializeActor } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { getCommandCenterWarmCadenceState } from "@lib/prewarm.server";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!hasPermission(actor, "command_center.read")) {
    return jsonApiResponse(
      {
        actor: serializeActor(actor),
        error: "forbidden",
        error_description: "This actor cannot inspect Command Center performance cadence.",
      },
      { status: 403 },
    );
  }

  return jsonApiResponse({
    ok: true,
    actor: serializeActor(actor),
    cadence: getCommandCenterWarmCadenceState(),
  });
};
