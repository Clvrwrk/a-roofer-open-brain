-- 274 — a price-affecting save asks for the audit to be rebuilt, and gets it
--       inside a minute instead of fifteen.
--
-- Chris, 2026-08-24: "Have the price list builder save trigger the matview refresh."
--
-- ── Why this is not a direct REFRESH from the save handler ────────────────
--
-- The obvious shape — call REFRESH MATERIALIZED VIEW from the endpoint — cannot
-- work. The refresh takes ~9s and PostgREST runs under the 8s statement_timeout
-- that service_role inherits from authenticator (PEC-241/243). The save would
-- die on the refresh after already having written the price list, which is the
-- worst possible outcome: the write lands, the request 500s, and the operator
-- retries a save that already succeeded.
--
-- A SECURITY DEFINER function with `SET statement_timeout TO '120s'` does not
-- rescue it either. Measured: a function so declared, called under a 2s caller
-- timeout, still died at 2s. The timeout is armed when the outer statement
-- begins and re-setting the GUC inside does not re-arm it.
--
-- ── The shape that does work ──────────────────────────────────────────────
--
-- Split "ask" from "do":
--
--   request_matview_refresh(...)          cheap upsert, returns immediately,
--                                         safe inside any save handler
--   service_pending_matview_refreshes()   runs under pg_cron every minute,
--                                         as postgres, with no ceiling
--
-- Latency drops from <=15 minutes to <=60 seconds, the save path cannot fail on
-- the refresh, and bulk writes debounce for free: promoting a 160-item price
-- list fires 160 requests and causes exactly one rebuild.
--
-- Servicing rebuilds the whole chain — mv_office_agreement_versions and
-- mv_invoice_pricing_office before mv_invoice_audit_line — because a territory
-- reassignment reaches the audit only through those two. Rebuilding the leaf
-- from stale inputs would look exactly like the save not having taken.
--
-- ── The now() choice, which is deliberate ─────────────────────────────────
--
-- The servicing function stamps `last_refreshed_at = now()` — transaction start,
-- NOT clock_timestamp() at the end. A request arriving DURING a 9-second refresh
-- has a requested_at later than that stamp, so it stays pending and is serviced
-- on the next tick. Stamping the end time would mark it satisfied by a snapshot
-- that may not have contained its write.
--
-- This inverts the usual trap (a run deleting its own inserts because the row
-- default now() precedes a clock_timestamp() captured at entry). Same mechanism,
-- opposite correct answer: here the earlier stamp is the safe one, because
-- erring towards "still pending" costs one extra rebuild and erring the other
-- way silently drops a write from the audit.

begin;

create table if not exists public.matview_refresh_request (
  matview_name      text primary key,
  requested_at      timestamptz not null default now(),
  requested_by      text,
  reason            text,
  last_refreshed_at timestamptz,
  last_duration_ms  integer,
  refresh_count     integer not null default 0
);

comment on table public.matview_refresh_request is
  'One row per matview that can be rebuilt on demand. A row is PENDING when requested_at > coalesce(last_refreshed_at, ''-infinity''). Written by request_matview_refresh() from any save path; drained by service_pending_matview_refreshes() under pg_cron once a minute.';

-- Allowlist. Refreshing is dynamic SQL, so the name never comes from a caller
-- unchecked - an unknown name is refused rather than interpolated.
create or replace function public.matview_refresh_allowed(p_matview text)
returns boolean language sql immutable as $$
  select p_matview in ('mv_invoice_audit_line');
$$;

create or replace function public.request_matview_refresh(
  p_matview text,
  p_reason  text default null,
  p_by      text default null
) returns timestamptz
language plpgsql security definer set search_path to 'public' as $$
declare v_at timestamptz;
begin
  if not matview_refresh_allowed(p_matview) then
    raise exception 'matview % is not registered for on-demand refresh', p_matview
      using hint = 'add it to matview_refresh_allowed() first';
  end if;

  insert into matview_refresh_request (matview_name, requested_at, requested_by, reason)
       values (p_matview, now(), p_by, p_reason)
  on conflict (matview_name) do update
     set requested_at = now(),
         requested_by = excluded.requested_by,
         reason       = excluded.reason
  returning requested_at into v_at;

  return v_at;
end $$;

comment on function public.request_matview_refresh(text, text, text) is
  'Ask for a matview to be rebuilt. Returns immediately - the rebuild happens within a minute under pg_cron. Call this from any handler that writes price agreements, price list items, or product bindings; a direct REFRESH would exceed the 8s PostgREST statement_timeout AFTER the write had already landed.';

create or replace function public.service_pending_matview_refreshes()
returns table (matview_name text, duration_ms integer)
language plpgsql security definer set search_path to 'public' as $$
declare r record; t0 timestamptz; ms integer;
begin
  for r in
    select q.matview_name
      from matview_refresh_request q
     where q.requested_at > coalesce(q.last_refreshed_at, '-infinity'::timestamptz)
       and matview_refresh_allowed(q.matview_name)
     order by q.requested_at
  loop
    t0 := clock_timestamp();

    -- Refresh the chain, not just the leaf. A territory reassignment changes
    -- pricing_territory_office_id, which reaches the audit only through these
    -- two matviews; rebuilding the audit alone would rebuild it from stale
    -- inputs and look like the change had not taken. Both are small (10 and
    -- ~1,070 rows) so this costs nothing next to the audit line itself.
    if r.matview_name = 'mv_invoice_audit_line' then
      refresh materialized view concurrently public.mv_office_agreement_versions;
      refresh materialized view concurrently public.mv_invoice_pricing_office;
    end if;

    execute format('refresh materialized view concurrently public.%I', r.matview_name);
    ms := (extract(epoch from clock_timestamp() - t0) * 1000)::integer;

    -- now(), not clock_timestamp() - see the header. A request that arrived
    -- while this refresh was running must stay pending.
    update matview_refresh_request q
       set last_refreshed_at = now(),
           last_duration_ms  = ms,
           refresh_count     = q.refresh_count + 1
     where q.matview_name = r.matview_name;

    matview_name := r.matview_name;
    duration_ms  := ms;
    return next;
  end loop;
end $$;

comment on function public.service_pending_matview_refreshes() is
  'Drains matview_refresh_request. Runs under pg_cron as postgres, where there is no statement_timeout, so a 9-second REFRESH is fine. Returns one row per matview actually rebuilt - an empty result means nothing was pending.';

select cron.schedule(
  'service-matview-refresh-requests',
  '* * * * *',
  $cron$select public.service_pending_matview_refreshes();$cron$
);

grant execute on function public.request_matview_refresh(text, text, text) to service_role;
grant select on public.matview_refresh_request to anon, authenticated, service_role;

commit;

-- Verification:
--   select public.request_matview_refresh('mv_invoice_audit_line','manual test','verify');
--   select * from public.service_pending_matview_refreshes();   -- 1 row, ~9000ms
--   select * from public.service_pending_matview_refreshes();   -- 0 rows (drained)
--   select * from matview_refresh_request;
--   select public.request_matview_refresh('not_a_matview');     -- raises
