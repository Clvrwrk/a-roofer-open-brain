BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;END$$;
-- Both runs complete before the next poll, at the same timestamp.
INSERT INTO public.runtime_job_runs(component_key,status,finished_at) VALUES('fast-worker','failure',now()),('fast-worker','success',now());
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.integration_sync_events WHERE component_key='runtime:fast-worker'),'first failure retained before fast recovery');
SELECT pg_temp.assert((SELECT consecutive_failures=0 FROM public.integration_sync_health WHERE component_key='runtime:fast-worker'),'latest source outcome is healthy despite timestamp tie');
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.integration_sync_events WHERE component_key='runtime:fast-worker'),'source receipts prevent duplicate delivery');
INSERT INTO public.runtime_job_runs(component_key,status,finished_at) VALUES('fast-worker','failure',now()-interval '1 minute');
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.integration_sync_events WHERE component_key='runtime:fast-worker'),'late committed failure is retained');
SELECT pg_temp.assert((SELECT consecutive_failures=0 FROM public.integration_sync_health WHERE component_key='runtime:fast-worker'),'old failure cannot overwrite newer recovery');
INSERT INTO public.runtime_job_runs(component_key,status,finished_at) VALUES('systemd.openbrain-jt-sentinel','failure',now());
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert(NOT EXISTS(SELECT FROM public.integration_sync_events WHERE component_key='runtime:systemd.openbrain-jt-sentinel'),'retired provider does not generate active incident');
SELECT public.observe_sync_condition('acculynx-office:test',true,NULL);
SELECT public.observe_sync_condition('acculynx-office:test',false,'stale_financials');
SELECT pg_temp.assert((SELECT consecutive_failures=1 FROM public.integration_sync_health WHERE component_key='acculynx-office:test'),'first stale condition not delayed to next hour');
SELECT public.observe_sync_condition('acculynx-office:test',true,NULL);
SELECT pg_temp.assert((SELECT consecutive_failures=0 FROM public.integration_sync_health WHERE component_key='acculynx-office:test'),'condition recovery clears immediately');
UPDATE public.integration_sync_events SET created_at=now()-interval '20 minutes';
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT failure_code='delivery_backlog' FROM public.integration_sync_health WHERE component_key='monitor:alert-delivery'),'undelivered events alarm independently');
INSERT INTO public.acculynx_jobs(id,account_key) VALUES('old','test'),('fresh','test'),('not-board','test');
INSERT INTO public.wip_ar_master VALUES('old',true),('fresh',true);
INSERT INTO public.acculynx_job_financials VALUES('old',now()-interval '3 days'),('fresh',now());
SELECT pg_temp.assert((SELECT array_agg(job_id)=ARRAY['old'] FROM public.acculynx_financial_sync_candidates('test')),'dedicated money queue scopes current WIP and resumes oldest first');
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.acculynx_financial_sync_candidates(text)','EXECUTE'),'financial queue denies end users');
-- AccuLynx outcomes also use stable receipts, even when request IDs and timestamps tie.
INSERT INTO public.acculynx_sync_runs(request_id,batch_context,token_hash,status,completed_at,failure_code)
VALUES(4242,'{"multiAccount":true}',decode('00','hex'),'failed',now(),'upstream_error'),
      (4242,'{"multiAccount":true}',decode('00','hex'),'completed',now(),NULL);
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.integration_sync_events WHERE source='acculynx_worker'),'worker failure retained across reused request ID and tied timestamp');
SELECT pg_temp.assert((SELECT consecutive_failures=0 FROM public.integration_sync_health WHERE component_key='acculynx-worker'),'worker recovery wins tied timestamp');
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.integration_sync_events WHERE source='acculynx_worker'),'worker receipt deduplicated');
SELECT public.record_sync_watchdog(repeat('a',40),'12345');
SELECT pg_temp.assert((SELECT consecutive_failures=0 FROM public.integration_sync_health WHERE component_key='monitor:github-watchdog'),'fresh watchdog healthy');
UPDATE public.integration_monitor_state SET updated_at=now()-interval '31 minutes' WHERE key='github-watchdog';
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT failure_code='watchdog_stale' FROM public.integration_sync_health WHERE component_key='monitor:github-watchdog'),'missing independent watchdog detected');
DO $$BEGIN
 BEGIN PERFORM public.record_sync_watchdog(NULL,'1'); RAISE EXCEPTION 'null watchdog accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END$$;
SELECT 'PASS: failure/recovery between polls, timestamp tie, late commit, exactly-once source, retired provider, immediate freshness, delivery alarm, money queue';
ROLLBACK;
