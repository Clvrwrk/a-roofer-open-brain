-- Stable receipt identity is independent of reused pg_net request numbers.
ALTER TABLE public.acculynx_sync_runs ADD COLUMN observation_id bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX acculynx_sync_observation_once ON public.acculynx_sync_runs(observation_id);
INSERT INTO public.integration_source_receipts(source,source_id) SELECT 'acculynx_worker',observation_id FROM public.acculynx_sync_runs WHERE completed_at IS NOT NULL ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.observe_integration_source(p_component text,p_source text,p_id bigint,p_finished timestamptz,p_ok boolean,p_code text,p_retry jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h public.integration_sync_health; claimed bigint;
BEGIN
 IF EXISTS(SELECT FROM public.integration_retired_components t WHERE t.component_key=p_component) THEN RETURN; END IF;
 INSERT INTO public.integration_source_receipts(source,source_id) VALUES(p_source,p_id) ON CONFLICT DO NOTHING RETURNING source_id INTO claimed;
 IF claimed IS NULL THEN RETURN; END IF;
 INSERT INTO public.integration_sync_health(component_key) VALUES(p_component) ON CONFLICT DO NOTHING;
 SELECT * INTO h FROM public.integration_sync_health WHERE component_key=p_component FOR UPDATE;
 -- Health follows source completion order, while EVERY failure gets its own durable receipt/event.
 IF h.last_source_at IS NULL OR (p_finished,p_id)>(h.last_source_at,h.last_source_id) THEN
  PERFORM public.observe_integration_sync_internal(p_component,clock_timestamp(),p_ok,p_code,p_retry,false);
  UPDATE public.integration_sync_health SET last_source_at=p_finished,last_source_id=p_id WHERE component_key=p_component;
 END IF;
 IF NOT p_ok THEN
  INSERT INTO public.integration_sync_events(component_key,incident_id,failures,failure_code,occurred_at,source,source_id)
  SELECT p_component,incident_id,greatest(consecutive_failures,1),p_code,p_finished,p_source,p_id FROM public.integration_sync_health WHERE component_key=p_component;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.observe_integration_source(text,text,bigint,timestamptz,boolean,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Scoped Actions attestation replaces a long-lived GitHub personal token in the app.
CREATE OR REPLACE FUNCTION public.record_sync_watchdog(p_commit text,p_run_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_commit IS NULL OR p_run_id IS NULL OR p_commit !~ '^[a-f0-9]{40}$' OR p_run_id !~ '^[0-9]{1,20}$' THEN RAISE EXCEPTION 'invalid_watchdog_observation' USING ERRCODE='22023'; END IF;
 INSERT INTO public.integration_monitor_state(key,value) VALUES('github-watchdog',jsonb_build_object('commit',p_commit,'runId',p_run_id))
 ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=clock_timestamp();
 PERFORM public.observe_sync_condition('monitor:github-watchdog',true,NULL);
END $$;
REVOKE ALL ON FUNCTION public.record_sync_watchdog(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_sync_watchdog(text,text) TO service_role;
-- Each office receives a full 110-second financial budget, staggered around :04/:30 full walks.
DO $$DECLARE a record; BEGIN
 FOR a IN SELECT account_key,(row_number() OVER(ORDER BY account_key)-1)::integer slot FROM public.acculynx_accounts WHERE is_active AND environment='production'
 LOOP
  IF a.slot>7 THEN RAISE EXCEPTION 'financial_schedule_capacity_exceeded'; END IF;
  PERFORM cron.schedule('acculynx-financial-'||a.account_key,(7+a.slot*7)::text||' * * * *',
   format('SELECT public.trigger_acculynx_sync(%L::jsonb)',jsonb_build_object('multiAccount',true,'financialsOnly',true,'accountFilter',jsonb_build_array(a.account_key))::text));
  INSERT INTO public.integration_sync_expectations(component_key,kind,ref,max_age_s) VALUES('cron:acculynx-financial-'||a.account_key,'pg_cron','acculynx-financial-'||a.account_key,4500) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;

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
  PERFORM public.observe_integration_source('acculynx-worker','acculynx_worker',x.observation_id,x.completed_at,x.status='completed',coalesce(x.failure_code,'worker_failed'),x.batch_context);n:=n+1;
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

