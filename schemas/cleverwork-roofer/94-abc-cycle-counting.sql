-- 94-abc-cycle-counting.sql
-- ABC Supply bridge: inventory-style cycle counting / ABC review classification.
--
-- Idea (https://www.buske.com/blog/cycle-counting-vs-physical-inventory): instead of revalidating
-- all ~331k catalog items every night, classify the ~1.7k items we actually purchase by recency
-- and review each on a cadence; everything never purchased is dormant and only revalidated by the
-- annual full sweep.
--
-- Recency tiers (relative to last purchase from the invoice/line ledger):
--   A  <= 90 days     -> weekly
--   B  <= 12 months   -> monthly
--   C  12-36 months   -> quarterly
--   D  > 36 months    -> annual (was purchased once, now dormant)
--   NULL review_class -> never purchased; never auto-reviewed, only the annual full sweep.
--
-- Requires 93-abc-supply-change-log.sql. Additive + idempotent. No destructive SQL.

----------------------------------------------------------------------------------------
-- 1) Review-schedule columns.
----------------------------------------------------------------------------------------
alter table public.abc_product_catalog add column if not exists last_purchased_at        date;
alter table public.abc_product_catalog add column if not exists purchases_36mo           integer       not null default 0;
alter table public.abc_product_catalog add column if not exists spend_36mo               numeric(14,2) not null default 0;
alter table public.abc_product_catalog add column if not exists is_tracked               boolean       not null default false;
alter table public.abc_product_catalog add column if not exists review_class             text;
alter table public.abc_product_catalog add column if not exists review_cadence           text;
alter table public.abc_product_catalog add column if not exists catalog_last_reviewed_at   timestamptz;
alter table public.abc_product_catalog add column if not exists catalog_next_review_due_at timestamptz;
alter table public.abc_product_catalog add column if not exists price_last_reviewed_at     timestamptz;
alter table public.abc_product_catalog add column if not exists price_next_review_due_at   timestamptz;

alter table public.abc_product_catalog drop constraint if exists abc_product_catalog_review_class_chk;
alter table public.abc_product_catalog add  constraint abc_product_catalog_review_class_chk
  check (review_class is null or review_class in ('A','B','C','D'));
alter table public.abc_product_catalog drop constraint if exists abc_product_catalog_review_cadence_chk;
alter table public.abc_product_catalog add  constraint abc_product_catalog_review_cadence_chk
  check (review_cadence is null or review_cadence in ('weekly','monthly','quarterly','annual'));

create index if not exists abc_catalog_tracked_idx    on public.abc_product_catalog (is_tracked) where is_tracked;
create index if not exists abc_catalog_catalog_due_idx on public.abc_product_catalog (catalog_next_review_due_at);
create index if not exists abc_catalog_price_due_idx   on public.abc_product_catalog (price_next_review_due_at) where is_tracked;

-- Lightweight activity flags on the small tables (no cadence needed).
alter table public.abc_vendor_branches add column if not exists is_active         boolean not null default false;
alter table public.abc_vendor_branches add column if not exists last_purchased_at date;
alter table public.abc_vendor_branches add column if not exists purchases_36mo    integer not null default 0;
alter table public.abc_regions add column if not exists is_active         boolean not null default false;
alter table public.abc_regions add column if not exists last_purchased_at date;

----------------------------------------------------------------------------------------
-- 2) Archive trigger: ignore review/operational columns; fire only on ABC source columns.
--    (Supersedes the trigger definitions in 93-abc-supply-change-log.sql.)
----------------------------------------------------------------------------------------
create or replace function public.abc_log_change() returns trigger
language plpgsql
as $fn$
declare
  key_col       text := TG_ARGV[0];
  ignore_keys   constant text[] := array[
    'abc_fetched_at','abc_last_seen_at','abc_first_seen_at','content_hash','created_at','updated_at','id',
    'last_purchased_at','purchases_36mo','spend_36mo','is_tracked','review_class','review_cadence',
    'catalog_last_reviewed_at','catalog_next_review_due_at','price_last_reviewed_at','price_next_review_due_at',
    'is_active'
  ];
  raw_volatile  constant text[] := array['lastModifiedDate'];
  old_clean jsonb; new_clean jsonb; rec_key text; diff_fields text[];
  old_vals jsonb := '{}'::jsonb; new_vals jsonb := '{}'::jsonb; k text; raw_norm jsonb;
begin
  if TG_OP = 'INSERT' then
    new_clean := to_jsonb(NEW);
    foreach k in array ignore_keys loop new_clean := new_clean - k; end loop;
    if new_clean ? 'raw' and jsonb_typeof(new_clean->'raw') = 'object' then
      raw_norm := new_clean->'raw';
      foreach k in array raw_volatile loop raw_norm := raw_norm - k; end loop;
      new_clean := jsonb_set(new_clean, '{raw}', raw_norm);
    end if;
    rec_key := to_jsonb(NEW) ->> key_col;
    insert into public.abc_change_log
      (table_name, record_key, change_type, changed_fields, old_values, new_values, source_endpoint)
    values (TG_TABLE_NAME, rec_key, 'insert', array(select jsonb_object_keys(new_clean)),
            null, new_clean, to_jsonb(NEW) ->> 'source_endpoint');
    return NEW;
  elsif TG_OP = 'UPDATE' then
    old_clean := to_jsonb(OLD); new_clean := to_jsonb(NEW);
    foreach k in array ignore_keys loop old_clean := old_clean - k; new_clean := new_clean - k; end loop;
    if old_clean ? 'raw' and jsonb_typeof(old_clean->'raw') = 'object' then
      raw_norm := old_clean->'raw';
      foreach k in array raw_volatile loop raw_norm := raw_norm - k; end loop;
      old_clean := jsonb_set(old_clean, '{raw}', raw_norm);
    end if;
    if new_clean ? 'raw' and jsonb_typeof(new_clean->'raw') = 'object' then
      raw_norm := new_clean->'raw';
      foreach k in array raw_volatile loop raw_norm := raw_norm - k; end loop;
      new_clean := jsonb_set(new_clean, '{raw}', raw_norm);
    end if;
    if old_clean is not distinct from new_clean then return NEW; end if;
    diff_fields := array(
      select coalesce(o.key, n.key) from jsonb_each(old_clean) o
      full outer join jsonb_each(new_clean) n on o.key = n.key
      where o.value is distinct from n.value);
    foreach k in array diff_fields loop
      old_vals := old_vals || jsonb_build_object(k, old_clean -> k);
      new_vals := new_vals || jsonb_build_object(k, new_clean -> k);
    end loop;
    rec_key := to_jsonb(NEW) ->> key_col;
    insert into public.abc_change_log
      (table_name, record_key, change_type, changed_fields, old_values, new_values, source_endpoint)
    values (TG_TABLE_NAME, rec_key, 'update', diff_fields, old_vals, new_vals, to_jsonb(NEW) ->> 'source_endpoint');
    return NEW;
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists abc_catalog_change_log on public.abc_product_catalog;
create trigger abc_catalog_change_log
  after insert or update of
    family_id, family_name, supplier_name, item_description, marketing_description,
    status, is_dimensional, weights, dimensions, uoms, images, hierarchy, raw,
    source_endpoint, content_hash
  on public.abc_product_catalog
  for each row execute function public.abc_log_change('item_number');

drop trigger if exists abc_branches_change_log on public.abc_vendor_branches;
create trigger abc_branches_change_log
  after insert or update of
    branch_name, city, state, region_code, is_primary, storefront, branch_status,
    branch_type, address_json, postal, country, latitude, longitude, contact_json,
    manager_json, hours_json, products_json, services_json, links_json,
    nearby_branches_json, raw, source_endpoint, content_hash
  on public.abc_vendor_branches
  for each row execute function public.abc_log_change('branch_number');

drop trigger if exists abc_regions_change_log on public.abc_regions;
create trigger abc_regions_change_log
  after insert or update of
    region_name, primary_state, primary_city, account_type, account_number,
    sold_to_number, bill_to_number, ship_to_number, storefront, branch_numbers,
    address_json, raw, source_endpoint, content_hash
  on public.abc_regions
  for each row execute function public.abc_log_change('region_code');

----------------------------------------------------------------------------------------
-- 3) Recompute classification + schedule from the purchase ledger. Run nightly.
--    Touches only ledger (ever-purchased) items + the small branch/account tables.
----------------------------------------------------------------------------------------
create or replace function public.abc_recompute_review_schedule()
returns jsonb
language plpgsql
as $fn$
declare catalog_touched int; branches_active int; regions_active int;
begin
  with ledger as (
    select item_number::text as item_number, invoice_date::date as d, coalesce(ext_price,0)::numeric as amt
    from public.abc_line_items where item_number is not null and invoice_date is not null
    union all
    select l.item_number::text, i.invoice_date::date, coalesce(l.extended_price,0)::numeric
    from public.abc_invoice_lines l join public.abc_invoices i on i.invoice_number = l.invoice_number
    where l.item_number is not null and i.invoice_date is not null
  ),
  agg as (
    select item_number, max(d) as last_purchased_at,
           count(*) filter (where d >= current_date - interval '36 months')::int as purchases_36mo,
           round(coalesce(sum(amt) filter (where d >= current_date - interval '36 months'),0),2) as spend_36mo
    from ledger group by item_number
  ),
  derived as (
    select a.item_number, a.last_purchased_at, a.purchases_36mo, a.spend_36mo, c.cls,
           case c.cls when 'A' then 'weekly' when 'B' then 'monthly' when 'C' then 'quarterly' else 'annual' end as cad,
           case c.cls when 'A' then interval '7 days' when 'B' then interval '1 month'
                      when 'C' then interval '3 months' else interval '1 year' end as ival
    from agg a, lateral (select case
      when a.last_purchased_at >= current_date - interval '90 days'   then 'A'
      when a.last_purchased_at >= current_date - interval '12 months' then 'B'
      when a.last_purchased_at >= current_date - interval '36 months' then 'C'
      else 'D' end as cls) c
  )
  update public.abc_product_catalog c set
    last_purchased_at = d.last_purchased_at, purchases_36mo = d.purchases_36mo, spend_36mo = d.spend_36mo,
    is_tracked = (d.cls <> 'D'), review_class = d.cls, review_cadence = d.cad,
    catalog_next_review_due_at = case when c.catalog_last_reviewed_at is null then now()
                                      else c.catalog_last_reviewed_at + d.ival end,
    price_next_review_due_at = case when d.cls = 'D' then null
                                    when c.price_last_reviewed_at is null then now()
                                    else c.price_last_reviewed_at + d.ival end
  from derived d
  where d.item_number = c.item_number
    and (c.review_class is distinct from d.cls
      or c.last_purchased_at is distinct from d.last_purchased_at
      or c.purchases_36mo is distinct from d.purchases_36mo
      or c.spend_36mo is distinct from d.spend_36mo
      or c.catalog_next_review_due_at is null
      or (d.cls <> 'D' and c.price_next_review_due_at is null));
  get diagnostics catalog_touched = row_count;

  update public.abc_vendor_branches set is_active=false, last_purchased_at=null, purchases_36mo=0
   where is_active is true or last_purchased_at is not null or purchases_36mo <> 0;
  with bl as (
    select branch_number::text as bn, max(invoice_date::date) as d,
           count(*) filter (where invoice_date::date >= current_date - interval '36 months')::int as c36
    from public.abc_line_items where branch_number is not null and invoice_date is not null group by 1)
  update public.abc_vendor_branches b set
    is_active = coalesce(bl.d >= current_date - interval '36 months', false),
    last_purchased_at = bl.d, purchases_36mo = coalesce(bl.c36,0)
  from bl where bl.bn = b.branch_number;
  select count(*) into branches_active from public.abc_vendor_branches where is_active;

  update public.abc_regions set is_active=false, last_purchased_at=null
   where is_active is true or last_purchased_at is not null;
  with parties as (
    select num::text as num, invoice_date::date as d from (
      select bill_to_number as num, invoice_date from public.abc_invoices
      union all select ship_to_number, invoice_date from public.abc_invoices
      union all select sold_to_number, invoice_date from public.abc_invoices) x
    where num is not null and invoice_date is not null),
  acct as (select num, max(d) as d from parties where d >= current_date - interval '36 months' group by num)
  update public.abc_regions r set is_active=true, last_purchased_at=a.d
  from acct a where a.num in (r.account_number, r.ship_to_number, r.bill_to_number, r.sold_to_number);
  select count(*) into regions_active from public.abc_regions where is_active;

  return jsonb_build_object('ran_at', now(), 'catalog_rows_touched', catalog_touched,
                            'branches_active', branches_active, 'regions_active', regions_active);
end;
$fn$;

----------------------------------------------------------------------------------------
-- 4) Review queues + summary.
----------------------------------------------------------------------------------------
create or replace view public.v_abc_catalog_review_due as
select item_number, item_description, review_class, review_cadence, last_purchased_at,
       purchases_36mo, spend_36mo, catalog_last_reviewed_at, catalog_next_review_due_at
from public.abc_product_catalog
where review_class is not null and catalog_next_review_due_at is not null
  and catalog_next_review_due_at <= now()
order by review_class, catalog_next_review_due_at;

create or replace view public.v_abc_price_review_due as
select item_number, item_description, review_class, review_cadence, last_purchased_at,
       spend_36mo, price_last_reviewed_at, price_next_review_due_at
from public.abc_product_catalog
where is_tracked and price_next_review_due_at is not null and price_next_review_due_at <= now()
order by review_class, price_next_review_due_at;

create or replace view public.v_abc_review_summary as
select coalesce(review_class,'(dormant)') as review_class, review_cadence, count(*) as items,
       count(*) filter (where catalog_next_review_due_at <= now()) as catalog_due_now,
       count(*) filter (where is_tracked and price_next_review_due_at <= now()) as price_due_now,
       round(sum(spend_36mo))::bigint as spend_36mo
from public.abc_product_catalog where review_class is not null
group by 1,2 order by 1;
