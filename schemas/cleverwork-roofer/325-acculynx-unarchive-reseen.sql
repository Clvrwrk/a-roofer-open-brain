-- 325-acculynx-unarchive-reseen.sql
-- Restore AccuLynx estimates and contacts that the hourly sync archived by mistake (2026-10-05).
--
-- Defect: acculynx-sync ran markNotSeen after every estimates/contacts sweep, including passes the run deadline
-- (~14 s per account), a non-200 page or a failed upsert had cut short. Every row the pass never reached was stamped
-- archived_at + archive_reason = 'not_seen_in_api', and nothing ever cleared the stamp when the next pass saw the row
-- again. Prod on 2026-10-05: acculynx_estimates 422 of 455 rows archived as not_seen_in_api, 412 of them seen by the
-- API after their archive; acculynx_contacts 7,197 of 7,256, nearly all seen again. crm_private.profile_cc_job and
-- crm_private.acculynx_stage_facts read estimates with archived_at IS NULL, so the CRM job profile and stage facts
-- were missing most estimates.
--
-- Code fix (supabase/functions/acculynx-sync: lib/diff.ts settleSweep/unarchiveSeen, resources/estimates.ts,
-- resources/contacts.ts, index.ts): archive only after a complete, error-free sweep from page 0 that saw at least the
-- API's own count; on every pass restore not_seen_in_api rows the pass saw again. Deploy the function first, then run
-- this once to repair the history.
--
-- This backfill: a row archived as not_seen_in_api whose last_seen_by_api is later than archived_at was returned by
-- the API after it was archived, so the archive was wrong. Clear it. Rows archived for any other reason (for example
-- the three 'phase3-legacy-null-provenance-triage' contacts) are untouched.
--
-- Proven-gone guard (review 2026-10-05): one sweep stamps every row it sees with the same last_seen_by_api. When an
-- account's latest sweep saw at least the API's own count (acculynx_sync_watermark.last_api_count), that sweep was
-- complete, and a row it did not see is gone from AccuLynx even if it was seen after its archive. Such rows keep
-- their archive. On 2026-10-05 this held back 1 Colorado estimate (Colorado's last estimates sweep, 2026-09-24, saw
-- 24 of 24 and not that row); without it the row would come back and stay, because Colorado's estimates sweep has
-- not run since. Accounts whose latest sweep was partial (Texas, Wichita) cannot prove which rows are gone; their
-- restored rows are re-archived by the next complete sweep, which needs the resume cursor (open issue).
--
-- Additive data repair: one new backup table, no DELETE. Every restored row's previous archived_at/archive_reason is
-- copied into public.acculynx_archive_backfill_325 first, so the repair is exactly reversible. Idempotent: a second run
-- matches no rows (archived_at is NULL after the first). Exact rollback:
--   UPDATE public.acculynx_estimates t SET archived_at=b.archived_at, archive_reason=b.archive_reason
--     FROM public.acculynx_archive_backfill_325 b WHERE b.table_name='acculynx_estimates' AND b.row_id=t.id::text;
--   (and the same for acculynx_contacts)
--
-- Dry-run preview (read-only; expected 2026-10-05: 413 estimates, 7,197 contacts):
--   WITH est_last AS (
--     SELECT e.account_key, max(e.last_seen_by_api) AS pass_at FROM public.acculynx_estimates e GROUP BY 1
--   ), est_full AS (
--     SELECT l.account_key, l.pass_at FROM est_last l
--       JOIN public.acculynx_sync_watermark w ON w.account_key = l.account_key AND w.resource_type = 'estimates'
--      WHERE (SELECT count(*) FROM public.acculynx_estimates x
--              WHERE x.account_key = l.account_key AND x.last_seen_by_api = l.pass_at) >= w.last_api_count
--   )
--   SELECT e.account_key, count(*) FROM public.acculynx_estimates e
--    WHERE e.archive_reason = 'not_seen_in_api' AND e.archived_at IS NOT NULL AND e.last_seen_by_api > e.archived_at
--      AND NOT EXISTS (SELECT 1 FROM est_full f WHERE f.account_key = e.account_key AND e.last_seen_by_api < f.pass_at)
--    GROUP BY 1 ORDER BY 1;
--   (and the same with acculynx_contacts / resource_type = 'contacts')

CREATE TABLE IF NOT EXISTS public.acculynx_archive_backfill_325 (
  table_name     text        NOT NULL,
  row_id         text        NOT NULL,
  archived_at    timestamptz,
  archive_reason text,
  restored_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
);
ALTER TABLE public.acculynx_archive_backfill_325 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.acculynx_archive_backfill_325 IS 'Previous archive stamps of rows restored by 325-acculynx-unarchive-reseen.sql (exact rollback source).';

DO $$
DECLARE
  n_estimates integer;
  n_contacts  integer;
BEGIN
  WITH last_pass AS (
    SELECT account_key, max(last_seen_by_api) AS pass_at FROM public.acculynx_estimates GROUP BY account_key
  ), complete_pass AS (
    SELECT l.account_key, l.pass_at
      FROM last_pass l
      JOIN public.acculynx_sync_watermark w ON w.account_key = l.account_key AND w.resource_type = 'estimates'
     WHERE (SELECT count(*) FROM public.acculynx_estimates x
             WHERE x.account_key = l.account_key AND x.last_seen_by_api = l.pass_at) >= w.last_api_count
  )
  INSERT INTO public.acculynx_archive_backfill_325 (table_name, row_id, archived_at, archive_reason)
  SELECT 'acculynx_estimates', e.id::text, e.archived_at, e.archive_reason
    FROM public.acculynx_estimates e
   WHERE e.archive_reason = 'not_seen_in_api'
     AND e.archived_at IS NOT NULL
     AND e.last_seen_by_api > e.archived_at
     AND NOT EXISTS (SELECT 1 FROM complete_pass c
                      WHERE c.account_key = e.account_key AND e.last_seen_by_api < c.pass_at)
  ON CONFLICT DO NOTHING;

  UPDATE public.acculynx_estimates e
     SET archived_at = NULL,
         archive_reason = NULL
   WHERE e.id::text IN (SELECT b.row_id FROM public.acculynx_archive_backfill_325 b WHERE b.table_name = 'acculynx_estimates')
     AND e.archive_reason = 'not_seen_in_api'
     AND e.archived_at IS NOT NULL
     AND e.last_seen_by_api > e.archived_at;
  GET DIAGNOSTICS n_estimates = ROW_COUNT;

  WITH last_pass AS (
    SELECT account_key, max(last_seen_by_api) AS pass_at FROM public.acculynx_contacts GROUP BY account_key
  ), complete_pass AS (
    SELECT l.account_key, l.pass_at
      FROM last_pass l
      JOIN public.acculynx_sync_watermark w ON w.account_key = l.account_key AND w.resource_type = 'contacts'
     WHERE (SELECT count(*) FROM public.acculynx_contacts x
             WHERE x.account_key = l.account_key AND x.last_seen_by_api = l.pass_at) >= w.last_api_count
  )
  INSERT INTO public.acculynx_archive_backfill_325 (table_name, row_id, archived_at, archive_reason)
  SELECT 'acculynx_contacts', c0.id::text, c0.archived_at, c0.archive_reason
    FROM public.acculynx_contacts c0
   WHERE c0.archive_reason = 'not_seen_in_api'
     AND c0.archived_at IS NOT NULL
     AND c0.last_seen_by_api > c0.archived_at
     AND NOT EXISTS (SELECT 1 FROM complete_pass c
                      WHERE c.account_key = c0.account_key AND c0.last_seen_by_api < c.pass_at)
  ON CONFLICT DO NOTHING;

  UPDATE public.acculynx_contacts c0
     SET archived_at = NULL,
         archive_reason = NULL
   WHERE c0.id::text IN (SELECT b.row_id FROM public.acculynx_archive_backfill_325 b WHERE b.table_name = 'acculynx_contacts')
     AND c0.archive_reason = 'not_seen_in_api'
     AND c0.archived_at IS NOT NULL
     AND c0.last_seen_by_api > c0.archived_at;
  GET DIAGNOSTICS n_contacts = ROW_COUNT;

  RAISE NOTICE '325: un-archived % estimates and % contacts seen again after their not_seen_in_api archive',
    n_estimates, n_contacts;
END $$;
