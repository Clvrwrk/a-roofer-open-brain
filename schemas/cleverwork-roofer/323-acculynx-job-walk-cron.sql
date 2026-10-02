-- 323-acculynx-job-walk-cron.sql
-- Dedicated hourly money pass for AccuLynx (2026-10-02, docs/85 freshness).
--
-- The :00 `acculynx-hourly-sync` run splits ~110 s across eight accounts (~14 s
-- each) and spends most of every slice on users / jobs / contacts / estimates.
-- Under the business-hours statement-timeout load on prod (15–60 timeouts/hour),
-- the 20:00 UTC run on 2026-10-02 walked ZERO jobs in every account even after
-- mig 321 made the walk candidate-driven.
--
-- This adds a second run at :30 with {"jobWalkOnly": true}: acculynx-sync then
-- does only the job walk (acculynx_job_walk_candidates(), board jobs first) and a
-- crm_pipeline rebuild of the jobs it walked, with its own rotation cursor
-- (`__rotation_walk__`). Requires acculynx-sync with jobWalkOnly support
-- (deployed before this migration). Idempotent.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('acculynx-job-walk')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'acculynx-job-walk');
    PERFORM cron.schedule(
      'acculynx-job-walk',
      '30 * * * *',
      $cron$select public.trigger_acculynx_sync('{"multiAccount": true, "jobWalkOnly": true}'::jsonb)$cron$
    );
  END IF;
END $$;
