-- acculynx-reconcile-check.sql
-- Phase 2, plan 02-02 Task 2 — Wave 0 content check (functional gate: Plan 04 Task 3)
--
-- Purpose: Flag any (account_key, resource) pair where the brain's row count
-- deviates more than 5% from the AccuLynx API's reported count.
-- A delta_pct of NULL means the API count has not been stored yet (no sync run
-- completed for this pair) — those rows are also flagged for investigation.
--
-- Acceptable tolerance (research assumption A5):
--   < 2% delta_pct  → within normal race-condition window; acceptable
--   2–5% delta_pct  → watch; may indicate a partial sync run
--   > 5% delta_pct  → investigate; likely a sync gap, budget-stop, or backfill not yet complete
--
-- CONTENT/GREP GATE (this plan, 02-02): This script is verified by existence and content
-- only in Plan 02-02. The view it queries (v_acculynx_reconciliation) is created by
-- migration 170 in Plan 02-01 (Wave 1, parallel). Running this script against the live DB
-- is the FUNCTIONAL gate in Plan 04 Task 3 (Wave 3), after Plan 02-01 has applied mig 170.
--
-- Run (after Plan 04 Task 3 applies mig 170 to the live DB):
--   psql $DATABASE_URL -f scripts/acculynx-reconcile-check.sql
--
-- Expected output when Phase 2 is healthy:
--   Zero rows returned (all accounts+resources within <5% tolerance).

SELECT
  account_key,
  resource,
  api_count,
  brain_count,
  delta_pct,
  last_sync_at
FROM
  public.v_acculynx_reconciliation
WHERE
  delta_pct IS NULL          -- no sync run completed yet for this pair
  OR delta_pct > 5           -- outside the 5% investigation threshold
ORDER BY
  delta_pct DESC NULLS FIRST, -- NULL rows (never synced) appear first
  account_key,
  resource;
