-- Stormwatch ZoomInfo <-> Supabase <-> GHL connectivity staging tables
-- Additive/idempotent migration.

create table if not exists public.stormwatch_zoominfo_runs (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.office(id),
  office_name text not null,
  target_state text not null default 'TX',
  base_intent text not null,
  fanout_topics jsonb not null default '[]'::jsonb,
  zoominfo_query_payload jsonb not null,
  records_company_count integer not null default 0,
  records_contact_count integer not null default 0,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.stormwatch_zoominfo_companies (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.stormwatch_zoominfo_runs(id) on delete cascade,
  office_id uuid not null references public.office(id),
  zoominfo_company_id text not null,
  company_name text not null,
  website text,
  city text,
  state text,
  country text,
  intent_topic text,
  signal_score integer,
  audience_strength text,
  source_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, zoominfo_company_id, intent_topic)
);

create table if not exists public.stormwatch_zoominfo_contacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.stormwatch_zoominfo_runs(id) on delete cascade,
  office_id uuid not null references public.office(id),
  zoominfo_company_id text not null,
  zoominfo_contact_id text not null,
  company_name text,
  first_name text,
  last_name text,
  full_name text,
  job_title text,
  management_level text,
  department text,
  role_bucket text,
  fit_score numeric,
  has_email boolean,
  has_direct_phone boolean,
  has_mobile_phone boolean,
  source_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, zoominfo_contact_id, role_bucket)
);

create table if not exists public.stormwatch_ghl_sync (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.stormwatch_zoominfo_runs(id) on delete cascade,
  office_id uuid not null references public.office(id),
  zoominfo_contact_id text not null,
  ghl_location_id text,
  ghl_contact_id text,
  ghl_opportunity_id text,
  opportunity_name text,
  pipeline_id text,
  pipeline_stage_id text,
  sync_status text not null default 'pending',
  sync_error text,
  request_payload jsonb,
  response_payload jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, zoominfo_contact_id)
);

create index if not exists idx_stormwatch_runs_office_started on public.stormwatch_zoominfo_runs (office_id, started_at desc);
create index if not exists idx_stormwatch_companies_run on public.stormwatch_zoominfo_companies (run_id);
create index if not exists idx_stormwatch_contacts_run on public.stormwatch_zoominfo_contacts (run_id);
create index if not exists idx_stormwatch_ghl_sync_run on public.stormwatch_ghl_sync (run_id);

alter table public.stormwatch_zoominfo_runs enable row level security;
alter table public.stormwatch_zoominfo_companies enable row level security;
alter table public.stormwatch_zoominfo_contacts enable row level security;
alter table public.stormwatch_ghl_sync enable row level security;
