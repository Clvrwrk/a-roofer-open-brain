-- 344 — Project CenterPoint landing rows into the work tables (function form).
--
-- Additive. Same six upserts as the hand-run projection of 2026-11-13, now inside
-- public.project_centerpoint_work_tables() so a schedule can run them.
-- Reads public.cp_resources only. Does not call CenterPoint.
-- Jobs come from resource_type = productions. opportunities and services
-- are the same ids and are not inserted.
-- Does not copy street addresses, emails, invoice line items, signatures,
-- payment notes, or file binaries.
-- Leaves work_property_sources.property_id and match_status untouched
-- when a row is already present, so a reviewed match survives a refresh.
-- Each statement keeps only rows fetched within 6 hours of the newest row
-- of that collection, so a leftover that a later pull no longer returns
-- is not promoted.
--
-- New here: missing_since. CenterPoint does not report deletes on these
-- collections (deleted_at_src is empty on every row). A row that an earlier
-- pull returned and the newest pull does not is stamped missing_since, and
-- cleared if it comes back. Money reads leave missing rows out (file 345).
-- The stamp is skipped for a collection whose newest pull holds under 90% of
-- the rows already projected, so a partial pull cannot blank a dashboard.

alter table public.work_companies        add column if not exists missing_since timestamptz;
alter table public.work_jobs             add column if not exists missing_since timestamptz;
alter table public.work_property_sources add column if not exists missing_since timestamptz;
alter table public.work_invoices         add column if not exists missing_since timestamptz;
alter table public.work_payments         add column if not exists missing_since timestamptz;
alter table public.work_labor            add column if not exists missing_since timestamptz;

create or replace function public.project_centerpoint_work_tables()
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  m record;
  v_fresh bigint;
  v_have bigint;
  v_stamped bigint;
  v_out jsonb := '{}'::jsonb;
begin
  insert into public.work_companies (
    source, source_id, source_collection, name, company_type, sales_status,
    external_id, locality, region, postal_code, property_count,
    created_at_src, updated_at_src, deleted_at_src, source_fetched_at, updated_at
  )
  select
    'centerpoint',
    r.cp_id,
    'companies',
    nullif(r.attributes->>'name', ''),
    nullif(r.attributes->>'type', ''),
    nullif(r.attributes->>'salesStatus', ''),
    nullif(r.attributes->>'externalId', ''),
    nullif(r.attributes->>'locality', ''),
    nullif(r.attributes->>'region', ''),
    nullif(r.attributes->>'postalCode', ''),
    case
      when r.attributes->>'propertyCount' ~ '^[0-9]+$'
      then (r.attributes->>'propertyCount')::integer
    end,
    r.created_at_src,
    r.updated_at_src,
    r.deleted_at_src,
    r.fetched_at,
    now()
  from public.cp_resources r
  where r.resource_type = 'companies'
    and r.fetched_at >= (
      select max(r2.fetched_at) - interval '6 hours'
      from public.cp_resources r2
      where r2.resource_type = 'companies'
    )
  on conflict (source, source_id) do update set
    source_collection = excluded.source_collection,
    name = excluded.name,
    company_type = excluded.company_type,
    sales_status = excluded.sales_status,
    external_id = excluded.external_id,
    locality = excluded.locality,
    region = excluded.region,
    postal_code = excluded.postal_code,
    property_count = excluded.property_count,
    created_at_src = excluded.created_at_src,
    updated_at_src = excluded.updated_at_src,
    deleted_at_src = excluded.deleted_at_src,
    source_fetched_at = excluded.source_fetched_at,
    missing_since = null,
    updated_at = now();

  insert into public.work_property_sources (
    source, source_id, source_collection, company_source_id,
    locality, region, postal_code, squares, latitude, longitude,
    created_at_src, updated_at_src, deleted_at_src, source_fetched_at, updated_at
  )
  select
    'centerpoint',
    r.cp_id,
    'properties',
    nullif(r.attributes->>'companyId', ''),
    nullif(r.attributes->>'locality', ''),
    nullif(r.attributes->>'region', ''),
    nullif(r.attributes->>'postalCode', ''),
    case
      when r.attributes->>'squares' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'squares')::numeric(12,2)
    end,
    case
      when r.attributes->>'latitude' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'latitude')::numeric(9,6)
    end,
    case
      when r.attributes->>'longitude' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'longitude')::numeric(9,6)
    end,
    r.created_at_src,
    r.updated_at_src,
    r.deleted_at_src,
    r.fetched_at,
    now()
  from public.cp_resources r
  where r.resource_type = 'properties'
    and r.fetched_at >= (
      select max(r2.fetched_at) - interval '6 hours'
      from public.cp_resources r2
      where r2.resource_type = 'properties'
    )
  on conflict (source, source_id) do update set
    source_collection = excluded.source_collection,
    company_source_id = excluded.company_source_id,
    locality = excluded.locality,
    region = excluded.region,
    postal_code = excluded.postal_code,
    squares = excluded.squares,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    created_at_src = excluded.created_at_src,
    updated_at_src = excluded.updated_at_src,
    deleted_at_src = excluded.deleted_at_src,
    source_fetched_at = excluded.source_fetched_at,
    missing_since = null,
    updated_at = now();

  insert into public.work_jobs (
    source, source_id, source_collection, book, number, domain, status,
    display_status, work_type, opportunity_type, price, invoiced, cost,
    material_total, labor_travel_total, nte, contractor_nte,
    company_source_id, property_source_id, profile_source_id, scheduled_at,
    archived_at, created_at_src, updated_at_src, deleted_at_src,
    source_fetched_at, updated_at
  )
  select
    'centerpoint',
    r.cp_id,
    'productions',
    case lower(btrim(r.attributes->>'domain'))
      when 'service' then 'service'
      when 'sales' then 'sales'
      when 'production' then 'production'
    end,
    nullif(r.attributes->>'name', ''),
    nullif(r.attributes->>'domain', ''),
    nullif(r.attributes->>'status', ''),
    nullif(r.attributes->>'displayStatus', ''),
    nullif(r.attributes->>'workType', ''),
    nullif(r.attributes->>'opportunityType', ''),
    case when r.attributes->>'price' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'price')::numeric(14,2) end,
    case when r.attributes->>'totalInvoiced' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'totalInvoiced')::numeric(14,2) end,
    case when r.attributes->>'cost' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'cost')::numeric(14,2) end,
    case when r.attributes->>'materialTotal' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'materialTotal')::numeric(14,2) end,
    case when r.attributes->>'laborTravelTotal' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'laborTravelTotal')::numeric(14,2) end,
    case when r.attributes #>> '{options,nte}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes #>> '{options,nte}')::numeric(14,2) end,
    case when r.attributes #>> '{options,contractorNTE}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes #>> '{options,contractorNTE}')::numeric(14,2) end,
    nullif(r.attributes->>'billedCompanyId', ''),
    nullif(r.attributes->>'propertyId', ''),
    nullif(r.attributes->>'profileId', ''),
    case
      when r.attributes->>'scheduledAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then (r.attributes->>'scheduledAt')::timestamptz
    end,
    case
      when r.attributes->>'archivedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then (r.attributes->>'archivedAt')::timestamptz
    end,
    r.created_at_src,
    r.updated_at_src,
    r.deleted_at_src,
    r.fetched_at,
    now()
  from public.cp_resources r
  where r.resource_type = 'productions'
    and lower(btrim(r.attributes->>'domain')) in ('service', 'sales', 'production')
    and r.fetched_at >= (
      select max(r2.fetched_at) - interval '6 hours'
      from public.cp_resources r2
      where r2.resource_type = 'productions'
    )
  on conflict (source, source_id) do update set
    source_collection = excluded.source_collection,
    book = excluded.book,
    number = excluded.number,
    domain = excluded.domain,
    status = excluded.status,
    display_status = excluded.display_status,
    work_type = excluded.work_type,
    opportunity_type = excluded.opportunity_type,
    price = excluded.price,
    invoiced = excluded.invoiced,
    cost = excluded.cost,
    material_total = excluded.material_total,
    labor_travel_total = excluded.labor_travel_total,
    nte = excluded.nte,
    contractor_nte = excluded.contractor_nte,
    company_source_id = excluded.company_source_id,
    property_source_id = excluded.property_source_id,
    profile_source_id = excluded.profile_source_id,
    scheduled_at = excluded.scheduled_at,
    archived_at = excluded.archived_at,
    created_at_src = excluded.created_at_src,
    updated_at_src = excluded.updated_at_src,
    deleted_at_src = excluded.deleted_at_src,
    source_fetched_at = excluded.source_fetched_at,
    missing_since = null,
    updated_at = now();

  insert into public.work_invoices (
    source, source_id, source_collection, job_source, job_source_id, job_id,
    number, production_name, amount, billed_amount, subtotal, tax_amount, profit,
    cost_total, material_total, labor_travel_total, other_total,
    material_cost_total, labor_travel_cost_total, other_cost_total, job_hours,
    is_draft, is_final, invoice_date, due_date, last_sent_at,
    created_at_src, updated_at_src, deleted_at_src, source_fetched_at, updated_at
  )
  select
    'centerpoint',
    r.cp_id,
    'invoices',
    'centerpoint',
    nullif(r.attributes->>'productionId', ''),
    j.id,
    nullif(r.attributes->>'name', ''),
    nullif(r.attributes->>'productionName', ''),
    case when r.attributes->>'amount' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'amount')::numeric(14,2) end,
    case when r.attributes #>> '{options,billedAmount}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes #>> '{options,billedAmount}')::numeric(14,2) end,
    case when r.attributes #>> '{options,subtotal}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes #>> '{options,subtotal}')::numeric(14,2) end,
    case when r.attributes #>> '{options,taxAmount}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes #>> '{options,taxAmount}')::numeric(14,2) end,
    case when r.attributes->>'profit' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'profit')::numeric(14,2) end,
    case when r.attributes #>> '{options,costTotal}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes #>> '{options,costTotal}')::numeric(14,2) end,
    case when r.attributes->>'materialTotal' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'materialTotal')::numeric(14,2) end,
    case when r.attributes->>'laborTravelTotal' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'laborTravelTotal')::numeric(14,2) end,
    case when r.attributes->>'otherTotal' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'otherTotal')::numeric(14,2) end,
    case when r.attributes->>'materialCostTotal' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'materialCostTotal')::numeric(14,2) end,
    case when r.attributes->>'laborTravelCostTotal' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'laborTravelCostTotal')::numeric(14,2) end,
    case when r.attributes->>'otherCostTotal' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'otherCostTotal')::numeric(14,2) end,
    case when r.attributes->>'jobHours' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'jobHours')::numeric(12,2) end,
    case r.attributes->>'isDraft' when 'true' then true when 'false' then false end,
    case r.attributes->>'isFinal' when 'true' then true when 'false' then false end,
    case
      when coalesce(r.attributes->>'invoiceDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then left(r.attributes->>'invoiceDate', 10)::date
    end,
    case
      when coalesce(r.attributes->>'dueDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then left(r.attributes->>'dueDate', 10)::date
    end,
    case
      when r.attributes->>'lastSentAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then (r.attributes->>'lastSentAt')::timestamptz
    end,
    r.created_at_src,
    r.updated_at_src,
    r.deleted_at_src,
    r.fetched_at,
    now()
  from public.cp_resources r
  left join public.work_jobs j
    on j.source = 'centerpoint'
   and j.source_id = nullif(r.attributes->>'productionId', '')
  where r.resource_type = 'invoices'
    and r.fetched_at >= (
      select max(r2.fetched_at) - interval '6 hours'
      from public.cp_resources r2
      where r2.resource_type = 'invoices'
    )
  on conflict (source, source_id) do update set
    source_collection = excluded.source_collection,
    job_source = excluded.job_source,
    job_source_id = excluded.job_source_id,
    job_id = excluded.job_id,
    number = excluded.number,
    production_name = excluded.production_name,
    amount = excluded.amount,
    billed_amount = excluded.billed_amount,
    subtotal = excluded.subtotal,
    tax_amount = excluded.tax_amount,
    profit = excluded.profit,
    cost_total = excluded.cost_total,
    material_total = excluded.material_total,
    labor_travel_total = excluded.labor_travel_total,
    other_total = excluded.other_total,
    material_cost_total = excluded.material_cost_total,
    labor_travel_cost_total = excluded.labor_travel_cost_total,
    other_cost_total = excluded.other_cost_total,
    job_hours = excluded.job_hours,
    is_draft = excluded.is_draft,
    is_final = excluded.is_final,
    invoice_date = excluded.invoice_date,
    due_date = excluded.due_date,
    last_sent_at = excluded.last_sent_at,
    created_at_src = excluded.created_at_src,
    updated_at_src = excluded.updated_at_src,
    deleted_at_src = excluded.deleted_at_src,
    source_fetched_at = excluded.source_fetched_at,
    missing_since = null,
    updated_at = now();

  insert into public.work_payments (
    source, source_id, source_collection, invoice_source_id, invoice_id,
    amount, payment_method, received_date,
    created_at_src, updated_at_src, deleted_at_src, source_fetched_at, updated_at
  )
  select
    'centerpoint',
    r.cp_id,
    'transactions',
    nullif(r.attributes->>'invoiceId', ''),
    i.id,
    case when r.attributes->>'amount' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'amount')::numeric(14,2) end,
    nullif(r.attributes->>'paymentMethod', ''),
    case
      when coalesce(r.attributes->>'receivedDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then left(r.attributes->>'receivedDate', 10)::date
    end,
    r.created_at_src,
    r.updated_at_src,
    r.deleted_at_src,
    r.fetched_at,
    now()
  from public.cp_resources r
  left join public.work_invoices i
    on i.source = 'centerpoint'
   and i.source_id = nullif(r.attributes->>'invoiceId', '')
  where r.resource_type = 'transactions'
    and r.fetched_at >= (
      select max(r2.fetched_at) - interval '6 hours'
      from public.cp_resources r2
      where r2.resource_type = 'transactions'
    )
  on conflict (source, source_id) do update set
    source_collection = excluded.source_collection,
    invoice_source_id = excluded.invoice_source_id,
    invoice_id = excluded.invoice_id,
    amount = excluded.amount,
    payment_method = excluded.payment_method,
    received_date = excluded.received_date,
    created_at_src = excluded.created_at_src,
    updated_at_src = excluded.updated_at_src,
    deleted_at_src = excluded.deleted_at_src,
    source_fetched_at = excluded.source_fetched_at,
    missing_since = null,
    updated_at = now();

  insert into public.work_labor (
    source, source_id, source_collection, job_source, job_source_id, job_id,
    profile_source_id, labor_type, hours, rate, is_overtime, is_timekeeping,
    in_at, out_at, confirmed_at, local_in_date,
    created_at_src, updated_at_src, deleted_at_src, source_fetched_at, updated_at
  )
  select
    'centerpoint',
    r.cp_id,
    'work_time_entries',
    'centerpoint',
    nullif(r.attributes->>'productionId', ''),
    j.id,
    nullif(r.attributes->>'profileId', ''),
    nullif(r.attributes->>'type', ''),
    case when r.attributes->>'hours' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'hours')::numeric(10,2) end,
    case when r.attributes->>'rate' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.attributes->>'rate')::numeric(10,2) end,
    case r.attributes->>'isOvertime' when 'true' then true when 'false' then false end,
    case r.attributes->>'isTimekeeping' when 'true' then true when 'false' then false end,
    case when r.attributes->>'inAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then (r.attributes->>'inAt')::timestamptz end,
    case when r.attributes->>'outAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then (r.attributes->>'outAt')::timestamptz end,
    case when r.attributes->>'confirmedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then (r.attributes->>'confirmedAt')::timestamptz end,
    case
      when coalesce(r.attributes->>'localInAtDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      then left(r.attributes->>'localInAtDate', 10)::date
    end,
    r.created_at_src,
    r.updated_at_src,
    r.deleted_at_src,
    r.fetched_at,
    now()
  from public.cp_resources r
  left join public.work_jobs j
    on j.source = 'centerpoint'
   and j.source_id = nullif(r.attributes->>'productionId', '')
  where r.resource_type = 'work_time_entries'
    and r.fetched_at >= (
      select max(r2.fetched_at) - interval '6 hours'
      from public.cp_resources r2
      where r2.resource_type = 'work_time_entries'
    )
  on conflict (source, source_id) do update set
    source_collection = excluded.source_collection,
    job_source = excluded.job_source,
    job_source_id = excluded.job_source_id,
    job_id = excluded.job_id,
    profile_source_id = excluded.profile_source_id,
    labor_type = excluded.labor_type,
    hours = excluded.hours,
    rate = excluded.rate,
    is_overtime = excluded.is_overtime,
    is_timekeeping = excluded.is_timekeeping,
    in_at = excluded.in_at,
    out_at = excluded.out_at,
    confirmed_at = excluded.confirmed_at,
    local_in_date = excluded.local_in_date,
    created_at_src = excluded.created_at_src,
    updated_at_src = excluded.updated_at_src,
    deleted_at_src = excluded.deleted_at_src,
    source_fetched_at = excluded.source_fetched_at,
    missing_since = null,
    updated_at = now();

  for m in
    select * from (values
      ('work_companies', 'companies'),
      ('work_property_sources', 'properties'),
      ('work_jobs', 'productions'),
      ('work_invoices', 'invoices'),
      ('work_payments', 'transactions'),
      ('work_labor', 'work_time_entries')
    ) as t(tbl, collection)
  loop
    select count(*) into v_fresh
    from public.cp_resources r
    where r.resource_type = m.collection
      and r.fetched_at >= (
        select max(r2.fetched_at) - interval '6 hours'
        from public.cp_resources r2
        where r2.resource_type = m.collection
      );
    execute format(
      'select count(*) from public.%I where source = ''centerpoint'' and missing_since is null',
      m.tbl
    ) into v_have;

    v_stamped := 0;
    if v_have > 0 and v_fresh >= 0.9 * v_have then
      execute format(
        'update public.%I w
            set missing_since = now(), updated_at = now()
          where w.source = ''centerpoint''
            and w.missing_since is null
            and not exists (
              select 1
              from public.cp_resources r
              where r.resource_type = %L
                and r.cp_id = w.source_id
                and r.fetched_at >= (
                  select max(r2.fetched_at) - interval ''6 hours''
                  from public.cp_resources r2
                  where r2.resource_type = %L
                )
            )',
        m.tbl, m.collection, m.collection
      );
      get diagnostics v_stamped = row_count;
    end if;

    v_out := v_out || jsonb_build_object(
      m.tbl,
      jsonb_build_object('fresh', v_fresh, 'present', v_have, 'newly_missing', v_stamped)
    );
  end loop;

  return v_out;
end
$fn$;

revoke all on function public.project_centerpoint_work_tables() from public, anon, authenticated;
grant execute on function public.project_centerpoint_work_tables() to service_role;

comment on function public.project_centerpoint_work_tables() is
  'Upserts the six work_* tables from the newest CenterPoint pull in cp_resources and stamps missing_since on rows the newest pull no longer returns. Repeatable.';
