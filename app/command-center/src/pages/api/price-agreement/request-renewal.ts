import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Drafts a price-agreement RENEWAL request into price_refresh_request
// (reason='agreement_renewal') for human approval. Never auto-sends — status
// starts at 'awaiting_verification'; a human approves + sends.
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const agreementId = Number(body.agreementId ?? body.agreement_id);
  if (!Number.isFinite(agreementId)) {
    return jsonApiResponse({ error: "invalid_request", error_description: "agreementId is required." }, { status: 400 });
  }
  const agreementNumber = String(body.agreementNumber ?? `#${agreementId}`).slice(0, 80);
  const scope = String(body.scope ?? "").slice(0, 120);
  const salesRep = String(body.salesRep ?? "").slice(0, 120);
  const expiry = String(body.expiry ?? "").slice(0, 20);
  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  // Idempotent-ish: if an open renewal request already exists for this agreement, return it.
  const { data: existing } = await client
    .from("price_refresh_request")
    .select("id,status,created_at")
    .eq("agreement_id", agreementId)
    .eq("reason", "agreement_renewal")
    .in("status", ["awaiting_verification", "approved", "ready_to_send"])
    .limit(1)
    .maybeSingle();
  if (existing) return jsonApiResponse({ ok: true, record: existing, alreadyOpen: true });

  const subject = `Price agreement renewal — ${agreementNumber}${scope ? " · " + scope : ""}`;
  const draftBody = [
    `Requesting renewal of price agreement ${agreementNumber}${scope ? ` (${scope})` : ""}.`,
    expiry ? `It expired ${expiry}.` : "It has lapsed.",
    salesRep ? `Sales rep on file: ${salesRep}.` : "",
    "Please send the current negotiated price list / renewed agreement. Drafted for internal approval — not yet sent.",
  ].filter(Boolean).join(" ");

  const { data, error } = await client
    .from("price_refresh_request")
    .insert({
      agreement_id: agreementId,
      reason: "agreement_renewal",
      status: "awaiting_verification",
      subject,
      body: draftBody,
      recipient_name: salesRep || null,
      sales_rep_name: salesRep || null,
      drafted_at: new Date().toISOString(),
      external_ref: `agreement:${agreementId}`,
    })
    .select("id,status,created_at")
    .single();

  if (error) return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
  return jsonApiResponse({ ok: true, record: data, draftedBy: who });
};
