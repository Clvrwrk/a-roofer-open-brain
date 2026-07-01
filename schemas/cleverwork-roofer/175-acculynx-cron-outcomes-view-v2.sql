-- 175 — v_acculynx_cron_outcomes rewritten off the owned dispatch table (Phase 3, REQ-07, plan 03-02)
--
-- PROBLEM: the prior v_acculynx_cron_outcomes LEFT JOINed net._http_response directly. Once the
-- 6h pg_net TTL purged a response, r.id became NULL and the run showed 'pending' forever — the
-- perpetual-pending bug (SC2). It also lost all outcome history at TTL.
--
-- FIX: read the OWNED acculynx_cron_dispatch table (mig 173, populated at dispatch by mig 172 and
-- reconciled by mig 174) instead of net._http_response. Outcome now keys off reconciled_at, so a
-- reconciled run stays 'success'/'timeout'/'http_error' permanently, and an unreconciled run past
-- the 30-min grace surfaces as 'unreconciled' (D-05d alert signal) rather than eternal 'pending'.
--
-- COLUMN CONTRACT: CREATE OR REPLACE VIEW may only append columns, never rename/reorder/retype.
-- The prior view's 11 columns (log_id, sync_batch_id, fired_at, notes, request_id, status_code,
-- timed_out, error_msg, response_preview, responded_at, outcome) are preserved in the SAME order
-- and types; new columns (dispatched_at, reconciled_at, unreconciled_past_grace) are appended.
--
-- This view references acculynx_cron_dispatch ONLY — never net._http_response.
--
-- Additive + idempotent (CREATE OR REPLACE VIEW); no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).

create or replace view public.v_acculynx_cron_outcomes as
select
  l.id                                                                as log_id,
  l.sync_batch_id                                                     as sync_batch_id,
  l.started_at                                                        as fired_at,
  l.notes                                                             as notes,
  (regexp_match(l.sync_batch_id, '^cron-trigger-(\d+)$'))[1]::bigint  as request_id,
  d.status_code                                                       as status_code,
  d.timed_out                                                         as timed_out,
  d.error_msg                                                         as error_msg,
  d.response_preview                                                  as response_preview,
  d.reconciled_at                                                     as responded_at,
  case
    when d.request_id is null                                                    then 'pending'
    when d.reconciled_at is null
         and d.dispatched_at > now() - interval '30 minutes'                     then 'pending'
    when d.reconciled_at is null                                                 then 'unreconciled'
    when d.timed_out                                                             then 'timeout'
    when d.status_code >= 200 and d.status_code <= 299                           then 'success'
    else 'http_error'
  end                                                                 as outcome,
  -- ── appended columns (new; safe under CREATE OR REPLACE VIEW) ──
  d.dispatched_at                                                     as dispatched_at,
  d.reconciled_at                                                     as reconciled_at,
  (d.reconciled_at is null and d.dispatched_at < now() - interval '30 minutes') as unreconciled_past_grace
from crm_sync_log l
left join public.acculynx_cron_dispatch d
  on d.request_id = (regexp_match(l.sync_batch_id, '^cron-trigger-(\d+)$'))[1]::bigint
where l.sync_type = 'cron_trigger'
order by l.id desc;

comment on view public.v_acculynx_cron_outcomes is
  'AccuLynx cron outcomes sourced from the owned acculynx_cron_dispatch table (never the transient pg_net response table), so reconciled runs never revert to pending after the 6h pg_net TTL. outcome: pending (within 30-min grace) / unreconciled (past grace, reconcile loop signal, D-05d) / timeout / success / http_error. Phase 3 mig 175.';

grant select on public.v_acculynx_cron_outcomes to authenticated, service_role;
