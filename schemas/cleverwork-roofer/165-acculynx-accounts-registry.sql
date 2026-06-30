-- 165 — AccuLynx account registry (Phase 1, REQ-02)
--
-- AccuLynx is a per-account API: each Pro Exteriors location/program is a separate
-- AccuLynx account with its own API key and its own 10 req/s limit. This registry maps
-- all 9 keys (8 production locations/programs + 1 sandbox) to a stable account_key, the
-- NAME of the Supabase secret that holds the key, and location/market metadata.
--
-- SECURITY (hard rule 2): this table stores the secret NAME only (env_secret_name),
-- NEVER the secret value. The runtime resolves the key via Deno.env.get(env_secret_name)
-- from Supabase Edge Function secrets. No key value ever lands in the DB or the repo.
--
-- Phase 1 exercises only the 'sandbox' row. Phase 2 reads is_active='production' rows to
-- fan the sync out across all 8 location accounts. Additive + idempotent (hard rule 1).

create table if not exists public.acculynx_accounts (
  id                  bigint generated always as identity primary key,
  account_key         text not null unique,          -- stable slug: 'kansas_city', 'sandbox', ...
  env_secret_name     text not null unique,          -- Supabase secret NAME, e.g. PE_CC_KANSAS_CITY_ACCULYNX_API_KEY
  label               text not null,                 -- 'Kansas City', 'Multi-Family / Commercial'
  program             text,                          -- 'Insurance Program' / 'Multi-Family Commercial' / NULL for geo
  market              text,                          -- metro/region (NULL until known)
  state               text,                          -- 'KS','TX',... (NULL for programs / sandbox)
  environment         text not null check (environment in ('production','sandbox')),
  is_active           boolean not null default true,
  acculynx_company_id uuid,                           -- bound after a probe confirms the account identity
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.acculynx_accounts is
  'Registry of AccuLynx per-account API keys (8 production locations/programs + 1 sandbox). Phase 1 (REQ-02). Phase 2 fans the sync out by reading the production rows.';
comment on column public.acculynx_accounts.env_secret_name is
  'Supabase project secret NAME holding this account''s AccuLynx API key. The value NEVER lands in the DB or the repo (hard rule 2).';
comment on column public.acculynx_accounts.acculynx_company_id is
  'AccuLynx company identity (from GET /company-settings); backfilled after a probe to verify the key→account binding.';

-- Seed the 9 accounts. env_secret_name uses the canonical Supabase secret names; the
-- Multi-Family/Commercial key is normalized hyphen->underscore for secret-name rules.
insert into public.acculynx_accounts (account_key, env_secret_name, label, program, state, environment) values
  ('florida',              'PE_CC_FLORIDA_ACCULYNX_API_KEY',                 'Florida',                  null,                     'FL', 'production'),
  ('colorado',             'PE_CC_COLORADO_ACCULYNX_API_KEY',                'Colorado',                 null,                     'CO', 'production'),
  ('georgia',              'PE_CC_GEORGIA_ACCULYNX_API_KEY',                 'Georgia',                  null,                     'GA', 'production'),
  ('kansas_city',          'PE_CC_KANSAS_CITY_ACCULYNX_API_KEY',             'Kansas City',              null,                     'KS', 'production'),
  ('texas',                'PE_CC_TEXAS_ACCULYNX_API_KEY',                   'Texas',                    null,                     'TX', 'production'),
  ('wichita',              'PE_CC_WICHITA_ACCULYNX_API_KEY',                 'Wichita',                  null,                     'KS', 'production'),
  ('insurance_program',    'PE_CC_INSURANCE_PROGRAM_ACCULYNX_API_KEY',       'Insurance Program',        'Insurance Program',      null, 'production'),
  ('multi_family_commercial','PE_CC_MULTI_FAMILY_COMMERCIAL_ACCULYNX_API_KEY','Multi-Family / Commercial','Multi-Family Commercial', null, 'production'),
  ('sandbox',              'PE_CC_SANDBOX_ACCULYNX_API_KEY',                 'Sandbox',                  null,                     null, 'sandbox')
on conflict (account_key) do nothing;

-- RLS: match the deny-all posture of the sibling acculynx_* tables (service_role bypasses RLS).
alter table public.acculynx_accounts enable row level security;
grant select on public.acculynx_accounts to authenticated, service_role;
