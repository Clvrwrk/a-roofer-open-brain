-- verify-acculynx-cron.sql
-- Phase 3, plan 03-01 Task 2 — re-runnable cron + reconciliation health gate
--
-- Purpose: Prove the AccuLynx ingestion cron is in its hardened commercial state:
--   (1) exactly one HOURLY sync job passing multiAccount:true (old daily job unscheduled), and
--   (2) no pg_net dispatch left unreconciled past the grace window (perpetual-`pending` guard, D-05d).
--
-- Ground truth at authoring (2026-06-30, see 03-LIVE-STATE.md): the OLD job to be gone is
--   `acculynx-sync-daily` (schedule `15 8 * * *`, body {"resources":["users","jobs"]} → legacy path).
-- After the Phase-3 cutover (plan 03-02, migration 172), the healthy state is a single hourly
--   `0 * * * *` acculynx sync job whose command drives multiAccount:true.
--
-- Run:
--   psql $DATABASE_URL -f scripts/verify-acculynx-cron.sql
--
-- Expected output when healthy:
--   Section 1 → exactly ONE row: an acculynx sync job with schedule '0 * * * *'; the command
--               (or the trigger_acculynx_sync body it calls) drives multiAccount:true; and NO row
--               named 'acculynx-sync-daily' (the legacy daily job) remains.
--   Section 2 → ZERO rows (every dispatched pg_net request has been reconciled within the grace window).
--
-- NOTE: Section 2 queries public.acculynx_cron_dispatch, created by plan 03-02 migration 173.
--       Until mig 173 is applied it will error with "relation does not exist" — that is expected
--       before the cutover wave; this file is committed now and becomes fully runnable after 03-02.

-- ── Section 1: cron schedule assertion ───────────────────────────────────────
-- Healthy = exactly one hourly acculynx sync row ('0 * * * *') and the legacy daily job gone.
select jobid, jobname, schedule, command
from cron.job
where jobname ilike '%acculynx%'
order by jobname;

-- ── Section 2: stuck / unreconciled pg_net dispatch guard (D-05d) ─────────────
-- Healthy = zero rows. Any row = a pg_net dispatch never reconciled within 30 min
-- (the reconcile cron, plan 03-02 mig 174, runs every 10 min against a 6h pg_net TTL).
select request_id, dispatched_at, status_code, reconciled_at
from public.acculynx_cron_dispatch
where reconciled_at is null
  and dispatched_at < now() - interval '30 minutes'
order by dispatched_at;

-- ── Migration dependencies ───────────────────────────────────────────────────
-- Section 1 is runnable now (cron.job always exists).
-- Section 1 returns the HEALTHY shape only after plan 03-02 migration 172 (hourly cutover).
-- Section 2 requires plan 03-02 migration 173 (acculynx_cron_dispatch) + migration 174 (reconcile cron).
