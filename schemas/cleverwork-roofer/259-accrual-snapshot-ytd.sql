-- 259 — the CPA accrual snapshot is year-to-date, not lifetime.
--
-- Chris, 2026-08-21: "CPA Accrual snapshot should be current YTD nothing older."
--
-- wip_accrual_snapshot() summed every non-void invoice and every job-cost line
-- from the beginning of time up to the cutoff, then labelled the result with
-- that cutoff. The CPA was receiving lifetime figures under a period heading.
-- After migration 258 widened the population to 347 jobs that error got
-- materially larger, which is what surfaced it.
--
--   lifetime (before):  $12,694,792.12 billed · $8,900,088.96 costs
--   YTD 2026 (after):    $5,699,551.72 billed · $3,490,948.94 costs
--
-- p_period_start overrides the window so a prior period can still be restated;
-- it defaults to 1 January of the cutoff's year. The output now carries
-- period_start, so a saved CSV always states the window it covers.
--
-- Return type changes (period_start added), so the old signature is dropped in
-- the same migration — hard rule 1 is about tables and atoms, and leaving a
-- stale overload behind is how 42725 ambiguity bugs start.

begin;

drop function if exists public.wip_accrual_snapshot(date);

create or replace function public.wip_accrual_snapshot(
  p_cutoff date default current_date,
  p_period_start date default null
)
returns table(acculynx_job_id text, job_number text, client text, location text, bucket text,
              contract_amount numeric, change_order_total numeric, est_total_costs numeric,
              billed_to_cutoff numeric, billed_ar_current numeric, costs_incurred_to_cutoff numeric,
              period_start date, cutoff date)
language sql stable security definer set search_path to 'public'
as $function$
  with bounds as (
    select coalesce(p_period_start, date_trunc('year', p_cutoff)::date) as period_start
  ), inv as (
    select i.job_id, round(sum(i.total_price::numeric), 2) as billed_to_cutoff
    from acculynx_invoices i, bounds b
    where lower(coalesce(i.current_invoice_state, '')) <> 'void'
      and coalesce(i.invoice_date::date, i.created_date::date) between b.period_start and p_cutoff
    group by i.job_id
  ), costs as (
    select cl.job_number, round(sum(cl.amount), 2) as costs_to_cutoff
    from v_qbo_job_cost_lines cl, bounds b
    where cl.job_number is not null
      and cl.txn_date between b.period_start and p_cutoff
    group by cl.job_number
  )
  select m.acculynx_job_id, m.job_number, m.client, m.location, m.bucket,
         m.contract_amount, m.change_order_total, m.est_total_costs,
         coalesce(inv.billed_to_cutoff, 0)  as billed_to_cutoff,
         m.billed_ar                        as billed_ar_current,
         coalesce(costs.costs_to_cutoff, 0) as costs_incurred_to_cutoff,
         b.period_start, p_cutoff as cutoff
  from wip_ar_master m
  cross join bounds b
  left join inv   on inv.job_id = m.acculynx_job_id
  left join costs on costs.job_number = m.job_number and m.job_number <> ''
  where m.in_ar_population
$function$;

comment on function public.wip_accrual_snapshot(date, date) is
  'CPA accrual snapshot. Billed and costs are summed over the PERIOD [period_start, cutoff], defaulting to year-to-date - not lifetime, which is what the pre-2026-08-21 version returned. p_period_start overrides for a prior-period restatement.';

commit;
