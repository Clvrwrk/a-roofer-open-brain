-- Emergency rollback of the follow-through monitor/trigger only; preserve financial and incident history.
-- Stop new financial-only schedules before restoring the older trigger contract.
DO $$DECLARE j record; BEGIN
 FOR j IN SELECT jobid FROM cron.job WHERE jobname LIKE 'acculynx-financial-%' LOOP PERFORM cron.unschedule(j.jobid); END LOOP;
 UPDATE public.integration_sync_expectations SET kind='retired' WHERE ref LIKE 'acculynx-financial-%';
END $$;

CREATE OR REPLACE FUNCTION public.monitor_integration_syncs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.observe_integration_sync(p_component text, p_at timestamp with time zone, p_ok boolean, p_code text, p_retry jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h public.integration_sync_health; r bigint;
BEGIN
 INSERT INTO public.integration_sync_health(component_key) VALUES(p_component) ON CONFLICT DO NOTHING;
 SELECT * INTO h FROM public.integration_sync_health WHERE component_key=p_component FOR UPDATE;
 IF h.last_observed_at IS NOT NULL AND p_at<=h.last_observed_at THEN RETURN; END IF;
 IF p_ok THEN
  UPDATE public.integration_sync_health SET last_observed_at=p_at,consecutive_failures=0,failure_code=NULL,
   recovery_attempts=0,last_recovery_at=NULL,incident_id=CASE WHEN consecutive_failures>0 THEN gen_random_uuid() ELSE incident_id END,updated_at=clock_timestamp()
  WHERE component_key=p_component;
  RETURN;
 END IF;
 h.consecutive_failures:=h.consecutive_failures+1;
 UPDATE public.integration_sync_health SET last_observed_at=p_at,consecutive_failures=h.consecutive_failures,
  failure_code=p_code,updated_at=clock_timestamp() WHERE component_key=p_component;
 IF h.consecutive_failures IN (1,3,5) THEN
  INSERT INTO public.integration_sync_events(component_key,incident_id,failures,failure_code)
  VALUES(p_component,h.incident_id,h.consecutive_failures,p_code);
 END IF;
 -- Finite allowlist, max TWO extra attempts, no auth/schema/mapping auto-repair.
 IF p_component='acculynx-worker' AND h.recovery_enabled AND h.consecutive_failures BETWEEN 3 AND 4
  AND h.recovery_attempts<2 AND (h.last_recovery_at IS NULL OR h.last_recovery_at<clock_timestamp()-interval '15 minutes')
  AND p_code IN ('rate_limited','upstream_error','transport_error','worker_timeout') AND p_retry IS NOT NULL THEN
  r:=public.trigger_acculynx_sync(p_retry);
  IF r>0 THEN UPDATE public.integration_sync_health SET recovery_attempts=recovery_attempts+1,last_recovery_at=clock_timestamp() WHERE component_key=p_component; END IF;
 END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.trigger_acculynx_sync(p_resources jsonb DEFAULT '{"multiAccount": true}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_jwt text; v_token text; v_body jsonb; v_run uuid:=gen_random_uuid(); v_request bigint;
BEGIN
 -- One sync globally at a time: both schedules share the same API rate budgets.
 IF NOT pg_try_advisory_xact_lock(755331) THEN RETURN 0; END IF;
 IF EXISTS(SELECT FROM public.acculynx_sync_runs WHERE status IN ('queued','running') AND dispatched_at>clock_timestamp()-interval '4 minutes') THEN RETURN 0; END IF;
 v_body:=CASE WHEN jsonb_typeof(p_resources)='array' THEN jsonb_build_object('resources',p_resources) ELSE p_resources END;
 IF v_body IS NULL OR jsonb_typeof(v_body)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(v_body) k WHERE k NOT IN ('multiAccount','jobWalkOnly','accountFilter','resources','fullSync','resolveLeads')) THEN
  RAISE EXCEPTION 'invalid_sync_options' USING ERRCODE='22023'; END IF;
 -- Recovery is a read-only multi-account ingestion; legacy mutation paths are refused.
 IF v_body->'multiAccount' IS DISTINCT FROM 'true'::jsonb OR coalesce(v_body->'fullSync','false')<>'false'::jsonb OR coalesce(v_body->'resolveLeads','false')<>'false'::jsonb THEN
  RAISE EXCEPTION 'multi_account_read_sync_required' USING ERRCODE='22023'; END IF;
 IF v_body ? 'resources' THEN RAISE EXCEPTION 'resource_override_not_allowed' USING ERRCODE='22023'; END IF;
 IF v_body ? 'jobWalkOnly' AND jsonb_typeof(v_body->'jobWalkOnly')<>'boolean' THEN RAISE EXCEPTION 'invalid_job_walk_option' USING ERRCODE='22023'; END IF;
 IF v_body ? 'accountFilter' THEN
  IF jsonb_typeof(v_body->'accountFilter')<>'array' OR jsonb_array_length(v_body->'accountFilter')=0 OR jsonb_array_length(v_body->'accountFilter')>8 THEN
   RAISE EXCEPTION 'invalid_account_filter' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements(v_body->'accountFilter') x WHERE jsonb_typeof(x)<>'string' OR NOT EXISTS(
    SELECT FROM public.acculynx_accounts a WHERE a.account_key=x#>>'{}' AND a.is_active AND a.environment='production')) THEN
   RAISE EXCEPTION 'unknown_sync_account' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT decrypted_secret INTO v_jwt FROM vault.decrypted_secrets WHERE name='acculynx_sync_auth_jwt' LIMIT 1;
 IF v_jwt IS NULL THEN RAISE EXCEPTION 'scheduler_credential_unavailable'; END IF;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.acculynx_sync_runs(run_id,batch_context,token_hash) VALUES(v_run,v_body,sha256(convert_to(v_token,'UTF8')));
 SELECT net.http_post(url:='https://rnhmvcpsvtqjlffpsayu.supabase.co/functions/v1/acculynx-sync',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_jwt,'x-sync-token',v_token),
  body:=jsonb_build_object('dispatch_run_id',v_run),timeout_milliseconds:=170000) INTO v_request;
 UPDATE public.acculynx_sync_runs SET request_id=v_request WHERE run_id=v_run;
 INSERT INTO public.crm_sync_log(sync_batch_id,sync_type,status,api_endpoint,notes)
 VALUES('cron-trigger-'||v_run,'cron_trigger','queued','acculynx-sync',v_body::text);
 RETURN v_request;
END $function$;

