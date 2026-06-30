// acculynx-sync — resources/contacts.ts (Phase 2, plan 02-02 Task 2 — Wave 0 stub)
//
// STUB — Wave 0 RED. This module exists as a type-stub so resources/contacts.test.ts
// can import it and fail at runtime. Plan 03 (GREEN) replaces this with the real
// full-sweep contacts sync implementation.
//
// Contract (asserted by contacts.test.ts):
//   - URL pagination param: pageStartIndex (NOT recordStartIndex — Pitfall 2)
//   - Stamps account_key AND market on every upserted row (no cross-account bleed)
//   - Sets last_seen_by_api on every upserted row
//   - Budget-stop: stops the page loop when Date.now() >= deadline

// deno-lint-ignore-file no-explicit-any

/**
 * Sync contacts for a single account via a full-sweep pagination loop.
 * Endpoint: GET /contacts?pageSize=50&pageStartIndex={N}
 *
 * @param sb         - Supabase client (service role)
 * @param acct       - account row (account_key, market stamped on every upserted row)
 * @param apiKey     - explicit per-account Bearer key (not module-level — Pitfall 3)
 * @param deadline   - epoch ms budget limit (Date.now() >= deadline → stop)
 * @param watermark  - current watermark row (null = first run)
 * @param fetchFn    - injectable fetch function (defaults to global fetch for prod)
 */
export async function syncContacts(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  watermark: any,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  void sb; void acct; void apiKey; void deadline; void watermark; void fetchFn;
  throw new Error("not implemented — syncContacts (Plan 03 GREEN)");
}
