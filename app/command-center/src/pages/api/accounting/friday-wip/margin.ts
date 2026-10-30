import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Per-office gross-margin override for WIP budgeting (mig 260).
//
// This drives Estimated total expense = contract × (1 − GM%) and therefore
// Expense Outstanding for every job in the office, so it is deliberately
// narrow: one numeric field, one office, bounded, attributed, and audit-logged.
// Clearing it (value null/"") restores the computed trailing-12-month rate.
//
// Budgeting only — nothing here reaches QBO or AccuLynx.

// Offices are AccuLynx account keys; the board groups by exactly this value.
const LOCATION_PATTERN = /^[a-z0-9_]{2,64}$/;

// Wider than the CHECK on wip_office_margin would strictly need, but the API
// should reject before the database has to.
const MIN_PCT = -50;
const MAX_PCT = 90;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const location = String(body.location ?? "").trim().toLowerCase();
  if (!LOCATION_PATTERN.test(location)) {
    return jsonApiResponse(
      { error: "invalid_request", error_description: "location must be an office key such as 'wichita'." },
      { status: 400 },
    );
  }

  const rawValue = body.gmPct;
  let gmPct: number | null = null;
  if (rawValue != null && String(rawValue).trim() !== "") {
    gmPct = Number(String(rawValue).replace(/[%\s]/g, ""));
    if (!Number.isFinite(gmPct) || gmPct < MIN_PCT || gmPct > MAX_PCT) {
      return jsonApiResponse(
        { error: "invalid_request", error_description: `gmPct must be a percent between ${MIN_PCT} and ${MAX_PCT}, or empty to clear.` },
        { status: 400 },
      );
    }
    gmPct = Math.round(gmPct * 100) / 100;
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  // The office must actually be on the board. Without this check a typo
  // silently creates a margin row that never applies to anything.
  const { data: known } = await client
    .from("v_wip_office_margin")
    .select("location")
    .eq("location", location)
    .maybeSingle();
  if (!known) {
    return jsonApiResponse(
      { error: "not_found", error_description: `No office '${location}' on the WIP board.` },
      { status: 404 },
    );
  }

  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";
  const nowIso = new Date().toISOString();

  const { error } = await client.from("wip_office_margin").upsert(
    {
      location,
      gm_pct_override: gmPct,
      set_by: gmPct == null ? null : who,
      set_at: gmPct == null ? null : nowIso,
      note: gmPct == null ? null : String(body.note ?? "").trim().slice(0, 500) || null,
      updated_at: nowIso,
    },
    { onConflict: "location" },
  );
  if (error) {
    return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
  }

  // Recompute immediately. The override is worthless until the estimates move,
  // and waiting for the nightly rebuild would make the control feel broken.
  const { error: refreshError } = await client.rpc("refresh_wip_ar_master", {});
  if (refreshError) {
    return jsonApiResponse(
      { error: "refresh_failed", error_description: refreshError.message, saved: true },
      { status: 500 },
    );
  }

  const { data: effective } = await client
    .from("v_wip_office_margin")
    .select("location,gm_pct_office,gm_pct_company,gm_pct_override,gm_basis,effective_gm_pct,sample_jobs,sample_billed,set_by,set_at")
    .eq("location", location)
    .maybeSingle();

  return jsonApiResponse({ ok: true, margin: effective });
};
