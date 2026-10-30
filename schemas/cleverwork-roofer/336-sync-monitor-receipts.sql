-- PEC-755 follow-through: lossless outcomes, honest delivery state, JobTread retirement.
CREATE TABLE public.integration_source_receipts(source text NOT NULL,source_id bigint NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(source,source_id));
CREATE TABLE public.integration_retired_components(component_key text PRIMARY KEY,reason text NOT NULL,retired_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.integration_monitor_state(key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.integration_source_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_retired_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_monitor_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_source_receipts,public.integration_retired_components,public.integration_monitor_state FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.integration_source_receipts,public.integration_retired_components,public.integration_monitor_state TO service_role;
ALTER TABLE public.integration_sync_health ADD COLUMN last_source_at timestamptz,ADD COLUMN last_source_id bigint;
ALTER TABLE public.integration_sync_events ADD COLUMN occurred_at timestamptz,ADD COLUMN source text,ADD COLUMN source_id bigint;
CREATE UNIQUE INDEX integration_event_source_once ON public.integration_sync_events(source,source_id) WHERE source IS NOT NULL;
-- Existing outcomes have already been inspected; only future/uncommitted outcomes enter the new stream.
INSERT INTO public.integration_source_receipts(source,source_id) SELECT 'runtime',id FROM public.runtime_job_runs ON CONFLICT DO NOTHING;
INSERT INTO public.integration_source_receipts(source,source_id) SELECT 'cron',runid FROM cron.job_run_details WHERE end_time IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.integration_retired_components(component_key,reason) VALUES('runtime:systemd.openbrain-jt-sentinel','JobTread retired by Chris 2026-10-23'),('int.jobtread','JobTread retired by Chris 2026-10-23');
-- Keep history and source mirrors; remove only the active cadence obligation.
UPDATE public.integration_sync_expectations SET kind='retired' WHERE component_key='runtime:systemd.openbrain-jt-sentinel';
CREATE OR REPLACE FUNCTION public.observe_integration_sync_internal(p_component text,p_at timestamptz,p_ok boolean,p_code text,p_retry jsonb,p_emit boolean)
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
 IF p_emit AND h.consecutive_failures IN (1,3,5) THEN
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
REVOKE ALL ON FUNCTION public.observe_integration_sync_internal(text,timestamptz,boolean,text,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.observe_integration_sync(p_component text,p_at timestamptz,p_ok boolean,p_code text,p_retry jsonb DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT public.observe_integration_sync_internal(p_component,p_at,p_ok,p_code,p_retry,true)$$;
REVOKE ALL ON FUNCTION public.observe_integration_sync(text,timestamptz,boolean,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.observe_integration_source(p_component text,p_source text,p_id bigint,p_finished timestamptz,p_ok boolean,p_code text)
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
  PERFORM public.observe_integration_sync_internal(p_component,clock_timestamp(),p_ok,p_code,NULL,false);
  UPDATE public.integration_sync_health SET last_source_at=p_finished,last_source_id=p_id WHERE component_key=p_component;
 END IF;
 IF NOT p_ok THEN
  INSERT INTO public.integration_sync_events(component_key,incident_id,failures,failure_code,occurred_at,source,source_id)
  SELECT p_component,incident_id,greatest(consecutive_failures,1),p_code,p_finished,p_source,p_id FROM public.integration_sync_health WHERE component_key=p_component;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.observe_integration_source(text,text,bigint,timestamptz,boolean,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.observe_sync_condition(p_component text,p_ok boolean,p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h public.integration_sync_health;
BEGIN
 IF EXISTS(SELECT FROM public.integration_retired_components t WHERE t.component_key=p_component) THEN RETURN; END IF;
 SELECT * INTO h FROM public.integration_sync_health WHERE component_key=p_component;
 IF NOT FOUND OR (p_ok AND h.consecutive_failures>0) OR (NOT p_ok AND (h.consecutive_failures=0 OR h.failure_code IS DISTINCT FROM p_code OR h.last_observed_at<clock_timestamp()-interval '15 minutes')) THEN
  PERFORM public.observe_integration_sync(p_component,clock_timestamp(),p_ok,p_code);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.observe_sync_condition(text,boolean,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sync_health_delivery_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('pending',count(*),'oldestPendingAt',min(e.created_at)) FROM public.integration_sync_events e
 WHERE e.delivered_at IS NULL AND NOT EXISTS(SELECT FROM public.integration_retired_components t WHERE t.component_key=e.component_key)
$$;
REVOKE ALL ON FUNCTION public.sync_health_delivery_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_health_delivery_status() TO service_role;
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
  LEFT JOIN public.integration_sync_health h ON h.component_key='acculynx-worker'
  WHERE d.completed_at>coalesce(h.last_observed_at,clock_timestamp()-interval '24 hours')
  ORDER BY d.completed_at
 LOOP
  PERFORM public.observe_integration_sync('acculynx-worker',x.completed_at,x.status='completed',coalesce(x.failure_code,'worker_failed'),x.batch_context);n:=n+1;
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
 PERFORM public.observe_sync_condition('monitor:alert-delivery',NOT EXISTS(SELECT FROM public.integration_sync_events e WHERE e.delivered_at IS NULL AND e.created_at<clock_timestamp()-interval '10 minutes' AND NOT EXISTS(SELECT FROM public.integration_retired_components t WHERE t.component_key=e.component_key)),'delivery_backlog');
 PERFORM public.observe_integration_sync('monitor:integration-sync-health',clock_timestamp(),true,NULL);
 RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public.monitor_integration_syncs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_integration_syncs() TO service_role;

