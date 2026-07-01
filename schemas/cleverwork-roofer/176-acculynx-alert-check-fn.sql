-- 176 — AccuLynx alert check function + 15-min cron (Phase 3, REQ-07, plan 03-03, D-04/D-05/D-06/D-07)
--
-- The SQL-side alerting layer: detects the conditions the edge function CANNOT see after it exits
-- (stale watermark, delta over tolerance, unreconciled pg_net dispatch, recent failed run) and posts
-- a human-readable summary to Slack via pg_net. Complements the edge-side lib/alerts.ts (in-run throws).
--
-- SECRET HANDLING (hard rule 2): Slack delivery uses the repo's bot-token pattern
-- (chat.postMessage — see .claude/skills/slack-agents). The bot token is read at runtime from
-- Supabase Vault (same mechanism as trigger_acculynx_sync's acculynx_sync_auth_jwt) — NEVER a
-- literal in this migration. Provision the secret ONCE (encrypted at rest):
--   select vault.create_secret('<xoxb-...>', 'acculynx_alert_slack_bot_token');
-- The channel (a non-secret ID) is a plain GUC-or-default. If the vault secret is absent the
-- function is a safe no-op (returns the breach count, no post). The token is sent only as the
-- Authorization header, never in the message body.
--
-- Additive + idempotent; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).

create or replace function public.check_acculynx_alerts()
returns integer
language plpgsql
security definer
set search_path = public, net, vault
as $fn$
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

  -- (b) D-05b/D-06 — stale watermark: a wired (account,resource) that HAS synced before but not in 3h.
  -- Pitfall 4: NULL last_sync_at (never-started / not-yet-reached backfill resource) is excluded so a
  -- legitimate long backfill does not trip a false "stale" alert; only a previously-live resource that
  -- has gone quiet for 3h+ counts.
  select count(*) into v_n
  from public.acculynx_sync_watermark
  where last_sync_at is not null and last_sync_at < now() - interval '3 hours';
  if v_n > 0 then
    v_lines := v_lines || format('🟠 %s (account,resource) watermark(s) stale > 3 hours', v_n);
  end if;

  -- (c) D-05c/D-07 — reconciliation delta over tolerance (> 2%). jobs is EXCLUDED for now: its
  -- last_api_count is the incremental modified-count, not the full total (see 03-02-SUMMARY follow-up),
  -- so its delta_pct is not yet a meaningful signal — re-include once the jobs full-count fix lands.
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

  if array_length(v_lines, 1) is null then
    return 0; -- all healthy
  end if;

  v_summary := 'AccuLynx cron health alert (' || to_char(now(), 'YYYY-MM-DD HH24:MI UTC') || E'):\n' ||
               array_to_string(v_lines, E'\n');

  -- Post to Slack via chat.postMessage only when the bot-token GUC is configured (never a literal —
  -- hard rule 2). Token is sent as the Authorization header only, never in the body.
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
$fn$;

comment on function public.check_acculynx_alerts() is
  'AccuLynx SQL-side alerting (D-05): checks failed dispatch (status_code >= 400), stale watermark (> 3 hours, excluding never-started backfill resources — Pitfall 4), reconciliation delta_pct > 2 (jobs excluded until full-count fix), and unreconciled pg_net (reconciled_at is null past 30-min grace). Posts a summary to Slack via chat.postMessage using the bot token from Vault (acculynx_alert_slack_bot_token) and channel GUC app.acculynx_alert_slack_channel (default C0BDF8QRF8A); never literals — hard rule 2. Scheduled every 15 min (cron: acculynx-alert-check).';

-- Schedule the alert check every 15 minutes (guarded / idempotent).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'acculynx-alert-check') then
    perform cron.schedule(
      'acculynx-alert-check',
      '*/15 * * * *',
      $cron$select public.check_acculynx_alerts()$cron$
    );
  end if;
end $$;

-- Additive; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).
