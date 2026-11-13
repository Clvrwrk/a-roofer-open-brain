-- 343 — CenterPoint work-surface merge tables
--
-- Approved 2026-11-13. Additive. Does not alter public.cp_resources,
-- public.cp_sync_runs, or public.cp_sync_watermarks (file 190).
--
-- source owns the external id: acculynx | centerpoint | crm | qbo.
-- book, on jobs only, picks the status list: residential | service | sales | production.
-- A CenterPoint service ticket is source=centerpoint, book=service.
-- An AccuLynx roof is source=acculynx, book=residential.
--
-- Identity for CenterPoint jobs is the productions collection. The
-- opportunities and services lists are the same ids and are not copied here.
-- Money is numeric dollars as the API returns them, not minor units.
-- property_id stays null until a reviewed match. This file does not load rows.
-- File binaries, notes, roof sections, and production items stay in cp_resources.

create table if not exists public.work_companies (
  id                bigint generated always as identity primary key,
  source            text not null,
  source_id         text not null,
  source_collection text not null,
  name              text,
  company_type      text,
  sales_status      text,
  external_id       text,
  locality          text,
  region            text,
  postal_code       text,
  property_count    integer,
  created_at_src    timestamptz,
  updated_at_src    timestamptz,
  deleted_at_src    timestamptz,
  source_fetched_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint work_companies_source_check
    check (source in ('acculynx', 'centerpoint', 'crm', 'qbo')),
  constraint work_companies_source_id_key unique (source, source_id)
);

create table if not exists public.work_jobs (
  id                  bigint generated always as identity primary key,
  source              text not null,
  source_id           text not null,
  source_collection   text not null,
  book                text not null,
  number              text,
  domain              text,
  status              text,
  display_status      text,
  work_type           text,
  opportunity_type    text,
  price               numeric(14,2),
  invoiced            numeric(14,2),
  cost                numeric(14,2),
  material_total      numeric(14,2),
  labor_travel_total  numeric(14,2),
  nte                 numeric(14,2),
  contractor_nte      numeric(14,2),
  company_source_id   text,
  property_source_id  text,
  profile_source_id   text,
  scheduled_at        timestamptz,
  archived_at         timestamptz,
  created_at_src      timestamptz,
  updated_at_src      timestamptz,
  deleted_at_src      timestamptz,
  source_fetched_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint work_jobs_source_check
    check (source in ('acculynx', 'centerpoint', 'crm', 'qbo')),
  constraint work_jobs_book_check
    check (book in ('residential', 'service', 'sales', 'production')),
  constraint work_jobs_source_id_key unique (source, source_id)
);

create table if not exists public.work_property_sources (
  id                bigint generated always as identity primary key,
  source            text not null,
  source_id         text not null,
  source_collection text not null,
  property_id       uuid references public.properties (id) on delete set null,
  company_source_id text,
  locality          text,
  region            text,
  postal_code       text,
  squares           numeric(12,2),
  latitude          numeric(9,6),
  longitude         numeric(9,6),
  match_status      text not null default 'unmatched',
  created_at_src    timestamptz,
  updated_at_src    timestamptz,
  deleted_at_src    timestamptz,
  source_fetched_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint work_property_sources_source_check
    check (source in ('acculynx', 'centerpoint', 'crm', 'qbo')),
  constraint work_property_sources_match_check
    check (match_status in ('unmatched', 'matched', 'rejected')),
  constraint work_property_sources_source_id_key unique (source, source_id)
);

create table if not exists public.work_invoices (
  id                       bigint generated always as identity primary key,
  source                   text not null,
  source_id                text not null,
  source_collection        text not null,
  job_source               text,
  job_source_id            text,
  job_id                   bigint references public.work_jobs (id) on delete set null,
  number                   text,
  production_name          text,
  amount                   numeric(14,2),
  billed_amount            numeric(14,2),
  subtotal                 numeric(14,2),
  tax_amount               numeric(14,2),
  profit                   numeric(14,2),
  cost_total               numeric(14,2),
  material_total           numeric(14,2),
  labor_travel_total       numeric(14,2),
  other_total              numeric(14,2),
  material_cost_total      numeric(14,2),
  labor_travel_cost_total  numeric(14,2),
  other_cost_total         numeric(14,2),
  job_hours                numeric(12,2),
  is_draft                 boolean,
  is_final                 boolean,
  invoice_date             date,
  due_date                 date,
  last_sent_at             timestamptz,
  created_at_src           timestamptz,
  updated_at_src           timestamptz,
  deleted_at_src           timestamptz,
  source_fetched_at        timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint work_invoices_source_check
    check (source in ('acculynx', 'centerpoint', 'crm', 'qbo')),
  constraint work_invoices_job_source_check
    check (job_source is null or job_source in ('acculynx', 'centerpoint', 'crm', 'qbo')),
  constraint work_invoices_source_id_key unique (source, source_id)
);

create table if not exists public.work_payments (
  id                bigint generated always as identity primary key,
  source            text not null,
  source_id         text not null,
  source_collection text not null,
  invoice_source_id text,
  invoice_id        bigint references public.work_invoices (id) on delete set null,
  amount            numeric(14,2),
  payment_method    text,
  received_date     date,
  created_at_src    timestamptz,
  updated_at_src    timestamptz,
  deleted_at_src    timestamptz,
  source_fetched_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint work_payments_source_check
    check (source in ('acculynx', 'centerpoint', 'crm', 'qbo')),
  constraint work_payments_source_id_key unique (source, source_id)
);

create table if not exists public.work_labor (
  id                bigint generated always as identity primary key,
  source            text not null,
  source_id         text not null,
  source_collection text not null,
  job_source        text,
  job_source_id     text,
  job_id            bigint references public.work_jobs (id) on delete set null,
  profile_source_id text,
  labor_type        text,
  hours             numeric(10,2),
  rate              numeric(10,2),
  is_overtime       boolean,
  is_timekeeping    boolean,
  in_at             timestamptz,
  out_at            timestamptz,
  confirmed_at      timestamptz,
  local_in_date     date,
  created_at_src    timestamptz,
  updated_at_src    timestamptz,
  deleted_at_src    timestamptz,
  source_fetched_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint work_labor_source_check
    check (source in ('acculynx', 'centerpoint', 'crm', 'qbo')),
  constraint work_labor_job_source_check
    check (job_source is null or job_source in ('acculynx', 'centerpoint', 'crm', 'qbo')),
  constraint work_labor_source_id_key unique (source, source_id)
);

create index if not exists work_jobs_book_status_idx
  on public.work_jobs (source, book, display_status);
create index if not exists work_jobs_number_idx
  on public.work_jobs (source, number);
create index if not exists work_jobs_company_idx
  on public.work_jobs (source, company_source_id);
create index if not exists work_jobs_property_idx
  on public.work_jobs (source, property_source_id);
create index if not exists work_jobs_open_service_idx
  on public.work_jobs (display_status, scheduled_at)
  where source = 'centerpoint'
    and book = 'service'
    and display_status in ('Ticket Created', 'Scheduled', 'In Progress', 'Completed');

create index if not exists work_property_sources_property_idx
  on public.work_property_sources (property_id);

create index if not exists work_invoices_job_idx
  on public.work_invoices (job_id);
create index if not exists work_invoices_job_source_idx
  on public.work_invoices (source, job_source_id);
create index if not exists work_invoices_date_idx
  on public.work_invoices (invoice_date);

create index if not exists work_payments_invoice_idx
  on public.work_payments (invoice_id);
create index if not exists work_payments_invoice_source_idx
  on public.work_payments (source, invoice_source_id);
create index if not exists work_payments_received_idx
  on public.work_payments (received_date);

create index if not exists work_labor_job_idx
  on public.work_labor (job_id);
create index if not exists work_labor_job_source_idx
  on public.work_labor (source, job_source_id);
create index if not exists work_labor_local_in_idx
  on public.work_labor (local_in_date);

comment on table public.work_jobs is
  'One job per source. CenterPoint rows use the productions id once. book selects the status list. Money is API dollars.';
comment on table public.work_companies is
  'One company per source. CenterPoint customers are companies.';
comment on table public.work_property_sources is
  'Link from a source property id onto public.properties. property_id stays null until a reviewed match.';
comment on table public.work_invoices is
  'One invoice per source. Does not copy invoice line items, addresses, or email.';
comment on table public.work_payments is
  'One payment per source. Notes stay in cp_resources.';
comment on table public.work_labor is
  'One time row per source. Profile id only; no worker name.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'work_companies',
    'work_jobs',
    'work_property_sources',
    'work_invoices',
    'work_payments',
    'work_labor'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    execute format('grant usage, select on sequence public.%I to service_role', t || '_id_seq');
  end loop;
end $$;
