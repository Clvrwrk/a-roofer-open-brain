import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { buildAgreementExport } from "@lib/agreement-export";
import { classifyRecipients } from "@lib/outbound-guard";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

const publicBase = () =>
  String(getRuntimeEnv().COMMAND_CENTER_PUBLIC_URL ?? "https://cc.proexteriorsus.net").replace(/\/+$/, "");

// Drafts a per-branch agreement package for INTERNAL review (Lucinda/Roberto),
// into price_refresh_request (reason='agreement_package', status='awaiting_verification').
// The recipient (Justin Garza, ABC national account manager) is EXTERNAL — the draft
// is flagged human-send-required and this endpoint NEVER sends anything. The external
// send happens by a human from Hermes / Google Workspace. (Consent boundary; first
// deployment rule = zero external agent sends.)
export const POST: APIRoute = async (ctx) => {
  try {
    return await handle(ctx);
  } catch (e: any) {
    return jsonApiResponse({ error: "handoff_failed", error_description: String(e?.message ?? e) }, { status: 500 });
  }
};

const handle: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";

  const body = await request.json().catch(() => ({}));
  const branchNumber = String(body.branchNumber ?? "").trim();
  if (!branchNumber) return jsonApiResponse({ error: "invalid_request", error_description: "branchNumber is required." }, { status: 400 });

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const exp = await buildAgreementExport(branchNumber);
  if (!exp.ok || !exp.branch) return jsonApiResponse({ error: "no_data", error_description: "No branch / negotiable items found." }, { status: 404 });

  // Classify the recipient. Justin Garza @abcsupply.com is EXTERNAL → human-send-required.
  const klass = classifyRecipients([exp.recipient.email]);
  const humanSendRequired = !klass.ok;

  // Idempotent: return an already-open draft for this branch.
  const { data: existing } = await client
    .from("price_refresh_request")
    .select("id,status,created_at")
    .eq("reason", "agreement_package")
    .eq("branch_number", branchNumber)
    .in("status", ["awaiting_verification", "approved", "ready_to_send"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return jsonApiResponse({ ok: true, record: existing, alreadyOpen: true, humanSendRequired });

  const base = publicBase();
  const pdfUrl = `${base}/api/price-agreement/package/pdf?branch=${encodeURIComponent(branchNumber)}`;
  const csvUrl = `${base}/api/price-agreement/package/csv?branch=${encodeURIComponent(branchNumber)}`;
  const itemCount = exp.rows.length;
  const pricedCount = exp.rows.filter((r) => r.finalPrice > 0).length;

  const subject = `ABC negotiated price agreement — ${exp.branch.name} (#${exp.branch.number})`;
  const draftBody = [
    `Draft negotiated price agreement for ${exp.branch.name} (#${exp.branch.number}${exp.branch.office ? ", " + exp.branch.office : ""}).`,
    `${itemCount} negotiable items (${pricedCount} with a proposed price).`,
    `Recipient: ${exp.recipient.name}, ABC National Account Manager (${exp.recipient.email}).`,
    `PDF: ${pdfUrl}`,
    `CSV: ${csvUrl}`,
    "",
    "INTERNAL REVIEW: Lucinda/Roberto — review the PDF/CSV, then send to the account manager",
    "from Hermes / Google Workspace. This is a draft prepared by an agent; it has NOT been sent.",
  ].join("\n");

  const { data, error } = await client
    .from("price_refresh_request")
    .insert({
      reason: "agreement_package",
      status: "awaiting_verification",
      branch_number: branchNumber,
      recipient_name: exp.recipient.name,
      recipient_email: exp.recipient.email,
      subject,
      body: draftBody,
      channel: humanSendRequired ? "human_send_required" : "internal",
      external_ref: `agreement_package:branch:${branchNumber}`,
      drafted_at: new Date().toISOString(),
    })
    .select("id,status,created_at")
    .single();
  if (error) return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });

  // Move the package into review (best-effort; no-op if no package row yet).
  await client.from("agreement_packages").update({ status: "pending_review", updated_at: new Date().toISOString() }).eq("branch_number", branchNumber).eq("vendor", "ABC Supply Co.");

  return jsonApiResponse({
    ok: true,
    record: data,
    draftedBy: who,
    humanSendRequired,
    recipient: exp.recipient,
    note: "Draft created for internal review. Nothing was sent — the external send is a human action.",
  });
};
