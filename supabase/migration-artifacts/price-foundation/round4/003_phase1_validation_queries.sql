-- DB-2026-06-12-PRICE-FOUNDATION
-- Round 4 / Phase 1 validation queries.
--
-- Run after:
--   001_phase1_sidecars.sql
--   002_phase1_backfill_and_quarantine.sql
--
-- These queries are read-only and safe to run repeatedly.

with
params as (
  select 'phase1-abc-price-foundation'::text as migration_key
),
run as (
  select id as run_id from public.price_foundation_migration_runs
  where migration_key = (select migration_key from params)
)
select
  '01_price_list_source_ref_reconciliation' as check_name,
  (select count(*) from public.abc_price_list_items) as expected_count,
  (
    select count(*)
    from public.price_foundation_source_refs sr
    join run on run.run_id = sr.run_id
    where sr.source_table = 'abc_price_list_items'
  ) as observed_count,
  (
    select count(*)
    from public.price_foundation_source_refs sr
    join run on run.run_id = sr.run_id
    where sr.source_table = 'abc_price_list_items'
  ) = (select count(*) from public.abc_price_list_items) as passed;

with
params as (
  select 'phase1-abc-price-foundation'::text as migration_key
),
run as (
  select id as run_id from public.price_foundation_migration_runs
  where migration_key = (select migration_key from params)
),
item_refs as (
  select sr.*
  from public.price_foundation_source_refs sr
  join run on run.run_id = sr.run_id
  where sr.source_table = 'abc_price_list_items'
)
select
  '02_price_item_migration_mix' as check_name,
  count(*) as source_refs,
  count(*) filter (where migration_status = 'migrated') as migrated_immediately,
  count(*) filter (where migration_status = 'migrated_review_gated') as migrated_review_gated,
  count(*) filter (where migration_status = 'quarantined') as quarantined,
  round(count(*) filter (where migration_status = 'migrated') * 100.0 / nullif(count(*), 0), 2) as pct_immediately_migrated,
  round(count(*) filter (where migration_status <> 'migrated') * 100.0 / nullif(count(*), 0), 2) as pct_review_or_quarantine
from item_refs;

with
params as (
  select 'phase1-abc-price-foundation'::text as migration_key
),
run as (
  select id as run_id from public.price_foundation_migration_runs
  where migration_key = (select migration_key from params)
),
orphaned_queue_rows as (
  select 'sku' as queue_name, q.id, q.source_table, q.source_pk
  from public.price_foundation_sku_review_queue q
  join run on run.run_id = q.run_id
  left join public.price_foundation_source_refs sr
    on sr.run_id = q.run_id and sr.source_table = q.source_table and sr.source_pk = q.source_pk
  where sr.id is null
  union all
  select 'branch', q.id, q.source_table, q.source_pk
  from public.price_foundation_branch_review_queue q
  join run on run.run_id = q.run_id
  left join public.price_foundation_source_refs sr
    on sr.run_id = q.run_id and sr.source_table = q.source_table and sr.source_pk = q.source_pk
  where sr.id is null
  union all
  select 'business_rule', q.id, q.source_table, q.source_pk
  from public.price_foundation_business_rule_review_queue q
  join run on run.run_id = q.run_id
  left join public.price_foundation_source_refs sr
    on sr.run_id = q.run_id and sr.source_table = q.source_table and sr.source_pk = q.source_pk
  where sr.id is null
)
select
  '03_review_queue_source_ref_orphans' as check_name,
  count(*) as orphaned_rows,
  count(*) = 0 as passed
from orphaned_queue_rows;

with
params as (
  select 'phase1-abc-price-foundation'::text as migration_key
),
run as (
  select id as run_id from public.price_foundation_migration_runs
  where migration_key = (select migration_key from params)
),
hash_mismatches as (
  select 'sku' as queue_name, q.id, q.source_table, q.source_pk
  from public.price_foundation_sku_review_queue q
  join run on run.run_id = q.run_id
  join public.price_foundation_source_refs sr
    on sr.run_id = q.run_id and sr.source_table = q.source_table and sr.source_pk = q.source_pk
  where sr.source_hash <> q.source_hash
  union all
  select 'branch', q.id, q.source_table, q.source_pk
  from public.price_foundation_branch_review_queue q
  join run on run.run_id = q.run_id
  join public.price_foundation_source_refs sr
    on sr.run_id = q.run_id and sr.source_table = q.source_table and sr.source_pk = q.source_pk
  where sr.source_hash <> q.source_hash
  union all
  select 'business_rule', q.id, q.source_table, q.source_pk
  from public.price_foundation_business_rule_review_queue q
  join run on run.run_id = q.run_id
  join public.price_foundation_source_refs sr
    on sr.run_id = q.run_id and sr.source_table = q.source_table and sr.source_pk = q.source_pk
  where sr.source_hash <> q.source_hash
)
select
  '04_review_queue_source_hash_mismatches' as check_name,
  count(*) as mismatched_rows,
  count(*) = 0 as passed
from hash_mismatches;

with
params as (
  select 'phase1-abc-price-foundation'::text as migration_key
),
run as (
  select id as run_id from public.price_foundation_migration_runs
  where migration_key = (select migration_key from params)
),
migrated_items as (
  select pai.*, pa.is_reusable, pa.is_one_off
  from public.price_foundation_source_refs sr
  join run on run.run_id = sr.run_id
  join public.price_agreement_items pai on pai.id = sr.target_pk
  join public.price_agreements pa on pa.id = pai.agreement_id
  where sr.source_table = 'abc_price_list_items'
    and sr.target_table = 'price_agreement_items'
)
select
  '05_reusable_vs_review_gated_items' as check_name,
  count(*) as migrated_item_rows,
  count(*) filter (
    where is_reusable and not is_one_off and approval_status = 'approved' and not needs_review
  ) as immediately_reusable_rows,
  count(*) filter (
    where not (is_reusable and not is_one_off and approval_status = 'approved' and not needs_review)
  ) as review_gated_or_non_reusable_rows,
  round(count(*) filter (
    where is_reusable and not is_one_off and approval_status = 'approved' and not needs_review
  ) * 100.0 / nullif(count(*), 0), 2) as pct_immediately_reusable
from migrated_items;

select
  '06_one_off_excluded_from_reusable_view' as check_name,
  count(*) as one_off_rows_in_reusable_view,
  count(*) = 0 as passed
from public.v_price_foundation_reusable_price_agreement_items v
join public.price_agreements pa on pa.id = v.agreement_id
where pa.is_one_off or not pa.is_reusable;

with duplicate_source_refs as (
  select run_id, source_table, source_pk, count(*) as duplicate_count
  from public.price_foundation_source_refs
  group by run_id, source_table, source_pk
  having count(*) > 1
)
select
  '07_duplicate_source_refs' as check_name,
  count(*) as duplicate_keys,
  count(*) = 0 as passed
from duplicate_source_refs;

select
  '08_migration_run_status' as check_name,
  migration_key,
  status,
  started_at,
  completed_at,
  real_source_metrics
from public.price_foundation_migration_runs
where migration_key = 'phase1-abc-price-foundation';
