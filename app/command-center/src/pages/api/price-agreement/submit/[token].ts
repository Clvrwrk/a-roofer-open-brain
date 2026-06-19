import type { APIRoute } from "astro";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { resolveSubmission } from "@lib/agreement-submission";

export const prerender = false;

// PUBLIC, token-gated vendor submission. No actor — the magic token IS the auth
// (random uuid, single-claim). Writes only the vendor's final prices + claims the
// token; cannot enumerate, escalate, or send. Allowlisted in middleware.ts.
export const POST: APIRoute = async ({ params, request }) => {
  const token = String(params.token ?? "");
  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const resolved = await resolveSubmission(client, token);
  if (resolved.state === "not_found") return jsonApiResponse({ error: "not_found", error_description: "Invalid link." }, { status: 404 });
  if (resolved.state === "expired") return jsonApiResponse({ error: "expired", error_description: "This link has expired." }, { status: 410 });
  if (resolved.state === "claimed") return jsonApiResponse({ error: "already_submitted", error_description: "This agreement was already submitted." }, { status: 409 });
  if (resolved.state === "revoked") return jsonApiResponse({ error: "revoked", error_description: "This link was revoked." }, { status: 410 });
  const sub = resolved.submission!;

  const body = await request.json().catch(() => ({}));
  const action = ["approved", "revise", "rejected"].includes(body.action) ? body.action : "approved";
  const note = String(body.note ?? "").slice(0, 2000) || null;
  const claimedBy = String(body.claimedBy ?? "").slice(0, 200) || sub.recipient_name || null;
  const items = Array.isArray(body.items) ? body.items.slice(0, 2000) : [];

  // Atomic single-claim: only the first submit wins (claimed_at goes non-null once).
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await client
    .from("agreement_package_submissions")
    .update({ claimed_at: nowIso, claimed_by: claimedBy, response_action: action, response_note: note, delivery_status: "claimed", updated_at: nowIso })
    .eq("id", sub.id)
    .is("claimed_at", null)
    .select("id")
    .maybeSingle();
  if (claimErr) return jsonApiResponse({ error: "write_failed", error_description: claimErr.message }, { status: 500 });
  if (!claimed) return jsonApiResponse({ error: "already_submitted", error_description: "This agreement was already submitted." }, { status: 409 });

  // Persist the vendor's per-line final prices (only for this package's items).
  const clampNum = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
    return Math.round(n * 100) / 100;
  };
  let written = 0;
  for (const it of items) {
    const itemNumber = String(it.itemNumber ?? "").slice(0, 80);
    if (!itemNumber) continue;
    const price = clampNum(it.vendorFinalPrice);
    const vnote = String(it.vendorNote ?? "").slice(0, 500) || null;
    if (price == null && !vnote) continue;
    const { error } = await client
      .from("agreement_package_items")
      .update({ vendor_final_price: price, vendor_note: vnote, updated_at: nowIso })
      .eq("package_id", sub.package_id)
      .eq("item_number", itemNumber);
    if (!error) written++;
  }

  await client.from("agreement_packages").update({ status: action === "rejected" ? "rejected" : "submitted", updated_at: nowIso }).eq("id", sub.package_id);

  return jsonApiResponse({ ok: true, action, itemsWritten: written });
};
