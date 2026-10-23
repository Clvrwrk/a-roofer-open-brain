CREATE OR REPLACE FUNCTION public.check_acculynx_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'vault'
AS $function$
declare
  v_bot_token text := (select decrypted_secret from vault.decrypted_secrets where name = 'acculynx_alert_slack_bot_token' limit 1);
  v_channel   text := coalesce(nullif(current_setting('app.acculynx_alert_slack_channel', true), ''), 'C0BDF8QRF8A');
  v_lines     text[] := array[]::text[];
  v_summary   text;
  v_n         integer;
begin
  -- (a) D-05a — recent failed run (reconciled non-2xx dispatch in the last 6h)
  select count(*) into v_n
  from public.acculynx_cron_dispatch
  where status_code >= 400 and dispatched_at > now() - interval '6 hours';
  if v_n > 0 then
    v_lines := v_lines || format('🔴 %s failed cron dispatch(es) (status >= 400) in the last 6h', v_n);
  end if;

  -- (b) D-05b/D-06 — stale watermark (previously-live resource quiet 3h+; NULL excluded, Pitfall 4)
  select count(*) into v_n
  from public.acculynx_sync_watermark
  where last_sync_at is not null and last_sync_at < now() - interval '3 hours';
  if v_n > 0 then
    v_lines := v_lines || format('🟠 %s (account,resource) watermark(s) stale > 3 hours', v_n);
  end if;

  -- (c) D-05c/D-07 — reconciliation delta over tolerance (> 2%); jobs excluded until full-count fix
  select count(*) into v_n
  from public.v_acculynx_reconciliation
  where delta_pct > 2 and resource_type <> 'jobs';
  if v_n > 0 then
    v_lines := v_lines || format('🟡 %s (account,resource) reconciliation delta_pct > 2%%', v_n);
  end if;

  -- (d) D-05d — unreconciled pg_net dispatch past the 30-min grace window
  select count(*) into v_n
  from public.acculynx_cron_dispatch
  where reconciled_at is null and dispatched_at < now() - interval '30 minutes';
  if v_n > 0 then
    v_lines := v_lines || format('⚪ %s pg_net dispatch(es) unreconciled past 30-min grace', v_n);
  end if;

  -- (e) NEW — unresolved job-walk sub-resource write failures in the last 6h (VERIFICATION gap 2)
  select count(*) into v_n
  from public.acculynx_job_walk_errors
  where resolved_at is null and occurred_at > now() - interval '6 hours';
  if v_n > 0 then
    v_lines := v_lines || format('🟣 %s unresolved job-walk write failure(s) in the last 6h', v_n);
  end if;

  if array_length(v_lines, 1) is null then
    return 0; -- all healthy
  end if;

  v_summary := 'AccuLynx cron health alert (' || to_char(now(), 'YYYY-MM-DD HH24:MI UTC') || E'):\n' ||
               array_to_string(v_lines, E'\n');

  if v_bot_token is not null then
    perform net.http_post(
      url     := 'https://slack.com/api/chat.postMessage',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json; charset=utf-8',
                   'Authorization', 'Bearer ' || v_bot_token
                 ),
      body    := jsonb_build_object('channel', v_channel, 'text', v_summary)
    );
  end if;

  return array_length(v_lines, 1);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_acculynx_cron_outcomes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
declare
  v_updated integer;
begin
  update public.acculynx_cron_dispatch d
     set status_code      = r.status_code,
         timed_out        = r.timed_out,
         error_msg        = r.error_msg,
         response_preview = substr(r.content, 1, 500),
         reconciled_at    = now()
    from net._http_response r
   where r.id = d.request_id
     and d.reconciled_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_acculynx_sync(p_resources jsonb DEFAULT '{"multiAccount": true}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
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

  insert into public.acculynx_cron_dispatch (request_id, batch_context, dispatched_at)
  values (v_request_id, v_body, now())
  on conflict (request_id) do nothing;

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
$function$
;
CREATE OR REPLACE VIEW public.v_acculynx_cron_outcomes AS  SELECT l.id AS log_id,
    l.sync_batch_id,
    l.started_at AS fired_at,
    l.notes,
    (regexp_match(l.sync_batch_id, '^cron-trigger-(\d+)$'::text))[1]::bigint AS request_id,
    d.status_code,
    d.timed_out,
    d.error_msg,
    d.response_preview,
    d.reconciled_at AS responded_at,
        CASE
            WHEN d.request_id IS NULL THEN 'pending'::text
            WHEN d.reconciled_at IS NULL AND d.dispatched_at > (now() - '00:30:00'::interval) THEN 'pending'::text
            WHEN d.reconciled_at IS NULL THEN 'unreconciled'::text
            WHEN d.timed_out THEN 'timeout'::text
            WHEN d.status_code >= 200 AND d.status_code <= 299 THEN 'success'::text
            ELSE 'http_error'::text
        END AS outcome,
    d.dispatched_at,
    d.reconciled_at,
    d.reconciled_at IS NULL AND d.dispatched_at < (now() - '00:30:00'::interval) AS unreconciled_past_grace
   FROM crm_sync_log l
     LEFT JOIN acculynx_cron_dispatch d ON d.request_id = (regexp_match(l.sync_batch_id, '^cron-trigger-(\d+)$'::text))[1]::bigint
  WHERE l.sync_type = 'cron_trigger'::text
  ORDER BY l.id DESC;;
