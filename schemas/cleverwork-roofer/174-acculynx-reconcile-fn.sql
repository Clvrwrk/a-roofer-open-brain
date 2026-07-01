-- 174 — AccuLynx pg_net reconcile function + 10-min cron (Phase 3, REQ-07, plan 03-02)
--
-- PROBLEM: pg_net purges net._http_response after its 6h TTL (pg_net 0.20.0, ttl=6h, live).
-- Outcomes must be copied into the owned acculynx_cron_dispatch table (mig 173) BEFORE the
-- purge, or every run reverts to looking 'pending'.
--
-- FIX: reconcile_acculynx_cron_outcomes() copies the real outcome (status_code, timed_out,
-- error_msg, first 500 chars of content) from net._http_response into acculynx_cron_dispatch
-- for every not-yet-reconciled dispatch, and a cron entry runs it every 10 minutes — a 36x
-- margin inside the 6h TTL. Reads net._http_response ONLY here (never from the dashboard view).
--
-- Rollback: cron.unschedule('acculynx-reconcile'); the function may remain (harmless).
--
-- Additive + idempotent; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).

create or replace function public.reconcile_acculynx_cron_outcomes()
returns integer
language plpgsql
security definer
set search_path = public, net
as $fn$
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
$fn$;

comment on function public.reconcile_acculynx_cron_outcomes() is
  'Copies pg_net HTTP outcomes from net._http_response into acculynx_cron_dispatch for all not-yet-reconciled dispatches, before the 6h pg_net TTL purges them. Scheduled every 10 min (cron: acculynx-reconcile). SECURITY DEFINER so the cron role can read net._http_response. Returns the number of rows reconciled.';

-- ── Schedule the reconcile cron every 10 minutes (guarded / idempotent) ──────
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'acculynx-reconcile') then
    perform cron.schedule(
      'acculynx-reconcile',
      '*/10 * * * *',
      $cron$select public.reconcile_acculynx_cron_outcomes()$cron$
    );
  end if;
end $$;
