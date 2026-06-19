// Magic-link submission helpers (Item 3, slice 5). The token is the auth: a random
// uuid, single-claim, expiring 7 working days out at ~06:00 Central. Agents never
// issue or send the link — a human approves issuance (auth-gated) and emails it.

import type { SupabaseClient } from "@supabase/supabase-js";

// Expiry = N business days from `from`, set to ~06:00 America/Chicago.
// (e.g. issued Monday → 7 business days → the following Wednesday morning.)
export function businessDaysExpiry(from: Date, businessDays = 7): Date {
  const d = new Date(from.getTime());
  let counted = 0;
  while (counted < businessDays) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay(); // 0 Sun … 6 Sat
    if (wd !== 0 && wd !== 6) counted++;
  }
  // 06:00 Central ≈ 11:00 UTC (CDT, UTC-5). Good enough as a "morning" cutoff.
  d.setUTCHours(11, 0, 0, 0);
  return d;
}

export type SubmissionState = "valid" | "not_found" | "expired" | "claimed" | "revoked";

export interface SubmissionRow {
  id: string;
  package_id: string;
  magic_token: string;
  token_expires_at: string;
  delivery_status: string;
  response_action: string | null;
  recipient_name: string | null;
  claimed_at: string | null;
  branch_number?: string | null;
  branch_name?: string | null;
}

export interface ResolvedSubmission {
  state: SubmissionState;
  submission: SubmissionRow | null;
}

// Canonical UUID only — reject malformed tokens before they reach the uuid column
// (a loose pattern would let non-UUID strings trigger a Postgres cast error).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validate a token: exists, not revoked, not expired, not already claimed (single-claim).
export async function resolveSubmission(client: SupabaseClient, token: string): Promise<ResolvedSubmission> {
  if (!token || !UUID_RE.test(token)) return { state: "not_found", submission: null };
  const { data } = await client
    .from("agreement_package_submissions")
    .select("id,package_id,magic_token,token_expires_at,delivery_status,response_action,recipient_name,claimed_at")
    .eq("magic_token", token)
    .maybeSingle();
  const sub = data as SubmissionRow | null;
  if (!sub) return { state: "not_found", submission: null };
  if (sub.delivery_status === "revoked") return { state: "revoked", submission: sub };
  if (sub.claimed_at || sub.delivery_status === "claimed") return { state: "claimed", submission: sub };
  if (new Date(sub.token_expires_at).getTime() < Date.now()) return { state: "expired", submission: sub };
  return { state: "valid", submission: sub };
}
