-- 180 — AccuLynx legacy NULL-provenance row triage (Phase 3, REQ-07, plan 03-04)
--
-- MUST APPLY BEFORE migration 178 (which SET NOT NULL account_key). RESEARCH Pitfall 3:
-- `ALTER COLUMN account_key SET NOT NULL` fails outright while any NULL-account_key row remains.
--
-- PROBLEM: 8 legacy rows carry NULL account_key (confirmed live in 03-LIVE-STATE.md OQ3b):
--   acculynx_contacts=3, acculynx_job_contacts=3, acculynx_job_financials=1, acculynx_job_insurance=1.
-- 02-VERIFICATION.md attributes them to likely Phase-1 sandbox artifacts (provenance ambiguous).
-- The other 5 constrained tables (jobs, estimates, invoices, invoice_lines, milestone_history) are
-- clean today, but the UPDATEs below run against all 9 as an idempotent no-op so a future stray NULL
-- in any of them is caught too — the 8-row figure is the known minimum, not the ceiling.
--
-- FIX (data triage, NO schema change, NO delete): stamp each NULL-account_key row with the most-likely
-- provenance ('sandbox' — a real acculynx_accounts key, no FK on account_key so this is a plain text
-- stamp) AND soft-archive it (archived_at + archive_reason) so it is excluded from live reconciliation
-- and the NULL-provenance rot guard. Reversible; never deletes (hard rule 1).
--
-- Idempotent: WHERE account_key IS NULL means a second run is a no-op (no rows match once stamped).
--
-- Additive UPDATE-only triage; rows are archived (archived_at), never removed (hard rule 1).

update public.acculynx_jobs                  set account_key = 'sandbox', archived_at = coalesce(archived_at, now()), archive_reason = coalesce(archive_reason, 'phase3-legacy-null-provenance-triage') where account_key is null;
update public.acculynx_contacts              set account_key = 'sandbox', archived_at = coalesce(archived_at, now()), archive_reason = coalesce(archive_reason, 'phase3-legacy-null-provenance-triage') where account_key is null;
update public.acculynx_job_contacts          set account_key = 'sandbox', archived_at = coalesce(archived_at, now()), archive_reason = coalesce(archive_reason, 'phase3-legacy-null-provenance-triage') where account_key is null;
update public.acculynx_estimates             set account_key = 'sandbox', archived_at = coalesce(archived_at, now()), archive_reason = coalesce(archive_reason, 'phase3-legacy-null-provenance-triage') where account_key is null;
update public.acculynx_invoices              set account_key = 'sandbox', archived_at = coalesce(archived_at, now()), archive_reason = coalesce(archive_reason, 'phase3-legacy-null-provenance-triage') where account_key is null;
update public.acculynx_invoice_lines         set account_key = 'sandbox', archived_at = coalesce(archived_at, now()), archive_reason = coalesce(archive_reason, 'phase3-legacy-null-provenance-triage') where account_key is null;
update public.acculynx_job_financials        set account_key = 'sandbox', archived_at = coalesce(archived_at, now()), archive_reason = coalesce(archive_reason, 'phase3-legacy-null-provenance-triage') where account_key is null;
update public.acculynx_job_insurance         set account_key = 'sandbox', archived_at = coalesce(archived_at, now()), archive_reason = coalesce(archive_reason, 'phase3-legacy-null-provenance-triage') where account_key is null;
update public.acculynx_job_milestone_history set account_key = 'sandbox', archived_at = coalesce(archived_at, now()), archive_reason = coalesce(archive_reason, 'phase3-legacy-null-provenance-triage') where account_key is null;

-- Verification after apply: each of the 9 tables must return 0:
--   select count(*) from <table> where account_key is null;
