-- DB-2026-06-12-PRICE-FOUNDATION
-- Ghost-only smoke-test fixture.
--
-- This file creates a minimal Supabase-like schema in an empty Ghost database
-- so 001/002/003 can be syntax-smoked without copying production data.
-- Do not run this file in Supabase branch, staging, or production.

create extension if not exists pgcrypto;

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  vendor_type text not null default 'supplier',
  channel text not null default 'distribution',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  internal_sku text not null unique,
  manufacturer_sku text not null unique,
  name text not null,
  description_normalized text,
  base_uom text not null default 'EA',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_branches (
  id uuid primary key default gen_random_uuid(),
  legacy_id integer,
  vendor_id uuid not null references public.vendors(id),
  branch_number text not null,
  branch_name text not null,
  city text,
  state text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  pricing_status text not null default 'unreviewed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, branch_number)
);

create table if not exists public.price_agreements (
  id uuid primary key default gen_random_uuid(),
  legacy_id integer,
  vendor_id uuid not null references public.vendors(id),
  vendor_branch_id uuid references public.vendor_branches(id),
  region_id uuid,
  agreement_number text,
  version_label text,
  account_number text,
  sales_rep text,
  effective_date date not null default current_date,
  expiry_date date,
  staleness_status text,
  staleness_alert_sent_at timestamptz,
  ceo_verified boolean not null default false,
  ceo_verified_at timestamptz,
  ceo_verified_by text,
  is_active boolean not null default true,
  source_pdf_url text,
  source_file text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.price_agreement_items (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.price_agreements(id),
  product_id uuid references public.products(id),
  color_variant_id uuid,
  raw_item_number text,
  raw_description text,
  raw_description_normalized text,
  negotiated_price numeric not null,
  price_uom text not null,
  order_uom text,
  uom_conversion_factor numeric,
  match_type text,
  match_confidence smallint,
  needs_review boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approval_status text not null default 'pending',
  approved_by text,
  approved_at timestamptz,
  prior_price numeric,
  pct_change numeric
);

create table if not exists public.abc_price_agreements (
  id integer primary key,
  branch_number text,
  region_code text,
  agreement_number text,
  version_label text,
  abc_account_number text,
  sales_rep text,
  effective_date date,
  expiry_date date,
  staleness_status text,
  staleness_alert_sent_at timestamptz,
  ceo_verified boolean,
  ceo_verified_at timestamptz,
  ceo_verified_by text,
  source_file text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.abc_price_list_items (
  id integer primary key,
  agreement_id integer not null,
  item_number text,
  description text not null,
  description_normalized text,
  unit text,
  unit_price numeric,
  manufacturer text,
  product_category text,
  has_sku boolean,
  created_at timestamptz default now(),
  approval_status text not null default 'pending',
  approved_by text,
  approved_at timestamptz
);

create table if not exists public.abc_product_catalog (
  item_number text primary key,
  family_id text,
  family_name text,
  supplier_name text,
  item_description text,
  marketing_description text,
  status text,
  is_dimensional boolean,
  weights jsonb,
  dimensions jsonb,
  uoms jsonb,
  images jsonb,
  hierarchy jsonb,
  raw jsonb not null default '{}'::jsonb,
  source_endpoint text not null default 'fixture',
  abc_first_seen_at timestamptz not null default now(),
  abc_last_seen_at timestamptz not null default now(),
  abc_fetched_at timestamptz not null default now()
);

create table if not exists public.abc_vendor_branches (
  id integer primary key,
  branch_number text not null,
  branch_name text not null,
  city text,
  state text,
  region_code text,
  is_primary boolean,
  created_at timestamptz default now()
);

create table if not exists public.abc_price_agreement_branch_matches (
  id uuid primary key default gen_random_uuid(),
  ship_to_number text not null,
  bill_to_number text,
  sold_to_number text,
  branch_number text not null,
  abc_price_agreement_id integer,
  match_type text not null default 'fixture',
  match_reason text,
  confidence_score smallint,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.abc_price_observations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  request_hash text not null,
  abc_price_agreement_id integer,
  ship_to_number text not null,
  bill_to_number text,
  sold_to_number text,
  branch_number text not null,
  purpose text not null default 'fixture',
  request_id text,
  observed_at timestamptz not null default now(),
  status_code integer,
  line_count integer not null default 0,
  ok_line_count integer not null default 0,
  error_line_count integer not null default 0,
  request_body jsonb not null default '{}'::jsonb,
  response_raw jsonb,
  source_endpoint text not null default 'fixture',
  created_at timestamptz not null default now()
);

insert into public.vendors (id, name, slug)
values ('00000000-0000-0000-0000-0000000000a1', 'ABC Supply', 'abc-supply')
on conflict (slug) do nothing;

insert into public.products (id, internal_sku, manufacturer_sku, name, description_normalized)
values ('00000000-0000-0000-0000-000000000101', 'SKU-TRUSTED', 'MFG-TRUSTED', 'Trusted reusable shingle', 'trusted reusable shingle')
on conflict (internal_sku) do nothing;

insert into public.vendor_branches (id, legacy_id, vendor_id, branch_number, branch_name, city, state, is_primary, pricing_status)
values ('00000000-0000-0000-0000-000000000201', 101, '00000000-0000-0000-0000-0000000000a1', '101', 'ABC Wichita', 'Wichita', 'KS', true, 'reviewed')
on conflict (vendor_id, branch_number) do nothing;

insert into public.abc_vendor_branches (id, branch_number, branch_name, city, state)
values (101, '101', 'ABC Wichita', 'Wichita', 'KS')
on conflict (id) do nothing;

insert into public.abc_product_catalog (item_number, item_description, supplier_name)
values
  ('SKU-TRUSTED', 'Trusted reusable shingle', 'ABC Supply'),
  ('SKU-CATALOG-ONLY', 'Catalog only shingle', 'ABC Supply')
on conflict (item_number) do nothing;

insert into public.abc_price_agreements (
  id, branch_number, agreement_number, version_label, abc_account_number, effective_date, ceo_verified, source_file, notes
)
values
  (9001, '101', 'AGR-REUSABLE', 'v1', 'acct-fixture', current_date, true, 'fixture.pdf', 'Reusable fixture'),
  (9002, '101', 'AGR-PROJECT', 'project', 'acct-fixture', current_date, true, 'fixture.pdf', 'custom project fixture')
on conflict (id) do nothing;

insert into public.abc_price_list_items (
  id, agreement_id, item_number, description, description_normalized, unit, unit_price, manufacturer, product_category, has_sku, approval_status
)
values
  (1, 9001, 'SKU-TRUSTED', 'Trusted reusable shingle', 'trusted reusable shingle', 'EA', 100.00, 'Fixture', 'Shingle', true, 'approved'),
  (2, 9001, 'SKU-CATALOG-ONLY', 'Catalog only shingle', 'catalog only shingle', 'EA', 101.00, 'Fixture', 'Shingle', true, 'pending'),
  (3, 9001, null, 'Missing SKU shingle', 'missing sku shingle', 'EA', 102.00, 'Fixture', 'Shingle', false, 'pending'),
  (4, 9001, 'SKU-UNKNOWN', 'Unknown SKU shingle', 'unknown sku shingle', 'EA', 103.00, 'Fixture', 'Shingle', true, 'pending'),
  (5, 9002, 'SKU-TRUSTED', 'Project one-off shingle', 'project one off shingle', 'EA', 80.00, 'Fixture', 'Shingle', true, 'approved')
on conflict (id) do nothing;

insert into public.abc_price_agreement_branch_matches (
  id, ship_to_number, branch_number, abc_price_agreement_id, match_type
)
values ('00000000-0000-0000-0000-000000000301', 'ship-fixture', 'BAD-BRANCH', 9001, 'fixture')
on conflict (id) do nothing;

insert into public.abc_price_observations (
  id, request_hash, abc_price_agreement_id, ship_to_number, branch_number, purpose, line_count
)
values ('00000000-0000-0000-0000-000000000401', 'fixture-observation', 9001, 'ship-fixture', 'BAD-BRANCH', 'fixture', 1)
on conflict (id) do nothing;
