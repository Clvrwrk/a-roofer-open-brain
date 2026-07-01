-- 172 — AccuLynx hourly cron cutover + multiAccount dispatch (Phase 3, REQ-07, plan 03-02)
--
-- PROBLEM (confirmed live, 03-LIVE-STATE.md): the live cron `acculynx-sync-daily`
-- (schedule `15 8 * * *`) calls `trigger_acculynx_sync('["users","jobs"]'::jsonb)`, whose body
-- was `{"resources": [...]}` with NO multiAccount flag → the edge function took the LEGACY
-- single-account path (legacySyncJobs). That legacy path (a) only syncs Kansas users+jobs once
-- daily and (b) stores jobs.last_api_count = 1 (confirmed: (kansas_city,jobs)=1), blinding
-- reconciliation. Goal SC1 requires hourly, all-wired-accounts, all-resources.
--
-- FIX:
--   1. Redefine trigger_acculynx_sync so the POST body is the caller's payload directly
--      (an object like {"multiAccount":true} is sent as-is; a legacy array is still wrapped
--      as {"resources":[...]} for backward compat), AND record the dispatched request_id into
--      the owned acculynx_cron_dispatch table (mig 173) so outcomes survive the pg_net 6h TTL.
--   2. Unschedule the legacy daily job and schedule ONE hourly job (`0 * * * *`) that drives
--      multiAccount:true → the edge function's runAccountSync fan-out (which already persists
--      the true apiCount, so the last_api_count=1 bug is fixed by this cutover alone — verified
--      live in plan 03-02 Task 2).
--
-- Rollback: cron.unschedule('acculynx-hourly-sync') and re-schedule the prior daily job
--   (`select cron.schedule('acculynx-sync-daily','15 8 * * *',$$select trigger_acculynx_sync('["users","jobs"]'::jsonb)$$)`).
--   No table is dropped.
--
-- Additive + idempotent; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).
-- The only scheduling removal is cron.unschedule of the legacy JOB (not a table DROP).

-- ── Step 1: redefine the trigger function (body = payload; record dispatch) ───
-- CREATE OR REPLACE keeps the existing (p_resources jsonb) signature (Postgres forbids
-- renaming an input parameter via REPLACE). p_resources is now treated as the full body
-- payload: an object is posted as-is; a legacy array is wrapped for backward compatibility.
create or replace function public.trigger_acculynx_sync(p_resources jsonb default '{"multiAccount": true}'::jsonb)
returns bigint
language plpgsql
as $fn$
declare
  v_jwt        text;
  v_request_id bigint;
  v_body       jsonb;
  v_url constant text := 'https://rnhmvcpsvtqjlffpsayu.supabase.co/functions/v1/acculynx-sync';
begin
  select decrypted_secret into v_jwt
  from vault.decrypted_secrets
  where name = 'acculynx_sync_auth_jwt'
  limit 1;

  if v_jwt is null then
    raise exception 'Vault secret acculynx_sync_auth_jwt not found';
  end if;

  -- Object payload (e.g. {"multiAccount":true}) → sent as-is.
  -- Legacy array payload (e.g. ["users","jobs"]) → wrapped as {"resources":[...]}.
  v_body := case
              when jsonb_typeof(p_resources) = 'array'
                then jsonb_build_object('resources', p_resources)
              else p_resources
            end;

  select net.http_post(
    url                  := v_url,
    headers              := jsonb_build_object(
                              'Content-Type',  'application/json',
                              'Authorization', 'Bearer ' || v_jwt
                            ),
    body                 := v_body,
    timeout_milliseconds := 170000
  ) into v_request_id;

  -- Record the dispatch in the owned table so the outcome survives the pg_net 6h TTL.
  -- batch_context stores ONLY the non-secret body payload (never the JWT/headers) — hard rule 2.
  insert into public.acculynx_cron_dispatch (request_id, batch_context, dispatched_at)
  values (v_request_id, v_body, now())
  on conflict (request_id) do nothing;

  -- Breadcrumb matching the real crm_sync_log schema (unchanged behavior).
  insert into crm_sync_log (sync_batch_id, sync_type, status, api_endpoint, notes)
  values (
    'cron-trigger-' || v_request_id,
    'cron_trigger',
    'queued',
    v_url,
    'pg_cron fired acculynx-sync with body=' || v_body::text ||
    ' (pg_net request_id=' || v_request_id || ')'
  );

  return v_request_id;
end;
$fn$;

comment on function public.trigger_acculynx_sync(jsonb) is
  'Fires the acculynx-sync edge function via pg_net. Phase 3 (mig 172): body = caller payload directly (object sent as-is so {"multiAccount":true} drives the multi-account fan-out; legacy array wrapped as {"resources":[...]}), and each dispatched request_id is recorded in acculynx_cron_dispatch so outcomes survive the pg_net 6h TTL. Never logs the JWT (hard rule 2).';

-- ── Step 2: retire the legacy daily job, schedule the single hourly job ───────
-- Unschedule the legacy daily sync job (idempotent — swallow "job not found").
do $$
begin
  perform cron.unschedule('acculynx-sync-daily');
exception when others then
  null; -- already unscheduled / never existed — idempotent no-op
end $$;

-- Schedule exactly one hourly job driving multiAccount:true. Guarded so re-running is a no-op.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'acculynx-hourly-sync') then
    perform cron.schedule(
      'acculynx-hourly-sync',
      '0 * * * *',
      $cron$select public.trigger_acculynx_sync('{"multiAccount": true}'::jsonb)$cron$
    );
  end if;
end $$;
