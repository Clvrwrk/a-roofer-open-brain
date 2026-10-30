-- PEC-755: oldest-first dedicated financial/invoice-header pass, preserving source authority.
CREATE OR REPLACE FUNCTION public.acculynx_financial_sync_candidates(p_account_key text)
RETURNS TABLE(job_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT j.id FROM public.acculynx_jobs j JOIN public.acculynx_accounts a ON a.account_key=j.account_key
 JOIN public.wip_ar_master w ON w.acculynx_job_id=j.id AND w.in_ar_population
 LEFT JOIN public.acculynx_job_financials f ON f.job_id=j.id
 WHERE j.account_key=p_account_key AND a.is_active AND a.environment='production' AND j.archived_at IS NULL
 AND (f.synced_at IS NULL OR f.synced_at<now()-interval '1 hour')
 ORDER BY f.synced_at NULLS FIRST,j.id LIMIT 500
$$;
REVOKE ALL ON FUNCTION public.acculynx_financial_sync_candidates(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acculynx_financial_sync_candidates(text) TO service_role;
CREATE OR REPLACE FUNCTION public.trigger_acculynx_sync(p_resources jsonb DEFAULT '{"multiAccount":true}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_jwt text; v_token text; v_body jsonb; v_run uuid:=gen_random_uuid(); v_request bigint;
BEGIN
 -- One sync globally at a time: both schedules share the same API rate budgets.
 IF NOT pg_try_advisory_xact_lock(755331) THEN RETURN 0; END IF;
 IF EXISTS(SELECT FROM public.acculynx_sync_runs WHERE status IN ('queued','running') AND dispatched_at>clock_timestamp()-interval '4 minutes') THEN RETURN 0; END IF;
 v_body:=CASE WHEN jsonb_typeof(p_resources)='array' THEN jsonb_build_object('resources',p_resources) ELSE p_resources END;
 IF v_body IS NULL OR jsonb_typeof(v_body)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(v_body) k WHERE k NOT IN ('multiAccount','jobWalkOnly','financialsOnly','accountFilter','resources','fullSync','resolveLeads')) THEN
  RAISE EXCEPTION 'invalid_sync_options' USING ERRCODE='22023'; END IF;
 -- Recovery is a read-only multi-account ingestion; legacy mutation paths are refused.
 IF v_body->'multiAccount' IS DISTINCT FROM 'true'::jsonb OR coalesce(v_body->'fullSync','false')<>'false'::jsonb OR coalesce(v_body->'resolveLeads','false')<>'false'::jsonb THEN
  RAISE EXCEPTION 'multi_account_read_sync_required' USING ERRCODE='22023'; END IF;
 IF v_body ? 'resources' THEN RAISE EXCEPTION 'resource_override_not_allowed' USING ERRCODE='22023'; END IF;
 IF v_body ? 'jobWalkOnly' AND jsonb_typeof(v_body->'jobWalkOnly')<>'boolean' THEN RAISE EXCEPTION 'invalid_job_walk_option' USING ERRCODE='22023'; END IF;
 IF v_body ? 'financialsOnly' AND (jsonb_typeof(v_body->'financialsOnly')<>'boolean' OR v_body->'jobWalkOnly'='true'::jsonb) THEN RAISE EXCEPTION 'invalid_financial_option' USING ERRCODE='22023'; END IF;
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
END $fn$;
REVOKE ALL ON FUNCTION public.trigger_acculynx_sync(jsonb) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.trigger_acculynx_sync(jsonb) TO service_role;
