-- Stormwatch lead packaging for rapid SDR/AE brief execution.
-- Additive/idempotent schema for property context, ranking, checklist, and summary notes.

alter table if exists public.stormwatch_zoominfo_contacts
  add column if not exists office_display_name text,
  add column if not exists office_key text,
  add column if not exists company_office_phone text,
  add column if not exists company_office_email text,
  add column if not exists company_website text,
  add column if not exists office_website text,
  add column if not exists property_section jsonb,
  add column if not exists property_name text,
  add column if not exists property_street text,
  add column if not exists property_city text,
  add column if not exists property_state text,
  add column if not exists property_zip text,
  add column if not exists property_country text,
  add column if not exists property_square_footage numeric,
  add column if not exists property_roof_type text,
  add column if not exists property_management_company text,
  add column if not exists property_management_email text,
  add column if not exists property_management_phone text,
  add column if not exists lead_score_total integer,
  add column if not exists lead_score_fit integer,
  add column if not exists lead_score_intent integer,
  add column if not exists lead_score_readiness integer,
  add column if not exists lead_score_routing integer,
  add column if not exists lead_score_completeness integer,
  add column if not exists lead_score_risk_penalty integer not null default 0,
  add column if not exists priority_tier text,
  add column if not exists lead_score_reason text,
  add column if not exists why_now text,
  add column if not exists lead_checklist jsonb not null default '{}'::jsonb,
  add column if not exists lead_checklist_version text not null default 'v1_sdr_rapid_brief',
  add column if not exists lead_checklist_completed_at timestamptz,
  add column if not exists first_summary_note_md text,
  add column if not exists first_summary_note_payload jsonb,
  add column if not exists first_summary_note_generated_at timestamptz,
  add column if not exists first_touch_channel text,
  add column if not exists first_touch_cta text,
  add column if not exists brief_sla_minutes integer not null default 5,
  add column if not exists outreach_sla_minutes integer not null default 8;

create index if not exists idx_stormwatch_contacts_priority_tier
  on public.stormwatch_zoominfo_contacts (priority_tier);

create index if not exists idx_stormwatch_contacts_office_key
  on public.stormwatch_zoominfo_contacts (office_key);

create table if not exists public.stormwatch_company_offices (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.office(id),
  zoominfo_company_id text,
  company_name text not null,
  office_key text not null,
  office_display_name text not null,
  office_street text,
  office_city text,
  office_state text,
  office_zip text,
  office_country text,
  office_phone text,
  office_email text,
  company_website text,
  office_website text,
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, company_name, office_key)
);

create index if not exists idx_stormwatch_company_offices_company
  on public.stormwatch_company_offices (company_name);

alter table if exists public.stormwatch_ghl_sync
  add column if not exists package_payload jsonb,
  add column if not exists first_summary_note_status text,
  add column if not exists first_summary_note_synced_at timestamptz,
  add column if not exists office_display_name text,
  add column if not exists lead_score_total integer,
  add column if not exists priority_tier text;

create index if not exists idx_stormwatch_ghl_sync_priority
  on public.stormwatch_ghl_sync (priority_tier);

alter table public.stormwatch_company_offices enable row level security;
