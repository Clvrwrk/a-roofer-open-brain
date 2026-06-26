-- Stormwatch storm-event trigger and SLA ledger.
-- Additive/idempotent schema for HailRecon-triggered orchestration and stage telemetry.

create table if not exists public.stormwatch_storm_events (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.office(id),
  trigger_source text not null default 'hailrecon',
  external_event_id text,
  storm_name text,
  storm_started_at timestamptz,
  alert_received_at timestamptz not null default now(),
  storm_center_lat numeric,
  storm_center_lng numeric,
  radius_miles numeric not null default 50,
  target_state text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, trigger_source, external_event_id)
);

create table if not exists public.stormwatch_storm_event_runs (
  id uuid primary key default gen_random_uuid(),
  storm_event_id uuid not null references public.stormwatch_storm_events(id) on delete cascade,
  office_id uuid not null references public.office(id),
  stormwatch_run_id uuid references public.stormwatch_zoominfo_runs(id),
  stage text not null,
  stage_status text not null default 'running',
  stage_started_at timestamptz not null default now(),
  stage_finished_at timestamptz,
  elapsed_seconds integer,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_stormwatch_storm_event_runs_event
  on public.stormwatch_storm_event_runs (storm_event_id, stage);

create table if not exists public.stormwatch_property_research (
  id uuid primary key default gen_random_uuid(),
  storm_event_id uuid not null references public.stormwatch_storm_events(id) on delete cascade,
  office_id uuid not null references public.office(id),
  source_system text not null,
  external_property_id text,
  property_name text,
  property_street text,
  property_city text,
  property_state text,
  property_zip text,
  property_country text,
  property_lat numeric,
  property_lng numeric,
  distance_miles numeric,
  building_owner_company text,
  building_owner_email text,
  building_owner_phone text,
  management_company text,
  management_email text,
  management_phone text,
  maintenance_company text,
  maintenance_email text,
  maintenance_phone text,
  company_website text,
  confidence numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_stormwatch_property_research_event
  on public.stormwatch_property_research (storm_event_id);

create table if not exists public.stormwatch_company_resolution (
  id uuid primary key default gen_random_uuid(),
  storm_event_id uuid not null references public.stormwatch_storm_events(id) on delete cascade,
  office_id uuid not null references public.office(id),
  canonical_company_name text not null,
  canonical_domain text,
  company_role text not null,
  confidence numeric,
  source_systems text[] not null default '{}',
  source_records jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storm_event_id, canonical_company_name, company_role)
);

create index if not exists idx_stormwatch_company_resolution_event
  on public.stormwatch_company_resolution (storm_event_id);

alter table if exists public.stormwatch_zoominfo_runs
  add column if not exists storm_event_id uuid references public.stormwatch_storm_events(id),
  add column if not exists trigger_source text,
  add column if not exists triggered_at timestamptz,
  add column if not exists ae_ready_at timestamptz,
  add column if not exists elapsed_seconds integer,
  add column if not exists sla_status text;

create index if not exists idx_stormwatch_runs_event
  on public.stormwatch_zoominfo_runs (storm_event_id);

alter table public.stormwatch_storm_events enable row level security;
alter table public.stormwatch_storm_event_runs enable row level security;
alter table public.stormwatch_property_research enable row level security;
alter table public.stormwatch_company_resolution enable row level security;
