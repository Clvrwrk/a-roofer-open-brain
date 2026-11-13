-- 345 — Work-table read layer: test flag, property links, job money, hours, QuickBooks check
--
-- Additive and idempotent. Builds on 343 (tables) and 344 (projection).
--
-- Why this file exists (review of 2026-11-13):
--   * $533,400.18 of the $1,480,257.48 invoice total sits on a CenterPoint
--     support test company: one job, two draft invoices. Screens must not count it.
--   * 848 time rows are day clock-ins with no job. They overlap job time on
--     803 of 839 worker-days, so clock hours and job hours must never be summed.
--   * QuickBooks already carries these invoices (doc_number = job number), so the
--     work tables add job detail to receivables, not new company revenue.
--
-- Rule for every surface: read public.mv_work_job_money (and the two views here),
-- never the raw work_* tables.

-- ── 1. Test companies ───────────────────────────────────────────────────────────
-- The projection does not write is_test, so the flag survives every refresh.
alter table public.work_companies
  add column if not exists is_test boolean not null default false;

update public.work_companies
   set is_test = true, updated_at = now()
 where source = 'centerpoint'
   and name = 'CP Support Test Company'
   and not is_test;

comment on column public.work_companies.is_test is
  'True for a source system''s own test or demo company. Its jobs, invoices and payments are left out of mv_work_job_money. Set by hand; the projection never changes it.';

-- ── 2. Property link bookkeeping ────────────────────────────────────────────────
-- Same shape as acculynx_jobs.property_link_* (file 305). A suggestion is a
-- candidate a person has not confirmed; it never fills property_id.
alter table public.work_property_sources
  add column if not exists property_link_method     text,
  add column if not exists property_link_confidence numeric(3,2),
  add column if not exists property_linked_at       timestamptz,
  add column if not exists suggested_property_id    uuid references public.properties (id) on delete set null,
  add column if not exists suggestion_method        text,
  add column if not exists suggestion_confidence    numeric(3,2);

-- Links a source property to the property spine.
--   address_zip     the source street + ZIP equals exactly one active property's
--                   address_key (street and ZIP parts). Confidence 0.95, the same
--                   bar as the AccuLynx and CompanyCam matchers. Fills property_id.
--   pin_within_30m  exactly one active property within 30 m of the source pin.
--                   Confidence 0.70. Recorded as a suggestion only.
-- Rows a person matched or rejected are never touched. The street address is read
-- from cp_resources at run time and is not stored on the work table.
create or replace function public.link_work_property_sources()
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_addr int := 0;
  v_pin int := 0;
  v_open int;
begin
  with k as (
    select w.id,
           normalize_street_address(nullif(r.attributes->>'streetAddress', '')) as street_key,
           nullif(left(regexp_replace(coalesce(r.attributes->>'postalCode', ''), '[^0-9]', '', 'g'), 5), '') as zip5
    from work_property_sources w
    join cp_resources r
      on r.resource_type = 'properties'
     and r.cp_id = w.source_id
    where w.source = 'centerpoint'
      and w.property_id is null
      and w.match_status = 'unmatched'
      and w.missing_since is null
  ), cand as (
    select k.id, min(pr.id::text)::uuid as property_id, count(distinct pr.id) as n
    from k
    join properties pr
      on pr.status = 'active'
     and split_part(pr.address_key, '|', 1) = k.street_key
     and split_part(pr.address_key, '|', 3) = k.zip5
    where k.street_key is not null
      and k.zip5 is not null
    group by k.id
  )
  update work_property_sources w
     set property_id = c.property_id,
         match_status = 'matched',
         property_link_method = 'address_zip',
         property_link_confidence = 0.95,
         property_linked_at = now(),
         suggested_property_id = null,
         suggestion_method = null,
         suggestion_confidence = null,
         updated_at = now()
    from cand c
   where w.id = c.id
     and c.n = 1;
  get diagnostics v_addr = row_count;

  with cand as (
    select w.id, min(pr.id::text)::uuid as property_id, count(*) as n
    from work_property_sources w
    join properties pr
      on pr.status = 'active'
     and pr.geom is not null
     and ST_DWithin(
           pr.geom,
           ST_SetSRID(ST_MakePoint(w.longitude::float8, w.latitude::float8), 4326)::geography,
           30
         )
    where w.property_id is null
      and w.match_status = 'unmatched'
      and w.missing_since is null
      and w.latitude is not null
      and w.longitude is not null
      and not (w.latitude = 0 and w.longitude = 0)
    group by w.id
  )
  update work_property_sources w
     set suggested_property_id = c.property_id,
         suggestion_method = 'pin_within_30m',
         suggestion_confidence = 0.70,
         updated_at = now()
    from cand c
   where w.id = c.id
     and c.n = 1
     and w.suggested_property_id is distinct from c.property_id;
  get diagnostics v_pin = row_count;

  select count(*) into v_open
  from work_property_sources
  where property_id is null
    and match_status = 'unmatched'
    and missing_since is null;

  return jsonb_build_object(
    'linked_by_address', v_addr,
    'suggested_by_pin', v_pin,
    'still_unmatched', v_open
  );
end
$fn$;

revoke all on function public.link_work_property_sources() from public, anon, authenticated;
grant execute on function public.link_work_property_sources() to service_role;

-- ── 3. Job money ────────────────────────────────────────────────────────────────
-- One row per job, any source. Left out: jobs of a test company, jobs the source
-- deleted, rows the newest pull no longer returns. Draft invoices are counted
-- apart (draft_amount) and never in billed. Payments count only against a
-- non-draft invoice. Hours are job time only; clock-ins are in v_work_labor_day.
-- No due date comes from CenterPoint, so age receivables from
-- oldest_open_invoice_date.
create materialized view if not exists public.mv_work_job_money as
with live_invoices as (
  select i.*
  from public.work_invoices i
  where i.deleted_at_src is null
    and i.missing_since is null
    and i.job_id is not null
), paid as (
  select p.invoice_id,
         sum(p.amount)        as paid,
         count(*)             as payment_count,
         max(p.received_date) as last_payment_date
  from public.work_payments p
  where p.deleted_at_src is null
    and p.missing_since is null
    and p.invoice_id is not null
  group by p.invoice_id
), inv as (
  select i.job_id,
         count(*) filter (where not coalesce(i.is_draft, false))                 as invoice_count,
         count(*) filter (where coalesce(i.is_draft, false))                     as draft_count,
         coalesce(sum(i.amount) filter (where not coalesce(i.is_draft, false)), 0)      as billed,
         coalesce(sum(i.amount) filter (where coalesce(i.is_draft, false)), 0)          as draft_amount,
         coalesce(sum(i.tax_amount) filter (where not coalesce(i.is_draft, false)), 0)  as tax_billed,
         coalesce(sum(i.cost_total) filter (where not coalesce(i.is_draft, false)), 0)  as invoice_cost,
         coalesce(sum(i.profit) filter (where not coalesce(i.is_draft, false)), 0)      as invoice_profit,
         coalesce(sum(pd.paid) filter (where not coalesce(i.is_draft, false)), 0)       as collected,
         coalesce(sum(pd.payment_count) filter (where not coalesce(i.is_draft, false)), 0)::int as payment_count,
         max(pd.last_payment_date) filter (where not coalesce(i.is_draft, false))       as last_payment_date,
         min(i.invoice_date) filter (where not coalesce(i.is_draft, false))             as first_invoice_date,
         max(i.invoice_date) filter (where not coalesce(i.is_draft, false))             as last_invoice_date,
         count(*) filter (
           where not coalesce(i.is_draft, false)
             and coalesce(i.amount, 0) - coalesce(pd.paid, 0) > 0.005
         )                                                                              as open_invoice_count,
         min(i.invoice_date) filter (
           where not coalesce(i.is_draft, false)
             and coalesce(i.amount, 0) - coalesce(pd.paid, 0) > 0.005
         )                                                                              as oldest_open_invoice_date
  from live_invoices i
  left join paid pd on pd.invoice_id = i.id
  group by i.job_id
), lab as (
  select l.job_id,
         coalesce(sum(l.hours), 0)                                          as labor_hours,
         coalesce(sum(l.hours) filter (where l.labor_type = 'Travel'), 0)   as travel_hours,
         coalesce(sum(l.hours * l.rate), 0)::numeric(14,2)                  as labor_cost,
         count(distinct l.profile_source_id)                                as worker_count,
         max(l.local_in_date)                                               as last_labor_date
  from public.work_labor l
  where l.job_id is not null
    and not coalesce(l.is_timekeeping, false)
    and l.deleted_at_src is null
    and l.missing_since is null
  group by l.job_id
)
select
  j.id                                   as job_id,
  j.source,
  j.source_id,
  j.book,
  j.number,
  j.status,
  j.display_status,
  j.work_type,
  j.opportunity_type,
  j.company_source_id,
  c.name                                 as company_name,
  c.company_type,
  j.property_source_id,
  ps.property_id,
  ps.locality,
  ps.region,
  ps.postal_code,
  j.price,
  j.nte,
  j.scheduled_at,
  j.archived_at,
  j.created_at_src,
  j.updated_at_src,
  coalesce(inv.invoice_count, 0)         as invoice_count,
  coalesce(inv.draft_count, 0)           as draft_count,
  coalesce(inv.billed, 0)                as billed,
  coalesce(inv.draft_amount, 0)          as draft_amount,
  coalesce(inv.tax_billed, 0)            as tax_billed,
  coalesce(inv.collected, 0)             as collected,
  coalesce(inv.billed, 0) - coalesce(inv.collected, 0) as outstanding,
  coalesce(inv.payment_count, 0)         as payment_count,
  inv.last_payment_date,
  inv.first_invoice_date,
  inv.last_invoice_date,
  coalesce(inv.open_invoice_count, 0)    as open_invoice_count,
  inv.oldest_open_invoice_date,
  coalesce(inv.invoice_cost, 0)          as invoice_cost,
  coalesce(inv.invoice_profit, 0)        as invoice_profit,
  coalesce(lab.labor_hours, 0)           as labor_hours,
  coalesce(lab.travel_hours, 0)          as travel_hours,
  coalesce(lab.labor_cost, 0)            as labor_cost,
  coalesce(lab.worker_count, 0)          as worker_count,
  lab.last_labor_date,
  j.source_fetched_at,
  now()                                  as computed_at
from public.work_jobs j
left join public.work_companies c
  on c.source = j.source
 and c.source_id = j.company_source_id
left join public.work_property_sources ps
  on ps.source = j.source
 and ps.source_id = j.property_source_id
left join inv on inv.job_id = j.id
left join lab on lab.job_id = j.id
where j.deleted_at_src is null
  and j.missing_since is null
  and not coalesce(c.is_test, false)
with no data;

create unique index if not exists mv_work_job_money_source_id_uidx
  on public.mv_work_job_money (source, source_id);
create unique index if not exists mv_work_job_money_job_id_uidx
  on public.mv_work_job_money (job_id);
create index if not exists mv_work_job_money_book_status_idx
  on public.mv_work_job_money (source, book, display_status);
create index if not exists mv_work_job_money_number_idx
  on public.mv_work_job_money (number);
create index if not exists mv_work_job_money_open_idx
  on public.mv_work_job_money (oldest_open_invoice_date)
  where outstanding > 0.005;
create index if not exists mv_work_job_money_property_idx
  on public.mv_work_job_money (property_id)
  where property_id is not null;

revoke all on public.mv_work_job_money from public, anon, authenticated;
grant select on public.mv_work_job_money to service_role;

comment on materialized view public.mv_work_job_money is
  'One row per work_jobs job with billed, collected, outstanding, invoice cost and job hours. Leaves out test-company jobs, source-deleted rows and rows the newest pull no longer returns; drafts are counted apart. Refreshed by refresh_centerpoint_work(). Surfaces read this, never the raw work_* tables.';

-- ── 4. Hours per worker-day ─────────────────────────────────────────────────────
-- Clock time and job time for the same person and day, side by side. They are
-- two measures of the same day, so add neither to the other.
create or replace view public.v_work_labor_day
with (security_invoker = true) as
select
  l.source,
  l.profile_source_id,
  l.local_in_date,
  coalesce(sum(l.hours) filter (where coalesce(l.is_timekeeping, false)), 0)      as clock_hours,
  coalesce(sum(l.hours) filter (where not coalesce(l.is_timekeeping, false)), 0)  as job_hours,
  coalesce(sum(l.hours) filter (
    where not coalesce(l.is_timekeeping, false) and l.labor_type = 'Travel'), 0)  as travel_hours,
  greatest(
    coalesce(sum(l.hours) filter (where coalesce(l.is_timekeeping, false)), 0)
    - coalesce(sum(l.hours) filter (where not coalesce(l.is_timekeeping, false)), 0),
    0
  )                                                                               as clock_hours_not_on_a_job,
  count(distinct l.job_id) filter (where not coalesce(l.is_timekeeping, false))   as job_count
from public.work_labor l
where l.deleted_at_src is null
  and l.missing_since is null
group by l.source, l.profile_source_id, l.local_in_date;

revoke all on public.v_work_labor_day from public, anon, authenticated;
grant select on public.v_work_labor_day to service_role;

-- ── 5. CenterPoint against QuickBooks ───────────────────────────────────────────
-- QuickBooks invoices for this work use the CenterPoint job number as doc_number
-- (513 of 514 on 2026-11-13). One row per job number that either side knows.
-- Read-only check: nothing here writes to QuickBooks (hard rule 13).
create or replace view public.v_work_invoice_qbo_recon
with (security_invoker = true) as
with cp as (
  select m.number,
         count(*)             as cp_job_count,
         sum(m.billed)        as cp_billed,
         sum(m.collected)     as cp_collected,
         sum(m.outstanding)   as cp_outstanding,
         sum(m.draft_amount)  as cp_draft_amount
  from public.mv_work_job_money m
  where m.source = 'centerpoint'
    and m.number is not null
    and (m.billed <> 0 or m.draft_amount <> 0 or m.collected <> 0)
  group by m.number
), qb as (
  select q.doc_number                                   as number,
         count(*)                                       as qbo_invoice_count,
         sum(q.total_amt)                               as qbo_billed,
         sum(q.balance)                                 as qbo_outstanding,
         sum(q.total_amt) - sum(q.balance)              as qbo_collected,
         max(q.txn_date)                                as qbo_last_invoice_date
  from public.qbo_invoices q
  where q.doc_number ~ '^CP-'
  group by q.doc_number
)
select
  coalesce(cp.number, qb.number)        as number,
  cp.cp_job_count,
  cp.cp_billed,
  cp.cp_collected,
  cp.cp_outstanding,
  cp.cp_draft_amount,
  qb.qbo_invoice_count,
  qb.qbo_billed,
  qb.qbo_collected,
  qb.qbo_outstanding,
  qb.qbo_last_invoice_date,
  coalesce(cp.cp_billed, 0) - coalesce(qb.qbo_billed, 0)           as billed_difference,
  coalesce(cp.cp_collected, 0) - coalesce(qb.qbo_collected, 0)     as collected_difference,
  case
    when qb.number is null then 'centerpoint_only'
    when cp.number is null then 'quickbooks_only'
    when abs(coalesce(cp.cp_billed, 0) - coalesce(qb.qbo_billed, 0)) > 0.01 then 'billed_differs'
    when abs(coalesce(cp.cp_collected, 0) - coalesce(qb.qbo_collected, 0)) > 0.01 then 'collected_differs'
    else 'match'
  end                                    as recon_status
from cp
full outer join qb on qb.number = cp.number;

revoke all on public.v_work_invoice_qbo_recon from public, anon, authenticated;
grant select on public.v_work_invoice_qbo_recon to service_role;

-- ── 6. One refresh, on a schedule ───────────────────────────────────────────────
-- Projection, then property links, then the money view. Cheap and repeatable, so
-- it runs hourly; it only changes anything after a new CenterPoint pull lands.
create or replace function public.refresh_centerpoint_work()
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_projection jsonb;
  v_links jsonb;
begin
  v_projection := public.project_centerpoint_work_tables();
  v_links := public.link_work_property_sources();
  if exists (select 1 from pg_matviews where schemaname = 'public' and matviewname = 'mv_work_job_money' and ispopulated) then
    refresh materialized view concurrently public.mv_work_job_money;
  else
    refresh materialized view public.mv_work_job_money;
  end if;
  return jsonb_build_object(
    'projection', v_projection,
    'property_links', v_links,
    'jobs_in_money_view', (select count(*) from public.mv_work_job_money),
    'refreshed_at', now()
  );
end
$fn$;

revoke all on function public.refresh_centerpoint_work() from public, anon, authenticated;
grant execute on function public.refresh_centerpoint_work() to service_role;

select cron.schedule('centerpoint-work-refresh', '10 * * * *', 'select public.refresh_centerpoint_work()');

insert into public.integration_sync_expectations (component_key, kind, ref, max_age_s)
values ('cron:centerpoint-work-refresh', 'pg_cron', 'centerpoint-work-refresh', 7200)
on conflict do nothing;
