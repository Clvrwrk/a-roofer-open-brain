import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Inline edits to the 13WCF drivers (wcf_assumptions, mig 281). Only keys that
// already exist in the table are writable, and every value is clamped-validated
// against the row's own min/max bounds (T-07-04: the key set is data-defined,
// but membership is checked against the table before any write). Every change
// is audit-logged to wcf_assumption_updates, mirroring wip_ar_master_updates.
const KEY_PATTERN = /^[a-z0-9_]{1,64}$/;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const key = String(body.key ?? "").trim();
  const rawValue = Number(String(body.value ?? "").replace(/[$,%\s]/g, ""));

  if (!KEY_PATTERN.test(key)) {
    return jsonApiResponse({ error: "invalid_request", error_description: "key must be a known assumption key." }, { status: 400 });
  }
  if (!Number.isFinite(rawValue)) {
    return jsonApiResponse({ error: "invalid_request", error_description: "value must be a number." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const { data: existing } = await client
    .from("wcf_assumptions")
    .select("key, value, min_value, max_value")
    .eq("key", key)
    .maybeSingle();
  if (!existing) {
    return jsonApiResponse({ error: "not_found", error_description: `Unknown assumption ${key}.` }, { status: 404 });
  }
  const min = Number(existing.min_value ?? 0);
  const max = Number(existing.max_value ?? Number.MAX_SAFE_INTEGER);
  if (rawValue < min || rawValue > max) {
    return jsonApiResponse(
      { error: "invalid_request", error_description: `${key} must be between ${min} and ${max}.` },
      { status: 400 },
    );
  }

  const who = actor.displayName ?? actor.id ?? "operator";
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("wcf_assumptions")
    .update({ value: rawValue, updated_by: who, updated_at: nowIso })
    .eq("key", key)
    .select("key, value, updated_by, updated_at")
    .single();
  if (error) {
    return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
  }

  await client.from("wcf_assumption_updates").insert({
    key,
    old_value: existing.value == null ? null : Number(existing.value),
    new_value: rawValue,
    updated_by: who,
    updated_at: nowIso,
  });

  return jsonApiResponse({ ok: true, record: data });
};
