-- 169 — AccuLynx resource tables DDL capture + account_key / diff columns (Phase 2, REQ-03 + REQ-04)
--
-- The 11 AccuLynx target tables PLUS acculynx_jobs were created in the live DB before DDL-in-repo
-- discipline was established; CREATE TABLE IF NOT EXISTS is a no-op for each existing table.
-- The real effects of this migration are the new columns added to each table:
--
--   account_key        text  — ties every row to an AccuLynx account (FK-style to acculynx_accounts)
--   market             text  — from acculynx_accounts.market (stamped at ingest time)
--   last_seen_by_api   timestamptz — set to now() on every upsert; used for diff detection
--   archived_at        timestamptz — set when a row is confirmed absent from the API (never DELETE)
--   archive_reason     text  — 'not_seen_in_api' (the only value used in Phase 2)
--
-- account_key is nullable at the DDL layer (no NOT NULL here) because the tables may hold
-- rows from the pre-account_key era. The ingest layer (Plan 03) stamps account_key on every
-- new upserted row; a follow-up constraint will enforce NOT NULL once all rows are backfilled.
--
-- INTENTIONALLY UNSYNCED in Phase 2 — acculynx_contact_emails and acculynx_contact_phones:
--   These two tables receive the same columns for shape-parity with the other 9 tables.
--   However, they are NOT fed by any Plan 03 resource module: email/phone sub-objects are
--   inlined into the /contacts response and denormalized at ingest time; a separate extraction
--   pass is a Phase 3+ decision. As a result, they are explicitly EXCLUDED from the
--   v_acculynx_reconciliation view (migration 170) so they cannot fire a false delta_pct
--   failure on the Plan 04 verification gate.
--
-- Live schema ground truth source: Task 0 MCP introspection, 2026-06-30. All 11 tables
-- confirmed present in the live DB with 0 rows; none have account_key yet.
--
-- Additive + idempotent; no DROP/TRUNCATE, no retype, no data touch (hard rule 1).

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- DDL CAPTURE: CREATE TABLE IF NOT EXISTS (no-op for all 11 tables — they exist in the live DB)
-- Minimal schema capture reflecting Task 0 ground truth. Full column details are in the live DB.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.acculynx_contacts (
  id              text primary key,
  first_name      text,
  last_name       text,
  salutation      text,
  cross_reference text,
  company_name    text,
  mailing_street1 text,
  mailing_street2 text,
  mailing_city    text,
  mailing_state   text,
  mailing_zip     text,
  mailing_country text,
  billing_street1 text,
  billing_street2 text,
  billing_city    text,
  billing_state   text,
  billing_zip     text,
  billing_country text,
  geoid           text,
  raw             jsonb not null,
  synced_at       timestamptz not null default now()
);
comment on table public.acculynx_contacts is
  'AccuLynx contacts — one row per contact across all accounts. account_key + market stamped at ingest (mig 169). Phase 2 full-sweep ingestion via Plan 03.';

create table if not exists public.acculynx_job_contacts (
  id                   text primary key,
  job_id               text not null,
  contact_id           text not null,
  is_primary           boolean,
  relation_to_primary  text,
  raw                  jsonb not null,
  synced_at            timestamptz not null default now()
);
comment on table public.acculynx_job_contacts is
  'AccuLynx job↔contact link table. Populated by the job-walk phase in Plan 03.';

create table if not exists public.acculynx_contact_emails (
  id            text primary key,
  contact_id    text not null,
  email_address text,
  email_type    text,
  is_primary    boolean,
  raw           jsonb not null,
  synced_at     timestamptz not null default now()
);
comment on table public.acculynx_contact_emails is
  'AccuLynx contact email addresses. INTENTIONALLY UNSYNCED in Phase 2 (emails are inlined in the /contacts response; extraction is a Phase 3+ decision). Columns added for shape-parity; excluded from v_acculynx_reconciliation.';

create table if not exists public.acculynx_contact_phones (
  id           text primary key,
  contact_id   text not null,
  phone_number text,
  phone_type   text,
  is_primary   boolean,
  raw          jsonb not null,
  synced_at    timestamptz not null default now()
);
comment on table public.acculynx_contact_phones is
  'AccuLynx contact phone numbers. INTENTIONALLY UNSYNCED in Phase 2 (phones are inlined in the /contacts response; extraction is a Phase 3+ decision). Columns added for shape-parity; excluded from v_acculynx_reconciliation.';

create table if not exists public.acculynx_estimates (
  id                    text primary key,
  job_id                text not null,
  title                 text,
  description           text,
  estimate_number       text,
  is_primary            boolean,
  created_by_user_id    text,
  created_date          timestamptz,
  modified_by_user_id   text,
  modified_date         timestamptz,
  profit_margin_rate    numeric,
  profit_margin_total   numeric,
  tax_rate              numeric,
  tax_total             numeric,
  overhead_rate         numeric,
  overhead_total        numeric,
  profit_rate           numeric,
  profit_total          numeric,
  total_cost            numeric,
  total_price           numeric,
  notes                 text,
  raw                   jsonb not null,
  synced_at             timestamptz not null default now()
);
comment on table public.acculynx_estimates is
  'AccuLynx estimates — one row per estimate per job across all accounts. Full-sweep ingestion via Plan 03.';

create table if not exists public.acculynx_invoices (
  id                     text primary key,
  job_id                 text not null,
  invoice_number         text,
  invoice_sequence       integer,
  invoice_name           text,
  invoice_date           timestamptz,
  due_date               text,
  current_invoice_state  text,
  total_price            numeric,
  balance_due            numeric,
  created_date           timestamptz,
  sort_index             integer,
  raw                    jsonb not null,
  synced_at              timestamptz not null default now()
);
comment on table public.acculynx_invoices is
  'AccuLynx invoices (PE→homeowner AR). Populated by the two-level job-walk (GET /jobs/{id}/invoices then GET /invoices/{id}) in Plan 03.';

create table if not exists public.acculynx_invoice_lines (
  id                   text primary key,
  invoice_id           text not null,
  section_id           text,
  section_type         text,
  item_name            text,
  price                numeric,
  total_price          numeric,
  hierarchy_sort_order integer,
  reference_type       text,
  raw                  jsonb not null,
  synced_at            timestamptz not null default now()
);
comment on table public.acculynx_invoice_lines is
  'AccuLynx invoice line items. Populated by the second level of the invoice walk (GET /invoices/{id}) in Plan 03.';

create table if not exists public.acculynx_job_financials (
  job_id                 text primary key,
  approved_job_value     numeric,
  balance_due            numeric,
  worksheet_total        numeric,
  change_order_total     numeric,
  insurance_claim_total  numeric,
  upgrade_total          numeric,
  discount_total         numeric,
  supplement_total       numeric,
  work_not_doing_total   numeric,
  amendments             jsonb,
  raw                    jsonb not null,
  synced_at              timestamptz not null default now()
);
comment on table public.acculynx_job_financials is
  'AccuLynx per-job financial summary (GET /jobs/{id}/financials). One row per job, keyed by job_id. Populated by the job-walk phase in Plan 03.';

create table if not exists public.acculynx_job_insurance (
  job_id                        text primary key,
  insurance_company_id          text,
  insurance_company_name        text,
  custom_insurance_company_name text,
  damage_location               text,
  date_of_loss                  timestamptz,
  claim_filed                   boolean,
  claim_filed_date              timestamptz,
  claim_number                  text,
  has_paperwork                 boolean,
  raw                           jsonb not null,
  synced_at                     timestamptz not null default now()
);
comment on table public.acculynx_job_insurance is
  'AccuLynx per-job insurance detail (GET /jobs/{id}/insurance). One row per job. Populated by the job-walk phase in Plan 03.';

create table if not exists public.acculynx_insurance_carriers (
  id        text primary key,
  name      text not null,
  is_active boolean,
  raw       jsonb,
  synced_at timestamptz not null default now()
);
comment on table public.acculynx_insurance_carriers is
  'AccuLynx insurance carrier lookup (company settings). Shared reference table across all accounts; ingested in Plan 03.';

create table if not exists public.acculynx_job_milestone_history (
  id             bigint primary key,
  job_id         text not null,
  milestone_name text not null,
  milestone_date timestamptz not null,
  synced_at      timestamptz not null default now()
);
comment on table public.acculynx_job_milestone_history is
  'AccuLynx job milestone history (GET /jobs/{id}/milestone-history). Populated by the job-walk phase in Plan 03.';

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- ADD COLUMNS: account_key, market, last_seen_by_api, archived_at, archive_reason
-- All IF NOT EXISTS — safe to re-run. One block per table.
-- account_key is nullable at DDL level (existing rows may pre-date multi-account support);
-- ingest stamps it on every new row; a follow-up migration adds NOT NULL after backfill.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

-- acculynx_jobs: pre-existing table with live data (1,284 Kansas rows as of 2026-06-30).
-- Also needs these columns for multi-account fan-out and the v_acculynx_reconciliation view
-- to count jobs per account_key. ADD COLUMN IF NOT EXISTS is safe on a live table.
alter table public.acculynx_jobs
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

alter table public.acculynx_contacts
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

alter table public.acculynx_job_contacts
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

-- contact_emails and contact_phones: shape-parity columns added; INTENTIONALLY UNSYNCED in Phase 2.
-- These tables are excluded from v_acculynx_reconciliation (migration 170) so they cannot fire
-- a false delta_pct failure on the Plan 04 verification gate.
alter table public.acculynx_contact_emails
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

alter table public.acculynx_contact_phones
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

alter table public.acculynx_estimates
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

alter table public.acculynx_invoices
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

alter table public.acculynx_invoice_lines
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

alter table public.acculynx_job_financials
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

alter table public.acculynx_job_insurance
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

alter table public.acculynx_insurance_carriers
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

alter table public.acculynx_job_milestone_history
  add column if not exists account_key      text,
  add column if not exists market           text,
  add column if not exists last_seen_by_api timestamptz,
  add column if not exists archived_at      timestamptz,
  add column if not exists archive_reason   text;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- INDEXES: account_key on acculynx_jobs and each of the 11 tables for account-scoped queries
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

create index if not exists idx_acculynx_jobs_account
  on public.acculynx_jobs(account_key);

create index if not exists idx_acculynx_contacts_account
  on public.acculynx_contacts(account_key);

create index if not exists idx_acculynx_job_contacts_account
  on public.acculynx_job_contacts(account_key);

create index if not exists idx_acculynx_contact_emails_account
  on public.acculynx_contact_emails(account_key);

create index if not exists idx_acculynx_contact_phones_account
  on public.acculynx_contact_phones(account_key);

create index if not exists idx_acculynx_estimates_account
  on public.acculynx_estimates(account_key);

create index if not exists idx_acculynx_invoices_account
  on public.acculynx_invoices(account_key);

create index if not exists idx_acculynx_invoice_lines_account
  on public.acculynx_invoice_lines(account_key);

create index if not exists idx_acculynx_job_financials_account
  on public.acculynx_job_financials(account_key);

create index if not exists idx_acculynx_job_insurance_account
  on public.acculynx_job_insurance(account_key);

create index if not exists idx_acculynx_insurance_carriers_account
  on public.acculynx_insurance_carriers(account_key);

create index if not exists idx_acculynx_job_milestone_history_account
  on public.acculynx_job_milestone_history(account_key);

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- RLS + GRANT: match the deny-all posture of the sibling acculynx_* tables (idempotent)
-- Note: acculynx_jobs RLS is applied here for completeness; it may already be enabled on live.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.acculynx_jobs                  enable row level security;
alter table public.acculynx_contacts              enable row level security;
alter table public.acculynx_job_contacts          enable row level security;
alter table public.acculynx_contact_emails        enable row level security;
alter table public.acculynx_contact_phones        enable row level security;
alter table public.acculynx_estimates             enable row level security;
alter table public.acculynx_invoices              enable row level security;
alter table public.acculynx_invoice_lines         enable row level security;
alter table public.acculynx_job_financials        enable row level security;
alter table public.acculynx_job_insurance         enable row level security;
alter table public.acculynx_insurance_carriers    enable row level security;
alter table public.acculynx_job_milestone_history enable row level security;

grant select on
  public.acculynx_jobs,
  public.acculynx_contacts,
  public.acculynx_job_contacts,
  public.acculynx_contact_emails,
  public.acculynx_contact_phones,
  public.acculynx_estimates,
  public.acculynx_invoices,
  public.acculynx_invoice_lines,
  public.acculynx_job_financials,
  public.acculynx_job_insurance,
  public.acculynx_insurance_carriers,
  public.acculynx_job_milestone_history
to authenticated, service_role;
