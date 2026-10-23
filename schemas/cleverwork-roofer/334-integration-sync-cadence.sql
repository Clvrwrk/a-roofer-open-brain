-- PEC-755: cadence contracts catch stopped/disabled jobs, not only failed runs.
CREATE TABLE IF NOT EXISTS public.integration_sync_expectations(
 component_key text PRIMARY KEY,kind text NOT NULL,ref text NOT NULL,max_age_s integer NOT NULL CHECK(max_age_s>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.integration_sync_expectations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_sync_expectations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.integration_sync_expectations TO service_role;
INSERT INTO public.integration_sync_expectations(component_key,kind,ref,max_age_s) VALUES
('cron:acculynx-geoid-match-daily','pg_cron','acculynx-geoid-match-daily',108000),
('cron:pvp_refresh_nightly','pg_cron','pvp_refresh_nightly',108000),
('cron:top20_refresh_quarterly','pg_cron','top20_refresh_quarterly',9828000),
('cron:acculynx-hourly-sync','pg_cron','acculynx-hourly-sync',4500),
('cron:acculynx-reconcile','pg_cron','acculynx-reconcile',1200),
('cron:acculynx-alert-check','pg_cron','acculynx-alert-check',1500),
('cron:wip-ar-master-nightly','pg_cron','wip-ar-master-nightly',108000),
('cron:wip-ar-week-roll-thursday','pg_cron','wip-ar-week-roll-thursday',756000),
('cron:refresh-office-pricing-matviews','pg_cron','refresh-office-pricing-matviews',1500),
('cron:nightly-silo-assertions','pg_cron','nightly-silo-assertions',108000),
('cron:service-matview-refresh-requests','pg_cron','service-matview-refresh-requests',900),
('cron:refresh-overhead-matview','pg_cron','refresh-overhead-matview',108000),
('cron:refresh-order-acculynx-match','pg_cron','refresh-order-acculynx-match',1500),
('cron:refresh-hail-heatzone-coverage','pg_cron','refresh-hail-heatzone-coverage',1500),
('cron:runtime-heartbeat-pump','pg_cron','runtime-heartbeat-pump',900),
('runtime:systemd.openbrain-abc-sync','runtime','systemd.openbrain-abc-sync',108000),
('runtime:systemd.openbrain-jt-sentinel','runtime','systemd.openbrain-jt-sentinel',108000),
('runtime:systemd.openbrain-maya-gate','runtime','systemd.openbrain-maya-gate',1500),
('runtime:systemd.openbrain-maya-qa','runtime','systemd.openbrain-maya-qa',108000),
('runtime:systemd.openbrain-qbo-thursday-sync','runtime','systemd.openbrain-qbo-thursday-sync',108000),
('runtime:systemd.openbrain-site-sweep','runtime','systemd.openbrain-site-sweep',108000),
('runtime:systemd.openbrain-companycam-sync','runtime','systemd.openbrain-companycam-sync',108000),
('runtime:systemd.openbrain-companycam-copy','runtime','systemd.openbrain-companycam-copy',2400),
('runtime:systemd.openbrain-wip-pack-thursday','runtime','systemd.openbrain-wip-pack-thursday',108000),
('cron:acculynx-job-walk','pg_cron','acculynx-job-walk',4500),
('cron:crm-acculynx-nightly-sync','pg_cron','crm-acculynx-nightly-sync',93600),
('cron:integration-sync-health','pg_cron','integration-sync-health',180)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.monitor_integration_syncs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE x record; n integer:=0;
BEGIN
 IF NOT pg_try_advisory_xact_lock(755332) THEN RETURN 0; END IF;
 PERFORM public.reconcile_acculynx_cron_outcomes();
 -- Read scheduler outcomes INDEPENDENTLY of the dispatch transaction/log.
 FOR x IN SELECT 'cron:'||j.jobname component,d.start_time at,d.status='succeeded' ok,
  CASE WHEN d.return_message ILIKE '%permission%' OR d.return_message ILIKE '%credential%' THEN 'auth_denied'
       WHEN d.return_message ILIKE '%duplicate key%' OR d.return_message ILIKE '%does not exist%' THEN 'schema_error' ELSE 'scheduler_error' END code
  FROM cron.job j JOIN cron.job_run_details d USING(jobid)
  LEFT JOIN public.integration_sync_health h ON h.component_key='cron:'||j.jobname
  WHERE j.active AND j.jobname<>'integration-sync-health' AND d.end_time IS NOT NULL
   AND d.start_time>coalesce(h.last_observed_at,clock_timestamp()-interval '24 hours')
  ORDER BY d.start_time
 LOOP
  PERFORM public.observe_integration_sync(x.component,x.at,x.ok,x.code);n:=n+1;
 END LOOP;
 FOR x IN SELECT d.* FROM public.acculynx_sync_runs d
  LEFT JOIN public.integration_sync_health h ON h.component_key='acculynx-worker'
  WHERE d.completed_at>coalesce(h.last_observed_at,clock_timestamp()-interval '24 hours')
  ORDER BY d.completed_at
 LOOP
  PERFORM public.observe_integration_sync('acculynx-worker',x.completed_at,x.status='completed',coalesce(x.failure_code,'worker_failed'),x.batch_context);n:=n+1;
 END LOOP;
 -- Every registered off-database job/API/MCP heartbeat is checked, not just AccuLynx.
 FOR x IN SELECT r.component_key,r.finished_at,r.status FROM public.v_runtime_job_latest r
  LEFT JOIN public.integration_sync_health s ON s.component_key='runtime:'||r.component_key
  WHERE r.finished_at>coalesce(s.last_observed_at,clock_timestamp()-interval '24 hours')
 LOOP
  PERFORM public.observe_integration_sync('runtime:'||x.component_key,x.finished_at,x.status IN ('success','completed','succeeded'),'runtime_failed');n:=n+1;
 END LOOP;
 -- Absence of runs is itself a failure. At most one stale observation per hour.
 FOR x IN SELECT h.component_key,coalesce(r.finished_at,h.last_pinged_success_at,h.created_at) last_at,h.period_s,h.grace_s
  FROM public.runtime_heartbeats h LEFT JOIN public.v_runtime_job_latest r USING(component_key)
  WHERE h.kind<>'pg_cron' AND coalesce(r.finished_at,h.last_pinged_success_at,h.created_at)<clock_timestamp()-make_interval(secs=>h.period_s+h.grace_s)
 LOOP
  PERFORM public.observe_integration_sync('runtime:'||x.component_key,date_trunc('hour',clock_timestamp()),false,'stale_heartbeat');
 END LOOP;
 -- Cadence checks include disabled/missing jobs, which have no new failure row.
 FOR x IN SELECT e.component_key,j.active,coalesce((SELECT max(d.end_time) FROM cron.job_run_details d WHERE d.jobid=j.jobid),e.created_at) last_at,e.max_age_s
  FROM public.integration_sync_expectations e LEFT JOIN cron.job j ON j.jobname=e.ref
  WHERE e.kind='pg_cron' AND e.ref<>'integration-sync-health'
 LOOP
  IF x.active IS DISTINCT FROM true OR x.last_at<clock_timestamp()-make_interval(secs=>x.max_age_s) THEN
   PERFORM public.observe_integration_sync(x.component_key,date_trunc('hour',clock_timestamp()),false,
     CASE WHEN x.active IS DISTINCT FROM true THEN 'scheduler_disabled_or_missing' ELSE 'stale_schedule' END);
  END IF;
 END LOOP;
 FOR x IN SELECT e.component_key,coalesce(r.finished_at,e.created_at) last_at,e.max_age_s
  FROM public.integration_sync_expectations e LEFT JOIN public.v_runtime_job_latest r ON r.component_key=e.ref
  WHERE e.kind='runtime'
 LOOP
  IF x.last_at<clock_timestamp()-make_interval(secs=>x.max_age_s) THEN
   PERFORM public.observe_integration_sync(x.component_key,date_trunc('hour',clock_timestamp()),false,'stale_heartbeat');
  END IF;
 END LOOP;
 -- An office-wide newest timestamp can conceal one unpaid-looking stale job.
 FOR x IN SELECT a.account_key,count(*) FILTER(WHERE f.synced_at IS NULL OR f.synced_at<clock_timestamp()-interval '3 days') stale
  FROM public.acculynx_accounts a JOIN public.acculynx_jobs j ON j.account_key=a.account_key
  JOIN public.wip_ar_master w ON w.acculynx_job_id=j.id AND w.in_ar_population
  LEFT JOIN public.acculynx_job_financials f ON f.job_id=j.id
  WHERE a.environment='production' AND a.is_active GROUP BY a.account_key
 LOOP
  PERFORM public.observe_integration_sync('acculynx-office:'||x.account_key,date_trunc('hour',clock_timestamp()),x.stale=0,'stale_financials');
 END LOOP;
 PERFORM public.observe_integration_sync('monitor:integration-sync-health',clock_timestamp(),true,NULL);
 RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public.monitor_integration_syncs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_integration_syncs() TO service_role;

SELECT cron.schedule('integration-sync-health','* * * * *','select public.monitor_integration_syncs()');
