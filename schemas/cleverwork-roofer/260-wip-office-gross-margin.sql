-- 260 — Expense Outstanding, driven by a per-office gross margin.
--
-- Chris, 2026-08-21: "pull a historical GM% per PE office and then make the
-- total expense an estimated total based on that GM% (there should be an
-- availability for the user to hard set this margin via the PE office location
-- filter bar) then subtract the expenses realized from the estimated total
-- expenses to get the remaining expenses. This is all for budgeting so it
-- should not impact any QBO or Acculynx worksurface just our Weekly AR/WIP
-- report."
--
--   est_total_costs     = contract_amount * (1 - effective_gm_pct/100)
--   expense_outstanding = est_total_costs - costs_incurred_to_date, floored at 0
--
-- Before this, est_total_costs was populated on 0 of 347 rows and Expense
-- Outstanding rendered as an em-dash for every job on the board.
--
-- Nothing here writes to QBO or AccuLynx. It reads the mirrors and populates
-- two wip_ar_master columns that already existed and were never filled.
--
-- ── Decisions worth not re-litigating ─────────────────────────────────────
--
-- * Rate basis: trailing 12 months, COMPLETED jobs only (Chris's choice).
--   "Completed" = milestone invoiced/closed WITH real billing. A job at the
--   'completed' milestone has not been invoiced, so its cost is not final.
--
-- * Computed from source history (crm_pipeline + acculynx_invoices +
--   v_qbo_job_costs), NOT from wip_ar_master, so jobs that have since left the
--   board still inform the rate.
--
-- * contract_amount ALREADY includes change orders — approved_job_value equals
--   billed_total on every job carrying a change order (MC-4: 174,000 contract
--   / 64,000 CO / 174,000 billed). Adding change_order_total would double-count.
--
-- * Thin samples are refused. Measured 2026-08-21, Georgia read 56.61% off ONE
--   completed job and the insurance program read -18.43% off five. An office
--   rate is only used when the sample clears 5 jobs AND $250k billed;
--   otherwise the company trailing-12-month rate (31.55%) applies. gm_basis
--   records which, and the board prints the sample size next to the control so
--   a rate carried by 1 job never looks like one carried by 107.
--
-- * The effective rate is clamped 0..75. A negative margin would make estimated
--   cost exceed the contract and turn Expense Outstanding into fiction.
--
-- * expense_outstanding is floored at 0. A job over its estimate has no
--   remaining budget, and a negative would silently offset other jobs in the
--   column total.
--
-- 2026-08-21 result: est_total_costs on 344 of 346 rows (the 2 without have a
-- $0 contract); total Expense Outstanding $2,382,335.52 against an estimated
-- total cost of $10,359,340. Colorado and Texas already show realized expense
-- ABOVE their estimated total — those offices are running under their
-- historical margin, which is the signal this column exists to give.

begin;

create table if not exists public.wip_office_margin (
  location        text primary key,
  gm_pct_override numeric,
  set_by          text,
  set_at          timestamptz,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wip_office_margin_pct_chk') then
    alter table public.wip_office_margin
      add constraint wip_office_margin_pct_chk
      check (gm_pct_override is null or (gm_pct_override >= -50 and gm_pct_override <= 90));
  end if;
end $$;

comment on table public.wip_office_margin is
  'Per-office gross-margin override for WIP budgeting, set from the board''s office filter bar. Persisted for everyone (Chris 2026-08-21) so two people never quote different remaining-expense figures. NULL override = use the computed trailing-12-month rate.';
comment on column public.wip_office_margin.gm_pct_override is
  'Hard-set gross margin percent, e.g. 32.5 for 32.5%. Bounded -50..90 - outside that band it is a typo, and this figure multiplies every contract in the office.';

create or replace view public.v_wip_office_margin as
with pipeline as (
  select distinct on (acculynx_job_id) *
  from crm_pipeline where acculynx_job_id is not null
  order by acculynx_job_id, (data_source = 'api_sync') desc
), inv as (
  select job_id,
         round(sum(total_price::numeric), 2) as billed,
         max(coalesce(invoice_date::date, created_date::date)) as last_invoiced
  from acculynx_invoices
  where job_id is not null and lower(coalesce(current_invoice_state, '')) <> 'void'
  group by job_id
), completed as (
  select coalesce(aj.account_key, 'unknown') as location,
         i.billed,
         coalesce(qc.costs_incurred, 0) as costs
  from pipeline p
  join acculynx_jobs aj on aj.id = p.acculynx_job_id
  join inv i            on i.job_id = p.acculynx_job_id
  left join v_qbo_job_costs qc
    on qc.job_number = nullif(trim(coalesce(p.client_job_number, '')), '')
  where lower(trim(coalesce(p.current_milestone, ''))) in ('invoiced', 'closed')
    and i.billed > 0
    and i.last_invoiced >= (current_date - interval '12 months')
), by_office as (
  select location, count(*) as sample_jobs,
         round(sum(billed), 2) as sample_billed,
         round(sum(costs), 2)  as sample_costs,
         round(100 * (sum(billed) - sum(costs)) / nullif(sum(billed), 0), 2) as gm_pct_office
  from completed group by location
), company as (
  select count(*) as sample_jobs,
         round(100 * (sum(billed) - sum(costs)) / nullif(sum(billed), 0), 2) as gm_pct_company
  from completed
), locations as (
  select distinct location from wip_ar_master where in_ar_population
  union select location from by_office
)
select l.location, o.sample_jobs, o.sample_billed, o.sample_costs, o.gm_pct_office,
       c.gm_pct_company, m.gm_pct_override, m.set_by, m.set_at, m.note,
       (o.sample_jobs >= 5 and o.sample_billed >= 250000) as office_sample_sufficient,
       case
         when m.gm_pct_override is not null then 'override'
         when o.sample_jobs >= 5 and o.sample_billed >= 250000 then 'office_trailing_12mo'
         else 'company_trailing_12mo'
       end as gm_basis,
       greatest(0, least(75, coalesce(
         m.gm_pct_override,
         case when o.sample_jobs >= 5 and o.sample_billed >= 250000 then o.gm_pct_office end,
         c.gm_pct_company,
         0
       ))) as effective_gm_pct
from locations l
left join by_office o         on o.location = l.location
left join wip_office_margin m on m.location = l.location
cross join company c;

comment on view public.v_wip_office_margin is
  'Effective gross margin per office for WIP budgeting. Precedence: manual override > office trailing-12-month rate (only when the sample clears 5 jobs AND $250k billed) > company trailing-12-month rate. Clamped 0..75. gm_basis says which applied, and sample_jobs/sample_billed let the board show the reader what the number rests on.';

commit;

-- ---------------------------------------------------------------------------
-- refresh_wip_ar_master() re-created to populate the budgeting columns.
-- Identical to the migration-258 body except for one LEFT JOIN and the three
-- est_/expense_ expressions. Reproduced in full — a migration that only
-- described its diff would leave anyone replaying the sequence with the 258
-- version, and repo/DB parity is the whole point of keeping these files.
-- ---------------------------------------------------------------------------

begin;

CREATE OR REPLACE FUNCTION public.refresh_wip_ar_master(p_asof date DEFAULT CURRENT_DATE)
 RETURNS TABLE(jobs_upserted integer, jobs_dropped integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_upserted    integer := 0;
  v_dropped     integer := 0;
  v_run_started timestamptz := clock_timestamp();
BEGIN
  WITH pipeline AS (
    SELECT DISTINCT ON (acculynx_job_id) * FROM crm_pipeline
    WHERE acculynx_job_id IS NOT NULL
    ORDER BY acculynx_job_id, (data_source = 'api_sync') DESC
  ), inv AS (
    SELECT job_id, round(sum(total_price::numeric), 2) AS billed_total,
           round(sum(balance_due::numeric), 2) AS billed_ar, count(*) AS invoice_count
    FROM acculynx_invoices
    WHERE job_id IS NOT NULL AND lower(coalesce(current_invoice_state, '')) <> 'void'
    GROUP BY job_id
  ), base AS (
    SELECT
      p.acculynx_job_id AS jid,
      coalesce(aj.account_key, 'unknown') AS location,
      coalesce(p.client_job_number, '') AS job_number,
      coalesce(p.client_name, p.job_name, '') AS client,
      coalesce(p.job_name, '') AS job_name,
      lower(trim(coalesce(p.current_milestone, ''))) AS milestone,
      coalesce(p.primary_salesperson, '(unassigned)') AS salesperson,
      coalesce(aj.job_category_name, '') AS category,
      p.milestone_date::date AS status_since,
      coalesce((f.raw -> 'worksheetSectionTotals' ->> 'changeOrderTotal')::numeric,
               f.change_order_total::numeric) AS change_order_total,
      coalesce(f.approved_job_value::numeric, p.contract_amount::numeric, 0) AS contract_amount,
      coalesce(f.balance_due::numeric, p.balance_due::numeric, 0) AS outstanding_ar,
      coalesce(i.billed_total, 0) AS billed_total,
      coalesce(i.billed_ar, 0) AS billed_ar,
      coalesce(i.invoice_count, 0) AS invoice_count,
      (coalesce(i.invoice_count, 0) > 0 OR coalesce(i.billed_total, 0) > 0) AS has_invoice,
      (coalesce(p.insurance_company, '') <> '' OR coalesce(p.insurance_claim_number, '') <> '') AS has_insurance
    FROM pipeline p
    LEFT JOIN acculynx_jobs aj          ON aj.id = p.acculynx_job_id
    LEFT JOIN acculynx_job_financials f ON f.job_id = p.acculynx_job_id
    LEFT JOIN inv i                     ON i.job_id = p.acculynx_job_id
    WHERE lower(trim(coalesce(p.current_milestone, ''))) NOT IN ('cancelled', 'dead', 'unknown')
  ), classified AS (
    SELECT b.*,
      CASE
        WHEN b.milestone IN ('unassigned_lead','assigned_lead','lead') THEN 'Lead'
        WHEN b.milestone = 'prospect' THEN 'Estimating'
        WHEN b.milestone = 'closed' AND b.outstanding_ar > 0 THEN 'Closed w/AR'
        WHEN b.milestone = 'closed' THEN 'Closed'
        WHEN b.milestone = 'invoiced' AND b.has_insurance AND b.outstanding_ar > 0
          THEN 'Approved – deposit collected → WIP'
        WHEN b.milestone = 'invoiced' THEN 'Invoiced'
        WHEN b.milestone = 'completed' THEN 'Approved – work complete → final sign-off'
        WHEN b.milestone = 'approved' AND b.has_invoice AND b.outstanding_ar > 0
          THEN 'Approved – deposit invoiced'
        WHEN b.milestone = 'approved' AND b.has_invoice
          THEN 'Approved – deposit collected → WIP'
        WHEN b.milestone = 'approved' THEN 'Contracted – awaiting deposit'
        ELSE 'Estimating'
      END AS bucket
    FROM base b
  ), scored AS (
    SELECT c.*,
      round(c.billed_total - c.billed_ar, 2)   AS collected_revenue,
      round(c.outstanding_ar - c.billed_ar, 2) AS unbilled,
      CASE
        WHEN c.contract_amount > 0 AND (c.billed_total - c.billed_ar) + 0.005 >= c.contract_amount
          THEN 'Collected in Full'
        WHEN c.bucket IN ('Lead','Estimating') THEN 'Pending'
        WHEN c.bucket IN ('Contracted – awaiting deposit','Approved – deposit invoiced',
                          'Approved – deposit collected → WIP') THEN 'Invoiced'
        WHEN c.outstanding_ar > 0 THEN 'Critical AR'
        ELSE 'Pending'
      END AS collection_status,
      CASE
        WHEN c.billed_ar > 0 AND (c.outstanding_ar - c.billed_ar) > 0 THEN 'Collect + invoice rest'
        WHEN c.billed_ar > 0 THEN 'COLLECT'
        WHEN (c.outstanding_ar - c.billed_ar) > 0 THEN 'INVOICE FIRST'
        ELSE '-'
      END AS action
    FROM classified c
  ), gated AS (
    SELECT s.*,
      (abs(s.outstanding_ar) > 0.004 OR abs(s.billed_ar) > 0.004) AS has_money,
      (s.milestone IN ('prospect','approved','completed','invoiced') AND s.contract_amount > 1) AS is_signed_contract
    FROM scored s
  ), ledger AS (
    SELECT g.*,
      CASE WHEN g.has_money AND g.is_signed_contract THEN 'both'
           WHEN g.has_money THEN 'ar_balance'
           ELSE 'signed_contract' END AS population_reason
    FROM gated g
    WHERE (g.has_money OR g.is_signed_contract)
      AND NOT (g.milestone = 'closed' AND g.outstanding_ar <= 0)
  ), up AS (
    INSERT INTO wip_ar_master AS m (
      acculynx_job_id, location, job_number, client, job_name, milestone,
      bucket, salesperson, category, collection_status, contract_amount,
      outstanding_ar, billed_total, billed_ar, unbilled, collected_revenue,
      invoice_count, change_order_total, action, acculynx_url, has_insurance,
      costs_incurred_to_date, costs_incurred_asof, status_since, days_in_status,
      est_total_costs, est_costs_source, expense_outstanding,
      population_reason, in_ar_population, computed_at)
    SELECT
      l.jid, l.location, l.job_number, l.client, l.job_name, l.milestone,
      l.bucket, l.salesperson, l.category, l.collection_status, l.contract_amount,
      l.outstanding_ar, l.billed_total, l.billed_ar, l.unbilled, l.collected_revenue,
      l.invoice_count, l.change_order_total, l.action,
      'https://my.acculynx.com/jobs/' || l.jid, l.has_insurance,
      qc.costs_incurred, CASE WHEN qc.costs_incurred IS NOT NULL THEN p_asof END,
      l.status_since,
      CASE WHEN l.status_since IS NOT NULL THEN greatest(0, p_asof - l.status_since) END,
      -- Budgeting estimate (mig 260). contract_amount already includes change
      -- orders, so adding change_order_total here would double-count.
      CASE WHEN l.contract_amount > 0 AND gm.effective_gm_pct IS NOT NULL
           THEN round(l.contract_amount * (1 - gm.effective_gm_pct / 100.0), 2) END,
      CASE WHEN l.contract_amount > 0 AND gm.effective_gm_pct IS NOT NULL
           THEN 'gm:' || gm.gm_basis || ':' || round(gm.effective_gm_pct, 2)::text END,
      -- Floored at 0: a job over its estimate has no remaining spend, and a
      -- negative would silently offset other jobs in the column total.
      CASE WHEN l.contract_amount > 0 AND gm.effective_gm_pct IS NOT NULL
           THEN greatest(0, round(l.contract_amount * (1 - gm.effective_gm_pct / 100.0)
                                  - coalesce(qc.costs_incurred, 0), 2)) END,
      l.population_reason, true, v_run_started
    FROM ledger l
    LEFT JOIN v_qbo_job_costs qc     ON qc.job_number = l.job_number AND l.job_number <> ''
    LEFT JOIN v_wip_office_margin gm ON gm.location = l.location
    ON CONFLICT (acculynx_job_id) DO UPDATE SET
      location = EXCLUDED.location, job_number = EXCLUDED.job_number,
      client = EXCLUDED.client, job_name = EXCLUDED.job_name,
      milestone = EXCLUDED.milestone, bucket = EXCLUDED.bucket,
      salesperson = EXCLUDED.salesperson, category = EXCLUDED.category,
      collection_status = EXCLUDED.collection_status,
      contract_amount = EXCLUDED.contract_amount, outstanding_ar = EXCLUDED.outstanding_ar,
      billed_total = EXCLUDED.billed_total, billed_ar = EXCLUDED.billed_ar,
      unbilled = EXCLUDED.unbilled, collected_revenue = EXCLUDED.collected_revenue,
      invoice_count = EXCLUDED.invoice_count, change_order_total = EXCLUDED.change_order_total,
      action = EXCLUDED.action, acculynx_url = EXCLUDED.acculynx_url,
      has_insurance = EXCLUDED.has_insurance,
      costs_incurred_to_date = EXCLUDED.costs_incurred_to_date,
      costs_incurred_asof = EXCLUDED.costs_incurred_asof,
      status_since = EXCLUDED.status_since, days_in_status = EXCLUDED.days_in_status,
      est_total_costs = EXCLUDED.est_total_costs,
      est_costs_source = EXCLUDED.est_costs_source,
      expense_outstanding = EXCLUDED.expense_outstanding,
      population_reason = EXCLUDED.population_reason,
      in_ar_population = true, computed_at = EXCLUDED.computed_at
    RETURNING 1
  )
  SELECT count(*) INTO v_upserted FROM up;

  UPDATE wip_ar_master m SET in_ar_population = false
  WHERE m.in_ar_population AND (m.computed_at IS NULL OR m.computed_at < v_run_started);
  GET DIAGNOSTICS v_dropped = ROW_COUNT;

  RETURN QUERY SELECT v_upserted, v_dropped;
END;
$function$;

comment on function public.refresh_wip_ar_master(date) is
  'Rebuilds wip_ar_master nightly from the AccuLynx mirror + QBO job costs. Population = AR balance OR signed contract (mig 258). est_total_costs / expense_outstanding are BUDGETING estimates derived from v_wip_office_margin (mig 260) - est_costs_source records the basis and rate. Writes nothing to QBO or AccuLynx. Meeting-editable columns are never touched.';

commit;
