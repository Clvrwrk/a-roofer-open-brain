import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv } from "@lib/runtime-env";
import { businessDaysExpiry } from "@lib/agreement-submission";

export const prerender = false;

const publicBase = () =>
  String(getRuntimeEnv().COMMAND_CENTER_PUBLIC_URL ?? "https://cc.proexteriorsus.net").replace(/\/+$/, "");

// Issues a single-claim magic link for a branch's package. AUTH-GATED: this IS the
// human-approval step — a token is created only when an authenticated operator
// clicks it. The agent does NOT email the link; the operator copies the returned
// URL and sends it from Hermes / Google Workspace. Idempotent: returns the active
// link if one is already outstanding for the package.
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";

  const body = await request.json().catch(() => ({}));
  const branchNumber = String(body.branchNumber ?? "").trim();
  if (!branchNumber) return jsonApiResponse({ error: "invalid_request", error_description: "branchNumber is required." }, { status: 400 });

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const { data: pkg } = await client
    .from("agreement_packages")
    .select("id,branch_name,national_account_manager_name,national_account_manager_email")
    .eq("branch_number", branchNumber)
    .eq("vendor", "ABC Supply Co.")
    .order("package_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pkg) return jsonApiResponse({ error: "no_package", error_description: "Save the agreement package before issuing a link." }, { status: 400 });
  const packageId = (pkg as any).id;

  // Idempotent: reuse an outstanding, unexpired, unclaimed link.
  const { data: open } = await client
    .from("agreement_package_submissions")
    .select("id,magic_token,token_expires_at,delivery_status,claimed_at")
    .eq("package_id", packageId)
    .in("delivery_status", ["approved", "sent"])
    .is("claimed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let token = (open as any)?.magic_token ?? null;
  let expiresAt = (open as any)?.token_expires_at ?? null;
  let reused = false;
  if (token && expiresAt && new Date(expiresAt).getTime() > Date.now()) {
    reused = true;
  } else {
    const expiry = businessDaysExpiry(new Date(), 7).toISOString();
    const { data: created, error } = await client
      .from("agreement_package_submissions")
      .insert({
        package_id: packageId,
        token_expires_at: expiry,
        delivery_status: "approved",
        recipient_name: (pkg as any).national_account_manager_name ?? "Justin Garza",
        recipient_email: (pkg as any).national_account_manager_email ?? "Justin.Garza@abcsupply.com",
        issued_by: who,
      })
      .select("magic_token,token_expires_at")
      .single();
    if (error) return jsonApiResponse({ error: "write_failed", error_description: error.message }, { status: 500 });
    token = (created as any).magic_token;
    expiresAt = (created as any).token_expires_at;
  }

  return jsonApiResponse({
    ok: true,
    reused,
    token,
    expiresAt,
    url: `${publicBase()}/submit-agreement/${token}`,
    issuedBy: who,
    note: "Copy this link and send it to the account manager yourself — the agent does not email it.",
  });
};
