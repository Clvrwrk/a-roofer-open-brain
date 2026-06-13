-- DB-2026-06-12-PRICE-FOUNDATION
-- Round 4 / Phase 1 idempotent ABC pricing backfill + quarantine population.
--
-- Assumptions and limits:
--   - Run 001_phase1_sidecars.sql first.
--   - Existing canonical tables remain in place: vendors, vendor_branches,
--     price_agreements, price_agreement_items, products.
--   - An ABC Supply vendor row already exists in vendors. The script matches
--     by slug/name and reports failure through validation if it cannot find one.
--   - Product shells are not automatically created because production products
--     require owner-reviewed manufacturer/taxonomy fields. ABC catalog matches
--     without products are preserved and queued.
--   - Description-only matching is not trusted for reusable pricing.
--
-- Idempotence:
--   - Stable UUIDs are derived from source table + source primary key.
--   - All sidecars and queues use ON CONFLICT upserts.
--   - price_agreement_items upsert by deterministic target id.

begin;

with params as (
  select 'phase1-abc-price-foundation'::text as migration_key
)
insert into public.price_foundation_migration_runs (id, migration_key, status, notes)
select public.price_foundation_uuid_from_text('price_foundation_migration_runs:' || migration_key),
       migration_key,
       'running',
       'Round 4 phase-1 additive ABC pricing backfill/quarantine script.'
from params
on conflict (migration_key) do update
set status = 'running',
    started_at = coalesce(public.price_foundation_migration_runs.started_at, now()),
    completed_at = null,
    notes = excluded.notes;

with
params as (
  select 'phase1-abc-price-foundation'::text as migration_key
),
run as (
  select id as run_id from public.price_foundation_migration_runs
  where migration_key = (select migration_key from params)
),
abc_vendor as (
  select id
  from public.vendors
  where lower(slug) in ('abc-supply', 'abc_supply', 'abc')
     or lower(name) in ('abc supply', 'abc supply co', 'abc supply co.')
     or lower(name) like 'abc supply%'
  order by
    case when lower(slug) = 'abc-supply' then 0 else 1 end,
    created_at nulls last,
    id
  limit 1
),
existing_agreements as (
  select distinct on (legacy_id) legacy_id, id
  from public.price_agreements
  where legacy_id is not null
  order by legacy_id, updated_at desc nulls last, created_at desc nulls last, id
),
branch_candidates as (
  select distinct on (lower(btrim(vb.branch_number))) lower(btrim(vb.branch_number)) as branch_key,
         vb.id as vendor_branch_id
  from public.vendor_branches vb
  join abc_vendor v on v.id = vb.vendor_id
  where nullif(btrim(vb.branch_number), '') is not null
  order by lower(btrim(vb.branch_number)), vb.is_primary desc, vb.updated_at desc nulls last, vb.id
),
agreement_source as (
  select
    coalesce(ea.id, public.price_foundation_uuid_from_text('abc_price_agreements:' || a.id::text)) as target_agreement_id,
    a.*,
    v.id as target_vendor_id,
    bc.vendor_branch_id as target_vendor_branch_id,
    (
      lower(coalesce(a.agreement_number, '') || ' ' ||
            coalesce(a.version_label, '') || ' ' ||
            coalesce(a.source_file, '') || ' ' ||
            coalesce(a.notes, '')) ~ '(project|job|one[ -]?off|custom)'
    ) as detected_one_off,
    md5(concat_ws('|',
      a.id::text,
      coalesce(a.branch_number, ''),
      coalesce(a.agreement_number, ''),
      coalesce(a.version_label, ''),
      coalesce(a.abc_account_number, ''),
      coalesce(a.effective_date::text, ''),
      coalesce(a.expiry_date::text, ''),
      coalesce(a.source_file, '')
    )) as source_hash
  from public.abc_price_agreements a
  cross join abc_vendor v
  left join existing_agreements ea on ea.legacy_id = a.id
  left join branch_candidates bc on bc.branch_key = lower(nullif(btrim(a.branch_number), ''))
),
upsert_agreements as (
  insert into public.price_agreements (
    id,
    legacy_id,
    vendor_id,
    vendor_branch_id,
    agreement_number,
    version_label,
    account_number,
    sales_rep,
    effective_date,
    expiry_date,
    staleness_status,
    staleness_alert_sent_at,
    ceo_verified,
    ceo_verified_at,
    ceo_verified_by,
    is_active,
    source_file,
    notes,
    is_one_off,
    one_off_label,
    agreement_scope,
    source_abc_table,
    source_abc_id
  )
  select
    target_agreement_id,
    id,
    target_vendor_id,
    target_vendor_branch_id,
    agreement_number,
    version_label,
    abc_account_number,
    sales_rep,
    coalesce(effective_date, current_date),
    expiry_date,
    staleness_status,
    staleness_alert_sent_at,
    coalesce(ceo_verified, false),
    ceo_verified_at,
    ceo_verified_by,
    coalesce(expiry_date >= current_date, true),
    source_file,
    notes,
    detected_one_off,
    case
      when detected_one_off then concat_ws(' / ', 'ABC project-specific agreement', agreement_number, version_label, id::text)
      else null
    end,
    case when detected_one_off then 'project_specific' else 'reusable' end,
    'abc_price_agreements',
    id::text
  from agreement_source
  on conflict (id) do update
  set vendor_id = excluded.vendor_id,
      vendor_branch_id = excluded.vendor_branch_id,
      agreement_number = excluded.agreement_number,
      version_label = excluded.version_label,
      account_number = excluded.account_number,
      sales_rep = excluded.sales_rep,
      effective_date = excluded.effective_date,
      expiry_date = excluded.expiry_date,
      staleness_status = excluded.staleness_status,
      staleness_alert_sent_at = excluded.staleness_alert_sent_at,
      ceo_verified = excluded.ceo_verified,
      ceo_verified_at = excluded.ceo_verified_at,
      ceo_verified_by = excluded.ceo_verified_by,
      is_active = excluded.is_active,
      source_file = excluded.source_file,
      notes = excluded.notes,
      is_one_off = excluded.is_one_off,
      one_off_label = excluded.one_off_label,
      agreement_scope = excluded.agreement_scope,
      source_abc_table = excluded.source_abc_table,
      source_abc_id = excluded.source_abc_id,
      updated_at = now()
  returning id
)
insert into public.price_foundation_source_refs (
  id,
  run_id,
  source_table,
  source_pk,
  source_hash,
  target_table,
  target_pk,
  migration_status,
  match_type,
  confidence,
  review_queue,
  problem_categories,
  updated_at
)
select public.price_foundation_uuid_from_text('source_ref:' || run.run_id::text || ':abc_price_agreements:' || s.id::text),
       run.run_id,
       'abc_price_agreements',
       s.id::text,
       s.source_hash,
       'price_agreements',
       s.target_agreement_id,
       'migrated',
       'legacy_id',
       100,
       null,
       '{}'::text[],
       now()
from agreement_source s
cross join run
on conflict (run_id, source_table, source_pk) do update
set source_hash = excluded.source_hash,
    target_table = excluded.target_table,
    target_pk = excluded.target_pk,
    migration_status = excluded.migration_status,
    match_type = excluded.match_type,
    confidence = excluded.confidence,
    review_queue = excluded.review_queue,
    problem_categories = excluded.problem_categories,
    updated_at = now();

with
params as (
  select 'phase1-abc-price-foundation'::text as migration_key
),
run as (
  select id as run_id from public.price_foundation_migration_runs
  where migration_key = (select migration_key from params)
),
product_keys as (
  select distinct on (sku_key) sku_key, product_id
  from (
    select lower(nullif(btrim(internal_sku), '')) as sku_key, id as product_id, 1 as priority
    from public.products
    union all
    select lower(nullif(btrim(manufacturer_sku), '')) as sku_key, id as product_id, 2 as priority
    from public.products
  ) s
  where sku_key is not null
  order by sku_key, priority, product_id
),
catalog_keys as (
  select lower(nullif(btrim(item_number), '')) as sku_key
  from public.abc_product_catalog
  where nullif(btrim(item_number), '') is not null
  group by 1
),
agreement_targets as (
  select legacy_id as abc_agreement_id, id as target_agreement_id, is_one_off, is_reusable
  from public.price_agreements
  where legacy_id is not null
),
classified as (
  select
    pli.*,
    lower(nullif(btrim(pli.item_number), '')) as item_key,
    coalesce(nullif(btrim(pli.approval_status), ''), 'pending') as source_approval_status,
    at.target_agreement_id,
    at.is_one_off as target_agreement_is_one_off,
    at.is_reusable as target_agreement_is_reusable,
    pk.product_id as target_product_id,
    (pk.product_id is not null) as product_match,
    (ck.sku_key is not null) as catalog_match,
    public.price_foundation_uuid_from_text('abc_price_list_items:' || pli.id::text) as target_item_id,
    md5(concat_ws('|',
      pli.id::text,
      pli.agreement_id::text,
      coalesce(pli.item_number, ''),
      coalesce(pli.description, ''),
      coalesce(pli.description_normalized, ''),
      coalesce(pli.unit, ''),
      coalesce(pli.unit_price::text, ''),
      coalesce(pli.approval_status, '')
    )) as source_hash
  from public.abc_price_list_items pli
  left join agreement_targets at on at.abc_agreement_id = pli.agreement_id
  left join product_keys pk on pk.sku_key = lower(nullif(btrim(pli.item_number), ''))
  left join catalog_keys ck on ck.sku_key = lower(nullif(btrim(pli.item_number), ''))
),
classified_with_rules as (
  select
    c.*,
    case
      when target_agreement_id is null then 'missing_target_agreement'
      when unit_price is null then 'missing_unit_price'
      when item_key is null then 'missing_item_number'
      when product_match then 'existing_product_sku'
      when catalog_match then 'abc_catalog_sku_review'
      else 'unmatched_sku'
    end as match_type_out,
    case
      when product_match then 100
      when catalog_match then 80
      when item_key is null then 30
      else 20
    end as confidence_out,
    array_remove(array[
      case when item_key is null then 'missing_item_number' end,
      case when item_key is not null and not product_match and catalog_match then 'catalog_match_needs_product_creation' end,
      case when item_key is not null and not product_match and not catalog_match then 'has_sku_no_catalog_or_product_match' end,
      case when source_approval_status <> 'approved' then 'approval_not_approved' end,
      case when target_agreement_id is null then 'missing_target_agreement' end,
      case when unit_price is null then 'missing_unit_price' end
    ], null)::text[] as problem_categories,
    (
      not product_match
      or source_approval_status <> 'approved'
      or target_agreement_id is null
      or unit_price is null
    ) as needs_review_out
  from classified c
),
existing_items as (
  select distinct on (agreement_id, raw_item_number, raw_description, negotiated_price)
         agreement_id,
         raw_item_number,
         raw_description,
         negotiated_price,
         id as existing_item_id
  from public.price_agreement_items
  where agreement_id is not null
  order by agreement_id, raw_item_number, raw_description, negotiated_price, updated_at desc nulls last, created_at desc nulls last, id
),
items_to_upsert as (
  select
    coalesce(ei.existing_item_id, c.target_item_id) as resolved_target_item_id,
    c.*
  from classified_with_rules c
  left join existing_items ei
    on ei.agreement_id = c.target_agreement_id
   and ei.raw_item_number is not distinct from c.item_number
   and ei.raw_description is not distinct from c.description
   and ei.negotiated_price is not distinct from c.unit_price
  where c.target_agreement_id is not null
    and c.unit_price is not null
),
upsert_items as (
  insert into public.price_agreement_items (
    id,
    agreement_id,
    product_id,
    raw_item_number,
    raw_description,
    raw_description_normalized,
    negotiated_price,
    price_uom,
    match_type,
    match_confidence,
    needs_review,
    approval_status,
    notes,
    updated_at
  )
  select
    resolved_target_item_id,
    target_agreement_id,
    target_product_id,
    item_number,
    description,
    description_normalized,
    unit_price,
    coalesce(nullif(btrim(unit), ''), 'EA'),
    match_type_out,
    confidence_out,
    needs_review_out,
    source_approval_status,
    concat_ws('; ',
      'Round 4 phase-1 ABC backfill',
      'source abc_price_list_items.id=' || id::text,
      case when array_length(problem_categories, 1) > 0 then 'review=' || array_to_string(problem_categories, ',') end
    ),
    now()
  from items_to_upsert
  on conflict (id) do update
  set agreement_id = excluded.agreement_id,
      product_id = excluded.product_id,
      raw_item_number = excluded.raw_item_number,
      raw_description = excluded.raw_description,
      raw_description_normalized = excluded.raw_description_normalized,
      negotiated_price = excluded.negotiated_price,
      price_uom = excluded.price_uom,
      match_type = excluded.match_type,
      match_confidence = excluded.match_confidence,
      needs_review = excluded.needs_review,
      approval_status = excluded.approval_status,
      notes = excluded.notes,
      updated_at = now()
  returning id
),
sku_queue_rows as (
  select
    public.price_foundation_uuid_from_text('sku_review:' || run.run_id::text || ':' || c.id::text || ':' || category.problem_category) as queue_id,
    run.run_id,
    c.id::text as source_pk,
    c.source_hash,
    category.problem_category,
    c.item_number,
    c.description,
    c.description_normalized,
    case category.problem_category
      when 'missing_item_number' then 'Human review required; do not infer reusable SKU from description alone.'
      when 'catalog_match_needs_product_creation' then 'Create/review product shell from abc_product_catalog before approving reusable pricing.'
      when 'has_sku_no_catalog_or_product_match' then 'Reconcile SKU against vendor/catalog source before product mapping.'
    end as proposed_resolution
  from classified_with_rules c
  cross join run
  cross join lateral unnest(c.problem_categories) as category(problem_category)
  where category.problem_category in (
    'missing_item_number',
    'catalog_match_needs_product_creation',
    'has_sku_no_catalog_or_product_match'
  )
),
upsert_sku_queue as (
  insert into public.price_foundation_sku_review_queue (
    id,
    run_id,
    source_table,
    source_pk,
    source_hash,
    problem_category,
    raw_item_number,
    raw_description,
    raw_description_normalized,
    proposed_resolution,
    updated_at
  )
  select
    queue_id,
    run_id,
    'abc_price_list_items',
    source_pk,
    source_hash,
    problem_category,
    item_number,
    description,
    description_normalized,
    proposed_resolution,
    now()
  from sku_queue_rows
  on conflict (run_id, source_table, source_pk, problem_category) do update
  set source_hash = excluded.source_hash,
      raw_item_number = excluded.raw_item_number,
      raw_description = excluded.raw_description,
      raw_description_normalized = excluded.raw_description_normalized,
      proposed_resolution = excluded.proposed_resolution,
      updated_at = now()
  returning id
),
business_queue_rows as (
  select
    public.price_foundation_uuid_from_text('business_review:' || run.run_id::text || ':' || c.id::text || ':' || category.problem_category) as queue_id,
    run.run_id,
    c.id::text as source_pk,
    c.source_hash,
    category.problem_category,
    case category.problem_category
      when 'approval_not_approved' then 'trusted_pricing_requires_approved_status'
      when 'missing_target_agreement' then 'price_item_requires_target_agreement'
      when 'missing_unit_price' then 'price_item_requires_unit_price'
    end as rule_name,
    case category.problem_category
      when 'approval_not_approved' then 'Preserve row but exclude from reusable pricing until approval workflow marks it approved.'
      when 'missing_target_agreement' then 'Create or repair target price_agreements row before price item can be inserted.'
      when 'missing_unit_price' then 'Review source row; negotiated_price is required in price_agreement_items.'
    end as proposed_resolution
  from classified_with_rules c
  cross join run
  cross join lateral unnest(c.problem_categories) as category(problem_category)
  where category.problem_category in (
    'approval_not_approved',
    'missing_target_agreement',
    'missing_unit_price'
  )
),
upsert_business_queue as (
  insert into public.price_foundation_business_rule_review_queue (
    id,
    run_id,
    source_table,
    source_pk,
    source_hash,
    problem_category,
    rule_name,
    proposed_resolution,
    updated_at
  )
  select
    queue_id,
    run_id,
    'abc_price_list_items',
    source_pk,
    source_hash,
    problem_category,
    rule_name,
    proposed_resolution,
    now()
  from business_queue_rows
  on conflict (run_id, source_table, source_pk, rule_name) do update
  set source_hash = excluded.source_hash,
      problem_category = excluded.problem_category,
      proposed_resolution = excluded.proposed_resolution,
      updated_at = now()
  returning id
)
insert into public.price_foundation_source_refs (
  id,
  run_id,
  source_table,
  source_pk,
  source_hash,
  target_table,
  target_pk,
  migration_status,
  match_type,
  confidence,
  review_queue,
  problem_categories,
  updated_at
)
select
  public.price_foundation_uuid_from_text('source_ref:' || run.run_id::text || ':abc_price_list_items:' || c.id::text),
  run.run_id,
  'abc_price_list_items',
  c.id::text,
  c.source_hash,
  case when c.target_agreement_id is not null and c.unit_price is not null then 'price_agreement_items' end,
  case when c.target_agreement_id is not null and c.unit_price is not null then coalesce(ei.existing_item_id, c.target_item_id) end,
  case
    when c.target_agreement_id is null or c.unit_price is null then 'quarantined'
    when array_length(c.problem_categories, 1) > 0 then 'migrated_review_gated'
    else 'migrated'
  end,
  c.match_type_out,
  c.confidence_out,
  case
    when array_length(c.problem_categories, 1) is null then null
    when array_length(c.problem_categories, 1) > 1 then 'multiple'
    when c.problem_categories[1] in ('missing_item_number', 'catalog_match_needs_product_creation', 'has_sku_no_catalog_or_product_match') then 'price_foundation_sku_review_queue'
    else 'price_foundation_business_rule_review_queue'
  end,
  c.problem_categories,
  now()
from classified_with_rules c
cross join run
left join existing_items ei
  on ei.agreement_id = c.target_agreement_id
 and ei.raw_item_number is not distinct from c.item_number
 and ei.raw_description is not distinct from c.description
 and ei.negotiated_price is not distinct from c.unit_price
on conflict (run_id, source_table, source_pk) do update
set source_hash = excluded.source_hash,
    target_table = excluded.target_table,
    target_pk = excluded.target_pk,
    migration_status = excluded.migration_status,
    match_type = excluded.match_type,
    confidence = excluded.confidence,
    review_queue = excluded.review_queue,
    problem_categories = excluded.problem_categories,
    updated_at = now();

with
params as (
  select 'phase1-abc-price-foundation'::text as migration_key
),
run as (
  select id as run_id from public.price_foundation_migration_runs
  where migration_key = (select migration_key from params)
),
abc_branch_keys as (
  select lower(nullif(btrim(branch_number), '')) as branch_key
  from public.abc_vendor_branches
  where nullif(btrim(branch_number), '') is not null
  group by 1
),
branch_match_bad_refs as (
  select
    'abc_price_agreement_branch_matches'::text as source_table,
    bm.id::text as source_pk,
    md5(concat_ws('|',
      bm.id::text,
      coalesce(bm.branch_number, ''),
      coalesce(bm.ship_to_number, ''),
      coalesce(bm.abc_price_agreement_id::text, ''),
      coalesce(bm.match_type, '')
    )) as source_hash,
    bm.branch_number as raw_branch_number
  from public.abc_price_agreement_branch_matches bm
  left join abc_branch_keys ab on ab.branch_key = lower(nullif(btrim(bm.branch_number), ''))
  where ab.branch_key is null
),
observation_bad_refs as (
  select
    'abc_price_observations'::text as source_table,
    o.id::text as source_pk,
    md5(concat_ws('|',
      o.id::text,
      coalesce(o.request_hash, ''),
      coalesce(o.branch_number, ''),
      coalesce(o.abc_price_agreement_id::text, ''),
      coalesce(o.observed_at::text, '')
    )) as source_hash,
    o.branch_number as raw_branch_number
  from public.abc_price_observations o
  left join abc_branch_keys ab on ab.branch_key = lower(nullif(btrim(o.branch_number), ''))
  where ab.branch_key is null
),
bad_refs as (
  select * from branch_match_bad_refs
  union all
  select * from observation_bad_refs
),
queue_rows as (
  select
    public.price_foundation_uuid_from_text('branch_review:' || run.run_id::text || ':' || br.source_table || ':' || br.source_pk) as queue_id,
    run.run_id,
    br.*
  from bad_refs br
  cross join run
),
upsert_branch_queue as (
  insert into public.price_foundation_branch_review_queue (
    id,
    run_id,
    source_table,
    source_pk,
    source_hash,
    problem_category,
    raw_branch_number,
    proposed_resolution,
    updated_at
  )
  select
    queue_id,
    run_id,
    source_table,
    source_pk,
    source_hash,
    'bad_branch_reference',
    raw_branch_number,
    'Review branch number against ABC branch source and canonical vendor_branches before using this row in branch-linked pricing/observation paths.',
    now()
  from queue_rows
  on conflict (run_id, source_table, source_pk, problem_category) do update
  set source_hash = excluded.source_hash,
      raw_branch_number = excluded.raw_branch_number,
      proposed_resolution = excluded.proposed_resolution,
      updated_at = now()
  returning id
)
insert into public.price_foundation_source_refs (
  id,
  run_id,
  source_table,
  source_pk,
  source_hash,
  target_table,
  target_pk,
  migration_status,
  match_type,
  confidence,
  review_queue,
  problem_categories,
  updated_at
)
select
  public.price_foundation_uuid_from_text('source_ref:' || qr.run_id::text || ':' || qr.source_table || ':' || qr.source_pk),
  qr.run_id,
  qr.source_table,
  qr.source_pk,
  qr.source_hash,
  'price_foundation_branch_review_queue',
  qr.queue_id,
  'quarantined',
  'bad_branch_reference',
  0,
  'price_foundation_branch_review_queue',
  array['bad_branch_reference']::text[],
  now()
from queue_rows qr
on conflict (run_id, source_table, source_pk) do update
set source_hash = excluded.source_hash,
    target_table = excluded.target_table,
    target_pk = excluded.target_pk,
    migration_status = excluded.migration_status,
    match_type = excluded.match_type,
    confidence = excluded.confidence,
    review_queue = excluded.review_queue,
    problem_categories = excluded.problem_categories,
    updated_at = now();

with params as (
  select 'phase1-abc-price-foundation'::text as migration_key
),
run as (
  select id as run_id from public.price_foundation_migration_runs
  where migration_key = (select migration_key from params)
),
metrics as (
  select jsonb_build_object(
    'abc_price_agreements', (select count(*) from public.abc_price_agreements),
    'abc_price_list_items', (select count(*) from public.abc_price_list_items),
    'abc_price_list_item_source_refs', (
      select count(*) from public.price_foundation_source_refs sr
      cross join run
      where sr.run_id = run.run_id and sr.source_table = 'abc_price_list_items'
    ),
    'sku_review_queue_open', (
      select count(*) from public.price_foundation_sku_review_queue q
      cross join run
      where q.run_id = run.run_id and q.resolution_status = 'open'
    ),
    'branch_review_queue_open', (
      select count(*) from public.price_foundation_branch_review_queue q
      cross join run
      where q.run_id = run.run_id and q.resolution_status = 'open'
    ),
    'business_rule_review_queue_open', (
      select count(*) from public.price_foundation_business_rule_review_queue q
      cross join run
      where q.run_id = run.run_id and q.resolution_status = 'open'
    )
  ) as real_source_metrics
)
update public.price_foundation_migration_runs mr
set status = 'phase1_loaded',
    completed_at = now(),
    real_source_metrics = metrics.real_source_metrics
from params, metrics
where mr.migration_key = params.migration_key;

commit;
