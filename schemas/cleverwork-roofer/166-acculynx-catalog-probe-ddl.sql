-- 166 — AccuLynx catalog/probe DDL capture + source_account_key tag (Phase 1, REQ-05)
--
-- acculynx_api_catalog (per-endpoint canonical record) and acculynx_api_probe (per-call
-- evidence) were created directly in the live DB and had no repo DDL. This migration captures
-- their exact live shape as idempotent CREATE TABLE IF NOT EXISTS so the repo is the source of
-- truth and a fresh brain can rebuild them. On the live brain the tables already exist with data,
-- so the CREATEs are no-ops; the only real effect is adding source_account_key.
--
-- source_account_key tags each probe row with the AccuLynx account it came from (FK-style to
-- acculynx_accounts.account_key). Phase 1's sandbox sweep tags every row 'sandbox'; the
-- reconciliation (01-03) asserts zero non-sandbox rows — the in-DB proof of the sandbox-only
-- mandate. Additive + idempotent; no DROP/TRUNCATE, no retype, no data touch (hard rule 1).

create table if not exists public.acculynx_api_catalog (
  id               integer generated always as identity primary key,
  endpoint_pattern text not null,
  method           text not null,
  category         text not null,
  subcategory      text,
  requires_param   text,
  is_collection    boolean,
  response_keys    text[],
  target_table     text,
  sync_enabled     boolean,
  last_probe_status integer,
  last_probed_at   timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.acculynx_api_probe (
  id             bigint generated always as identity primary key,
  probe_batch_id text not null,
  probe_name     text not null,
  api_endpoint   text not null,
  method         text not null,
  http_status    integer,
  response_ms    integer,
  reported_count integer,
  items_on_page  integer,
  result_summary jsonb not null default '{}'::jsonb,
  payload_sample jsonb,
  error          text,
  probed_at      timestamptz not null default now()
);

-- Account tagging for the sweep (the sandbox-only DB proof).
alter table public.acculynx_api_probe   add column if not exists source_account_key text;
alter table public.acculynx_api_catalog add column if not exists source_account_key text;

comment on column public.acculynx_api_probe.source_account_key is
  'AccuLynx account this probe ran against (acculynx_accounts.account_key). Phase 1 sweep tags every row ''sandbox''; reconciliation asserts no non-sandbox rows.';

create index if not exists idx_acculynx_api_probe_batch  on public.acculynx_api_probe(probe_batch_id);
create index if not exists idx_acculynx_api_probe_source on public.acculynx_api_probe(source_account_key);

-- Match the deny-all RLS posture already live on these tables (idempotent if already enabled).
alter table public.acculynx_api_catalog enable row level security;
alter table public.acculynx_api_probe   enable row level security;
grant select on public.acculynx_api_catalog, public.acculynx_api_probe to authenticated, service_role;
