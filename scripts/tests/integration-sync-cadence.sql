BEGIN;
TRUNCATE public.integration_sync_health,public.integration_sync_events,public.integration_sync_expectations;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;END$$;
INSERT INTO public.integration_sync_expectations VALUES
('cron:disabled','pg_cron','disabled',60,now()-interval '2 hours'),
('cron:missing','pg_cron','missing',60,now()-interval '2 hours'),
('runtime:missing','runtime','missing',60,now()-interval '2 hours');
INSERT INTO cron.job VALUES(901,'disabled',false);
INSERT INTO public.acculynx_jobs VALUES('old','test'),('new','test');
INSERT INTO public.wip_ar_master VALUES('old',true),('new',true);
INSERT INTO public.acculynx_job_financials VALUES('old',now()-interval '4 days'),('new',now());
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT failure_code='scheduler_disabled_or_missing' FROM public.integration_sync_health WHERE component_key='cron:disabled'),'disabled schedule detected');
SELECT pg_temp.assert((SELECT consecutive_failures=1 FROM public.integration_sync_health WHERE component_key='cron:missing'),'missing schedule detected');
SELECT pg_temp.assert((SELECT consecutive_failures=1 FROM public.integration_sync_health WHERE component_key='runtime:missing'),'missing runtime heartbeat detected');
SELECT pg_temp.assert((SELECT failure_code='stale_financials' FROM public.integration_sync_health WHERE component_key='acculynx-office:test'),'one stale job not hidden by newest timestamp');
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT consecutive_failures=1 FROM public.integration_sync_health WHERE component_key='cron:disabled'),'stale observation rate limited');
SELECT 'PASS: disabled schedule, missing schedule, absent runtime, per-job money freshness, deduplication';
ROLLBACK;
