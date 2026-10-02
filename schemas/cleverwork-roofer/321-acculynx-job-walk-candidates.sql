-- 321-acculynx-job-walk-candidates.sql
-- Candidate-driven AccuLynx job walk (2026-10-02, docs/85 freshness audit).
--
-- Why: the hourly job walk re-read financials/invoices only when its cursor reached
-- a job, scanning every job of an account in order and running an unindexed
-- `acculynx_raw.api_endpoint LIKE '%/jobs/{id}%'` probe (77k rows, 121 MB) for each
-- one. With ~14 s of budget per account per hour, payments and new invoices took
-- days to reach the Friday WIP/AR board (41 of 333 board jobs differed from live
-- AccuLynx on 2026-10-02; colorado had not been walked since 09-24).
--
-- What: one marker per job (`walked_at`) and one function that returns, in priority
-- order, only the jobs that need a walk:
--   first_sight    never walked
--   changed        AccuLynx modified_date is newer than the last walk
--   board_refresh  on the WIP/AR board and not walked within p_board_refresh — a
--                  backstop for changes the /jobs list never reports (six wichita /
--                  georgia jobs closed in July/August never appeared in the
--                  ModifiedDate-filtered list, live-probed 2026-10-02)
-- Additive and idempotent (hard rule 1).

ALTER TABLE public.acculynx_jobs
  ADD COLUMN IF NOT EXISTS walked_at timestamptz;

COMMENT ON COLUMN public.acculynx_jobs.walked_at IS
  'When the job walk last re-read this job (header, financials, invoices, reps). Set by acculynx-sync after each walked job; compared to modified_date by acculynx_job_walk_candidates() (mig 321).';

-- Seed the marker from the last financials read so the first candidate run does not
-- treat 7,000 already-walked jobs as never walked. Only fills NULLs, so re-running
-- this migration never moves a marker the sync has already set.
UPDATE public.acculynx_jobs aj
   SET walked_at = f.synced_at
  FROM public.acculynx_job_financials f
 WHERE f.job_id = aj.id
   AND aj.walked_at IS NULL
   AND f.synced_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acculynx_jobs_account_walked
  ON public.acculynx_jobs (account_key, walked_at);

CREATE OR REPLACE FUNCTION public.acculynx_job_walk_candidates(
  p_account_key   text,
  p_limit         integer  DEFAULT 200,
  p_board_refresh interval DEFAULT interval '3 days'
)
RETURNS TABLE (job_id text, modified_date timestamptz, reason text, on_board boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH c AS (
    SELECT aj.id AS job_id,
           aj.modified_date,
           CASE
             WHEN aj.walked_at IS NULL THEN 'first_sight'
             WHEN aj.modified_date IS NOT NULL AND aj.modified_date > aj.walked_at THEN 'changed'
             ELSE 'board_refresh'
           END AS reason,
           coalesce(m.in_ar_population, false) AS on_board,
           aj.walked_at
      FROM acculynx_jobs aj
      LEFT JOIN wip_ar_master m ON m.acculynx_job_id = aj.id
     WHERE aj.account_key = p_account_key
       AND aj.archived_at IS NULL
       AND (
             aj.walked_at IS NULL
          OR (aj.modified_date IS NOT NULL AND aj.modified_date > aj.walked_at)
          OR (m.in_ar_population AND aj.walked_at < now() - p_board_refresh)
       )
  )
  SELECT job_id, modified_date, reason, on_board
    FROM c
   ORDER BY (reason = 'board_refresh'),        -- real changes before the backstop
            on_board DESC,                       -- money on the board first
            coalesce(walked_at, '-infinity'::timestamptz)  -- longest-waiting first
   LIMIT greatest(p_limit, 0);
$$;

COMMENT ON FUNCTION public.acculynx_job_walk_candidates(text, integer, interval) IS
  'Jobs the acculynx-sync job walk should re-read for one account, in priority order: changed or never-walked jobs (WIP/AR board first, longest-waiting first), then board jobs not walked within p_board_refresh. Replaces the per-job acculynx_raw LIKE probe (mig 321, docs/85).';

REVOKE ALL ON FUNCTION public.acculynx_job_walk_candidates(text, integer, interval) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acculynx_job_walk_candidates(text, integer, interval) TO service_role;
