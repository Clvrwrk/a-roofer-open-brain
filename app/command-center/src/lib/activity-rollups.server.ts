import { createServerSupabaseClient } from "@lib/supabase.server";
import type { CommandCenterActorType } from "@lib/access-control";

function hourBucket(date = new Date()) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function normalizeActorType(type: CommandCenterActorType): string {
  if (type === "human" || type === "agent" || type === "service_agent" || type === "local_operator") {
    return type;
  }
  return "unknown";
}

/**
 * Upsert hourly route rollup — fire-and-forget; failures must not block requests.
 */
export function persistActivityRollup(pathname: string, actorType: CommandCenterActorType) {
  const route = pathname.split("?")[0] || "/";
  const bucket = hourBucket();
  const actor = normalizeActorType(actorType);

  const { client } = createServerSupabaseClient();
  if (!client) return;

  void (async () => {
    const { data: existing } = await client
      .from("command_center_activity_rollups")
      .select("id, request_count")
      .eq("route", route)
      .eq("actor_type", actor)
      .eq("hour_bucket", bucket)
      .maybeSingle();

    if (existing?.id) {
      await client
        .from("command_center_activity_rollups")
        .update({
          request_count: (existing.request_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return;
    }

    await client.from("command_center_activity_rollups").insert({
      route,
      actor_type: actor,
      hour_bucket: bucket,
      request_count: 1,
    });
  })().catch(() => undefined);
}

export async function fetchActivitySummary(limitHours = 168) {
  const { client } = createServerSupabaseClient();
  if (!client) return { configured: false, routes: [], totals: [] };

  const since = new Date(Date.now() - limitHours * 3600_000).toISOString();
  const { data, error } = await client
    .from("command_center_activity_rollups")
    .select("route, actor_type, hour_bucket, request_count")
    .gte("hour_bucket", since)
    .order("request_count", { ascending: false })
    .limit(500);

  if (error) return { configured: true, error: error.message, routes: [], totals: [] };

  const byRoute = new Map<string, number>();
  for (const row of data ?? []) {
    byRoute.set(row.route, (byRoute.get(row.route) ?? 0) + (row.request_count ?? 0));
  }

  const routes = [...byRoute.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([route, count]) => ({ route, count }));

  return { configured: true, routes, rowCount: data?.length ?? 0, since };
}
