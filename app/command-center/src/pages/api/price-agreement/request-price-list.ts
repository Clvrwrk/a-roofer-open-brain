import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Drafts a PRICE LIST request for a branch with no/partial negotiated coverage,
// into price_refresh_request (reason='price_list_request', branch grain from
// schema 95). For internal review (Lucinda/Roberto) — drafted, never auto-sent.
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";

  const body = await request.json().catch(() => ({}));
  const vendorBranchId = String(body.vendorBranchId ?? "").trim();
  const branchNumber = String(body.branchNumber ?? "").trim();
  if (!vendorBranchId && !branchNumber) {
    return jsonApiResponse({ error: "invalid_request", error_description: "vendorBranchId or branchNumber is required." }, { status: 400 });
  }
  const managerName = String(body.managerName ?? "").slice(0, 200) || null;
  const managerEmail = String(body.managerEmail ?? "").slice(0, 200) || null;
  const salesRepName = String(body.salesRepName ?? "").slice(0, 200) || null;
  const coverageStatus = ["none", "partial", "full"].includes(body.coverageStatus) ? body.coverageStatus : null;

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  // Idempotent: return an already-open price-list request for this branch.
  let existsQ = client.from("price_refresh_request").select("id,status,created_at").eq("reason", "price_list_request")
    .in("status", ["awaiting_verification", "approved", "ready_to_send", "sent"]).order("created_at", { ascending: false }).limit(1);
  existsQ = vendorBranchId ? existsQ.eq("vendor_branch_id", vendorBranchId) : existsQ.eq("branch_number", branchNumber);
  const { data: existing } = await existsQ.maybeSingle();
  if (existing) return jsonApiResponse({ ok: true, record: existing, alreadyOpen: true });

  const now = new Date();
  const followUp = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const subject = `Price list request — ${body.branchName || "branch " + branchNumber}`;
  const draftBody = [
    `Requesting the current negotiated price list for ${body.branchName || "branch " + branchNumber}${branchNumber ? ` (#${branchNumber})` : ""}.`,
    coverageStatus === "none" ? "No negotiated price list on file." : coverageStatus === "partial" ? "Partial coverage on file." : "",
    managerName ? `Branch manager: ${managerName}${managerEmail ? ` <${managerEmail}>` : ""}.` : "",
    salesRepName ? `Sales rep: ${salesRepName}.` : "",
    "Drafted for internal review (Lucinda/Roberto) — not yet sent.",
  ].filter(Boolean).join(" ");

  const { data, error } = await client
    .from("price_refresh_request")
    .insert({
      reason: "price_list_request",
      status: "awaiting_verification",
      vendor_branch_id: vendorBranchId || null,
      branch_number: branchNumber || null,
      coverage_status: coverageStatus,
      recipient_name: managerName,
      recipient_email: managerEmail,
      branch_manager_name: managerName,
      branch_manager_email: managerEmail,
      sales_rep_name: salesRepName,
      subject,
      body: draftBody,
      channel: "human_send_required",
      external_ref: `price_list:${vendorBranchId || branchNumber}`,
      drafted_at: now.toISOString(),
      next_followup_at: followUp,
    })
    .select("id,status,created_at")
    .single();
  if (error) return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });

  return jsonApiResponse({ ok: true, record: data, draftedBy: who });
};
