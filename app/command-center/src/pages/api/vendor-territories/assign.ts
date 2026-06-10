import type { APIRoute } from "astro";
import {
  actorCanAccessDepartment,
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
} from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { recordLiveWorkDecision, type LiveWorkItem } from "@lib/live-work";
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

  const canAssignTerritory =
    hasPermission(actor, "approval.decide") &&
    (actorCanAccessDepartment(actor, "accounting") || actorCanAccessDepartment(actor, "operations"));

  if (!canAssignTerritory) {
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
  const office = payload.offices.find((item) => item.id === officeId) ?? null;
  let workDecision: Awaited<ReturnType<typeof recordLiveWorkDecision>> | null = null;
  let workSyncError: string | null = null;

  if (branch) {
    const branchLabel = [branch.vendorName, branch.branchNumber, branch.branchName].filter(Boolean).join(" / ");
    const officeLabel = office?.name ?? branch.assignedOfficeName ?? officeId;
    const work: LiveWorkItem = {
      id: `vendor-territory-branch-route-${vendorBranchId}`,
      workKey: `vendor-territory:branch-route:${vendorBranchId}`,
      title: `Vendor branch routed: ${branchLabel}`,
      department: "accounting",
      workflow: "vendor-territory-branch-route",
      cadence: "ad-hoc",
      owner: "@ob-accounting",
      primaryHuman: actor.displayName || "Command Center",
      nextRun: "Immediate",
      status: "needs_review",
      priority: branch.markerPriority === "needs_office_route" ? "high" : "normal",
      approval: "before_write",
      auditorRequired: false,
      evidence: `Branch ${branchLabel} assigned to ${officeLabel}.`,
      action: "Review pricing waterfall",
      detail:
        `${branchLabel} is now assigned to ${officeLabel}. Next pricing source: ${branch.priceEvidenceLabel}.`,
      href: `/vendor-territories?branch=${encodeURIComponent(branch.id)}`,
      sourceLabel: "Vendor Territory Map",
      sourceTable: "vendor_branches",
      sourcePk: branch.id,
      valueAtRisk: 0,
      auditTrail: [
        `Saved office route at ${now}`,
        `Pricing waterfall status: ${branch.priceEvidenceStatus}`,
        `Pricing rows: ${branch.pricingWaterfall.itemCount} lines / ${branch.pricingWaterfall.uniqueSkuCount} SKUs`,
      ],
    };

    try {
      workDecision = await recordLiveWorkDecision(
        work,
        actor,
        "mark_done",
        `Assigned ${branchLabel} to ${officeLabel}.`,
        {
          actionIntent: "assign_vendor_branch_office",
          actionLabel: "Save vendor branch PE office route",
          nextStep: branch.pricingWaterfall.isAuthoritative
            ? "Pricing waterfall is authoritative; branch can inherit vendor color."
            : "Pricing remains incomplete; route Ops and Accounting through the pricing waterfall.",
        },
      );
    } catch (decisionError) {
      workSyncError = decisionError instanceof Error ? decisionError.message : "Dashboard work item sync failed.";
    }
  }

  return jsonApiResponse({
    ok: true,
    persisted: true,
    assignedAt: now,
    actor: serializeActor(actor),
    branch,
    counts: payload.counts,
    workDecision: workDecision
      ? {
          actionId: workDecision.action?.id ?? null,
          workItemId: workDecision.workItem?.id ?? null,
          memory: workDecision.memory,
        }
      : null,
    workSyncError,
  });
};
