-- 286 — runtime status plumbing for the /agents uptime board (docs/109 D6, D7, D11, D12).
--
-- Three things the board needs that nothing recorded before 2026-09-11:
--   1. v_runtime_pg_cron_status — every pg_cron job with its latest run, its last
--      SUCCESSFUL run, and how many failures have stacked up since. (Job 13 had
--      893 consecutive failures that no surface showed.)
--   2. runtime_job_runs + runtime_job_report() — host-side jobs (systemd timers on
--      the Hetzner agent host) report their result here from an ExecStopPost hook,
--      so the web tier never needs SSH (D7).
--   3. runtime_heartbeats + runtime_heartbeat_pump() — one Better Stack heartbeat
--      per scheduled job. The pump (pg_cron, every 5 min) pings a heartbeat ONCE per
--      NEW successful run, so a job that stops succeeding stops pinging and Better
--      Stack alerts after period + grace (D11). Ping URLs are service-role only.
--
-- Additive + idempotent. No client data. Rollback: drop the two tables, the view,
-- the two functions and cron.unschedule('runtime-heartbeat-pump').

create table if not exists public.runtime_heartbeats (
  component_key   text primary key,               -- e.g. pgcron.refresh-office-pricing-matviews, systemd.openbrain-abc-sync
  kind            text not null check (kind in ('pg_cron','systemd')),
  ref             text not null,                  -- pg_cron jobid, or systemd unit name
  name            text not null,
  period_s        integer not null,
  grace_s         integer not null,
  betterstack_id  text,
  ping_url        text,                           -- ping-only URL; never exposed to the browser
  last_pinged_success_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.runtime_heartbeats enable row level security;

create table if not exists public.runtime_job_runs (
  id             bigserial primary key,
  component_key  text not null,
  host           text,
  status         text not null check (status in ('success','failure','timeout','skipped')),
  exit_code      integer,
  summary        text,
  started_at     timestamptz,
  finished_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists runtime_job_runs_component_finished_idx
  on public.runtime_job_runs (component_key, finished_at desc);
alter table public.runtime_job_runs enable row level security;

-- Host jobs call this (service role) from scripts/runtime-job-report.sh via PostgREST RPC.
create or replace function public.runtime_job_report(
  p_component_key text,
  p_status text,
  p_exit_code integer default null,
  p_summary text default null,
  p_host text default null,
  p_started_at timestamptz default null
) returns bigint
language sql security definer set search_path = public as $$
  insert into public.runtime_job_runs (component_key, host, status, exit_code, summary, started_at)
  values (p_component_key, p_host, p_status, p_exit_code, left(p_summary, 2000), p_started_at)
  returning id;
$$;
revoke all on function public.runtime_job_report(text,text,integer,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.runtime_job_report(text,text,integer,text,text,timestamptz) to service_role;

-- pg_cron health, readable by the app's service-role client (cron.* is not exposed by PostgREST).
create or replace view public.v_runtime_pg_cron_status as
select j.jobid, j.jobname, j.schedule, j.active, j.command,
       d.status                       as last_status,
       d.start_time                   as last_start,
       d.end_time                     as last_end,
       left(d.return_message, 400)    as last_message,
       s.end_time                     as last_success_end,
       f.n_failed_since_success
from cron.job j
left join lateral (
  select r.status, r.start_time, r.end_time, r.return_message
  from cron.job_run_details r where r.jobid = j.jobid
  order by r.start_time desc limit 1) d on true
left join lateral (
  select r.end_time from cron.job_run_details r
  where r.jobid = j.jobid and r.status = 'succeeded'
  order by r.start_time desc limit 1) s on true
left join lateral (
  select count(*) as n_failed_since_success from cron.job_run_details r
  where r.jobid = j.jobid and r.status = 'failed'
    and r.start_time > coalesce(s.end_time, '-infinity'::timestamptz)) f on true;
revoke all on public.v_runtime_pg_cron_status from anon, authenticated;
grant select on public.v_runtime_pg_cron_status to service_role;

-- Latest host-job result per component, for the board.
create or replace view public.v_runtime_job_latest as
select distinct on (component_key)
       component_key, host, status, exit_code, summary, started_at, finished_at
from public.runtime_job_runs
order by component_key, finished_at desc;
revoke all on public.v_runtime_job_latest from anon, authenticated;
grant select on public.v_runtime_job_latest to service_role;

-- One ping per NEW success. Requires pg_net (present on this project).
create or replace function public.runtime_heartbeat_pump()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_h record; v_marker timestamptz; v_pinged int := 0; v_idle int := 0;
begin
  for v_h in select * from public.runtime_heartbeats where ping_url is not null loop
    v_marker := null;
    if v_h.kind = 'pg_cron' then
      select max(r.end_time) into v_marker from cron.job_run_details r
      where r.jobid = v_h.ref::bigint and r.status = 'succeeded';
    elsif v_h.kind = 'systemd' then
      select max(jr.finished_at) into v_marker from public.runtime_job_runs jr
      where jr.component_key = v_h.component_key and jr.status = 'success';
    end if;
    if v_marker is not null and (v_h.last_pinged_success_at is null or v_marker > v_h.last_pinged_success_at) then
      perform net.http_get(v_h.ping_url);
      update public.runtime_heartbeats
         set last_pinged_success_at = v_marker, updated_at = now()
       where component_key = v_h.component_key;
      v_pinged := v_pinged + 1;
    else
      v_idle := v_idle + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'pinged', v_pinged, 'idle', v_idle, 'at', now());
end $$;
revoke all on function public.runtime_heartbeat_pump() from public, anon, authenticated;

-- Every 5 minutes. cron.schedule(name, …) upserts by job name, so re-running is safe.
select cron.schedule('runtime-heartbeat-pump', '*/5 * * * *', 'select public.runtime_heartbeat_pump();');
