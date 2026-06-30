-- 170 — AccuLynx reconciliation view (Phase 2, REQ-03 + REQ-04)
--
-- v_acculynx_reconciliation compares, per (account_key, resource_type), the
-- API-reported count stored in acculynx_sync_watermark.last_api_count against the
-- count of non-archived rows currently in the corresponding target table (brain_count).
-- delta_pct flags sync health so the Plan 04 gate can catch data gaps early.
--
-- DESIGN DECISIONS:
--   1. resource_type: the live watermark column is "resource_type" (not "resource").
--      All references in this view use resource_type.
--   2. Synced resources only: the CASE includes only the 9 resources that Plan 03
--      actively syncs. acculynx_contact_emails and acculynx_contact_phones are
--      INTENTIONALLY UNSYNCED in Phase 2 and EXCLUDED from the CASE so they cannot
--      produce a false delta_pct failure on the Plan 04 gate.
--   3. WHERE last_api_count IS NOT NULL: any (account_key, resource_type) that has
--      never completed a sweep (including the two unsynced tables if rows exist in
--      the watermark) is excluded. Never-swept rows have no api_count to compare.
--   4. archived_at IS NULL filter: brain_count counts only live (non-archived) rows.
--
-- Additive + idempotent via CREATE OR REPLACE VIEW (hard rule 1).

create or replace view public.v_acculynx_reconciliation as
select
  w.account_key,
  w.resource_type,
  w.last_api_count                                                as api_count,
  w.last_sync_at,
  case w.resource_type
    when 'jobs'
      then (select count(*)
            from public.acculynx_jobs
            where account_key = w.account_key
              and archived_at is null)
    when 'contacts'
      then (select count(*)
            from public.acculynx_contacts
            where account_key = w.account_key
              and archived_at is null)
    when 'estimates'
      then (select count(*)
            from public.acculynx_estimates
            where account_key = w.account_key
              and archived_at is null)
    when 'invoices'
      then (select count(*)
            from public.acculynx_invoices
            where account_key = w.account_key
              and archived_at is null)
    when 'invoice_lines'
      then (select count(*)
            from public.acculynx_invoice_lines
            where account_key = w.account_key
              and archived_at is null)
    when 'job_financials'
      then (select count(*)
            from public.acculynx_job_financials
            where account_key = w.account_key
              and archived_at is null)
    when 'job_insurance'
      then (select count(*)
            from public.acculynx_job_insurance
            where account_key = w.account_key
              and archived_at is null)
    when 'job_milestone_history'
      then (select count(*)
            from public.acculynx_job_milestone_history
            where account_key = w.account_key
              and archived_at is null)
    when 'job_contacts'
      then (select count(*)
            from public.acculynx_job_contacts
            where account_key = w.account_key
              and archived_at is null)
    else null
  end::bigint                                                     as brain_count,
  round(
    100.0
    * abs(
        case w.resource_type
          when 'jobs'
            then (select count(*)
                  from public.acculynx_jobs
                  where account_key = w.account_key
                    and archived_at is null)
          when 'contacts'
            then (select count(*)
                  from public.acculynx_contacts
                  where account_key = w.account_key
                    and archived_at is null)
          when 'estimates'
            then (select count(*)
                  from public.acculynx_estimates
                  where account_key = w.account_key
                    and archived_at is null)
          when 'invoices'
            then (select count(*)
                  from public.acculynx_invoices
                  where account_key = w.account_key
                    and archived_at is null)
          when 'invoice_lines'
            then (select count(*)
                  from public.acculynx_invoice_lines
                  where account_key = w.account_key
                    and archived_at is null)
          when 'job_financials'
            then (select count(*)
                  from public.acculynx_job_financials
                  where account_key = w.account_key
                    and archived_at is null)
          when 'job_insurance'
            then (select count(*)
                  from public.acculynx_job_insurance
                  where account_key = w.account_key
                    and archived_at is null)
          when 'job_milestone_history'
            then (select count(*)
                  from public.acculynx_job_milestone_history
                  where account_key = w.account_key
                    and archived_at is null)
          when 'job_contacts'
            then (select count(*)
                  from public.acculynx_job_contacts
                  where account_key = w.account_key
                    and archived_at is null)
          else 0
        end::bigint
        - w.last_api_count
      )
    / nullif(w.last_api_count, 0),
    1
  )                                                               as delta_pct
from public.acculynx_sync_watermark w
-- Exclude any (account_key, resource_type) that has never completed a sweep.
-- This covers both the two unsynced Phase 2 tables (contact_emails, contact_phones)
-- and any resource that simply hasn't run yet — neither can fire a false delta_pct.
where w.last_api_count is not null;

comment on view public.v_acculynx_reconciliation is
  'Compares API-reported count (last_api_count in watermark) against brain non-archived row count per (account_key, resource_type). Synced resources only — contact_emails and contact_phones are excluded (unsynced in Phase 2). WHERE last_api_count IS NOT NULL ensures never-swept resources cannot fire a false delta_pct. Plan 04 gate: all delta_pct < 5%.';

grant select on public.v_acculynx_reconciliation to authenticated, service_role;
