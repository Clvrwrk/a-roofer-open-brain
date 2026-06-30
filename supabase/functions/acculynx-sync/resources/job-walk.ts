// acculynx-sync — resources/job-walk.ts (Phase 2, plan 02-02 Task 2 — Wave 0 stub)
//
// STUB — Wave 0 RED. This module exists as a type-stub so resources/job-walk.test.ts
// can import it and fail at runtime. Plan 03 (GREEN) replaces this with the real
// two-level invoice walk + sub-resource sync implementation.
//
// Contract (asserted by job-walk.test.ts):
//   - Fetches /jobs/{id}/invoices (level 1) → list of invoice IDs
//   - Fetches /invoices/{invoiceId} per invoice (level 2) → detail
//   - Advances last_walked_job_id watermark after each job
//   - Budget-stop: stops when Date.now() >= deadline
//   - Watermark is advanced to the last processed jobId before the budget break

// deno-lint-ignore-file no-explicit-any

/**
 * Walk known job IDs to sync sub-resources (invoices, financials, insurance,
 * milestone-history, job-contacts) for a single account.
 *
 * Invoice sub-resource requires a two-level walk:
 *   Level 1: GET /jobs/{jobId}/invoices → list of {id} invoice stubs
 *   Level 2: GET /invoices/{invoiceId} → invoice detail + line items
 *
 * @param sb         - Supabase client (service role)
 * @param acct       - account row (account_key, market for row stamping)
 * @param apiKey     - explicit per-account Bearer key (not module-level — Pitfall 3)
 * @param deadline   - epoch ms budget limit (Date.now() >= deadline → stop and save watermark)
 * @param watermark  - current watermark row (last_walked_job_id for resume)
 * @param jobIds     - ordered list of job IDs to walk (from acculynx_jobs for this account)
 * @param fetchFn    - injectable fetch function (defaults to global fetch for prod)
 */
export async function syncJobWalk(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  watermark: any,
  jobIds: string[],
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  void sb; void acct; void apiKey; void deadline; void watermark; void jobIds; void fetchFn;
  throw new Error("not implemented — syncJobWalk (Plan 03 GREEN)");
}
