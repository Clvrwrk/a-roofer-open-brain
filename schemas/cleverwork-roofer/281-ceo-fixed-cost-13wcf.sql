-- 281 — CEO fixed-cost register + 13-week cash flow (13WCF) foundation
--
-- Workstreams 1 & 3 of the Accounting Division project (2026-08-26, Chris):
--   * fixed_cost_register — one row per overhead account, pre-classified per the
--     Fixed-Cost Register artifact draft v0.3. EVERYTHING here is basis_version 0
--     and provisional=true: the R1–R11 rulings are pending the CPA strategy
--     meeting, and nothing downstream may present these classifications as final.
--   * wcf_assumptions — the editable drivers of the 13WCF surface, with an audit
--     table mirroring wip_ar_master_updates.
--   * mv_overhead_account_month — month × expense-account actuals materialised
--     from qbo_purchases + qbo_bills line JSON (the jsonb explode is far too
--     heavy for a PostgREST-read view; playbook #9). Refreshed nightly by pg_cron.
--   * v_13wcf_receipts_week / v_13wcf_undated_pool / v_cash_position — the live
--     WIP/AR ↔ 13WCF link: receipts come straight from wip_ar_master expected
--     dates, so dating a job on the Friday board immediately reshapes the forecast.
--
-- Additive + idempotent (hard rule 1). QBO stays read-only (hard rule 13):
-- everything reads the mirror; nothing writes toward QuickBooks.

-- ---------------------------------------------------------------- register
create table if not exists fixed_cost_register (
  id bigint generated always as identity primary key,
  account_fqn text not null,
  cost_pool text not null,
  cost_behavior text not null check (cost_behavior in ('fixed','step_fixed','variable','mixed')),
  attribution text not null check (attribution in ('corporate','office_direct','inferred')),
  attribution_rule text,
  allocation_basis text not null check (allocation_basis in ('revenue_pct','compensation_pct','headcount','direct','none')),
  ttm_amount numeric,
  monthly_budget numeric,
  owner_name text,
  needs_ruling boolean not null default false,
  ruling_ref text,
  notes text,
  provisional boolean not null default true,
  basis_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_fqn, basis_version)
);

comment on table fixed_cost_register is
  'Overhead account classification register (Fixed-Cost Register artifact). basis_version 0 = pre-CPA-ruling draft; provisional rows must render with a draft banner.';

insert into fixed_cost_register
  (account_fqn, cost_pool, cost_behavior, attribution, attribution_rule, allocation_basis, ttm_amount, monthly_budget, needs_ruling, ruling_ref, notes)
values
  -- People ($966K TTM)
  ('Payroll expenses','people','mixed','corporate',null,'compensation_pct',493320,41110,true,'R1','Parent catch-all; should trend to zero once posting moves fully to sub-accounts. Current wage run-rate lives in wcf_assumptions.'),
  ('Payroll expenses:Salaries & wages','people','fixed','corporate',null,'compensation_pct',331839,27653,true,'R1','Only ~4 months of history post-recode; current run-rate ~$83K/mo differs from TTM/12.'),
  ('Taxes paid:Payroll taxes','people','fixed','corporate',null,'compensation_pct',114381,9532,false,null,'Tracks W-2 compensation.'),
  ('Team Building','people','variable','corporate',null,'headcount',6553,546,false,null,null),
  ('Employee benefits:Workers'' compensation insurance','people','mixed','corporate',null,'compensation_pct',5575,465,true,'R2','Plausible only because production is subcontracted; confirm posting path + premium-audit exposure.'),
  ('Health & Dental Insurance','people','fixed','corporate',null,'headcount',5099,425,false,null,null),
  ('Continuing education','people','variable','inferred','employee''s office','direct',5080,423,false,null,null),
  ('Uniforms','people','variable','inferred','employee''s office','direct',4431,369,false,null,null),
  -- Facilities ($245K)
  ('Rent:Company Housing','facilities','step_fixed','inferred','housing location','direct',109928,9161,true,'R3','May belong in job costs (COGS) if it houses traveling crews.'),
  ('Rent','facilities','fixed','office_direct','lease per office','direct',98183,8182,false,null,null),
  ('Utilities:Phone service','facilities','fixed','corporate','lines per employee','headcount',15492,1291,false,null,null),
  ('Utilities:Electricity','facilities','fixed','office_direct','meter','direct',6836,570,false,null,null),
  ('Repairs and Maintenance','facilities','variable','office_direct',null,'direct',5058,422,false,null,null),
  ('Rent:Storage','facilities','fixed','office_direct',null,'direct',4141,345,false,null,null),
  ('Utilities:Internet & TV services','facilities','fixed','office_direct',null,'direct',2115,176,false,null,null),
  ('Utilities:Gas (building)','facilities','fixed','office_direct',null,'direct',1610,134,false,null,null),
  ('Utilities','facilities','mixed','corporate','parent catch-all','none',1282,107,true,'R4','Retire: post to sub-accounts only.'),
  ('Utilities:Water & sewer','facilities','fixed','office_direct',null,'direct',509,42,false,null,null),
  ('Utilities:Disposal & waste fees','facilities','fixed','office_direct',null,'direct',246,21,false,null,null),
  -- Fleet ($166K)
  ('Auto/Truck Expense:Vehicle gas & fuel','fleet','variable','inferred','vehicle assignment','direct',70444,5870,false,null,null),
  ('Auto/Truck Expense:Auto repairs & maintenance','fleet','variable','inferred','vehicle assignment','direct',39600,3300,false,null,'The "tire replacement on a support van" line — office+division at entry from Jan 1.'),
  ('Auto/Truck Expense:Vehicle insurance & Registration','fleet','step_fixed','inferred','vehicle assignment','direct',32778,2732,false,null,null),
  ('Auto/Truck Expense:Parking & tolls','fleet','variable','inferred','vehicle assignment','direct',18497,1541,false,null,null),
  ('Interest Expense:Vehicle Loan Interest','fleet','fixed','inferred','vehicle assignment','direct',3464,289,true,'R5','Recommend below-the-line as financing cost.'),
  ('Auto/Truck Expense:Vehicle wash & road services','fleet','variable','inferred','vehicle assignment','direct',1056,88,false,null,null),
  ('Utilities:Vehicle GPS','fleet','fixed','inferred','vehicle assignment','direct',86,7,false,null,null),
  -- Technology ($166K)
  ('Software & apps','technology','step_fixed','corporate',null,'revenue_pct',141285,11774,true,'R6','Move to per-seat allocation once the license inventory exists.'),
  ('Dues and Subscriptions','technology','fixed','corporate',null,'revenue_pct',24975,2081,false,null,null),
  -- Marketing ($300K)
  ('Advertising & marketing','marketing','mixed','inferred','campaign geography','direct',294603,24550,true,'R7','Metro-level lead gen = office-direct; brand spend = revenue %.'),
  ('Advertising & marketing:Social media','marketing','variable','corporate',null,'revenue_pct',3628,302,false,null,null),
  ('Advertising & marketing:Referral fee','marketing','variable','inferred','job''s office','direct',1750,146,false,null,null),
  -- Insurance & risk ($159K)
  ('Business insurance','insurance_risk','fixed','corporate',null,'revenue_pct',158839,13237,true,'R8','High CV is cash-basis premium timing; accrual spreads it. Policy schedule feeds the contract fields.'),
  -- Professional services ($172K)
  ('Legal & accounting services:Legal fees','professional_services','variable','corporate',null,'revenue_pct',88634,7386,false,null,null),
  ('Outsourcing international','professional_services','fixed','corporate',null,'revenue_pct',61000,5083,true,'R9','Very stable; identify owner and correct pool.'),
  ('Legal & accounting services:Accounting fees','professional_services','fixed','corporate',null,'revenue_pct',18215,1518,false,null,null),
  ('Legal & accounting services','professional_services','mixed','corporate','parent catch-all','none',4109,342,true,'R4','Retire: post to sub-accounts only.'),
  -- Travel & meals ($136K)
  ('Travel:Hotels','travel_meals','variable','inferred','traveler''s office','direct',52334,4361,false,null,null),
  ('Meals','travel_meals','variable','inferred','purchaser''s office','direct',33796,2816,false,null,null),
  ('Travel:Airfare','travel_meals','variable','inferred','traveler''s office','direct',25897,2158,false,null,null),
  ('Travel:Vehicle rental','travel_meals','variable','inferred','traveler''s office','direct',19419,1618,false,null,null),
  ('Travel:Taxis or shared rides','travel_meals','variable','inferred','traveler''s office','direct',3039,253,false,null,null),
  ('Travel','travel_meals','variable','corporate','parent catch-all','none',1564,130,true,'R4','Retire: post to sub-accounts only.'),
  -- Office & admin ($45K)
  ('Office expenses','office_admin','variable','inferred','purchaser''s office','direct',23372,1948,false,null,null),
  ('Office supplies','office_admin','variable','inferred','purchaser''s office','direct',14827,1236,false,null,null),
  ('Shipping & postage','office_admin','variable','inferred','purchaser''s office','direct',6490,541,false,null,null),
  ('Printing & photocopying','office_admin','variable','inferred','purchaser''s office','direct',81,7,false,null,null),
  -- Compliance, tax & fees ($87K)
  ('Taxes paid','compliance_tax','mixed','corporate','parent catch-all','none',31647,2637,true,'R4','Retire: post to sub-accounts only.'),
  ('Licenses and Fees','compliance_tax','step_fixed','office_direct','issuing state','direct',16740,1395,false,null,null),
  ('De minimis Safe Harbor Sec 1.263 (a)(1)(f)','compliance_tax','mixed','inferred','asset location','direct',16415,1368,true,'R10','Asset-expensing election bucket; review contents.'),
  ('Business licenses','compliance_tax','fixed','office_direct','issuing state','direct',14219,1185,false,null,null),
  ('Small tools & equipment','compliance_tax','variable','inferred','purchaser''s office','direct',12856,1071,false,null,null),
  ('Taxes paid:Texas Sales and Use Tax','compliance_tax','variable','office_direct','Richardson TX','direct',3549,296,false,null,null),
  ('General business expenses','compliance_tax','mixed','corporate','junk drawer','none',3293,274,true,'R10','Review contents, reclassify, retire.'),
  ('Purchases','compliance_tax','mixed','corporate','junk drawer','none',1069,89,true,'R10','Review contents, reclassify, retire.'),
  ('Taxes paid:Property taxes','compliance_tax','fixed','office_direct',null,'direct',440,37,false,null,null),
  -- Financial ($18K)
  ('Merchant Fees','financial','variable','corporate','tracks receipts','revenue_pct',14687,1224,false,null,null),
  ('Bank Service Charges','financial','fixed','corporate',null,'revenue_pct',2120,177,false,null,null),
  ('Interest Expense:Credit card interest','financial','variable','corporate',null,'revenue_pct',1628,136,true,'R5','Recommend below-the-line as financing cost.'),
  ('Commissions & fees','financial','mixed','corporate','junk drawer','none',25,2,true,'R10','Review and retire.')
on conflict (account_fqn, basis_version) do nothing;

-- ---------------------------------------------------------------- 13WCF assumptions
create table if not exists wcf_assumptions (
  key text primary key,
  value numeric not null,
  label text not null,
  note text,
  min_value numeric not null default 0,
  max_value numeric not null default 100000000,
  updated_by text,
  updated_at timestamptz not null default now()
);

comment on table wcf_assumptions is
  '13-week cash flow forecast drivers, editable from /accounting/cash-flow. Values seeded from TTM actuals 2026-08-26; every edit is audit-logged to wcf_assumption_updates.';

insert into wcf_assumptions (key, value, label, note, min_value, max_value) values
  ('undated_collection_pct', 0.04, 'Undated AR collected per week (% of remaining pool)', 'Placeholder until WIP jobs carry expected dates. Fraction: 0.04 = 4%/week.', 0, 1),
  ('new_billings_weekly', 100000, 'New billings converting to cash per week', 'Conservative vs the ~$221K/wk revenue run-rate.', 0, 5000000),
  ('new_billings_ramp_week', 3, 'Week new billings start converting', 'Weeks 1–2 rely on existing AR.', 1, 13),
  ('materials_weekly', 60000, 'Materials (ABC/SRS/QXO) per week', 'COGS supplies & materials TTM $3.105M ÷ 52.', 0, 5000000),
  ('subs_weekly', 48000, 'Subcontractors per week', 'COGS subcontractors TTM $2.488M ÷ 52; lumpy with production.', 0, 5000000),
  ('commissions_weekly', 19000, 'Sales commissions (1099) per week', 'TTM $981K ÷ 52; tune to the commission calendar.', 0, 5000000),
  ('payroll_per_run', 51500, 'W-2 payroll + employer taxes per run', 'Wages ~$83K/mo + taxes ~$28.6K/mo ≈ $51.5K per biweekly run. Cadence unconfirmed (posting path moved ~May).', 0, 5000000),
  ('fixed_overhead_monthly', 127100, 'Fixed overhead per month (non-payroll pools)', 'From the Fixed-Cost Register pool totals, basis_version 0.', 0, 10000000),
  ('min_cash_floor', 250000, 'Minimum cash floor (Owner sets)', 'Any forecast week ending below this flags on both surfaces.', 0, 100000000),
  ('one_time_outflow_week1', 26526, 'Known one-time outflows, week 1', 'Past-due AP open in QBO at seeding; retune weekly.', 0, 100000000)
on conflict (key) do nothing;

create table if not exists wcf_assumption_updates (
  id bigint generated always as identity primary key,
  key text not null,
  old_value numeric,
  new_value numeric not null,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- overhead actuals matview
-- Month × expense account actuals from the QBO mirror's line JSON. The explode
-- over ~30k transactions is nightly-batch work, never a per-request view
-- (playbook #9: PostgREST inherits an 8s statement_timeout).
create materialized view if not exists mv_overhead_account_month as
with lines_x as (
  select
    (l -> 'AccountBasedExpenseLineDetail' -> 'AccountRef' ->> 'value') as acct_id,
    (l ->> 'Amount')::numeric as amt,
    date_trunc('month', z.txn_date)::date as month
  from (
    select txn_date, jsonb_array_elements(lines) as l from qbo_purchases
    union all
    select txn_date, jsonb_array_elements(lines) as l from qbo_bills
  ) z(txn_date, l)
  where z.txn_date >= (current_date - interval '25 months')
    and l ? 'AccountBasedExpenseLineDetail'
)
select
  a.fully_qualified_name as account_fqn,
  a.account_type,
  lx.month,
  round(sum(lx.amt), 2) as amount
from lines_x lx
join qbo_accounts a on a.qbo_id = lx.acct_id
where a.classification = 'Expense'
group by 1, 2, 3;

create unique index if not exists mv_overhead_account_month_pk
  on mv_overhead_account_month (account_fqn, month);

-- Nightly refresh at 07:35 UTC (after the 03:30 ET vendor sync completes).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'refresh-overhead-matview') then
      perform cron.unschedule((select jobid from cron.job where jobname = 'refresh-overhead-matview'));
    end if;
    perform cron.schedule(
      'refresh-overhead-matview',
      '35 7 * * *',
      $cron$ refresh materialized view concurrently mv_overhead_account_month; $cron$
    );
  end if;
end $$;

-- ---------------------------------------------------------------- live WIP/AR → 13WCF link
-- Dated receipts by expected week. Reads wip_ar_master directly: the moment a
-- job gets an expected_invoice_cash_date on the Friday board, it moves out of
-- the undated pool and into its week here.
create or replace view v_13wcf_receipts_week as
select
  date_trunc('week', expected_invoice_cash_date)::date as week_start,
  (expected_invoice_cash_date < current_date) as past_expected,
  coalesce(has_insurance, false) as has_insurance,
  count(*) as jobs,
  round(sum(coalesce(expected_cash_amount, outstanding_ar)), 2) as expected_cash
from wip_ar_master
where in_ar_population
  and expected_invoice_cash_date is not null
  and coalesce(expected_cash_amount, outstanding_ar) > 0
group by 1, 2, 3;

create or replace view v_13wcf_undated_pool as
select
  count(*) as jobs,
  round(sum(coalesce(expected_cash_amount, outstanding_ar)), 2) as expected_cash,
  round(sum(coalesce(expected_cash_amount, outstanding_ar)) filter (where coalesce(has_insurance, false)), 2) as insurance_cash
from wip_ar_master
where in_ar_population
  and expected_invoice_cash_date is null
  and coalesce(expected_cash_amount, outstanding_ar) > 0;

create or replace view v_cash_position as
select name as account_name, round(current_balance, 2) as balance, txn_updated_at
from qbo_accounts
where account_type = 'Bank' and active;
