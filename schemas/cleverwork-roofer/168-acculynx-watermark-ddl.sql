-- 168 — AccuLynx sync watermark DDL capture + account_key dimension (Phase 2, REQ-03)
--
-- acculynx_sync_watermark was created directly in the live DB and had no repo DDL.
-- This migration captures its current live shape as idempotent CREATE TABLE IF NOT EXISTS
-- (a no-op for the existing table) so the repo is the source of truth and a fresh brain
-- can rebuild it. The real effects are:
--   1. ADD COLUMN IF NOT EXISTS for the multi-account columns (account_key, last_page_index,
--      last_walked_job_id, last_api_count, last_sync_at).
--   2. A new UNIQUE(account_key, resource_type) constraint so each (account, resource) gets
--      its own watermark row — the foundation of REQ-03's multi-location fan-out.
--
-- Live schema ground truth (Task 0, introspected 2026-06-30):
--   PK: resource_type (text)
--   Columns: last_modified_date, last_successful_sync_at, last_sync_batch_id,
--            total_records_synced, updated_at
--   Note: the live column is named "resource_type", not "resource". All downstream
--   code (Plan 03 Edge Function) uses resource_type to match the live schema.
--
-- Additive + idempotent; no DROP/TRUNCATE, no retype, no data touch (hard rule 1).

-- DDL capture: CREATE TABLE IF NOT EXISTS is a no-op for the existing live table.
-- Purpose: enables a fresh brain build to recreate the table from the repo.
create table if not exists public.acculynx_sync_watermark (
  resource_type            text primary key,
  last_modified_date       timestamptz,
  last_successful_sync_at  timestamptz,
  last_sync_batch_id       text,
  total_records_synced     bigint default 0,
  updated_at               timestamptz not null default now()
);

comment on table public.acculynx_sync_watermark is
  'Per-(account_key, resource_type) incremental sync watermark for the AccuLynx fan-out. Phase 2 added the account_key dimension (mig 168) so each location account has its own cursor per resource.';

-- ── New columns for multi-account watermarking (all IF NOT EXISTS — safe to re-run) ──────────────

-- account_key: ties this watermark row to an AccuLynx account in acculynx_accounts.
-- DEFAULT ''wichita'' back-fills the single existing Wichita jobs watermark row
-- so it keeps working without a data migration; all new rows are stamped explicitly.
alter table public.acculynx_sync_watermark
  add column if not exists account_key        text not null default 'wichita';

comment on column public.acculynx_sync_watermark.account_key is
  'AccuLynx account this watermark row tracks (FK to acculynx_accounts.account_key). DEFAULT ''wichita'' preserves the pre-existing single-account rows.';

-- last_page_index: resume cursor for full-sweep resources (contacts, estimates) that use
-- pageStartIndex pagination. Reset to 0 after a confirmed full sweep.
alter table public.acculynx_sync_watermark
  add column if not exists last_page_index    integer;

comment on column public.acculynx_sync_watermark.last_page_index is
  'Last completed pageStartIndex for full-sweep resources (contacts, estimates). NULL = not started. Reset to 0 after full sweep confirmed.';

-- last_walked_job_id: resume cursor for the job-walk phase (sub-resources have no date filter).
-- The Edge Function sorts acculynx_jobs by created_date ASC and resumes after this ID.
alter table public.acculynx_sync_watermark
  add column if not exists last_walked_job_id text;

comment on column public.acculynx_sync_watermark.last_walked_job_id is
  'Last job_id walked in the sub-resource job-walk phase (financials, insurance, milestone-history, invoices, job-contacts). NULL = walk not started. Advances after each job so multi-run resumption is safe.';

-- last_api_count: the count field returned by AccuLynx for this resource on the last sweep.
-- Stored here so v_acculynx_reconciliation can compare it against brain_count without
-- making a live API call at reconciliation time.
alter table public.acculynx_sync_watermark
  add column if not exists last_api_count     integer;

comment on column public.acculynx_sync_watermark.last_api_count is
  'API-reported total count for this (account_key, resource_type) on the last completed sweep. Used by v_acculynx_reconciliation to compute delta_pct without a live API call.';

-- last_sync_at: timestamp of the last time this watermark row was advanced by the Edge Function.
-- Distinct from updated_at (which is set by any UPDATE); last_sync_at is only set by a
-- successful ingest pass.
alter table public.acculynx_sync_watermark
  add column if not exists last_sync_at       timestamptz;

comment on column public.acculynx_sync_watermark.last_sync_at is
  'Timestamp of the last successful ingest pass for this (account_key, resource_type). Used for staleness alerting in Phase 3.';

-- ── New UNIQUE constraint: one watermark row per (account_key, resource_type) ─────────────────────
-- The existing PK on resource_type is preserved (it covers the single-account case for the
-- existing wichita jobs row). The new UNIQUE constraint is the multi-account identity — the
-- Edge Function upserts on conflict (account_key, resource_type).
-- DROP CONSTRAINT IF EXISTS targets any prior attempt at this constraint (safe no-op if absent).
alter table public.acculynx_sync_watermark
  drop constraint if exists acculynx_sync_watermark_account_resource;

alter table public.acculynx_sync_watermark
  add constraint acculynx_sync_watermark_account_resource
    unique (account_key, resource_type);

-- ── Index for account-scoped queries ──────────────────────────────────────────────────────────────
create index if not exists idx_acculynx_sync_watermark_account
  on public.acculynx_sync_watermark(account_key);

-- ── RLS: match the deny-all posture of the sibling acculynx_* tables ──────────────────────────────
alter table public.acculynx_sync_watermark enable row level security;
grant select on public.acculynx_sync_watermark to authenticated, service_role;
