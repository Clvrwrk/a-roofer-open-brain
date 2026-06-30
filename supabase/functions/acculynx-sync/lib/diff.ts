// acculynx-sync — lib/diff.ts (Phase 2, plan 02-03)
//
// Mark-not-seen-in-API diff detection.
//
// Hard rule 1 (No destructive SQL): rows absent from the last full sweep are
// MARKED (archived_at + archive_reason), never DELETEd or TRUNCATEd.
// This uses .update() only — diff.test.ts asserts the delete spy is never invoked.
//
// Scope: only rows for the given account_key that have not yet been archived
// (archived_at IS NULL) and whose last_seen_by_api is older than sweepStartedAt.

// deno-lint-ignore-file no-explicit-any

/**
 * Mark rows that were not seen in the last full sweep of (table, accountKey).
 *
 * After a complete sweep, any row with last_seen_by_api < sweepStartedAt was absent
 * from the API response — it may have been deleted in AccuLynx.
 * We mark it with archived_at + archive_reason='not_seen_in_api' (never DELETE).
 *
 * Non-fatal: logs a warning on error but does not abort the sync.
 *
 * @param sb             - Supabase client (service role)
 * @param table          - target table name (e.g. 'acculynx_contacts')
 * @param accountKey     - account scope (prevents cross-account updates)
 * @param sweepStartedAt - ISO timestamp when the sweep started (rows unseen since this)
 */
export async function markNotSeen(
  sb: any,
  table: string,
  accountKey: string,
  sweepStartedAt: string,
): Promise<void> {
  const { error } = await sb
    .from(table)
    .update({ archived_at: new Date().toISOString(), archive_reason: "not_seen_in_api" })
    .eq("account_key", accountKey)
    .is("archived_at", null)
    .lt("last_seen_by_api", sweepStartedAt);
  if (error) console.warn(`[diff] markNotSeen on ${table}: ${error.message}`);
}
