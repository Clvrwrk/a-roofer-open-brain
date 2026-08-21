-- 258 — the Friday WIP/AR board covers every signed contract, not only jobs
--       that happen to carry an AR balance.
--
-- Chris, 2026-08-21: "expand the workspace to include all acculynx jobID's
-- that are in the Prospect, Approved, Completed, Invoiced stage with an
-- estimate value greater than $1 which signifies as signed contract".
--
-- ── What changes ──────────────────────────────────────────────────────────
--
-- refresh_wip_ar_master() built its ledger from ONE gate:
--
--     abs(outstanding_ar) > 0.004 OR abs(billed_ar) > 0.004
--
-- so a signed contract sat off the board entirely until money moved on it.
-- That is right for an AR meeting and wrong for a WIP board: work in progress
-- with costs already incurred and nothing yet invoiced is exactly what a WIP
-- board exists to show, and it is the population Tier 2 ("delivered, never
-- invoiced") is supposed to be measured against.
--
-- The gate becomes a UNION — a job earns its place by carrying money OR by
-- being a signed contract:
--
--     (abs(outstanding_ar) > 0.004 OR abs(billed_ar) > 0.004)
--  OR (milestone IN ('prospect','approved','completed','invoiced')
--      AND contract_amount > 1)
--
-- Measured on 2026-08-21: 123 jobs by the AR gate, 345 by the signed-contract
-- gate, 348 by the union — 225 newly visible.
--
-- ── Why the KPIs stay honest ──────────────────────────────────────────────
--
-- The 225 added jobs have no AR by construction, so Billed AR, Unbilled,
-- Critical AR Tier 1 and the 3-week cash map are all unchanged. What does
-- move: the ledger job count, Total job balance, and Expense Realized — which
-- is the point. Every row now records WHY it is on the board, so the two
-- populations can be told apart on the surface and in any query.
--
-- The existing exclusions are kept exactly as they were: cancelled / dead /
-- unknown milestones never enter, and a closed job with no AR still drops off.
--
-- Additive and idempotent (hard rule 1): one new nullable column, CREATE OR
-- REPLACE on the function. The meeting-editable columns (expected dates,
-- Estimated $, collected?, notes) are untouched and still survive every
-- rebuild.

begin;

alter table public.wip_ar_master
  add column if not exists population_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wip_ar_population_reason_chk') then
    alter table public.wip_ar_master
      add constraint wip_ar_population_reason_chk
      check (population_reason is null or population_reason in ('ar_balance','signed_contract','both'));
  end if;
end $$;

comment on column public.wip_ar_master.population_reason is
  'Why this job is on the board. ar_balance = it carries outstanding or billed AR. signed_contract = milestone is prospect/approved/completed/invoiced with a contract over $1 but no AR yet (migration 258). both = it qualifies either way. Lets the AR meeting filter to its own population without shrinking the WIP view.';

create index if not exists wip_ar_population_reason_idx
  on public.wip_ar_master (population_reason)
  where in_ar_population;

commit;

-- ---------------------------------------------------------------------------
-- The rebuild itself. Only two things differ from migration 215/216:
--   * the `gated` CTE, which adds the signed-contract arm, and
--   * population_reason, carried through the INSERT and the ON CONFLICT.
-- Everything else — bucketing, collection_status, action, the drop pass — is
-- byte-for-byte the prior logic.
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
    SELECT DISTINCT ON (acculynx_job_id) *
    FROM crm_pipeline WHERE acculynx_job_id IS NOT NULL
    ORDER BY acculynx_job_id, (data_source = 'api_sync') DESC
  ), inv AS (
    SELECT job_id,
           round(sum(total_price::numeric), 2) AS billed_total,
           round(sum(balance_due::numeric), 2) AS billed_ar,
           count(*)                            AS invoice_count
    FROM acculynx_invoices
    WHERE job_id IS NOT NULL AND lower(coalesce(current_invoice_state, '')) <> 'void'
    GROUP BY job_id
  ), base AS (
    SELECT
      p.acculynx_job_id                               AS jid,
      coalesce(aj.account_key, 'unknown')             AS location,
      coalesce(p.client_job_number, '')               AS job_number,
      coalesce(p.client_name, p.job_name, '')         AS client,
      coalesce(p.job_name, '')                        AS job_name,
      lower(trim(coalesce(p.current_milestone, '')))  AS milestone,
      coalesce(p.primary_salesperson, '(unassigned)') AS salesperson,
      coalesce(aj.job_category_name, '')              AS category,
      p.milestone_date::date                          AS status_since,
      coalesce((f.raw -> 'worksheetSectionTotals' ->> 'changeOrderTotal')::numeric,
               f.change_order_total::numeric)         AS change_order_total,
      coalesce(f.approved_job_value::numeric, p.contract_amount::numeric, 0) AS contract_amount,
      coalesce(f.balance_due::numeric, p.balance_due::numeric, 0)            AS outstanding_ar,
      coalesce(i.billed_total, 0)                     AS billed_total,
      coalesce(i.billed_ar, 0)                        AS billed_ar,
      coalesce(i.invoice_count, 0)                    AS invoice_count,
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
    -- A job earns its place two ways (migration 258). Money on it, or a
    -- signed contract: a milestone past estimating with a contract over $1.
    SELECT s.*,
      (abs(s.outstanding_ar) > 0.004 OR abs(s.billed_ar) > 0.004) AS has_money,
      (s.milestone IN ('prospect','approved','completed','invoiced')
        AND s.contract_amount > 1)                                AS is_signed_contract
    FROM scored s
  ), ledger AS (
    SELECT g.*,
      CASE WHEN g.has_money AND g.is_signed_contract THEN 'both'
           WHEN g.has_money                          THEN 'ar_balance'
           ELSE                                           'signed_contract' END AS population_reason
    FROM gated g
    WHERE (g.has_money OR g.is_signed_contract)
      -- unchanged: a closed job with nothing outstanding leaves the board.
      AND NOT (g.milestone = 'closed' AND g.outstanding_ar <= 0)
  ), up AS (
    INSERT INTO wip_ar_master AS m (
      acculynx_job_id, location, job_number, client, job_name, milestone,
      bucket, salesperson, category, collection_status, contract_amount,
      outstanding_ar, billed_total, billed_ar, unbilled, collected_revenue,
      invoice_count, change_order_total, action, acculynx_url, has_insurance,
      costs_incurred_to_date, costs_incurred_asof, status_since, days_in_status,
      expense_outstanding, population_reason, in_ar_population, computed_at)
    SELECT
      l.jid, l.location, l.job_number, l.client, l.job_name, l.milestone,
      l.bucket, l.salesperson, l.category, l.collection_status, l.contract_amount,
      l.outstanding_ar, l.billed_total, l.billed_ar, l.unbilled, l.collected_revenue,
      l.invoice_count, l.change_order_total, l.action,
      'https://my.acculynx.com/jobs/' || l.jid, l.has_insurance,
      qc.costs_incurred, CASE WHEN qc.costs_incurred IS NOT NULL THEN p_asof END,
      l.status_since,
      CASE WHEN l.status_since IS NOT NULL THEN greatest(0, p_asof - l.status_since) END,
      CASE WHEN m2.est_total_costs IS NOT NULL
           THEN round(m2.est_total_costs - coalesce(qc.costs_incurred, 0), 2) END,
      l.population_reason, true, v_run_started
    FROM ledger l
    LEFT JOIN v_qbo_job_costs qc ON qc.job_number = l.job_number AND l.job_number <> ''
    LEFT JOIN wip_ar_master m2   ON m2.acculynx_job_id = l.jid
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
      expense_outstanding = EXCLUDED.expense_outstanding,
      population_reason = EXCLUDED.population_reason,
      in_ar_population = true, computed_at = EXCLUDED.computed_at
    RETURNING 1
  )
  SELECT count(*) INTO v_upserted FROM up;

  UPDATE wip_ar_master m
  SET in_ar_population = false
  WHERE m.in_ar_population AND (m.computed_at IS NULL OR m.computed_at < v_run_started);
  GET DIAGNOSTICS v_dropped = ROW_COUNT;

  RETURN QUERY SELECT v_upserted, v_dropped;
END;
$function$;

comment on function public.refresh_wip_ar_master(date) is
  'Rebuilds wip_ar_master nightly (pg_cron wip-ar-master-nightly) from the AccuLynx mirror + QBO job costs. Population = jobs carrying AR OR signed contracts (prospect/approved/completed/invoiced with contract > $1) - migration 258; population_reason records which. Meeting-editable columns are never touched.';

commit;

-- Applied 2026-08-21: 347 jobs upserted, 0 dropped.
--   both             120 jobs   billed AR $1,000,293.73   expense $2,549,959.51
--   ar_balance         2 jobs   billed AR    $87,525.03   expense          none
--   signed_contract  225 jobs   billed AR         $0.00   expense $6,350,129.45
-- Board Expense Realized: $875,957.04 -> $8,900,088.96 (migrations 257 + 258).
-- Billed AR, Unbilled and the 3-week cash map are unchanged, as designed.
