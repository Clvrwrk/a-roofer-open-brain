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
//
// 2026-10-05 (migration 325): callers go through settleSweep(), which archives only after a
// complete sweep (SweepOutcome.complete) and always restores not_seen_in_api rows the pass saw
// again (unarchiveSeen). A deadline-cut pass used to archive every row it never reached.

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

/**
 * What a full-sweep pass reports back so the caller can decide whether markNotSeen is safe.
 *
 * complete is true only when the sweep started at page 0, reached the end of the list (an empty or short page),
 * every page's upsert succeeded, and the API reported a count that the rows seen reach. A pass cut short by the run deadline, a non-200 page or a failed upsert leaves rows
 * it never refreshed with an old last_seen_by_api; archiving on such a pass is what archived 422 of 455 estimates and
 * 7,197 of 7,256 contacts as of 2026-10-05 (migration 325).
 */
export interface SweepOutcome {
  complete: boolean;
  pages: number;
  seen: number;
}

export function newSweepOutcome(): SweepOutcome {
  return { complete: false, pages: 0, seen: 0 };
}

/**
 * Un-archive rows this sweep saw again: a row archived as not_seen_in_api whose last_seen_by_api is at or after
 * sweepStartedAt came back in the API, so the archive was wrong (a partial pass) or the record reappeared.
 *
 * Only archive_reason = 'not_seen_in_api' is cleared; a row archived for any other reason (for example the
 * phase3-legacy-null-provenance-triage contacts) keeps its archive. Safe on a partial pass: it touches only rows the
 * pass actually refreshed. Non-fatal, like markNotSeen. Returns how many rows were restored (0 on error).
 */
export async function unarchiveSeen(
  sb: any,
  table: string,
  accountKey: string,
  sweepStartedAt: string,
): Promise<number> {
  try {
    const { data, error } = await sb
      .from(table)
      .update({ archived_at: null, archive_reason: null })
      .eq("account_key", accountKey)
      .eq("archive_reason", "not_seen_in_api")
      .gte("last_seen_by_api", sweepStartedAt)
      .select("id");
    if (error) {
      console.warn(`[diff] unarchiveSeen on ${table}: ${error.message}`);
      return 0;
    }
    return Array.isArray(data) ? data.length : 0;
  } catch (e) {
    console.warn(`[diff] unarchiveSeen on ${table}: ${(e as Error).message}`);
    return 0;
  }
}

/**
 * Close out a full-sweep pass: restore every not_seen_in_api row this pass saw again, then archive the rows it did
 * not see, but only when the sweep was complete. Returns what it did, for the run log.
 */
export async function settleSweep(
  sb: any,
  table: string,
  accountKey: string,
  sweepStartedAt: string,
  outcome: SweepOutcome,
): Promise<{ restored: number; archived: boolean }> {
  const restored = await unarchiveSeen(sb, table, accountKey, sweepStartedAt);
  if (!outcome.complete) {
    console.warn(
      `[diff] ${table} ${accountKey}: partial sweep (${outcome.pages} pages, ${outcome.seen} rows), archive skipped`,
    );
    return { restored, archived: false };
  }
  await markNotSeen(sb, table, accountKey, sweepStartedAt);
  return { restored, archived: true };
}
