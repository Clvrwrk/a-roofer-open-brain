-- DB-2026-06-12-PRICE-FOUNDATION
-- Round 4 / Phase 1 additive migration support objects.
--
-- Purpose:
--   Create idempotent sidecar tables, review queues, source-reference tracking,
--   and one-off/reusable agreement support needed before ABC pricing backfill.
--
-- Production posture:
--   Intended for Supabase branch or staging validation first.
--   Do not apply to production until migration approval gates pass.

begin;

create extension if not exists pgcrypto;

create or replace function public.price_foundation_uuid_from_text(seed text)
returns uuid
language sql
immutable
strict
as $$
  select (
    substr(h, 1, 8) || '-' ||
    substr(h, 9, 4) || '-' ||
    substr(h, 13, 4) || '-' ||
    substr(h, 17, 4) || '-' ||
    substr(h, 21, 12)
  )::uuid
  from (select md5(seed) as h) s;
$$;

comment on function public.price_foundation_uuid_from_text(text) is
  'Deterministically derives UUIDs for idempotent price-foundation migration rows. Uses MD5 formatting for stable branch/staging backfill IDs; not for security.';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'price_agreements' and column_name = 'is_one_off'
  ) then
    alter table public.price_agreements
      add column is_one_off boolean not null default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'price_agreements' and column_name = 'one_off_label'
  ) then
    alter table public.price_agreements
      add column one_off_label text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'price_agreements' and column_name = 'agreement_scope'
  ) then
    alter table public.price_agreements
      add column agreement_scope text not null default 'reusable';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'price_agreements' and column_name = 'is_reusable'
  ) then
    alter table public.price_agreements
      add column is_reusable boolean
      generated always as (not is_one_off and agreement_scope = 'reusable') stored;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'price_agreements' and column_name = 'source_abc_table'
  ) then
    alter table public.price_agreements
      add column source_abc_table text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'price_agreements' and column_name = 'source_abc_id'
  ) then
    alter table public.price_agreements
      add column source_abc_id text;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.price_agreements'::regclass
      and conname = 'price_agreements_agreement_scope_check'
  ) then
    alter table public.price_agreements
      add constraint price_agreements_agreement_scope_check
      check (agreement_scope in ('reusable', 'project_specific'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.price_agreements'::regclass
      and conname = 'price_agreements_one_off_label_check'
  ) then
    alter table public.price_agreements
      add constraint price_agreements_one_off_label_check
      check (not is_one_off or one_off_label is not null);
  end if;
end $$;

comment on column public.price_agreements.is_one_off is
  'True for project-specific or one-off pricing that must not feed reusable pricing paths.';
comment on column public.price_agreements.one_off_label is
  'Human-readable label required for one-off/project-specific pricing.';
comment on column public.price_agreements.agreement_scope is
  'Phase 1 scope marker: reusable or project_specific.';
comment on column public.price_agreements.is_reusable is
  'Generated convenience flag used by reusable-pricing views.';
comment on column public.price_agreements.source_abc_table is
  'Original ABC source table for migrated agreement rows.';
comment on column public.price_agreements.source_abc_id is
  'Original ABC source primary key for migrated agreement rows.';

create table if not exists public.price_foundation_migration_runs (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null unique,
  source_system text not null default 'abc_supply',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  real_source_metrics jsonb not null default '{}'::jsonb,
  notes text,
  constraint price_foundation_migration_runs_status_check
    check (status in ('running', 'phase1_loaded', 'validated', 'failed', 'abandoned'))
);

comment on table public.price_foundation_migration_runs is
  'One row per price-foundation migration/backfill attempt. Stores aggregate evidence and run status without raw exports.';

create table if not exists public.price_foundation_source_refs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.price_foundation_migration_runs(id) on delete restrict,
  source_table text not null,
  source_pk text not null,
  source_hash text not null,
  target_table text,
  target_pk uuid,
  migration_status text not null,
  match_type text,
  confidence smallint,
  review_queue text,
  problem_categories text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_foundation_source_refs_confidence_check
    check (confidence is null or confidence between 0 and 100),
  unique (run_id, source_table, source_pk)
);

comment on table public.price_foundation_source_refs is
  'Audit and rollback sidecar for every migrated or quarantined ABC source row touched by the phase-1 migration.';

create table if not exists public.price_foundation_sku_review_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.price_foundation_migration_runs(id) on delete restrict,
  source_table text not null default 'abc_price_list_items',
  source_pk text not null,
  source_hash text not null,
  problem_category text not null,
  raw_item_number text,
  raw_description text,
  raw_description_normalized text,
  candidate_product_id uuid references public.products(id) on delete restrict,
  proposed_resolution text,
  resolution_status text not null default 'open',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_foundation_sku_review_status_check
    check (resolution_status in ('open', 'resolved', 'rejected', 'deferred')),
  unique (run_id, source_table, source_pk, problem_category)
);

comment on table public.price_foundation_sku_review_queue is
  'Review queue for missing item numbers, ABC catalog-only SKUs, and SKUs absent from canonical products/catalog.';

create table if not exists public.price_foundation_branch_review_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.price_foundation_migration_runs(id) on delete restrict,
  source_table text not null,
  source_pk text not null,
  source_hash text not null,
  problem_category text not null,
  raw_branch_number text,
  candidate_branch_id uuid references public.vendor_branches(id) on delete restrict,
  proposed_resolution text,
  resolution_status text not null default 'open',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_foundation_branch_review_status_check
    check (resolution_status in ('open', 'resolved', 'rejected', 'deferred')),
  unique (run_id, source_table, source_pk, problem_category)
);

comment on table public.price_foundation_branch_review_queue is
  'Review queue for branch references in ABC branch matches and observations that cannot be resolved safely.';

create table if not exists public.price_foundation_business_rule_review_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.price_foundation_migration_runs(id) on delete restrict,
  source_table text not null,
  source_pk text not null,
  source_hash text not null,
  problem_category text not null,
  rule_name text not null,
  proposed_resolution text,
  resolution_status text not null default 'open',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_foundation_business_review_status_check
    check (resolution_status in ('open', 'resolved', 'rejected', 'deferred')),
  unique (run_id, source_table, source_pk, rule_name)
);

comment on table public.price_foundation_business_rule_review_queue is
  'Review queue for structurally preservable rows that fail trust or migration business rules.';

create index if not exists price_foundation_source_refs_status_idx
  on public.price_foundation_source_refs (run_id, migration_status, review_queue);
create index if not exists price_foundation_source_refs_target_idx
  on public.price_foundation_source_refs (target_table, target_pk);
create index if not exists price_foundation_source_refs_problem_gin_idx
  on public.price_foundation_source_refs using gin (problem_categories);

create index if not exists price_foundation_sku_review_status_idx
  on public.price_foundation_sku_review_queue (run_id, resolution_status, problem_category);
create index if not exists price_foundation_sku_review_source_idx
  on public.price_foundation_sku_review_queue (source_table, source_pk);

create index if not exists price_foundation_branch_review_status_idx
  on public.price_foundation_branch_review_queue (run_id, resolution_status, problem_category);
create index if not exists price_foundation_branch_review_source_idx
  on public.price_foundation_branch_review_queue (source_table, source_pk);

create index if not exists price_foundation_business_review_status_idx
  on public.price_foundation_business_rule_review_queue (run_id, resolution_status, problem_category);
create index if not exists price_foundation_business_review_source_idx
  on public.price_foundation_business_rule_review_queue (source_table, source_pk);

create index if not exists price_agreements_one_off_scope_idx
  on public.price_agreements (is_one_off, agreement_scope, is_active);
create index if not exists price_agreements_source_abc_idx
  on public.price_agreements (source_abc_table, source_abc_id);

create or replace view public.v_price_foundation_reusable_price_agreement_items as
select pai.*
from public.price_agreement_items pai
join public.price_agreements pa on pa.id = pai.agreement_id
where pa.is_active
  and pa.is_reusable
  and not pa.is_one_off
  and pai.approval_status = 'approved'
  and not pai.needs_review;

comment on view public.v_price_foundation_reusable_price_agreement_items is
  'Reusable pricing view for branch testing. Excludes one-off/project-specific agreements and any review-gated item.';

alter table public.price_foundation_migration_runs enable row level security;
alter table public.price_foundation_source_refs enable row level security;
alter table public.price_foundation_sku_review_queue enable row level security;
alter table public.price_foundation_branch_review_queue enable row level security;
alter table public.price_foundation_business_rule_review_queue enable row level security;

comment on table public.price_foundation_migration_runs is
  'One row per price-foundation migration/backfill attempt. RLS is enabled without broad policies in phase 1; add role/client policies in branch testing before exposing through app APIs.';

commit;
