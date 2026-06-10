import type { APIRoute } from "astro";
import {
  actorCanAccessDepartment,
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
} from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { loadVendorTerritoryMapPayload } from "@lib/vendor-territories";

export const prerender = false;

function cleanId(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse(
      {
        actor: serializeActor(actor),
        error: "forbidden",
        error_description: "This actor cannot assign vendor branches to PE offices.",
      },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const vendorBranchId = cleanId(body.vendorBranchId ?? body.vendor_branch_id);
  const officeId = cleanId(body.officeId ?? body.office_id);

  if (!vendorBranchId || !officeId) {
    return jsonApiResponse(
      {
        error: "invalid_assignment",
        error_description: "vendorBranchId and officeId are required UUIDs.",
      },
      { status: 400 },
    );
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse(
      {
        error: "supabase_unconfigured",
        error_description: config.missing.join(", "),
      },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const { error } = await client
    .from("vendor_branches")
    .update({
      pricing_territory_office_id: officeId,
      pricing_status: "covered",
      territory_decided_by: actor.displayName || actor.id,
      territory_decided_at: now,
    })
    .eq("id", vendorBranchId);

  if (error) {
    return jsonApiResponse(
      {
        error: "assignment_failed",
        error_description: error.message,
      },
      { status: 409 },
    );
  }

  const payload = await loadVendorTerritoryMapPayload();
  const branch = payload.branches.find((item) => item.id === vendorBranchId) ?? null;

  return jsonApiResponse({
    ok: true,
    persisted: true,
    assignedAt: now,
    actor: serializeActor(actor),
    branch,
    counts: payload.counts,
  });
};
