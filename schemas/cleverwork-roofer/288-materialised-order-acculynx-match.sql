-- 288 — materialise v_order_acculynx_match (2026-09-11)
--
-- ── Why ───────────────────────────────────────────────────────────────────
--
-- `v_order_acculynx_match` regex-parses every ABC purchase order and every
-- AccuLynx job name on each read and joins them on the derived key. Read through
-- PostgREST by the Operations surface (order-audit.ts) it costs more than the 8 s
-- statement_timeout the service role inherits from authenticator, so the read
-- fails and the surface renders without job matches — the same failure shape
-- as PEC-241/PEC-243 (docs/109 F-open threads, playbook 9). Same remedy as
-- mig 272: keep the view as the definition of record, serve readers from a
-- matview refreshed CONCURRENTLY every 15 minutes.
--
-- ── What this installs ────────────────────────────────────────────────────
--
-- `mv_order_acculynx_match` plus its own pg_cron job. Deliberately NOT appended
-- to `refresh-office-pricing-matviews` (job 13): that job is one transaction,
-- and a single failing statement there froze the invoice audit for nine days
-- (mig 285). The order match has no dependency on the pricing matviews, so it
-- refreshes on its own schedule, offset by seven minutes.

begin;

create materialized view if not exists public.mv_order_acculynx_match as
  select * from public.v_order_acculynx_match;

-- DISTINCT ON (order_number) in the view guarantees uniqueness; required for
-- REFRESH ... CONCURRENTLY.
create unique index if not exists mv_order_acculynx_match_pk
  on public.mv_order_acculynx_match (order_number);

comment on materialized view public.mv_order_acculynx_match is
  'Materialised v_order_acculynx_match. Read this from any PostgREST client - the view regex-parses every order and job on each read and exceeds the 8s statement_timeout. Refreshed CONCURRENTLY every 15 minutes by pg_cron job refresh-order-acculynx-match (mig 288). The view remains the definition of record.';

grant select on public.mv_order_acculynx_match to anon, authenticated, service_role;

select cron.schedule(
  'refresh-order-acculynx-match',
  '7,22,37,52 * * * *',
  $cron$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_order_acculynx_match; $cron$
)
where not exists (select 1 from cron.job where jobname = 'refresh-order-acculynx-match');

commit;

-- Verification:
--   select count(*) from mv_order_acculynx_match;                    -- instant
--   select jobname, schedule from cron.job where jobname = 'refresh-order-acculynx-match';
--   GET /operations (order audit) renders matched / needs_link counts
