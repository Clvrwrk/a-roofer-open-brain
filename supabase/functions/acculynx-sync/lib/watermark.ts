// acculynx-sync — lib/watermark.ts (Phase 2, plan 02-02)
//
// Per-resource watermark read/write helpers.
// The watermark table is keyed on (account_key, resource) — one row per account per resource.
// Upsert on conflict ensures idempotent advancement (hard rule 1: never DELETE).

// deno-lint-ignore-file no-explicit-any

/** Shape of a watermark row in acculynx_sync_watermark. */
export interface WatermarkRow {
  account_key: string;
  resource: string;
  last_modified_date?: string | null;
  last_page_index?: number | null;
  last_walked_job_id?: string | null;
  last_api_count?: number | null;
  last_sync_at?: string | null;
}

/**
 * Read the current watermark for a (account_key, resource) pair.
 * Returns null if no watermark row exists yet (first run for this account+resource).
 *
 * STUB (Wave 0 RED): body not yet implemented — Plan 03 (GREEN) fills this in.
 * The .eq("account_key",...).eq("resource",...) filter chain is the contract
 * asserted by watermark.test.ts.
 */
export async function readWatermark(
  sb: any,
  accountKey: string,
  resource: string,
): Promise<WatermarkRow | null> {
  void sb; void accountKey; void resource;
  throw new Error("not implemented — readWatermark (Plan 03 GREEN)");
}

/**
 * Advance (upsert) the watermark for a (account_key, resource) pair.
 * onConflict targets the unique constraint (account_key, resource) added by migration 168.
 * Non-fatal: logs a warning on error but does not abort the sync.
 *
 * STUB (Wave 0 RED): body not yet implemented — Plan 03 (GREEN) fills this in.
 * The onConflict 'account_key,resource' option is the contract asserted by
 * watermark.test.ts.
 */
export async function advanceWatermark(sb: any, row: WatermarkRow): Promise<void> {
  void sb; void row;
  throw new Error("not implemented — advanceWatermark (Plan 03 GREEN)");
}
