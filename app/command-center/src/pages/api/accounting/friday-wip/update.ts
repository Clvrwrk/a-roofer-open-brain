import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Inline edits from the Friday WIP/AR board. Only the meeting-editable
// columns are writable — the computed columns are owned by the nightly
// refresh (mig 215) and can never be edited from here. Every change is
// audit-logged to wip_ar_master_updates.
const EDITABLE_FIELDS = new Set([
  "expected_invoice_cash_date",
  "expected_paid_full_date",
  "collected_since",
  "notes",
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeValue(field: string, raw: unknown): { ok: boolean; value: string | null; reason?: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  const value = String(raw).trim();
  if (field === "collected_since") {
    if (value !== "Y" && value !== "N") return { ok: false, value: null, reason: "collected_since must be Y or N" };
    return { ok: true, value };
  }
  if (field === "notes") {
    return { ok: true, value: value.slice(0, 1000) };
  }
  // date fields
  if (!DATE_PATTERN.test(value)) return { ok: false, value: null, reason: `${field} must be YYYY-MM-DD` };
  const parsed = new Date(value + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime())) return { ok: false, value: null, reason: `${field} is not a real date` };
  return { ok: true, value };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const jobId = String(body.jobId ?? "").trim();
  const field = String(body.field ?? "").trim();

  if (!JOB_ID_PATTERN.test(jobId)) {
    return jsonApiResponse({ error: "invalid_request", error_description: "jobId must be an AccuLynx job GUID." }, { status: 400 });
  }
  if (!EDITABLE_FIELDS.has(field)) {
    return jsonApiResponse({ error: "invalid_request", error_description: `field must be one of: ${[...EDITABLE_FIELDS].join(", ")}` }, { status: 400 });
  }
  const sanitized = sanitizeValue(field, body.value);
  if (!sanitized.ok) {
    return jsonApiResponse({ error: "invalid_request", error_description: sanitized.reason }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";
  const nowIso = new Date().toISOString();

  const { data: existing } = await client
    .from("wip_ar_master")
    .select(`acculynx_job_id, ${field}`)
    .eq("acculynx_job_id", jobId)
    .maybeSingle();
  if (!existing) {
    return jsonApiResponse({ error: "not_found", error_description: `No WIP/AR row for job ${jobId}.` }, { status: 404 });
  }

  const { data, error } = await client
    .from("wip_ar_master")
    .update({ [field]: sanitized.value, updated_by: who, updated_at: nowIso })
    .eq("acculynx_job_id", jobId)
    .select(`acculynx_job_id, ${field}, updated_by, updated_at`)
    .single();
  if (error) {
    return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
  }

  await client.from("wip_ar_master_updates").insert({
    acculynx_job_id: jobId,
    field,
    old_value: (existing as Record<string, unknown>)[field] == null ? null : String((existing as Record<string, unknown>)[field]),
    new_value: sanitized.value,
    updated_by: who,
    updated_at: nowIso,
  });

  return jsonApiResponse({ ok: true, record: data });
};
