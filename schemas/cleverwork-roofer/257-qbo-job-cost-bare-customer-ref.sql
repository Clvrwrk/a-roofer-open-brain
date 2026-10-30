-- 257 — Expense Realized was missing $16.2M: QBO job costs keyed off a colon
--       that most CustomerRef names do not have.
--
-- Reported by Chris, 2026-08-21: "we are seeing a large discrepancy" in the
-- Expenses Realized column of the Friday WIP/AR board.
--
-- ── What was actually wrong ────────────────────────────────────────────────
--
-- The nightly machinery is healthy. All of it verified on 2026-08-21:
--   * pg_cron `wip-ar-master-nightly` (job 11) — 8/8 succeeded, last 10:45 UTC
--   * pg_cron `acculynx-hourly-sync` (job 5) — 192/192 succeeded
--   * QBO mirror on the Hetzner host — runs DAILY at 01:00 UTC despite the
--     historical `mode: thursday` run_key; 8/8 `status: ok`, 25,885 purchases
--     and 3,135 bills current as of 2026-08-21 01:07 UTC.
--
-- The loss was in this view. v_qbo_job_cost_lines derived the job number as
--
--     substring(customer_ref_name, ':([^:]+)$')
--
-- which REQUIRES a colon. QBO's Customer:Job convention produces
-- 'Elaine Suderman:KS-208' — but the great majority of job-tagged expense
-- lines carry the bare job number as the CustomerRef name, with no parent and
-- no colon. Those returned NULL and were dropped by the view's own
-- `WHERE job_number IS NOT NULL` in v_qbo_job_costs.
--
-- Measured before the fix (17,489 job-cost lines, $24,378,521.74 total):
--
--   shape                    lines     amount          matches AccuLynx?
--   has_colon                3,421     $8,028,640.16   815 of 847 job numbers
--   bare 'XX-000'           10,362    $12,448,277.28   815 of 815  — ALL
--   bare numeric '41'        3,451     $3,745,315.52   183 of 183  — ALL
--   other, no colon            255       $156,288.78     0 of 135  — none
--
-- Every bare name shaped like a job number matched a real
-- crm_pipeline.client_job_number — 998 of 998, zero misses. Every 'other'
-- name ('EECU Loan' and friends) matched none. So the two bare shapes are
-- safe to accept and the remainder is correctly excluded.
--
-- Effect: $16,193,592.80 of job-tagged cost re-attaches, and 32 ledger jobs
-- that showed a blank Expense Realized — including MC-59 Texas Motor Speedway
-- ($45,511.99) and GA-42 Paine College ($34,106.50) — get their costs back.
--
-- ── Deliberately NOT changed ──────────────────────────────────────────────
--
-- The colon branch keeps its exact current behaviour. 32 colon-derived job
-- numbers ($53,259.00) match no AccuLynx job; they attach to nothing
-- downstream either way, and narrowing that branch would risk dropping cost
-- that is currently counted. The bug is the missing bare-name branch, so that
-- is the only thing this migration adds.
--
-- Additive and idempotent (hard rule 1): CREATE OR REPLACE only, no data
-- touched. v_qbo_job_costs and refresh_wip_ar_master read through unchanged.

begin;

create or replace view public.v_qbo_job_cost_lines as
 WITH bill_lines AS (
         SELECT 'bill'::text AS source,
            b.qbo_id AS qbo_txn_id,
            b.txn_date,
            b.vendor_name,
            1::numeric AS sign,
            l.value AS line
           FROM qbo_bills b
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.lines, b.raw -> 'Line'::text)) l(value)
        ), purchase_lines AS (
         SELECT 'purchase'::text AS source,
            p.qbo_id AS qbo_txn_id,
            p.txn_date,
            p.entity_name AS vendor_name,
                CASE
                    WHEN COALESCE(p.credit, false) THEN '-1'::integer
                    ELSE 1
                END::numeric AS sign,
            l.value AS line
           FROM qbo_purchases p
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.lines, p.raw -> 'Line'::text)) l(value)
        ), all_lines AS (
         SELECT * FROM bill_lines
        UNION ALL
         SELECT * FROM purchase_lines
        ), named AS (
         SELECT source, qbo_txn_id, txn_date, vendor_name, sign, line,
            COALESCE(
              ((line -> 'AccountBasedExpenseLineDetail') -> 'CustomerRef') ->> 'name',
              ((line -> 'ItemBasedExpenseLineDetail')    -> 'CustomerRef') ->> 'name'
            ) AS customer_ref_name
           FROM all_lines
        )
 SELECT source,
    qbo_txn_id,
    txn_date,
    vendor_name,
    customer_ref_name,
    -- Customer:Job -> the job is the last colon segment. No colon -> the whole
    -- name IS the job number when it is shaped like one. Both PE job-number
    -- shapes are represented: prefixed (KS-208, MC-59, GA-42, INS-11) and the
    -- legacy bare numeric (41, 81, 185). Anything else stays NULL, which is
    -- what keeps 'EECU Loan' out of job costing.
    CASE
      WHEN customer_ref_name LIKE '%:%'
        THEN NULLIF(TRIM(BOTH FROM "substring"(customer_ref_name, ':([^:]+)$')), '')
      WHEN customer_ref_name ~ '^[A-Z]{2,4}-[0-9]+$' OR customer_ref_name ~ '^[0-9]+$'
        THEN TRIM(BOTH FROM customer_ref_name)
      ELSE NULL
    END AS job_number,
    COALESCE(
      ((line -> 'AccountBasedExpenseLineDetail') -> 'AccountRef') ->> 'name',
      ((line -> 'ItemBasedExpenseLineDetail')    -> 'ItemRef')    ->> 'name'
    ) AS account_or_item,
    sign * ((line ->> 'Amount')::numeric) AS amount
   FROM named
  WHERE customer_ref_name IS NOT NULL
    AND (line ->> 'Amount') IS NOT NULL;

comment on view public.v_qbo_job_cost_lines is
  'QBO bill + purchase expense lines carrying a CustomerRef, flattened for job costing. job_number accepts BOTH the Customer:Job colon form and a bare CustomerRef name shaped like a PE job number - the bare form is the majority (13,813 of 17,489 lines) and was silently dropped until migration 257.';

-- ---------------------------------------------------------------------------
-- Guard rail: make this class of silent loss visible instead of invisible.
-- A CustomerRef that names a real AccuLynx job but yields no job_number is a
-- bug in the extraction, not a data problem. This view should stay empty.
-- ---------------------------------------------------------------------------

create or replace view public.v_qbo_job_cost_unattributed as
select l.customer_ref_name,
       count(*)                       as cost_lines,
       round(sum(l.amount), 2)        as amount,
       min(l.txn_date)                as first_txn,
       max(l.txn_date)                as last_txn,
       exists (
         select 1 from crm_pipeline p
         where trim(coalesce(p.client_job_number,'')) = trim(l.customer_ref_name)
       )                              as names_a_real_acculynx_job
from v_qbo_job_cost_lines l
where l.job_number is null
group by l.customer_ref_name
order by amount desc;

comment on view public.v_qbo_job_cost_unattributed is
  'QBO expense lines that carry a CustomerRef but produce no job number. Rows with names_a_real_acculynx_job = true are an extraction BUG - job cost is being dropped on the floor, which is exactly how $16.2M went missing from Expense Realized before migration 257. Rows with false are ordinary non-job customers and are expected.';

commit;
