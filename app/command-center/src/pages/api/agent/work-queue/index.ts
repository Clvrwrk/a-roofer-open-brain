import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, serializeActor } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadCommandCenterSurface, serializeLiveWorkQueueItem } from "@lib/live-work";

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const status = url.searchParams.get("status");
  const department = url.searchParams.get("department");
  const surface = await loadCommandCenterSurface();

  const items = surface.items
    .filter((work) => actorCanAccessDepartment(actor, work.department))
    .filter((work) => !status || work.status === status)
    .filter((work) => !department || work.department === department)
    .map((work) => serializeLiveWorkQueueItem(work, actor));

  const departmentCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.department] = (counts[item.department] ?? 0) + 1;
    return counts;
  }, {});
  const workflowCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.workflow] = (counts[item.workflow] ?? 0) + 1;
    return counts;
  }, {});

  return jsonApiResponse({
    status: "ok",
    source: surface.status,
    actor: serializeActor(actor),
    count: items.length,
    departmentCounts,
    errors: surface.errors,
    items,
    workflowCounts,
  });
};
