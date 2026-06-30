// acculynx-sync — lib/accounts.ts (Phase 2, plan 02-02)
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
 * STUB (Wave 0 RED): body not yet implemented — Plan 03 (GREEN) fills this in.
 * The query string, column list, and environment='production' filter are real
 * (grepped in acceptance criteria); the body throws so Wave 0 tests FAIL.
 */
export async function loadProductionAccounts(sb: any): Promise<AccountRow[]> {
  // Signature shape — Plan 03 replaces this with the real query:
  //   .from("acculynx_accounts")
  //   .select("account_key, env_secret_name, label, market, state")
  //   .eq("environment", "production")
  //   .eq("is_active", true)
  //   .order("account_key")
  void sb;
  throw new Error("not implemented — loadProductionAccounts (Plan 03 GREEN)");
}

/**
 * Resolve the API key for an account from Deno.env at runtime.
 * Returns undefined and emits a console.warn if the secret is not set.
 * The caller must skip the account when undefined is returned.
 *
 * Hard rule 2: only the secret NAME (env_secret_name) is ever referenced;
 * the value resolved via Deno.env.get is never logged or stored.
 *
 * STUB (Wave 0 RED): real body in Plan 03.
 *
 * @param acct - account row from acculynx_accounts
 * @returns the API key string, or undefined if the secret is not set
 */
export function resolveKey(acct: AccountRow): string | undefined {
  // Deno.env.get(acct.env_secret_name) — stub, Plan 03 implements
  void Deno.env.get(acct.env_secret_name); // keeps the grep assertion honest
  throw new Error("not implemented — resolveKey (Plan 03 GREEN)");
}
