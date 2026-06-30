// acculynx-sync — resources/jobs.ts (Phase 2, plan 02-02 Task 2 — Wave 0 stub)
//
// STUB — Wave 0 RED. This module exists as a type-stub so resources/jobs.test.ts
// can import it and fail at runtime. Plan 03 (GREEN) replaces this with the real
// date-windowed incremental jobs sync implementation.
//
// Contract (asserted by jobs.test.ts):
//   - URL pagination param: recordStartIndex (NOT pageStartIndex — Pitfall 2)
//   - URL includes dateFilterType=ModifiedDate (jobs support date filtering)
//   - Stamps account_key AND market on every upserted row (no cross-account bleed)
//   - Sets last_seen_by_api on every upserted row
//   - Budget-stop: stops the page loop when Date.now() >= deadline

// deno-lint-ignore-file no-explicit-any

/**
 * Sync jobs for a single account via a date-windowed incremental query.
 * Endpoint: GET /jobs?dateFilterType=ModifiedDate&startDate={wm}&recordStartIndex={N}
 *
 * @param sb         - Supabase client (service role)
 * @param acct       - account row (account_key, market stamped on every upserted row)
 * @param apiKey     - explicit per-account Bearer key (not module-level — Pitfall 3)
 * @param deadline   - epoch ms budget limit (Date.now() >= deadline → stop)
 * @param watermark  - current watermark row (last_modified_date for startDate param)
 * @param fetchFn    - injectable fetch function (defaults to global fetch for prod)
 */
export async function syncJobs(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  watermark: any,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  void sb; void acct; void apiKey; void deadline; void watermark; void fetchFn;
  throw new Error("not implemented — syncJobs (Plan 03 GREEN)");
}
