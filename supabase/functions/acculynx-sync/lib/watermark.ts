// acculynx-sync — lib/watermark.ts (Phase 2, plan 02-03)
//
// Per-resource watermark read/write helpers.
// The watermark table is keyed on (account_key, resource_type) — one row per account per resource.
// Upsert on conflict ensures idempotent advancement (hard rule 1: never DELETE).
//
// CRITICAL DEVIATION (02-01-SUMMARY): The live column is `resource_type` (NOT `resource`).
// The UNIQUE constraint is acculynx_sync_watermark_account_resource(account_key, resource_type).

// deno-lint-ignore-file no-explicit-any

/** Shape of a watermark row in acculynx_sync_watermark. */
export interface WatermarkRow {
  account_key: string;
  resource_type: string;
  last_modified_date?: string | null;
  last_page_index?: number | null;
  last_walked_job_id?: string | null;
  last_api_count?: number | null;
  last_api_total?: number | null;
  last_sync_at?: string | null;
}

/**
 * Read the current watermark for a (account_key, resource_type) pair.
 * Returns null if no watermark row exists yet (first run for this account+resource).
 *
 * @param sb         - Supabase client (service role)
 * @param accountKey - account identifier (acculynx_accounts.account_key)
 * @param resource   - resource name (e.g. 'contacts', 'jobs', 'job_walk')
 */
export async function readWatermark(
  sb: any,
  accountKey: string,
  resource: string,
): Promise<WatermarkRow | null> {
  const { data, error } = await sb
    .from("acculynx_sync_watermark")
    .select("*")
    .eq("account_key", accountKey)
    .eq("resource_type", resource)
    .maybeSingle();
  if (error) throw new Error(`watermark read: ${error.message}`);
  return data;
}

/**
 * Advance (upsert) the watermark for a (account_key, resource_type) pair.
 * onConflict targets the unique constraint (account_key, resource_type) added by migration 168.
 * Non-fatal: logs a warning on error but does not abort the sync.
 *
 * @param sb  - Supabase client (service role)
 * @param row - WatermarkRow to upsert (must include account_key + resource_type)
 */
export async function advanceWatermark(sb: any, row: WatermarkRow): Promise<void> {
  const { error } = await sb
    .from("acculynx_sync_watermark")
    .upsert(row, { onConflict: "account_key,resource_type" });
  if (error) console.warn(`[sync] watermark upsert: ${error.message}`);
}
