-- 322-wip-ar-3am-central-schedule.sql
-- Friday WIP/AR board rebuilds daily at 3:00 AM Central (Chris, 2026-10-02).
--
-- pg_cron runs in UTC and cannot follow daylight saving, so each job is scheduled
-- for BOTH of its possible UTC hours and the command only does work when the
-- America/Chicago wall clock says the intended hour:
--   board rebuild  3:00 AM CT daily  → 08:00 UTC (CDT) or 09:00 UTC (CST)
--   Thursday roll  2:45 AM CT Thu    → 07:45 UTC (CDT) or 08:45 UTC (CST)
-- The roll still runs just before the rebuild, as in mig 215. The other UTC slot
-- each day is a no-op run (SELECT … WHERE false).
--
-- Inputs are ready by then: AccuLynx syncs hourly, the QBO mirror runs 01:00 UTC,
-- and product_vendor_pricing / mv_overhead_account_month refresh at 07:00 / 07:35
-- UTC. The board does not read ABC (03:30 ET sync). The Excel pack timer on the
-- agent host moves to 03:20 America/Chicago in the same change
-- (deployment/remote/systemd/openbrain-wip-pack-thursday.timer).
-- Supersedes the mig 215 schedules. Idempotent.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('wip-ar-master-nightly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wip-ar-master-nightly');
    PERFORM cron.schedule(
      'wip-ar-master-nightly',
      '0 8,9 * * *',
      $cron$SELECT refresh_wip_ar_master()
             WHERE extract(hour FROM now() AT TIME ZONE 'America/Chicago') = 3;$cron$
    );

    PERFORM cron.unschedule('wip-ar-week-roll-thursday')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wip-ar-week-roll-thursday');
    PERFORM cron.schedule(
      'wip-ar-week-roll-thursday',
      '45 7,8 * * 4',
      $cron$SELECT roll_wip_ar_week()
             WHERE extract(hour FROM now() AT TIME ZONE 'America/Chicago') = 2
               AND extract(isodow FROM now() AT TIME ZONE 'America/Chicago') = 4;$cron$
    );
  END IF;
END $$;
