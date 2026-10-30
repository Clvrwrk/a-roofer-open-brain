-- 326-stagger-top-of-hour-cron.sql
-- Move the heavy pg_cron jobs off minute :00 (2026-10-08, docs/125).
--
-- At 05:00 UTC on 2026-10-08 the live CRM showed "Jobs are not available right
-- now": its RPCs waited 15 s for a PostgREST connection and aborted. Everything
-- that touched prod in that minute queued 30-80 s. Minute :00 stacked:
--   * refresh-office-pricing-matviews (job 13, */15): four REFRESH ... CONCURRENTLY,
--     61 s mean, 124 s max, failed on statement timeout at 05:00;
--   * acculynx-alert-check (*/15): 31 s at 22:00;
--   * acculynx-hourly-sync (0 * * * *): the edge function's ~200 writes;
--   * the agent host's CompanyCam copy and Maya gate timers (moved in the same
--     change, deployment/remote/systemd);
--   * Command Center cache warms (prewarm.server.ts, fixed in the same change).
--
-- New minutes (every other job keeps its schedule):
--   refresh-office-pricing-matviews  3,18,33,48   (was */15)
--   acculynx-hourly-sync             4            (was 0)
--   acculynx-alert-check             5,20,35,50   (was */15)
-- Existing neighbours: order-acculynx-match 7,22,37,52 (2 s); hail-heatzone
-- 12,27,42,57 (5 s); acculynx-job-walk 30; CC daily warm 41-45.
--
-- The alert check and the reconcile use interval windows (30 min, 3 h, 6 h), so
-- moving the sync four minutes later changes no alert. Additive and idempotent:
-- cron.alter_job keeps each job's id and command and changes only the schedule.
-- Rollback: rerun with the old schedules ('*/15 * * * *', '0 * * * *').

DO $$
DECLARE
  v_job record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  FOR v_job IN
    SELECT j.jobid, s.new_schedule
    FROM (VALUES
      ('refresh-office-pricing-matviews', '3,18,33,48 * * * *'),
      ('acculynx-hourly-sync',            '4 * * * *'),
      ('acculynx-alert-check',            '5,20,35,50 * * * *')
    ) AS s(jobname, new_schedule)
    JOIN cron.job j ON j.jobname = s.jobname
    WHERE j.schedule IS DISTINCT FROM s.new_schedule
  LOOP
    PERFORM cron.alter_job(job_id := v_job.jobid, schedule := v_job.new_schedule);
  END LOOP;
END $$;
