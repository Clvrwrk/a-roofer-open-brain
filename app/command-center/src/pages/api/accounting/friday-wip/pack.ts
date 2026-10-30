import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const WIP_PACK_BUCKET = "wip-packs";

// Latest Thursday AR/WIP pack (xlsx). The pack is built Thursday mornings on
// the agent host (scripts/wip-pack-thursday.sh → build_pack.py) and uploaded
// to the private `wip-packs` storage bucket; this route redirects to a
// short-lived signed URL for the newest file. ?meta=1 returns JSON instead.
export const GET: APIRoute = async ({ url, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const { data: files, error } = await client.storage.from(WIP_PACK_BUCKET).list("", {
    limit: 100,
    sortBy: { column: "name", order: "desc" },
  });
  if (error) {
    return jsonApiResponse({ error: "storage_error", error_description: error.message }, { status: 500 });
  }
  const latest = (files ?? []).find((f) => f.name.endsWith(".xlsx"));
  if (!latest) {
    return jsonApiResponse(
      {
        error: "no_pack_yet",
        error_description:
          "No AR/WIP pack has been uploaded yet. The Thursday build (openbrain-wip-pack-thursday.timer) publishes to the wip-packs bucket.",
      },
      { status: 404 },
    );
  }

  const { data: signed, error: signError } = await client.storage
    .from(WIP_PACK_BUCKET)
    .createSignedUrl(latest.name, 600, { download: latest.name });
  if (signError || !signed?.signedUrl) {
    return jsonApiResponse({ error: "sign_failed", error_description: signError?.message ?? "no url" }, { status: 500 });
  }

  if (url.searchParams.get("meta") === "1") {
    return jsonApiResponse({
      ok: true,
      name: latest.name,
      updatedAt: latest.updated_at ?? latest.created_at ?? null,
      url: signed.signedUrl,
    });
  }
  return new Response(null, { status: 302, headers: { location: signed.signedUrl, "cache-control": "no-store" } });
};
