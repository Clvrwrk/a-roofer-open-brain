// acculynx-sync — lib/diff.ts (Phase 2, plan 02-02)
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
  // This stub shape preserves the contract: only .update() is used (hard rule 1).
  // Plan 03 (GREEN) replaces this with the real implementation:
  //   sb.from(table)
  //     .update({ archived_at: ..., archive_reason: "not_seen_in_api" })
  //     .eq("account_key", accountKey)
  //     .is("archived_at", null)
  //     .lt("last_seen_by_api", sweepStartedAt)
  void sb; void table; void accountKey; void sweepStartedAt;
  throw new Error("not implemented — markNotSeen (Plan 03 GREEN)");
}
