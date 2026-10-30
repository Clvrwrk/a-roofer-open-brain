-- 310 — materialise vw_hail_heatzone_coverage (2026-09-29)
--
-- ── Why ───────────────────────────────────────────────────────────────────
--
-- The Command Center's marketing surface (loadMarketingSurface,
-- app/command-center/src/lib/live-work.ts) reads vw_hail_heatzone_coverage three
-- times in parallel through PostgREST: two `count: "exact"` heads
-- (action <> 'MONITOR', is_tracked = true) and the top-50 rows by risk_score.
-- The view is one row per ZCTA (zcta_hail_summary, 17,234 rows) left-joined to
-- two aggregates:
--   * trk: count(DISTINCT geoid) per zip5 over vw_tracked_property — a UNION of
--     crm_pipeline, lead_list (~147k rows) and properties, each regex-normalising
--     its zip on every read, sorted to disk;
--   * ihm: vw_zip_impact_coverage — ~106k ihm_monitoring_alerts rows, also
--     regex-normalised and sorted to disk.
-- Neither filter can be pushed below those aggregates, so every read recomputes
-- the whole view: 3.4 s warm as postgres (EXPLAIN ANALYZE, 2026-09-29), three at
-- once under the hourly prewarm. PostgREST's 8 s statement_timeout (inherited
-- from authenticator) cancels them: in the 24 h to 2026-09-29 16:02 UTC, most of
-- the CC's 93 reads returned 500 (57014) or 504. Playbook 9 (MEMORY): never read
-- a per-row-heavy view via PostgREST — materialise.
--
-- ── What this installs ────────────────────────────────────────────────────
--
-- `mv_hail_heatzone_coverage` (select * from the view — the view stays the
-- definition of record, same as mig 272 / 288), a unique index on zcta_geoid for
-- REFRESH ... CONCURRENTLY, and its own pg_cron job. Deliberately NOT appended to
-- another refresh job: one failing statement in a shared job froze the invoice
-- audit for nine days (mig 285). Schedule 12,27,42,57 — offset from
-- refresh-office-pricing-matviews (0,15,30,45) and refresh-order-acculynx-match
-- (7,22,37,52), and :57 lands just before the CC's hourly :00 prewarm.
--
-- Freshness: at most ~15 minutes behind the sources. zcta_hail_summary moves
-- with the NOAA pipeline (last event 2026-02-28); tracked properties move with
-- the AccuLynx sync and list loads; IHM alerts with the webhook. A marketing
-- activation surface reviewed weekly does not need fresher.
--
-- Grants: service_role + ob_readonly only. Unlike 288, anon/authenticated get
-- nothing — the source view was locked to service_role by mig 309, and a matview
-- has no RLS, so granting anon here would re-open exactly what 309 closed. The
-- explicit REVOKE is needed because the public schema's default privileges grant
-- new relations to anon/authenticated.
--
-- Additive and idempotent (hard rule 1): IF NOT EXISTS / guarded cron.schedule;
-- safe to re-run. Readers switch in the same change
-- (live-work.ts: vw_ -> mv_hail_heatzone_coverage for the three reads only;
-- sourceTable stays 'vw_hail_heatzone_coverage' because dashboard_action_log
-- stores it and past decisions must keep joining).
--
-- Rollback:
--   1. revert the live-work.ts read target to vw_hail_heatzone_coverage (redeploy);
--   2. select cron.unschedule('refresh-hail-heatzone-coverage');
--   The matview holds no source data (pure cache of the view) and can be left
--   in place unread.

begin;

create materialized view if not exists public.mv_hail_heatzone_coverage as
  select * from public.vw_hail_heatzone_coverage;

-- zcta_geoid is unique in zcta_hail_summary (17,234 rows, 17,234 distinct, no
-- nulls) and both joins are to per-zip5 aggregates, so the view is one row per
-- zcta_geoid. Required for REFRESH ... CONCURRENTLY.
create unique index if not exists mv_hail_heatzone_coverage_pk
  on public.mv_hail_heatzone_coverage (zcta_geoid);

comment on materialized view public.mv_hail_heatzone_coverage is
  'Materialised vw_hail_heatzone_coverage. Read this from any PostgREST client - the view recomputes ~250k regex-normalised rows per read and exceeds the 8s statement_timeout. Refreshed CONCURRENTLY every 15 minutes (12,27,42,57) by pg_cron job refresh-hail-heatzone-coverage (mig 310). The view remains the definition of record. service_role + ob_readonly only (see mig 309).';

revoke all on public.mv_hail_heatzone_coverage from anon, authenticated;
grant select on public.mv_hail_heatzone_coverage to service_role;
grant select on public.mv_hail_heatzone_coverage to ob_readonly;

select cron.schedule(
  'refresh-hail-heatzone-coverage',
  '12,27,42,57 * * * *',
  $cron$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_hail_heatzone_coverage; $cron$
)
where not exists (select 1 from cron.job where jobname = 'refresh-hail-heatzone-coverage');

commit;

-- Verification:
--   select count(*) from public.mv_hail_heatzone_coverage;             -- 17,234, instant
--   select jobname, schedule from cron.job where jobname = 'refresh-hail-heatzone-coverage';
--   select status, start_time, end_time from cron.job_run_details d join cron.job j using (jobid)
--     where j.jobname = 'refresh-hail-heatzone-coverage' order by start_time desc limit 3;
--   edge logs: /rest/v1/mv_hail_heatzone_coverage from the CC -> 200 / 206
