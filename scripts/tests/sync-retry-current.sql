BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;END$$;
INSERT INTO public.integration_sync_health(component_key,recovery_enabled) VALUES('acculynx-worker',true) ON CONFLICT(component_key) DO UPDATE SET recovery_enabled=true;
INSERT INTO public.acculynx_sync_runs(batch_context,token_hash,status,completed_at,failure_code)
SELECT '{"multiAccount":true}',decode('00','hex'),'failed',now(),'upstream_error' FROM generate_series(1,5);
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT count(*)=0 FROM net.queue),'fifth committed failure suppresses stale third-failure retry');
SELECT pg_temp.assert((SELECT consecutive_failures=5 FROM public.integration_sync_health WHERE component_key='acculynx-worker'),'all five failures are still counted');
ROLLBACK;
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;END$$;
INSERT INTO public.integration_sync_health(component_key,recovery_enabled) VALUES('acculynx-worker',true) ON CONFLICT(component_key) DO UPDATE SET recovery_enabled=true;
INSERT INTO public.acculynx_sync_runs(batch_context,token_hash,status,completed_at,failure_code)
SELECT '{"multiAccount":true}',decode('00','hex'),'failed',now(),'upstream_error' FROM generate_series(1,3);
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT count(*)=1 FROM net.queue),'latest third transient failure receives one scoped recovery');
ROLLBACK;
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;END$$;
INSERT INTO public.integration_sync_health(component_key,recovery_enabled) VALUES('acculynx-worker',true) ON CONFLICT(component_key) DO UPDATE SET recovery_enabled=true;
INSERT INTO public.acculynx_sync_runs(batch_context,token_hash,status,completed_at,failure_code)
SELECT '{"multiAccount":true}',decode('00','hex'),'failed',now(),'upstream_error' FROM generate_series(1,3);
INSERT INTO public.acculynx_sync_runs(batch_context,token_hash,status,completed_at) VALUES('{"multiAccount":true}',decode('00','hex'),'completed',now());
SELECT public.monitor_integration_syncs();
SELECT pg_temp.assert((SELECT count(*)=0 FROM net.queue),'already committed recovery suppresses stale retry');
ROLLBACK;
