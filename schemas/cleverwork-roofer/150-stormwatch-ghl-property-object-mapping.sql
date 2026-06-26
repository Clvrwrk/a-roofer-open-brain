-- Stormwatch GHL property-object mapping ledger.
-- Uses GHL "business" object as the property-level entity and maps contacts/opportunities.

create table if not exists public.stormwatch_ghl_property_object_map (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.stormwatch_zoominfo_runs(id) on delete cascade,
  office_id uuid not null references public.office(id),
  zoominfo_contact_id text not null,
  ghl_contact_id text not null,
  ghl_opportunity_id text,
  business_object_key text not null default 'business',
  business_record_id text not null,
  office_display_name text not null,
  association_id text not null default 'BUSINESSES_CONTACTS_ASSOCIATION',
  contact_association_status text not null default 'pending',
  opportunity_mapping_method text not null default 'via_contact_association',
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, zoominfo_contact_id, business_record_id)
);

create index if not exists idx_stormwatch_ghl_property_map_run
  on public.stormwatch_ghl_property_object_map (run_id);

create index if not exists idx_stormwatch_ghl_property_map_business
  on public.stormwatch_ghl_property_object_map (business_record_id);

alter table if exists public.stormwatch_ghl_sync
  add column if not exists business_object_key text,
  add column if not exists business_record_id text,
  add column if not exists contact_business_association_status text,
  add column if not exists opportunity_mapping_method text;

alter table public.stormwatch_ghl_property_object_map enable row level security;
