// acculynx-sync — lib/accounts.ts (Phase 2, plan 02-03)
//
// Fan-out account loader: queries acculynx_accounts WHERE environment='production'
// and resolves each key at runtime from Deno.env only.
//
// Hard rule 2: the secret VALUE is never stored, logged, or returned.
// Only env_secret_name (the NAME) is ever referenced in code or DB.
// No module-level shared key — prevents cross-account key bleed (Pitfall 3).

// deno-lint-ignore-file no-explicit-any

/** Minimal interface for an account row from acculynx_accounts. */
export interface AccountRow {
  account_key: string;
  env_secret_name: string;
  label: string | null;
  market: string | null;
  state: string | null;
}

/**
 * Load all production-active AccuLynx accounts from the registry.
 * Filters to environment='production' AND is_active=true, ordered by account_key
 * for deterministic fan-out order.
 *
 * @param sb - Supabase client (service role, passed in — no module-level client)
 * @returns array of AccountRow (empty if none match)
 * @throws Error if the Supabase query fails
 */
export async function loadProductionAccounts(sb: any): Promise<AccountRow[]> {
  const { data: accounts, error } = await sb
    .from("acculynx_accounts")
    .select("account_key, env_secret_name, label, market, state")
    .eq("environment", "production")
    .eq("is_active", true)
    .order("account_key");
  if (error) throw new Error(`accounts load: ${error.message}`);
  return accounts ?? [];
}

/**
 * Resolve the API key for an account from Deno.env at runtime.
 * Returns undefined if the secret is not set; caller must skip + warn.
 *
 * Hard rule 2: only the secret NAME (env_secret_name) is ever referenced;
 * the value resolved via Deno.env.get is never logged or stored.
 *
 * @param acct - account row from acculynx_accounts
 * @returns the API key string, or undefined if the secret is not set
 */
export function resolveKey(acct: AccountRow): string | undefined {
  return Deno.env.get(acct.env_secret_name);
}
