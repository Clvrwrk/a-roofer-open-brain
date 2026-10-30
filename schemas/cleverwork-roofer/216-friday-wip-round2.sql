-- 216-friday-wip-round2.sql
-- Friday WIP/AR board round 2 (Chris, 2026-08-06):
--   * days_in_status + status_since — "Days in current status" chip
--     (green→red 0–365). Source: crm_pipeline.milestone_date (present on all
--     115 ledger jobs at time of writing).
--   * expected_cash_amount — meeting-editable "Estimated $" next to the
--     expected invoice/cash date; the paid-in-full remainder auto-derives as
--     balance_due − expected_cash_amount (display-side).
--   * expense_outstanding — est_total_costs − costs_incurred_to_date (NULL
--     until the worksheet-detail mirror fills est_total_costs; docs/85 gap).
-- Additive + idempotent.

ALTER TABLE wip_ar_master ADD COLUMN IF NOT EXISTS status_since date;
ALTER TABLE wip_ar_master ADD COLUMN IF NOT EXISTS days_in_status integer;
ALTER TABLE wip_ar_master ADD COLUMN IF NOT EXISTS expected_cash_amount numeric(14,2);
ALTER TABLE wip_ar_master ADD COLUMN IF NOT EXISTS expense_outstanding numeric(14,2);

CREATE OR REPLACE FUNCTION refresh_wip_ar_master(p_asof date DEFAULT current_date)
RETURNS TABLE (jobs_upserted integer, jobs_dropped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upserted    integer := 0;
  v_dropped     integer := 0;
  v_run_started timestamptz := clock_timestamp();
BEGIN
  WITH pipeline AS (
    SELECT DISTINCT ON (acculynx_job_id) *
    FROM crm_pipeline
    WHERE acculynx_job_id IS NOT NULL
    ORDER BY acculynx_job_id, (data_source = 'api_sync') DESC
  ), inv AS (
    SELECT job_id,
           round(sum(total_price::numeric), 2)  AS billed_total,
           round(sum(balance_due::numeric), 2)  AS billed_ar,
           count(*)                             AS invoice_count
    FROM acculynx_invoices
    WHERE job_id IS NOT NULL
      AND lower(coalesce(current_invoice_state, '')) <> 'void'
    GROUP BY job_id
  ), base AS (
    SELECT
      p.acculynx_job_id                                   AS jid,
      coalesce(aj.account_key, 'unknown')                 AS location,
      coalesce(p.client_job_number, '')                   AS job_number,
      coalesce(p.client_name, p.job_name, '')             AS client,
      coalesce(p.job_name, '')                            AS job_name,
      lower(trim(coalesce(p.current_milestone, '')))      AS milestone,
      coalesce(p.primary_salesperson, '(unassigned)')     AS salesperson,
      coalesce(aj.job_category_name, '')                  AS category,
      p.milestone_date::date                              AS status_since,
      coalesce(
        (f.raw -> 'worksheetSectionTotals' ->> 'changeOrderTotal')::numeric,
        f.change_order_total::numeric)                    AS change_order_total,
      coalesce(f.approved_job_value::numeric,
               p.contract_amount::numeric, 0)             AS contract_amount,
      coalesce(f.balance_due::numeric,
               p.balance_due::numeric, 0)                 AS outstanding_ar,
      coalesce(i.billed_total, 0)                         AS billed_total,
      coalesce(i.billed_ar, 0)                            AS billed_ar,
      coalesce(i.invoice_count, 0)                        AS invoice_count,
      (coalesce(i.invoice_count, 0) > 0
        OR coalesce(i.billed_total, 0) > 0)               AS has_invoice,
      (coalesce(p.insurance_company, '') <> ''
        OR coalesce(p.insurance_claim_number, '') <> '')  AS has_insurance
    FROM pipeline p
    LEFT JOIN acculynx_jobs aj          ON aj.id = p.acculynx_job_id
    LEFT JOIN acculynx_job_financials f ON f.job_id = p.acculynx_job_id
    LEFT JOIN inv i                     ON i.job_id = p.acculynx_job_id
    WHERE lower(trim(coalesce(p.current_milestone, '')))
          NOT IN ('cancelled', 'dead', 'unknown')
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
        WHEN c.contract_amount > 0
         AND (c.billed_total - c.billed_ar) + 0.005 >= c.contract_amount
          THEN 'Collected in Full'
        WHEN c.bucket IN ('Lead','Estimating') THEN 'Pending'
        WHEN c.bucket IN ('Contracted – awaiting deposit',
                          'Approved – deposit invoiced',
                          'Approved – deposit collected → WIP') THEN 'Invoiced'
        WHEN c.outstanding_ar > 0 THEN 'Critical AR'
        ELSE 'Pending'
      END AS collection_status,
      CASE
        WHEN c.billed_ar > 0 AND (c.outstanding_ar - c.billed_ar) > 0
          THEN 'Collect + invoice rest'
        WHEN c.billed_ar > 0 THEN 'COLLECT'
        WHEN (c.outstanding_ar - c.billed_ar) > 0 THEN 'INVOICE FIRST'
        ELSE '-'
      END AS action
    FROM classified c
  ), ledger AS (
    SELECT s.* FROM scored s
    WHERE (abs(s.outstanding_ar) > 0.004 OR abs(s.billed_ar) > 0.004)
      AND NOT (s.milestone = 'closed' AND s.outstanding_ar <= 0)
  ), up AS (
    INSERT INTO wip_ar_master AS m (
      acculynx_job_id, location, job_number, client, job_name, milestone,
      bucket, salesperson, category, collection_status, contract_amount,
      outstanding_ar, billed_total, billed_ar, unbilled, collected_revenue,
      invoice_count, change_order_total, action, acculynx_url, has_insurance,
      costs_incurred_to_date, costs_incurred_asof,
      status_since, days_in_status, expense_outstanding,
      in_ar_population, computed_at
    )
    SELECT
      l.jid, l.location, l.job_number, l.client, l.job_name, l.milestone,
      l.bucket, l.salesperson, l.category, l.collection_status, l.contract_amount,
      l.outstanding_ar, l.billed_total, l.billed_ar, l.unbilled, l.collected_revenue,
      l.invoice_count, l.change_order_total, l.action,
      'https://my.acculynx.com/jobs/' || l.jid, l.has_insurance,
      qc.costs_incurred, CASE WHEN qc.costs_incurred IS NOT NULL THEN p_asof END,
      l.status_since,
      CASE WHEN l.status_since IS NOT NULL
           THEN greatest(0, p_asof - l.status_since) END,
      CASE WHEN m2.est_total_costs IS NOT NULL
           THEN round(m2.est_total_costs - coalesce(qc.costs_incurred, 0), 2) END,
      true, v_run_started
    FROM ledger l
    LEFT JOIN v_qbo_job_costs qc
      ON qc.job_number = l.job_number AND l.job_number <> ''
    LEFT JOIN wip_ar_master m2 ON m2.acculynx_job_id = l.jid
    ON CONFLICT (acculynx_job_id) DO UPDATE SET
      location = EXCLUDED.location,
      job_number = EXCLUDED.job_number,
      client = EXCLUDED.client,
      job_name = EXCLUDED.job_name,
      milestone = EXCLUDED.milestone,
      bucket = EXCLUDED.bucket,
      salesperson = EXCLUDED.salesperson,
      category = EXCLUDED.category,
      collection_status = EXCLUDED.collection_status,
      contract_amount = EXCLUDED.contract_amount,
      outstanding_ar = EXCLUDED.outstanding_ar,
      billed_total = EXCLUDED.billed_total,
      billed_ar = EXCLUDED.billed_ar,
      unbilled = EXCLUDED.unbilled,
      collected_revenue = EXCLUDED.collected_revenue,
      invoice_count = EXCLUDED.invoice_count,
      change_order_total = EXCLUDED.change_order_total,
      action = EXCLUDED.action,
      acculynx_url = EXCLUDED.acculynx_url,
      has_insurance = EXCLUDED.has_insurance,
      costs_incurred_to_date = EXCLUDED.costs_incurred_to_date,
      costs_incurred_asof = EXCLUDED.costs_incurred_asof,
      status_since = EXCLUDED.status_since,
      days_in_status = EXCLUDED.days_in_status,
      expense_outstanding = EXCLUDED.expense_outstanding,
      in_ar_population = true,
      computed_at = EXCLUDED.computed_at
    RETURNING 1
  )
  SELECT count(*) INTO v_upserted FROM up;

  UPDATE wip_ar_master m
  SET in_ar_population = false
  WHERE m.in_ar_population
    AND (m.computed_at IS NULL OR m.computed_at < v_run_started);
  GET DIAGNOSTICS v_dropped = ROW_COUNT;

  RETURN QUERY SELECT v_upserted, v_dropped;
END;
$$;
