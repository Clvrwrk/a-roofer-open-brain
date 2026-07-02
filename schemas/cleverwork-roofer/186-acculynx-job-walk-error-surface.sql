-- 186 — AccuLynx job-walk counted error surface + fifth alert condition (Phase 7, gap-closure
-- Wave 5, REQ-10, plan 07-05, VERIFICATION gap 2 alert-visibility half)
--
-- PROBLEM: job-walk.ts's per-sub-resource upsert failures were only console.warn'd — invisible
-- to any of the four existing check_acculynx_alerts() conditions (176) and to operators. Per D-14
-- (capture-first) the raw body is never lost, but a mapping/upsert failure still needs to be a
-- counted, queryable, alertable row so it can be triaged and (once fixed forward) resolved.
--
-- FIX: a new acculynx_job_walk_errors table (deny-by-default RLS, matching migration 177's
-- posture) plus a fifth condition (e) appended to check_acculynx_alerts() counting unresolved
-- job-walk write failures in the last 6h. All four existing conditions (a-d) are preserved
-- verbatim from migration 176 — this is additive only.
--
-- Applied to prod rnhmvcpsvtqjlffpsayu (schema-gate: 07-05-PLAN.md Task 1b, blocking checkpoint).
--
-- Additive + idempotent; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- TABLE: acculynx_job_walk_errors
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.acculynx_job_walk_errors (
  id             bigint generated always as identity primary key,
  account_key    text not null,
  job_id         text not null,
  resource_type  text not null, -- job_contacts | job_financials | job_insurance | milestone_history | invoices | invoice_lines
  sync_batch_id  text,
  error_message  text,
  http_status    integer,
  occurred_at    timestamptz not null default now(),
  resolved_at    timestamptz -- nullable; set (UPDATE-only, never DELETE) when a later successful
                              -- upsert of the same job_id+resource_type supersedes this error
);
comment on table public.acculynx_job_walk_errors is
  'Counted, queryable surface for job-walk sub-resource upsert failures (job_contacts/job_financials/job_insurance/milestone_history/invoices/invoice_lines). Replaces the console.warn-only path in resources/job-walk.ts (VERIFICATION gap 2, D-14). resolved_at is set (never deleted) when a later upsert of the same job_id+resource_type succeeds.';

create index if not exists idx_acculynx_job_walk_errors_open
  on public.acculynx_job_walk_errors(resource_type, occurred_at)
  where resolved_at is null;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- RLS + GRANT: deny-by-default posture, matching migration 177
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.acculynx_job_walk_errors enable row level security;
revoke all on public.acculynx_job_walk_errors from anon, authenticated;
grant all on public.acculynx_job_walk_errors to service_role;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- FUNCTION: check_acculynx_alerts() — extended with fifth condition (e)
-- Entire body copied verbatim from migration 176 (conditions a-d unchanged); condition (e) is
-- inserted BEFORE the array_length(v_lines,1) health check. Vault-token / channel-GUC / pg_net
-- post block is preserved exactly (hard rule 2 — never a literal token).
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

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

  -- (e) NEW — unresolved job-walk sub-resource write failures in the last 6h (VERIFICATION gap 2:
  -- promotes the former console.warn-only silent-failure path to a counted, alertable condition).
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

  -- Post to Slack via chat.postMessage only when the bot-token GUC is configured (never a literal —
  -- hard rule 2). Token is sent only as the Authorization header, never in the message body.
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
  'AccuLynx SQL-side alerting (D-05 + gap-closure 07-05 condition e): checks failed dispatch (status_code >= 400), stale watermark (> 3 hours, excluding never-started backfill resources — Pitfall 4), reconciliation delta_pct > 2 (jobs excluded until full-count fix), unreconciled pg_net (reconciled_at is null past 30-min grace), and (e) unresolved acculynx_job_walk_errors in the last 6h (job-walk sub-resource write failures, previously console.warn-only — VERIFICATION gap 2). Posts a summary to Slack via chat.postMessage using the bot token from Vault (acculynx_alert_slack_bot_token) and channel GUC app.acculynx_alert_slack_channel (default C0BDF8QRF8A); never literals — hard rule 2. Scheduled every 15 min (cron: acculynx-alert-check, unchanged — no re-schedule needed on CREATE OR REPLACE).';

-- No cron.schedule re-run needed: the 'acculynx-alert-check' job already exists (guarded in 176)
-- and CREATE OR REPLACE FUNCTION updates the function body in place without touching the schedule.

-- Additive; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).
