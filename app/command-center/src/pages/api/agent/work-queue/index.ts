import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, resolveCommandCenterActor, serializeActor } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadCommandCenterSurface, serializeLiveWorkQueueItem } from "@lib/live-work";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const actor = resolveCommandCenterActor(request, getRuntimeEnv());
  if (!actor) return buildUnauthorizedResponse();

  const status = url.searchParams.get("status");
  const department = url.searchParams.get("department");
  const surface = await loadCommandCenterSurface();

  const items = surface.items
    .filter((work) => actorCanAccessDepartment(actor, work.department))
    .filter((work) => !status || work.status === status)
    .filter((work) => !department || work.department === department)
    .map((work) => serializeLiveWorkQueueItem(work, actor));

  return jsonApiResponse({
    status: "ok",
    source: surface.status,
    actor: serializeActor(actor),
    count: items.length,
    errors: surface.errors,
    items,
  });
};
