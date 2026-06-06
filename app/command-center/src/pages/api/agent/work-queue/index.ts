import type { APIRoute } from "astro";
import { actorCanAccessWork, buildUnauthorizedResponse, resolveCommandCenterActor, serializeActor } from "@lib/access-control";
import { jsonApiResponse, serializeWorkQueueItem } from "@lib/agent-api";
import { workDefinitions } from "@lib/cadence";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

export const GET: APIRoute = ({ request, url }) => {
  const actor = resolveCommandCenterActor(request, getRuntimeEnv());
  if (!actor) return buildUnauthorizedResponse();

  const status = url.searchParams.get("status");
  const department = url.searchParams.get("department");

  const items = workDefinitions
    .filter((work) => actorCanAccessWork(actor, work))
    .filter((work) => !status || work.status === status)
    .filter((work) => !department || work.department === department)
    .map((work) => serializeWorkQueueItem(work, actor));

  return jsonApiResponse({
    status: "ok",
    actor: serializeActor(actor),
    count: items.length,
    items,
  });
};
