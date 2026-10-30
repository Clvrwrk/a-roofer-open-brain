-- PEC-755: restart-safe dispatch, single-use scheduler capabilities, least-access RPCs.
-- Old dispatch history is retained. HTTP request IDs are correlation only, never identity.
CREATE TABLE IF NOT EXISTS public.acculynx_sync_runs (
 run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id bigint,
 batch_context jsonb NOT NULL, token_hash bytea NOT NULL,
 dispatched_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 claimed_at timestamptz, completed_at timestamptz,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','timed_out')),
 status_code integer, failure_code text, reconciled_at timestamptz
);
CREATE INDEX IF NOT EXISTS acculynx_sync_runs_recent ON public.acculynx_sync_runs(dispatched_at DESC);
ALTER TABLE public.acculynx_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.acculynx_sync_runs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.acculynx_sync_runs TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_acculynx_sync(p_resources jsonb DEFAULT '{"multiAccount":true}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
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
END $fn$;
REVOKE ALL ON FUNCTION public.trigger_acculynx_sync(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.claim_acculynx_sync_run(p_run_id uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_body jsonb;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 UPDATE public.acculynx_sync_runs SET status='running',claimed_at=clock_timestamp()
 WHERE run_id=p_run_id AND token_hash=sha256(convert_to(p_token,'UTF8')) AND status='queued'
  AND dispatched_at>clock_timestamp()-interval '3 minutes'
 RETURNING batch_context INTO v_body;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('body',v_body);
END $fn$;
REVOKE ALL ON FUNCTION public.claim_acculynx_sync_run(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_acculynx_sync_run(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_acculynx_cron_outcomes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE n integer; nold integer;
BEGIN
 -- Legacy histories remain valid; reject responses older than their dispatch.
 UPDATE public.acculynx_cron_dispatch d SET status_code=r.status_code,timed_out=r.timed_out,
  error_msg=CASE WHEN r.status_code>=400 THEN 'http_error' ELSE NULL END,
  response_preview=NULL,reconciled_at=clock_timestamp()
 FROM net._http_response r WHERE r.id=d.request_id AND r.created>=d.dispatched_at AND d.reconciled_at IS NULL;
 GET DIAGNOSTICS nold=ROW_COUNT;
 -- Worker echoes our UUID. An old response with a reused request_id cannot match.
 UPDATE public.acculynx_sync_runs d SET status_code=r.status_code,reconciled_at=clock_timestamp(),completed_at=clock_timestamp(),
  status=CASE WHEN r.status_code BETWEEN 200 AND 299 AND (CASE WHEN r.content IS JSON OBJECT THEN r.content::jsonb ELSE '{}'::jsonb END)->>'status'='completed' THEN 'completed' ELSE 'failed' END,
  failure_code=CASE WHEN r.status_code BETWEEN 200 AND 299 AND (CASE WHEN r.content IS JSON OBJECT THEN r.content::jsonb ELSE '{}'::jsonb END)->>'status'='completed' THEN NULL
   WHEN r.status_code IN (401,403) THEN 'auth_denied' WHEN r.status_code=429 THEN 'rate_limited'
   WHEN r.status_code>=500 THEN 'upstream_error' ELSE 'partial_or_invalid' END
 FROM net._http_response r WHERE r.id=d.request_id AND r.created>=d.dispatched_at AND d.reconciled_at IS NULL AND d.status IN ('queued','running')
  AND r.content IS JSON OBJECT AND (CASE WHEN r.content IS JSON OBJECT THEN r.content::jsonb ELSE '{}'::jsonb END)->>'dispatch_run_id'=d.run_id::text;
 GET DIAGNOSTICS n=ROW_COUNT;
 -- Non-JSON / gateway denials cannot echo a run ID: only accept their timestamped transport failure.
 UPDATE public.acculynx_sync_runs d SET status='failed',status_code=r.status_code,
  failure_code=CASE WHEN r.status_code IN (401,403) THEN 'auth_denied' WHEN r.status_code=429 THEN 'rate_limited' ELSE 'transport_error' END,
  completed_at=clock_timestamp(),reconciled_at=clock_timestamp()
 FROM net._http_response r WHERE r.id=d.request_id AND r.created>=d.dispatched_at AND d.reconciled_at IS NULL AND d.status IN ('queued','running')
  AND (r.timed_out OR r.error_msg IS NOT NULL OR r.status_code>=400)
  AND NOT (r.content IS JSON OBJECT AND (CASE WHEN r.content IS JSON OBJECT THEN r.content::jsonb ELSE '{}'::jsonb END) ? 'dispatch_run_id');
 UPDATE public.acculynx_sync_runs SET status='timed_out',failure_code='worker_timeout',completed_at=clock_timestamp(),reconciled_at=clock_timestamp()
 WHERE status IN ('queued','running') AND dispatched_at<clock_timestamp()-interval '4 minutes';
 RETURN n+nold;
END $fn$;
REVOKE ALL ON FUNCTION public.reconcile_acculynx_cron_outcomes() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_acculynx_cron_outcomes() TO service_role;

CREATE OR REPLACE VIEW public.v_acculynx_cron_outcomes AS
SELECT l.id AS log_id,l.sync_batch_id,l.started_at AS fired_at,l.notes,
 coalesce(n.request_id,d.request_id) AS request_id,coalesce(n.status_code,d.status_code) AS status_code,
 CASE WHEN n.run_id IS NOT NULL THEN n.status='timed_out' ELSE d.timed_out END AS timed_out,
 coalesce(n.failure_code,d.error_msg) AS error_msg,d.response_preview,
 coalesce(n.reconciled_at,d.reconciled_at) AS responded_at,
 CASE WHEN n.run_id IS NOT NULL THEN CASE WHEN n.status='completed' THEN 'success' WHEN n.status='timed_out' THEN 'timeout'
   WHEN n.status='failed' THEN 'http_error' ELSE 'pending' END
  WHEN d.request_id IS NULL THEN 'pending'
  WHEN d.reconciled_at IS NULL AND d.dispatched_at>now()-interval '30 minutes' THEN 'pending'
  WHEN d.reconciled_at IS NULL THEN 'unreconciled' WHEN d.timed_out THEN 'timeout'
  WHEN d.status_code BETWEEN 200 AND 299 THEN 'success' ELSE 'http_error' END AS outcome,
 coalesce(n.dispatched_at,d.dispatched_at) AS dispatched_at,
 coalesce(n.reconciled_at,d.reconciled_at) AS reconciled_at,
 coalesce(n.reconciled_at,d.reconciled_at) IS NULL AND coalesce(n.dispatched_at,d.dispatched_at)<now()-interval '30 minutes' AS unreconciled_past_grace
FROM public.crm_sync_log l
LEFT JOIN public.acculynx_cron_dispatch d ON l.sync_batch_id='cron-trigger-'||d.request_id
LEFT JOIN public.acculynx_sync_runs n ON l.sync_batch_id='cron-trigger-'||n.run_id
WHERE l.sync_type='cron_trigger' ORDER BY l.id DESC;

-- Server maintenance only, never a user-facing RPC; preserve owner execution.
REVOKE ALL ON FUNCTION public.check_acculynx_alerts() FROM PUBLIC,anon,authenticated;
