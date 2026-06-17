-- 93-abc-supply-change-log.sql
-- ABC Supply bridge: change-detection + append-only archive.
--
-- Purpose
--   The ABC production sync (integrations/bridges/abc-supply/production-sync.mjs) refreshes
--   abc_product_catalog, abc_vendor_branches, and abc_regions. This migration adds:
--     1. content_hash on each table so the sync can skip rows whose data is unchanged
--        ("only update when new or changed").
--     2. a single, combined, append-only archive (abc_change_log) capturing every applied
--        insert/update with the date archived and the exact changed fields (old + new values).
--
-- Design notes
--   * One combined log (not per-table) keeps history queryable in one place and DRY.
--   * Volatile columns are excluded from change detection: abc_fetched_at, abc_last_seen_at,
--     abc_first_seen_at, content_hash, created_at, id.
--   * ABC stamps raw.lastModifiedDate on every record touch even when no mapped field changes,
--     so it is treated as a volatile sub-field of raw and ignored for change detection. The sync's
--     content_hash (RAW_VOLATILE_KEYS) and this trigger (raw_volatile) MUST stay in sync.
--   * Additive and idempotent. No destructive SQL. Atoms are never deleted; history only appends.

alter table public.abc_product_catalog add column if not exists content_hash text;
alter table public.abc_vendor_branches add column if not exists content_hash text;
alter table public.abc_regions        add column if not exists content_hash text;

create table if not exists public.abc_change_log (
  id              bigint generated always as identity primary key,
  table_name      text        not null,
  record_key      text,
  change_type     text        not null check (change_type in ('insert','update','delete')),
  changed_fields  text[]      not null default '{}',
  old_values      jsonb,
  new_values      jsonb,
  source_endpoint text,
  archived_at     timestamptz not null default now()
);
comment on table public.abc_change_log is
  'Append-only audit/history of ABC Supply table changes. One row per applied insert/update where business data actually changed. old_values/new_values hold only the changed keys. Volatile columns (abc_fetched_at, abc_last_seen_at, content_hash, abc_first_seen_at, created_at, id) and raw.lastModifiedDate are excluded from change detection.';

create index if not exists abc_change_log_table_key_idx   on public.abc_change_log (table_name, record_key);
create index if not exists abc_change_log_archived_at_idx on public.abc_change_log (archived_at desc);
create index if not exists abc_change_log_change_type_idx on public.abc_change_log (change_type);

create or replace function public.abc_log_change() returns trigger
language plpgsql
as $fn$
declare
  key_col       text := TG_ARGV[0];
  ignore_keys   constant text[] := array[
    'abc_fetched_at','abc_last_seen_at','abc_first_seen_at','content_hash','created_at','id'
  ];
  raw_volatile  constant text[] := array['lastModifiedDate'];
  old_clean     jsonb;
  new_clean     jsonb;
  rec_key       text;
  diff_fields   text[];
  old_vals      jsonb := '{}'::jsonb;
  new_vals      jsonb := '{}'::jsonb;
  k             text;
  raw_norm      jsonb;
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
    values
      (TG_TABLE_NAME, rec_key, 'insert',
       array(select jsonb_object_keys(new_clean)),
       null, new_clean, to_jsonb(NEW) ->> 'source_endpoint');
    return NEW;

  elsif TG_OP = 'UPDATE' then
    old_clean := to_jsonb(OLD);
    new_clean := to_jsonb(NEW);
    foreach k in array ignore_keys loop
      old_clean := old_clean - k;
      new_clean := new_clean - k;
    end loop;

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

    if old_clean is not distinct from new_clean then
      return NEW;
    end if;

    diff_fields := array(
      select coalesce(o.key, n.key)
      from jsonb_each(old_clean) o
      full outer join jsonb_each(new_clean) n on o.key = n.key
      where o.value is distinct from n.value
    );

    foreach k in array diff_fields loop
      old_vals := old_vals || jsonb_build_object(k, old_clean -> k);
      new_vals := new_vals || jsonb_build_object(k, new_clean -> k);
    end loop;

    rec_key := to_jsonb(NEW) ->> key_col;
    insert into public.abc_change_log
      (table_name, record_key, change_type, changed_fields, old_values, new_values, source_endpoint)
    values
      (TG_TABLE_NAME, rec_key, 'update', diff_fields, old_vals, new_vals,
       to_jsonb(NEW) ->> 'source_endpoint');
    return NEW;
  end if;

  return NEW;
end;
$fn$;

drop trigger if exists abc_catalog_change_log on public.abc_product_catalog;
create trigger abc_catalog_change_log
  after insert or update on public.abc_product_catalog
  for each row execute function public.abc_log_change('item_number');

drop trigger if exists abc_branches_change_log on public.abc_vendor_branches;
create trigger abc_branches_change_log
  after insert or update on public.abc_vendor_branches
  for each row execute function public.abc_log_change('branch_number');

drop trigger if exists abc_regions_change_log on public.abc_regions;
create trigger abc_regions_change_log
  after insert or update on public.abc_regions
  for each row execute function public.abc_log_change('region_code');
