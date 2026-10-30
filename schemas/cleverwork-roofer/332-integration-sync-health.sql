-- PEC-755: independent first-failure detection for EVERY pg_cron job and
-- registered runtime/MCP/API heartbeats. Only AccuLynx transient retries are automatic.
CREATE TABLE IF NOT EXISTS public.integration_sync_health (
 component_key text PRIMARY KEY, last_observed_at timestamptz,
 consecutive_failures integer NOT NULL DEFAULT 0, failure_code text,
 recovery_attempts integer NOT NULL DEFAULT 0, last_recovery_at timestamptz,
 recovery_enabled boolean NOT NULL DEFAULT false, incident_id uuid NOT NULL DEFAULT gen_random_uuid(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.integration_sync_events (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), component_key text NOT NULL,
 incident_id uuid NOT NULL, failures integer NOT NULL, failure_code text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), request_id bigint,
 delivered_at timestamptz, sent_at timestamptz, attempts integer NOT NULL DEFAULT 0
);
ALTER TABLE public.integration_sync_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_sync_health,public.integration_sync_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.integration_sync_health,public.integration_sync_events TO service_role;

CREATE OR REPLACE FUNCTION public.observe_integration_sync(p_component text,p_at timestamptz,p_ok boolean,p_code text,p_retry jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
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
END $fn$;
REVOKE ALL ON FUNCTION public.observe_integration_sync(text,timestamptz,boolean,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

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
 PERFORM public.observe_integration_sync('monitor:integration-sync-health',clock_timestamp(),true,NULL);
 RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public.monitor_integration_syncs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_integration_syncs() TO service_role;
INSERT INTO public.integration_sync_health(component_key,recovery_enabled) VALUES('acculynx-worker',true) ON CONFLICT DO NOTHING;
-- Scheduler installed separately after tests/deploy; never starts from a lab migration.
GRANT UPDATE(delivered_at) ON public.integration_sync_events TO service_role;
-- Checkpoint proves the independent DB monitor itself continues running.
CREATE OR REPLACE FUNCTION public.record_integration_probe(p_component text,p_ok boolean,p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF p_component !~ '^(int|feed|api|page|site)\.[a-zA-Z0-9._/-]{1,120}$' OR p_ok IS NULL OR p_code NOT IN ('probe_unverified','probe_failed') THEN
  RAISE EXCEPTION 'invalid_probe' USING ERRCODE='22023'; END IF;
 PERFORM public.observe_integration_sync(p_component,clock_timestamp(),p_ok,p_code);
END $fn$;
REVOKE ALL ON FUNCTION public.record_integration_probe(text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_integration_probe(text,boolean,text) TO service_role;
