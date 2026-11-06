-- 343 — Expense Realized counts only lines posted to an Expense-classified QBO account
--
-- Reported 2026-11-06 (Chris): KS-234 showed Expense Realized $21,281.32 on the
-- Friday WIP/AR board while AccuLynx showed $9,479.86.
--
-- Cause: v_qbo_job_cost_lines summed EVERY bill/purchase line that carried a
-- CustomerRef, whatever account it was posted to. On KS-234 one line was
-- purchase 40326 (2026-10-14, $11,801.46, memo "Returned check-Need ck endorsed
-- by bank"): the client's check bounced and the bank debit was booked to
-- Accounts Receivable to reopen the receivable. That is customer money, not a
-- job cost. Without it the job is $9,479.86 — AccuLynx to the cent.
--
-- Measured before this migration, job-tagged lines by account classification
-- (qbo_accounts.classification, 214 accounts, one realm):
--   Expense  (COGS + Expense)          18,469 lines   $25,092,023.59  -> counts
--   Asset    (Accounts Receivable)         31 lines      $400,833.25  -> customer checks
--   Revenue  (Sales, Refunds to Cust.)    112 lines      $379,466.52  -> customer refunds/sales
--   Liability (EECU note/loan, card)       28 lines       $31,277.72  -> loan payments
--   Equity   (partner distribution)         1 line            $104.24  -> owner draw
--   account not in mirror (deleted
--     "Fuel related to jobs")             86 lines        $5,156.52  -> counts (see below)
--
-- Rule: a line is job cost only when its account is classified Expense. Every
-- other classification is customer money or a balance-sheet movement.
--
-- An account missing from the qbo_accounts mirror (today only the deleted
-- "Fuel related to jobs" account) still COUNTS. Dropping cost silently is how
-- $16.2M went missing before migration 257; an unknown account is surfaced in
-- the guard view below instead of being dropped.
--
-- Shape: the full line set moves to v_qbo_job_cost_lines_all (adds account
-- classification + counts_as_job_cost). v_qbo_job_cost_lines keeps its exact
-- column list and becomes the filtered view, so all four consumers —
-- v_qbo_job_costs -> refresh_wip_ar_master (board), wip_accrual_snapshot (CPA
-- accrual CSV), v_wip_office_margin (office GM%), v_qbo_job_cost_unattributed —
-- get the one corrected definition with no function changes.
--
-- Guard rail: v_qbo_job_cost_excluded lists every job-tagged line that is NOT
-- counted, and every line on an account missing from the mirror, so a new
-- non-expense pattern is visible rather than silently summed or silently dropped.
--
-- Additive and idempotent: CREATE OR REPLACE only, no data touched. The
-- job_number derivation is copied byte-for-byte from the live view (it already
-- carries the -PECRM suffix branch, newer than migration 257's file).

begin;

create or replace view public.v_qbo_job_cost_lines_all as
 WITH bill_lines AS (
         SELECT 'bill'::text AS source,
            b.qbo_id AS qbo_txn_id,
            b.realm_id,
            b.txn_date,
            b.vendor_name,
            1::numeric AS sign,
            l.value AS line
           FROM qbo_bills b
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.lines, b.raw -> 'Line'::text)) l(value)
        ), purchase_lines AS (
         SELECT 'purchase'::text AS source,
            p.qbo_id AS qbo_txn_id,
            p.realm_id,
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
         SELECT all_lines.*,
            COALESCE(((all_lines.line -> 'AccountBasedExpenseLineDetail'::text) -> 'CustomerRef'::text) ->> 'name'::text,
                     ((all_lines.line -> 'ItemBasedExpenseLineDetail'::text) -> 'CustomerRef'::text) ->> 'name'::text) AS customer_ref_name,
            ((all_lines.line -> 'AccountBasedExpenseLineDetail'::text) -> 'AccountRef'::text) ->> 'value'::text AS account_id
           FROM all_lines
        )
 SELECT n.source,
    n.qbo_txn_id,
    n.txn_date,
    n.vendor_name,
    n.customer_ref_name,
        CASE
            WHEN n.customer_ref_name ~~ '%:%'::text THEN NULLIF(TRIM(BOTH FROM "substring"(n.customer_ref_name, ':([^:]+)$'::text)), ''::text)
            WHEN n.customer_ref_name ~ '^[A-Z]{2,4}-[0-9]+(-PECRM)?$'::text OR n.customer_ref_name ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM n.customer_ref_name)
            ELSE NULL::text
        END AS job_number,
    COALESCE(((n.line -> 'AccountBasedExpenseLineDetail'::text) -> 'AccountRef'::text) ->> 'name'::text,
             ((n.line -> 'ItemBasedExpenseLineDetail'::text) -> 'ItemRef'::text) ->> 'name'::text) AS account_or_item,
    n.sign * ((n.line ->> 'Amount'::text)::numeric) AS amount,
    n.account_id,
    a.classification AS account_classification,
    a.account_type,
    n.line ->> 'Description'::text AS line_description,
    -- Expense-classified account, or (item lines / accounts missing from the
    -- mirror) unknown -> counted and surfaced in v_qbo_job_cost_excluded.
    (a.qbo_id IS NULL OR a.classification = 'Expense') AS counts_as_job_cost
   FROM named n
     LEFT JOIN qbo_accounts a ON a.qbo_id = n.account_id AND a.realm_id = n.realm_id
  WHERE n.customer_ref_name IS NOT NULL AND (n.line ->> 'Amount'::text) IS NOT NULL;

comment on view public.v_qbo_job_cost_lines_all is
  'Every QBO bill + purchase line carrying a CustomerRef, with its account classification and counts_as_job_cost. Source for v_qbo_job_cost_lines (counted lines) and v_qbo_job_cost_excluded (guard). Migration 343.';

create or replace view public.v_qbo_job_cost_lines as
select source, qbo_txn_id, txn_date, vendor_name, customer_ref_name,
       job_number, account_or_item, amount
from public.v_qbo_job_cost_lines_all
where counts_as_job_cost;

comment on view public.v_qbo_job_cost_lines is
  'QBO job cost lines that count toward Expense Realized: bill + purchase lines with a CustomerRef posted to an Expense-classified account (COGS or Expense). Lines on A/R, income, liability or equity accounts — returned customer checks, refunds to customers, loan payments — are excluded (migration 343; KS-234 returned check). job_number accepts the Customer:Job colon form and a bare job-number CustomerRef (migration 257).';

create or replace view public.v_qbo_job_cost_excluded as
select source, qbo_txn_id, txn_date, vendor_name, customer_ref_name, job_number,
       account_or_item, account_classification, account_type, line_description, amount,
       case when counts_as_job_cost then 'counted_account_not_in_mirror'
            else 'excluded_non_expense_account' end as status
from public.v_qbo_job_cost_lines_all
where not counts_as_job_cost
   or account_classification is null
order by abs(amount) desc;

comment on view public.v_qbo_job_cost_excluded is
  'Guard for Expense Realized. excluded_non_expense_account = job-tagged lines left OUT of job cost because the account is not an expense (returned customer checks on A/R, refunds to customers, loan payments). counted_account_not_in_mirror = lines still counted whose account is missing from qbo_accounts (deleted account, item line) — review these; a new one may be customer money. Migration 343.';

commit;
