-- 181 — AccuLynx reconciliation instrument fix: true API grand-total (Phase 3, plan 03-06 gate)
--
-- PROBLEM (found during the 03-06 D-08 expansion-gate check, 2026-07-01):
--   v_acculynx_reconciliation compared brain_count (cumulative) against
--   acculynx_sync_watermark.last_api_count. For FULL-SWEEP resources (contacts,
--   estimates) last_api_count == the API grand total, so the delta was meaningful.
--   But for the DATE-WINDOWED jobs sync, the AccuLynx `count` field reflects the
--   *modified-since-watermark window* (e.g. 8 jobs modified last hour), NOT the
--   grand total — so once a job resource left first-backfill it reported nonsense
--   (kansas_city jobs: brain 166 vs last_api_count 8 → delta 1975%). The gate could
--   never read <=2% no matter how complete the backfill was.
--
-- FIX:
--   1. Add last_api_total (bigint, nullable) to acculynx_sync_watermark — the API's
--      unfiltered grand total for that (account_key, resource_type). The edge fn's
--      windowed jobs sync writes it via a one-shot full-history count probe; full-sweep
--      resources leave it NULL (their last_api_count is already the total).
--   2. Recreate v_acculynx_reconciliation to reconcile against
--      coalesce(last_api_total, last_api_count): jobs uses the true total once probed,
--      full-sweep resources fall back to last_api_count unchanged. No behavior change
--      for contacts/estimates; jobs delta becomes meaningful.
--
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE VIEW). No
-- DROP/TRUNCATE/DELETE (hard rule 1).

-- integer (matches last_api_count) so v_acculynx_reconciliation.api_count keeps its
-- column type — CREATE OR REPLACE VIEW cannot change an existing column's data type.
-- Counts here are well under the int range (largest AccuLynx resource is ~thousands).
alter table public.acculynx_sync_watermark
  add column if not exists last_api_total integer;

comment on column public.acculynx_sync_watermark.last_api_total is
  'API-reported UNFILTERED grand total for this (account_key, resource_type). Set by the windowed jobs sync via a full-history count probe; NULL for full-sweep resources whose last_api_count already equals the total. v_acculynx_reconciliation reconciles against coalesce(last_api_total, last_api_count).';

create or replace view public.v_acculynx_reconciliation as
select
  w.account_key,
  w.resource_type,
  coalesce(w.last_api_total, w.last_api_count)                    as api_count,
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
        - coalesce(w.last_api_total, w.last_api_count)
      )
    / nullif(coalesce(w.last_api_total, w.last_api_count), 0),
    1
  )                                                               as delta_pct
from public.acculynx_sync_watermark w
-- Exclude any (account_key, resource_type) with no comparable API count (never swept
-- and never probed) — neither last_api_total nor last_api_count set.
where coalesce(w.last_api_total, w.last_api_count) is not null;

comment on view public.v_acculynx_reconciliation is
  'Compares the API grand total (coalesce(last_api_total, last_api_count)) against brain non-archived row count per (account_key, resource_type). last_api_total carries the unfiltered total for date-windowed resources (jobs) whose last_api_count is only the modified-window count; full-sweep resources (contacts, estimates) fall back to last_api_count. Synced resources only. Plan 03-06 gate: all delta_pct <= 2%.';

grant select on public.v_acculynx_reconciliation to authenticated, service_role;
