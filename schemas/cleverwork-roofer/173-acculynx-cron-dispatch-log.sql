-- 173 — AccuLynx cron dispatch log (Phase 3, REQ-07, plan 03-02)
--
-- PROBLEM: pg_net stores HTTP responses in net._http_response with a 6-hour TTL
-- (confirmed live: pg_net 0.20.0, pg_net.ttl = 6 hours — see 03-LIVE-STATE.md).
-- v_acculynx_cron_outcomes read net._http_response DIRECTLY, so once the TTL purged
-- a response, its LEFT JOIN produced r.id IS NULL → the run showed 'pending' FOREVER.
-- Every historical cron run therefore looked perpetually pending (the core SC2 bug).
--
-- FIX: An OWNED table that survives the TTL. trigger_acculynx_sync records each dispatched
-- pg_net request_id here at dispatch time (mig 172); reconcile_acculynx_cron_outcomes()
-- copies the real outcome (status_code, timed_out, error_msg, response_preview) from
-- net._http_response into this table on a 10-min cron (mig 174) — well inside the 6h TTL;
-- v_acculynx_cron_outcomes (mig 175) then reads THIS table, never net._http_response.
--
-- RLS: deny-by-default (house pattern, migs 76/148). No dashboard read path depends on the
-- base table directly — the dashboard reads the v_acculynx_cron_outcomes view instead.
--
-- Additive + idempotent; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).

create table if not exists public.acculynx_cron_dispatch (
  request_id        bigint primary key,
  batch_context     jsonb,
  dispatched_at     timestamptz not null default now(),
  status_code       integer,
  timed_out         boolean,
  error_msg         text,
  response_preview  text,
  reconciled_at     timestamptz
);

comment on table public.acculynx_cron_dispatch is
  'Owned cron-dispatch log for the AccuLynx hourly sync. One row per pg_net request_id, inserted at dispatch time by trigger_acculynx_sync (mig 172). reconcile_acculynx_cron_outcomes() (mig 174) copies the real outcome from net._http_response here before the 6h pg_net TTL purges it, so v_acculynx_cron_outcomes (mig 175) never shows perpetual pending. batch_context stores only {"multiAccount":true}-style trigger metadata — never a key/token (hard rule 2).';

comment on column public.acculynx_cron_dispatch.request_id is 'pg_net request_id returned by net.http_post — the correlation handle to net._http_response.';
comment on column public.acculynx_cron_dispatch.batch_context is 'Non-secret trigger metadata (e.g. {"multiAccount":true}); NEVER a key/token/JWT.';
comment on column public.acculynx_cron_dispatch.reconciled_at is 'Set by reconcile_acculynx_cron_outcomes() once the outcome is copied from net._http_response. NULL = not yet reconciled.';

-- ── Deny-by-default RLS (76-pattern) ─────────────────────────────────────────
-- Enable is idempotent; the real control is REVOKE from anon,authenticated.
alter table public.acculynx_cron_dispatch enable row level security;
revoke all on public.acculynx_cron_dispatch from anon, authenticated;
grant  all on public.acculynx_cron_dispatch to service_role;
