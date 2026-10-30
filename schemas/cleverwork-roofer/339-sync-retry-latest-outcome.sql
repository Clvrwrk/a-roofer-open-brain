-- Process every failure receipt, but retry only the newest completed outcome.
-- A later success or fifth failure already committed must suppress stale recovery.
CREATE OR REPLACE FUNCTION public.monitor_integration_syncs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE x record; n integer:=0;
BEGIN
 IF NOT pg_try_advisory_xact_lock(755332) THEN RETURN 0; END IF;
 PERFORM public.reconcile_acculynx_cron_outcomes();
 -- Read every committed scheduler outcome once, including equal/late timestamps.
 FOR x IN SELECT j.jobname,d.runid,d.end_time,d.status,d.return_message FROM cron.job j
 JOIN cron.job_run_details d USING(jobid) LEFT JOIN public.integration_source_receipts s ON s.source='cron' AND s.source_id=d.runid
 WHERE d.end_time IS NOT NULL AND j.active AND j.jobname<>'integration-sync-health' AND s.source_id IS NULL ORDER BY d.end_time,d.runid
 LOOP
  PERFORM public.observe_integration_source('cron:'||x.jobname,'cron',x.runid,x.end_time,x.status='succeeded',
   CASE WHEN x.return_message ILIKE '%permission%' OR x.return_message ILIKE '%credential%' THEN 'auth_denied'
    WHEN x.return_message ILIKE '%duplicate key%' THEN 'duplicate_identity'
    WHEN x.return_message ILIKE '%does not exist%' THEN 'schema_error' ELSE 'scheduler_error' END);n:=n+1;
 END LOOP;
 FOR x IN SELECT d.* FROM public.acculynx_sync_runs d
  LEFT JOIN public.integration_source_receipts s ON s.source='acculynx_worker' AND s.source_id=d.observation_id
  WHERE d.completed_at IS NOT NULL AND s.source_id IS NULL ORDER BY d.completed_at,d.observation_id
 LOOP
  PERFORM public.observe_integration_source('acculynx-worker','acculynx_worker',x.observation_id,x.completed_at,x.status='completed',coalesce(x.failure_code,'worker_failed'),CASE WHEN NOT EXISTS(SELECT FROM public.acculynx_sync_runs later WHERE later.completed_at IS NOT NULL AND (later.completed_at,later.observation_id)>(x.completed_at,x.observation_id)) THEN x.batch_context ELSE NULL END);n:=n+1;
 END LOOP;
 -- Append-only receipt processing catches failure then success between polls.
 FOR x IN SELECT r.* FROM public.runtime_job_runs r LEFT JOIN public.integration_source_receipts s ON s.source='runtime' AND s.source_id=r.id
 WHERE s.source_id IS NULL AND NOT EXISTS(SELECT FROM public.integration_retired_components t WHERE t.component_key='runtime:'||r.component_key)
 ORDER BY r.finished_at,r.id
 LOOP
  PERFORM public.observe_integration_source('runtime:'||x.component_key,'runtime',x.id,x.finished_at,x.status IN ('success','completed','succeeded'),'runtime_failed');n:=n+1;
 END LOOP;
 -- Absence of runs is itself a failure. At most one stale observation per hour.
 FOR x IN SELECT h.component_key,coalesce(r.finished_at,h.last_pinged_success_at,h.created_at) last_at,h.period_s,h.grace_s
  FROM public.runtime_heartbeats h LEFT JOIN public.v_runtime_job_latest r USING(component_key)
  WHERE h.kind<>'pg_cron' AND NOT EXISTS(SELECT FROM public.integration_retired_components t WHERE t.component_key='runtime:'||h.component_key) AND coalesce(r.finished_at,h.last_pinged_success_at,h.created_at)<clock_timestamp()-make_interval(secs=>h.period_s+h.grace_s)
 LOOP
  PERFORM public.observe_sync_condition('runtime:'||x.component_key,false,'stale_heartbeat');
 END LOOP;
 -- Cadence checks include disabled/missing jobs, which have no new failure row.
 FOR x IN SELECT e.component_key,j.active,coalesce((SELECT max(d.end_time) FROM cron.job_run_details d WHERE d.jobid=j.jobid),e.created_at) last_at,e.max_age_s
  FROM public.integration_sync_expectations e LEFT JOIN cron.job j ON j.jobname=e.ref
  WHERE e.kind='pg_cron' AND e.ref<>'integration-sync-health'
 LOOP
  IF x.active IS DISTINCT FROM true OR x.last_at<clock_timestamp()-make_interval(secs=>x.max_age_s) THEN
   PERFORM public.observe_sync_condition(x.component_key,false,
     CASE WHEN x.active IS DISTINCT FROM true THEN 'scheduler_disabled_or_missing' ELSE 'stale_schedule' END);
  ELSE IF EXISTS(SELECT FROM public.integration_sync_health h WHERE h.component_key=x.component_key AND h.failure_code IN ('stale_heartbeat','stale_schedule','scheduler_disabled_or_missing')) THEN PERFORM public.observe_sync_condition(x.component_key,true,NULL); END IF; END IF;
 END LOOP;
 FOR x IN SELECT e.component_key,coalesce(r.finished_at,e.created_at) last_at,e.max_age_s
  FROM public.integration_sync_expectations e LEFT JOIN public.v_runtime_job_latest r ON r.component_key=e.ref
  WHERE e.kind='runtime'
 LOOP
  IF x.last_at<clock_timestamp()-make_interval(secs=>x.max_age_s) THEN
   PERFORM public.observe_sync_condition(x.component_key,false,'stale_heartbeat');
  ELSE IF EXISTS(SELECT FROM public.integration_sync_health h WHERE h.component_key=x.component_key AND h.failure_code IN ('stale_heartbeat','stale_schedule','scheduler_disabled_or_missing')) THEN PERFORM public.observe_sync_condition(x.component_key,true,NULL); END IF; END IF;
 END LOOP;
 -- An office-wide newest timestamp can conceal one unpaid-looking stale job.
 FOR x IN SELECT a.account_key,count(*) FILTER(WHERE f.synced_at IS NULL OR f.synced_at<clock_timestamp()-interval '2 hours') stale
  FROM public.acculynx_accounts a JOIN public.acculynx_jobs j ON j.account_key=a.account_key
  JOIN public.wip_ar_master w ON w.acculynx_job_id=j.id AND w.in_ar_population
  LEFT JOIN public.acculynx_job_financials f ON f.job_id=j.id
  WHERE a.environment='production' AND a.is_active GROUP BY a.account_key
 LOOP
  PERFORM public.observe_sync_condition('acculynx-office:'||x.account_key,x.stale=0,'stale_financials');
 END LOOP;
 IF EXISTS(SELECT FROM public.integration_monitor_state WHERE key='github-watchdog') THEN
  PERFORM public.observe_sync_condition('monitor:github-watchdog',EXISTS(SELECT FROM public.integration_monitor_state WHERE key='github-watchdog' AND updated_at>clock_timestamp()-interval '30 minutes'),'watchdog_stale');
 END IF;
 PERFORM public.observe_sync_condition('monitor:alert-delivery',NOT EXISTS(SELECT FROM public.integration_sync_events e WHERE e.delivered_at IS NULL AND e.created_at<clock_timestamp()-interval '10 minutes' AND NOT EXISTS(SELECT FROM public.integration_retired_components t WHERE t.component_key=e.component_key)),'delivery_backlog');
 PERFORM public.observe_integration_sync('monitor:integration-sync-health',clock_timestamp(),true,NULL);
 RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public.monitor_integration_syncs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_integration_syncs() TO service_role;

