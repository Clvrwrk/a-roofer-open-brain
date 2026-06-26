-- Stormwatch full-field contract hardening.
-- Additive/idempotent extension for full enriched payloads and identity mapping.

alter table if exists public.stormwatch_zoominfo_contacts
  add column if not exists enriched_payload jsonb,
  add column if not exists primary_email text,
  add column if not exists primary_phone text,
  add column if not exists office_street text,
  add column if not exists office_city text,
  add column if not exists office_state text,
  add column if not exists office_zip text,
  add column if not exists office_country text,
  add column if not exists office_address text,
  add column if not exists mandatory_email_ok boolean not null default false,
  add column if not exists mandatory_phone_ok boolean not null default false,
  add column if not exists mandatory_office_address_ok boolean not null default false,
  add column if not exists exclusion_reason text,
  add column if not exists mapping_version text not null default 'v2_full_contract';

create table if not exists public.stormwatch_zoominfo_rejections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.stormwatch_zoominfo_runs(id) on delete cascade,
  office_id uuid not null references public.office(id),
  zoominfo_contact_id text not null,
  zoominfo_company_id text,
  company_name text,
  role_bucket text,
  rejection_reason text not null,
  source_payload jsonb,
  enriched_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_stormwatch_rejections_run on public.stormwatch_zoominfo_rejections (run_id);

create table if not exists public.stormwatch_field_contract (
  id uuid primary key default gen_random_uuid(),
  mapping_key text not null unique,
  source_system text not null default 'zoominfo',
  source_field_path text not null,
  supabase_target_path text not null,
  ghl_object text not null default 'contact',
  ghl_field_name text,
  ghl_field_id text,
  required boolean not null default false,
  data_type text not null default 'text',
  mapping_version text not null default 'v2_full_contract',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stormwatch_ghl_custom_fields (
  id uuid primary key default gen_random_uuid(),
  ghl_location_id text not null,
  object_key text not null default 'contact',
  field_name text not null,
  field_id text,
  field_key text,
  data_type text not null default 'TEXT',
  required boolean not null default false,
  mapping_version text not null default 'v2_full_contract',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ghl_location_id, object_key, field_name)
);

alter table if exists public.stormwatch_ghl_sync
  add column if not exists zoominfo_company_id text,
  add column if not exists supabase_contact_row_id uuid references public.stormwatch_zoominfo_contacts(id),
  add column if not exists mapping_version text not null default 'v2_full_contract',
  add column if not exists ghl_custom_field_payload jsonb,
  add column if not exists identity_payload jsonb;

create index if not exists idx_stormwatch_ghl_sync_supabase_contact on public.stormwatch_ghl_sync (supabase_contact_row_id);

alter table public.stormwatch_zoominfo_rejections enable row level security;
alter table public.stormwatch_field_contract enable row level security;
alter table public.stormwatch_ghl_custom_fields enable row level security;
