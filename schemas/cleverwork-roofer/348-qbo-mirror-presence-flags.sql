-- 348 — QuickBooks mirror: flag rows QuickBooks no longer returns; read actuals only
--
-- Reported 2026-11-22 (Chris): payments "not syncing" to the board.
--
-- Cause: mirror-backfill.mjs pulls every entity in full each night and upserts
-- on (realm_id, qbo_id). It never marks a row that QuickBooks stops returning.
-- An invoice that is deleted, or voided and re-created, in QuickBooks stays in
-- the mirror with its old open balance. A payment on the replacement invoice
-- then looks like it never arrived.
--
-- Measured 2026-11-22 against the 02:00 UTC full run:
--   qbo_invoices       223 rows not returned, 206 still open, $2,441,202 open
--   qbo_payments        10 rows not returned
--   qbo_purchases       57 rows not returned ($34,692; these reach job cost)
--   qbo_transfers       21 rows not returned
--   qbo_vendors         13 rows not returned
-- Mirror open AR was $4.39M against $1.92M on the QuickBooks AR aging report.
-- The rows the run DID return come to $1.94M open.
--
-- Fix (Chris, 2026-11-22: "don't delete any data ... just add flags"):
--   * Four flag columns on every mirrored entity table. Nothing is deleted.
--       last_seen_run_key / last_seen_at  the last full pull or change-feed read that returned the row
--       missing_since                     set when a complete full pull did not return the row;
--                                         cleared automatically if it comes back
--       qbo_deleted_at                    set when the QuickBooks change feed (CDC) reports the
--                                         entity as Deleted
--   * qbo_mark_missing() and qbo_mark_deleted(): update-only helpers the mirror calls.
--   * v_qbo_<entity>_current views: the rows that exist in QuickBooks today.
--   * v_qbo_removed_rows: every flagged row, for review.
--   * v_qbo_ar_reconciliation and v_qbo_ar_invoice_recon: mirror open AR against
--     the AgedReceivableDetail report the same run pulled.
--   * The three live readers of these tables (job cost lines, register lines and
--     the CenterPoint invoice reconciliation) read current rows only. Their column
--     lists are unchanged; definitions are copied from the live database on
--     2026-11-22 with only the flag filters added.
--
-- Not changed here: mv_overhead_account_month (a materialized view; replacing it
-- needs a drop and re-create, left for a separate change). It still includes the
-- 57 flagged purchases until then.
--
-- Note for PR #68 (migration 343-qbo-job-cost-expense-accounts-only): that file
-- also replaces v_qbo_job_cost_lines_all. It is already live; this file starts
-- from the live definition. If 343 is ever re-applied, re-apply this file after it.
--
-- Additive and idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, and
-- UPDATEs that only fill NULL flag columns. No DELETE, DROP or TRUNCATE.
-- QuickBooks itself is untouched (read-only, hard rule 13).

begin;

-- ---------------------------------------------------------------------------
-- 1. Flag columns
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'qbo_accounts','qbo_customers','qbo_vendors','qbo_classes',
    'qbo_invoices','qbo_payments','qbo_bills','qbo_bill_payments',
    'qbo_purchases','qbo_deposits','qbo_journal_entries',
    'qbo_vendor_credits','qbo_credit_memos','qbo_transfers'
  ]
  loop
    execute format('alter table public.%I add column if not exists last_seen_run_key text', t);
    execute format('alter table public.%I add column if not exists last_seen_at timestamptz', t);
    execute format('alter table public.%I add column if not exists missing_since timestamptz', t);
    execute format('alter table public.%I add column if not exists qbo_deleted_at timestamptz', t);
    execute format(
      'create index if not exists %I on public.%I (realm_id, last_seen_at)',
      t || '_last_seen_idx', t);
    execute format(
      'create index if not exists %I on public.%I (realm_id) where missing_since is not null or qbo_deleted_at is not null',
      t || '_flagged_idx', t);

    -- Seed last_seen from the existing fetch stamp (fill-only).
    execute format(
      'update public.%I set last_seen_at = fetched_at, last_seen_run_key = pull_batch where last_seen_at is null',
      t);

    execute format($c$comment on column public.%I.missing_since is
      'Set when a complete full pull of this entity did not return the row (likely deleted or replaced in QuickBooks). Cleared when the row is seen again. Rows are never deleted (mig 348).'$c$, t);
    execute format($c$comment on column public.%I.qbo_deleted_at is
      'Set when the QuickBooks change feed (CDC) reported this entity as Deleted (mig 348).'$c$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Update-only helpers called by the mirror (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.qbo_mirror_table_allowed(p_table text)
returns boolean
language sql
immutable
as $$
  select p_table = any (array[
    'qbo_accounts','qbo_customers','qbo_vendors','qbo_classes',
    'qbo_invoices','qbo_payments','qbo_bills','qbo_bill_payments',
    'qbo_purchases','qbo_deposits','qbo_journal_entries',
    'qbo_vendor_credits','qbo_credit_memos','qbo_transfers'
  ]);
$$;

-- Stamp missing_since on rows a COMPLETE full pull did not return.
-- p_run_started: when that pull began; every row it returned has last_seen_at >= it.
create or replace function public.qbo_mark_missing(
  p_table text,
  p_realm text,
  p_run_started timestamptz
)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  n integer;
begin
  if not public.qbo_mirror_table_allowed(p_table) then
    raise exception 'qbo_mark_missing: table % is not a QuickBooks mirror table', p_table;
  end if;
  execute format(
    'update public.%I set missing_since = now()
      where realm_id = $1
        and missing_since is null
        and coalesce(last_seen_at, fetched_at) < $2',
    p_table)
  using p_realm, p_run_started;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Record CDC deletions. p_rows: [{"id":"123","deleted_at":"2026-11-21T15:00:00Z"}, ...]
-- Rows not in the mirror are ignored (nothing is inserted).
create or replace function public.qbo_mark_deleted(
  p_table text,
  p_realm text,
  p_rows jsonb
)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  n integer;
begin
  if not public.qbo_mirror_table_allowed(p_table) then
    raise exception 'qbo_mark_deleted: table % is not a QuickBooks mirror table', p_table;
  end if;
  execute format(
    'update public.%I t
        set qbo_deleted_at = coalesce(t.qbo_deleted_at, d.deleted_at),
            missing_since  = coalesce(t.missing_since, d.deleted_at, now())
       from (
         select r->>''id'' as qbo_id,
                coalesce(nullif(r->>''deleted_at'', '''')::timestamptz, now()) as deleted_at
           from jsonb_array_elements(coalesce($2, ''[]''::jsonb)) r
       ) d
      where t.realm_id = $1
        and t.qbo_id = d.qbo_id
        and t.qbo_deleted_at is null',
    p_table)
  using p_realm, p_rows;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.qbo_mirror_table_allowed(text) from public, anon, authenticated;
revoke all on function public.qbo_mark_missing(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.qbo_mark_deleted(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.qbo_mirror_table_allowed(text) to service_role;
grant execute on function public.qbo_mark_missing(text, text, timestamptz) to service_role;
grant execute on function public.qbo_mark_deleted(text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. One-off: flag rows the latest complete full run did not return
-- ---------------------------------------------------------------------------
-- Uses the newest successful thursday/backfill run that included the entity.
-- missing_since is set to that run's start. Fill-only, so re-running is safe.

do $$
declare
  m record;
  run_start timestamptz;
begin
  for m in
    select * from (values
      ('accounts','qbo_accounts'), ('customers','qbo_customers'), ('vendors','qbo_vendors'),
      ('classes','qbo_classes'), ('invoices','qbo_invoices'), ('payments','qbo_payments'),
      ('bills','qbo_bills'), ('billpayments','qbo_bill_payments'), ('purchases','qbo_purchases'),
      ('deposits','qbo_deposits'), ('journals','qbo_journal_entries'),
      ('vendorcredits','qbo_vendor_credits'), ('creditmemos','qbo_credit_memos'),
      ('transfers','qbo_transfers')
    ) as v(entity_key, table_name)
  loop
    select r.started_at into run_start
      from public.qbo_sync_runs r
     where r.status = 'ok'
       and r.mode in ('thursday', 'backfill')
       and m.entity_key = any (r.entities)
     order by r.started_at desc
     limit 1;
    continue when run_start is null;
    execute format(
      'update public.%I set missing_since = $1
        where missing_since is null
          and coalesce(last_seen_at, fetched_at) < $1',
      m.table_name)
    using run_start;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Current-row views: what exists in QuickBooks today
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'qbo_accounts','qbo_customers','qbo_vendors','qbo_classes',
    'qbo_invoices','qbo_payments','qbo_bills','qbo_bill_payments',
    'qbo_purchases','qbo_deposits','qbo_journal_entries',
    'qbo_vendor_credits','qbo_credit_memos','qbo_transfers'
  ]
  loop
    execute format(
      'create or replace view public.%I with (security_invoker = true) as
         select * from public.%I where missing_since is null and qbo_deleted_at is null',
      'v_' || t || '_current', t);
    execute format('revoke all on public.%I from anon, authenticated', 'v_' || t || '_current');
    execute format('grant select on public.%I to service_role', 'v_' || t || '_current');
    execute format($c$comment on view public.%I is
      'Rows of %s that QuickBooks still returns (not missing, not deleted). Read this, not the base table, for actuals (mig 348).'$c$,
      'v_' || t || '_current', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Review list of every flagged transaction
-- ---------------------------------------------------------------------------

create or replace view public.v_qbo_removed_rows with (security_invoker = true) as
  select 'Invoice'::text as entity, realm_id, qbo_id, doc_number, txn_date,
         customer_name as party_name, total_amt as amount, balance as open_balance,
         last_seen_at, missing_since, qbo_deleted_at
    from public.qbo_invoices where missing_since is not null or qbo_deleted_at is not null
  union all
  select 'Payment', realm_id, qbo_id, null, txn_date, customer_name, total_amt, null,
         last_seen_at, missing_since, qbo_deleted_at
    from public.qbo_payments where missing_since is not null or qbo_deleted_at is not null
  union all
  select 'CreditMemo', realm_id, qbo_id, doc_number, txn_date, customer_name, total_amt, balance,
         last_seen_at, missing_since, qbo_deleted_at
    from public.qbo_credit_memos where missing_since is not null or qbo_deleted_at is not null
  union all
  select 'Bill', realm_id, qbo_id, doc_number, txn_date, vendor_name, total_amt, balance,
         last_seen_at, missing_since, qbo_deleted_at
    from public.qbo_bills where missing_since is not null or qbo_deleted_at is not null
  union all
  select 'BillPayment', realm_id, qbo_id, doc_number, txn_date, vendor_name, total_amt, null,
         last_seen_at, missing_since, qbo_deleted_at
    from public.qbo_bill_payments where missing_since is not null or qbo_deleted_at is not null
  union all
  select 'VendorCredit', realm_id, qbo_id, doc_number, txn_date, vendor_name, total_amt, balance,
         last_seen_at, missing_since, qbo_deleted_at
    from public.qbo_vendor_credits where missing_since is not null or qbo_deleted_at is not null
  union all
  select 'Purchase', realm_id, qbo_id, doc_number, txn_date, entity_name, total_amt, null,
         last_seen_at, missing_since, qbo_deleted_at
    from public.qbo_purchases where missing_since is not null or qbo_deleted_at is not null
  union all
  select 'Deposit', realm_id, qbo_id, null, txn_date, null, total_amt, null,
         last_seen_at, missing_since, qbo_deleted_at
    from public.qbo_deposits where missing_since is not null or qbo_deleted_at is not null
  union all
  select 'JournalEntry', realm_id, qbo_id, doc_number, txn_date, null, null, null,
         last_seen_at, missing_since, qbo_deleted_at
    from public.qbo_journal_entries where missing_since is not null or qbo_deleted_at is not null
  union all
  select 'Transfer', realm_id, qbo_id, null, txn_date, null, amount, null,
         last_seen_at, missing_since, qbo_deleted_at
    from public.qbo_transfers where missing_since is not null or qbo_deleted_at is not null;

revoke all on public.v_qbo_removed_rows from anon, authenticated;
grant select on public.v_qbo_removed_rows to service_role;
comment on view public.v_qbo_removed_rows is
  'QuickBooks transactions kept in the mirror but no longer returned by QuickBooks (missing_since) or reported deleted by the change feed (qbo_deleted_at). Review list; nothing is deleted (mig 348).';

-- ---------------------------------------------------------------------------
-- 6. AR reconciliation against the AgedReceivableDetail report
-- ---------------------------------------------------------------------------
-- Report detail rows: ColData[1] = {value: txn type, id: QBO txn id},
-- ColData[2] = doc number, ColData[6] = open balance. strict mode: lax .** repeats items.

create or replace view public.v_qbo_ar_report_lines with (security_invoker = true) as
  with latest as (
    select distinct on (realm_id) realm_id, as_of_date, fetched_at, pull_batch, raw
      from public.qbo_report_snapshots
     where report_name = 'AgedReceivableDetail'
     order by realm_id, fetched_at desc
  )
  select l.realm_id,
         l.as_of_date,
         l.fetched_at as report_fetched_at,
         l.pull_batch as report_pull_batch,
         d.r -> 'ColData' -> 1 ->> 'value' as txn_type,
         d.r -> 'ColData' -> 1 ->> 'id'    as qbo_id,
         d.r -> 'ColData' -> 2 ->> 'value' as doc_number,
         d.r -> 'ColData' -> 3 ->> 'value' as customer_name,
         nullif(d.r -> 'ColData' -> 6 ->> 'value', '')::numeric as open_balance
    from latest l
    cross join lateral jsonb_path_query(l.raw, 'strict $.**?(@.type == "Data")') as d(r);

create or replace view public.v_qbo_ar_reconciliation with (security_invoker = true) as
  with rep as (
    select realm_id, max(as_of_date) as report_as_of, max(report_fetched_at) as report_fetched_at,
           sum(open_balance) as report_open_ar,
           sum(open_balance) filter (where txn_type = 'Invoice') as report_invoice_open,
           count(*) filter (where txn_type = 'Invoice') as report_invoice_count
      from public.v_qbo_ar_report_lines
     group by realm_id
  ), mir as (
    select realm_id,
           sum(balance) filter (where missing_since is null and qbo_deleted_at is null) as mirror_current_open,
           count(*) filter (where missing_since is null and qbo_deleted_at is null and balance > 0) as mirror_current_count,
           sum(balance) as mirror_all_open,
           sum(balance) filter (where missing_since is not null or qbo_deleted_at is not null) as flagged_open,
           count(*) filter (where (missing_since is not null or qbo_deleted_at is not null) and balance > 0) as flagged_open_count
      from public.qbo_invoices
     where balance <> 0
     group by realm_id
  )
  select coalesce(rep.realm_id, mir.realm_id) as realm_id,
         rep.report_as_of,
         rep.report_fetched_at,
         rep.report_open_ar,
         rep.report_invoice_open,
         rep.report_invoice_count,
         mir.mirror_current_open,
         mir.mirror_current_count,
         mir.mirror_all_open,
         mir.flagged_open,
         mir.flagged_open_count,
         round(coalesce(mir.mirror_current_open, 0) - coalesce(rep.report_invoice_open, 0), 2) as invoice_open_difference,
         round(100 * abs(coalesce(mir.mirror_current_open, 0) - coalesce(rep.report_invoice_open, 0))
               / nullif(rep.report_invoice_open, 0), 2) as invoice_open_difference_pct,
         case
           when rep.realm_id is null then 'no_report'
           when abs(coalesce(mir.mirror_current_open, 0) - coalesce(rep.report_invoice_open, 0))
                <= 0.01 * nullif(rep.report_invoice_open, 0) then 'ok'
           else 'drift'
         end as status
    from rep
    full join mir on mir.realm_id = rep.realm_id;

create or replace view public.v_qbo_ar_invoice_recon with (security_invoker = true) as
  with rep as (
    select realm_id, qbo_id, doc_number, customer_name, open_balance
      from public.v_qbo_ar_report_lines
     where txn_type = 'Invoice'
  ), mir as (
    select realm_id, qbo_id, doc_number, customer_name, balance,
           missing_since, qbo_deleted_at, last_seen_at
      from public.qbo_invoices
     where balance <> 0 or missing_since is not null or qbo_deleted_at is not null
  )
  select coalesce(rep.realm_id, mir.realm_id) as realm_id,
         coalesce(rep.qbo_id, mir.qbo_id) as qbo_id,
         coalesce(rep.doc_number, mir.doc_number) as doc_number,
         coalesce(rep.customer_name, mir.customer_name) as customer_name,
         rep.open_balance as report_open_balance,
         mir.balance as mirror_balance,
         mir.missing_since,
         mir.qbo_deleted_at,
         mir.last_seen_at,
         case
           when mir.qbo_id is null then 'report_only'
           when (mir.missing_since is not null or mir.qbo_deleted_at is not null) and rep.qbo_id is null then 'flagged_removed'
           when (mir.missing_since is not null or mir.qbo_deleted_at is not null) then 'flagged_but_in_report'
           when rep.qbo_id is null and coalesce(mir.balance, 0) <> 0 then 'mirror_only'
           when abs(coalesce(rep.open_balance, 0) - coalesce(mir.balance, 0)) > 0.01 then 'balance_differs'
           else 'match'
         end as recon_status
    from rep
    full join mir on mir.realm_id = rep.realm_id and mir.qbo_id = rep.qbo_id
   where rep.qbo_id is not null
      or mir.balance <> 0;

revoke all on public.v_qbo_ar_report_lines from anon, authenticated;
revoke all on public.v_qbo_ar_reconciliation from anon, authenticated;
revoke all on public.v_qbo_ar_invoice_recon from anon, authenticated;
grant select on public.v_qbo_ar_report_lines to service_role;
grant select on public.v_qbo_ar_reconciliation to service_role;
grant select on public.v_qbo_ar_invoice_recon to service_role;
comment on view public.v_qbo_ar_reconciliation is
  'Nightly check: current mirror open invoices against the AgedReceivableDetail report from the same pull. status = drift when they differ by more than 1% (mig 348).';
comment on view public.v_qbo_ar_invoice_recon is
  'Per-invoice match of the mirror against the AgedReceivableDetail report (mig 348).';

-- ---------------------------------------------------------------------------
-- 7. Existing readers: current rows only (column lists unchanged)
-- ---------------------------------------------------------------------------

create or replace view public.v_qbo_job_cost_lines_all as
 WITH bill_lines AS (
         SELECT 'bill'::text AS source,
            b.qbo_id AS qbo_txn_id,
            b.realm_id,
            b.txn_date,
            b.vendor_name,
            (1)::numeric AS sign,
            l.value AS line
           FROM (qbo_bills b
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.lines, (b.raw -> 'Line'::text))) l(value))
          WHERE b.missing_since IS NULL AND b.qbo_deleted_at IS NULL
        ), purchase_lines AS (
         SELECT 'purchase'::text AS source,
            p.qbo_id AS qbo_txn_id,
            p.realm_id,
            p.txn_date,
            p.entity_name AS vendor_name,
            (
                CASE
                    WHEN COALESCE(p.credit, false) THEN '-1'::integer
                    ELSE 1
                END)::numeric AS sign,
            l.value AS line
           FROM (qbo_purchases p
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.lines, (p.raw -> 'Line'::text))) l(value))
          WHERE p.missing_since IS NULL AND p.qbo_deleted_at IS NULL
        ), all_lines AS (
         SELECT bill_lines.source,
            bill_lines.qbo_txn_id,
            bill_lines.realm_id,
            bill_lines.txn_date,
            bill_lines.vendor_name,
            bill_lines.sign,
            bill_lines.line
           FROM bill_lines
        UNION ALL
         SELECT purchase_lines.source,
            purchase_lines.qbo_txn_id,
            purchase_lines.realm_id,
            purchase_lines.txn_date,
            purchase_lines.vendor_name,
            purchase_lines.sign,
            purchase_lines.line
           FROM purchase_lines
        ), named AS (
         SELECT all_lines.source,
            all_lines.qbo_txn_id,
            all_lines.realm_id,
            all_lines.txn_date,
            all_lines.vendor_name,
            all_lines.sign,
            all_lines.line,
            COALESCE((((all_lines.line -> 'AccountBasedExpenseLineDetail'::text) -> 'CustomerRef'::text) ->> 'name'::text), (((all_lines.line -> 'ItemBasedExpenseLineDetail'::text) -> 'CustomerRef'::text) ->> 'name'::text)) AS customer_ref_name,
            (((all_lines.line -> 'AccountBasedExpenseLineDetail'::text) -> 'AccountRef'::text) ->> 'value'::text) AS account_id
           FROM all_lines
        )
 SELECT n.source,
    n.qbo_txn_id,
    n.txn_date,
    n.vendor_name,
    n.customer_ref_name,
        CASE
            WHEN (n.customer_ref_name ~~ '%:%'::text) THEN NULLIF(TRIM(BOTH FROM "substring"(n.customer_ref_name, ':([^:]+)$'::text)), ''::text)
            WHEN ((n.customer_ref_name ~ '^[A-Z]{2,4}-[0-9]+(-PECRM)?$'::text) OR (n.customer_ref_name ~ '^[0-9]+$'::text)) THEN TRIM(BOTH FROM n.customer_ref_name)
            ELSE NULL::text
        END AS job_number,
    COALESCE((((n.line -> 'AccountBasedExpenseLineDetail'::text) -> 'AccountRef'::text) ->> 'name'::text), (((n.line -> 'ItemBasedExpenseLineDetail'::text) -> 'ItemRef'::text) ->> 'name'::text)) AS account_or_item,
    (n.sign * ((n.line ->> 'Amount'::text))::numeric) AS amount,
    n.account_id,
    a.classification AS account_classification,
    a.account_type,
    (n.line ->> 'Description'::text) AS line_description,
    ((a.qbo_id IS NULL) OR (a.classification = 'Expense'::text)) AS counts_as_job_cost
   FROM (named n
     LEFT JOIN qbo_accounts a ON (((a.qbo_id = n.account_id) AND (a.realm_id = n.realm_id))))
  WHERE ((n.customer_ref_name IS NOT NULL) AND ((n.line ->> 'Amount'::text) IS NOT NULL));

create or replace view public.v_work_invoice_qbo_recon with (security_invoker = true) as
 WITH cp AS (
         SELECT m.number,
            count(*) AS cp_job_count,
            sum(m.billed) AS cp_billed,
            sum(m.collected) AS cp_collected,
            sum(m.outstanding) AS cp_outstanding,
            sum(m.draft_amount) AS cp_draft_amount
           FROM mv_work_job_money m
          WHERE ((m.source = 'centerpoint'::text) AND (m.number IS NOT NULL) AND ((m.billed <> (0)::numeric) OR (m.draft_amount <> (0)::numeric) OR (m.collected <> (0)::numeric)))
          GROUP BY m.number
        ), qb AS (
         SELECT q.doc_number AS number,
            count(*) AS qbo_invoice_count,
            sum(q.total_amt) AS qbo_billed,
            sum(q.balance) AS qbo_outstanding,
            (sum(q.total_amt) - sum(q.balance)) AS qbo_collected,
            max(q.txn_date) AS qbo_last_invoice_date
           FROM qbo_invoices q
          WHERE (q.doc_number ~ '^CP-'::text)
            AND q.missing_since IS NULL AND q.qbo_deleted_at IS NULL
          GROUP BY q.doc_number
        )
 SELECT COALESCE(cp.number, qb.number) AS number,
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
    (COALESCE(cp.cp_billed, (0)::numeric) - COALESCE(qb.qbo_billed, (0)::numeric)) AS billed_difference,
    (COALESCE(cp.cp_collected, (0)::numeric) - COALESCE(qb.qbo_collected, (0)::numeric)) AS collected_difference,
        CASE
            WHEN (qb.number IS NULL) THEN 'centerpoint_only'::text
            WHEN (cp.number IS NULL) THEN 'quickbooks_only'::text
            WHEN (abs((COALESCE(cp.cp_billed, (0)::numeric) - COALESCE(qb.qbo_billed, (0)::numeric))) > 0.01) THEN 'billed_differs'::text
            WHEN (abs((COALESCE(cp.cp_collected, (0)::numeric) - COALESCE(qb.qbo_collected, (0)::numeric))) > 0.01) THEN 'collected_differs'::text
            ELSE 'match'::text
        END AS recon_status
   FROM (cp
     FULL JOIN qb ON ((qb.number = cp.number)));

create or replace view public.v_qbo_register_lines as
 SELECT p.realm_id,
    p.account_ref,
    COALESCE(p.account_name, a.name) AS account_name,
    a.account_type,
    a.account_sub_type,
        CASE
            WHEN (a.account_type = 'Bank'::text) THEN 'bank'::text
            WHEN (a.account_type = 'Credit Card'::text) THEN 'credit_card'::text
            WHEN (a.account_sub_type = 'LineOfCredit'::text) THEN 'line_of_credit'::text
            WHEN ((a.account_type = 'Long Term Liability'::text) AND (a.account_sub_type = 'NotesPayable'::text)) THEN 'notes_payable'::text
            ELSE 'other'::text
        END AS register_kind,
    'Purchase'::text AS source_entity,
    p.qbo_id AS source_qbo_id,
    COALESCE(p.payment_type, 'Purchase'::text) AS txn_type,
    p.txn_date,
    p.doc_number,
    p.entity_ref AS payee_ref,
    p.entity_name AS payee_name,
        CASE
            WHEN COALESCE(p.credit, false) THEN NULL::numeric
            ELSE p.total_amt
        END AS spent,
        CASE
            WHEN COALESCE(p.credit, false) THEN p.total_amt
            ELSE NULL::numeric
        END AS received,
    p.private_note AS memo,
    p.credit AS is_credit,
    p.lines,
    p.txn_updated_at,
    p.fetched_at
   FROM (qbo_purchases p
     LEFT JOIN qbo_accounts a ON (((a.realm_id = p.realm_id) AND (a.qbo_id = p.account_ref))))
  WHERE p.missing_since IS NULL AND p.qbo_deleted_at IS NULL
UNION ALL
 SELECT d.realm_id,
    d.deposit_to_account_ref AS account_ref,
    COALESCE(d.deposit_to_account_name, a.name) AS account_name,
    a.account_type,
    a.account_sub_type,
        CASE
            WHEN (a.account_type = 'Bank'::text) THEN 'bank'::text
            WHEN (a.account_type = 'Credit Card'::text) THEN 'credit_card'::text
            ELSE 'other'::text
        END AS register_kind,
    'Deposit'::text AS source_entity,
    d.qbo_id AS source_qbo_id,
    'Deposit'::text AS txn_type,
    d.txn_date,
    NULL::text AS doc_number,
    NULL::text AS payee_ref,
    NULL::text AS payee_name,
    NULL::numeric AS spent,
    d.total_amt AS received,
    d.private_note AS memo,
    false AS is_credit,
    d.lines,
    d.txn_updated_at,
    d.fetched_at
   FROM (qbo_deposits d
     LEFT JOIN qbo_accounts a ON (((a.realm_id = d.realm_id) AND (a.qbo_id = d.deposit_to_account_ref))))
  WHERE (d.deposit_to_account_ref IS NOT NULL)
    AND d.missing_since IS NULL AND d.qbo_deleted_at IS NULL
UNION ALL
 SELECT pay.realm_id,
    pay.deposit_to_account_ref AS account_ref,
    a.name AS account_name,
    a.account_type,
    a.account_sub_type,
        CASE
            WHEN (a.account_type = 'Bank'::text) THEN 'bank'::text
            WHEN (a.account_type = 'Credit Card'::text) THEN 'credit_card'::text
            ELSE 'other'::text
        END AS register_kind,
    'Payment'::text AS source_entity,
    pay.qbo_id AS source_qbo_id,
    'Payment'::text AS txn_type,
    pay.txn_date,
    NULL::text AS doc_number,
    pay.customer_ref AS payee_ref,
    pay.customer_name AS payee_name,
    NULL::numeric AS spent,
    pay.total_amt AS received,
    pay.private_note AS memo,
    false AS is_credit,
    pay.lines,
    pay.txn_updated_at,
    pay.fetched_at
   FROM (qbo_payments pay
     LEFT JOIN qbo_accounts a ON (((a.realm_id = pay.realm_id) AND (a.qbo_id = pay.deposit_to_account_ref))))
  WHERE ((pay.deposit_to_account_ref IS NOT NULL) AND (COALESCE(a.name, ''::text) !~~* '%undeposited%'::text))
    AND pay.missing_since IS NULL AND pay.qbo_deleted_at IS NULL
UNION ALL
 SELECT bp.realm_id,
    bp.bank_account_ref AS account_ref,
    a.name AS account_name,
    a.account_type,
    a.account_sub_type,
        CASE
            WHEN (a.account_type = 'Bank'::text) THEN 'bank'::text
            WHEN (a.account_type = 'Credit Card'::text) THEN 'credit_card'::text
            ELSE 'other'::text
        END AS register_kind,
    'BillPayment'::text AS source_entity,
    bp.qbo_id AS source_qbo_id,
    COALESCE(bp.pay_type, 'BillPayment'::text) AS txn_type,
    bp.txn_date,
    bp.doc_number,
    bp.vendor_ref AS payee_ref,
    bp.vendor_name AS payee_name,
    bp.total_amt AS spent,
    NULL::numeric AS received,
    bp.private_note AS memo,
    false AS is_credit,
    bp.lines,
    bp.txn_updated_at,
    bp.fetched_at
   FROM (qbo_bill_payments bp
     LEFT JOIN qbo_accounts a ON (((a.realm_id = bp.realm_id) AND (a.qbo_id = bp.bank_account_ref))))
  WHERE (bp.bank_account_ref IS NOT NULL)
    AND bp.missing_since IS NULL AND bp.qbo_deleted_at IS NULL
UNION ALL
 SELECT t.realm_id,
    t.from_account_ref AS account_ref,
    a.name AS account_name,
    a.account_type,
    a.account_sub_type,
        CASE
            WHEN (a.account_type = 'Bank'::text) THEN 'bank'::text
            WHEN (a.account_type = 'Credit Card'::text) THEN 'credit_card'::text
            WHEN ((a.account_type = 'Long Term Liability'::text) AND (a.account_sub_type = 'NotesPayable'::text)) THEN 'notes_payable'::text
            ELSE 'other'::text
        END AS register_kind,
    'Transfer'::text AS source_entity,
    t.qbo_id AS source_qbo_id,
    'TransferOut'::text AS txn_type,
    t.txn_date,
    NULL::text AS doc_number,
    t.to_account_ref AS payee_ref,
    ('to '::text || COALESCE(a2.name, t.to_account_ref)) AS payee_name,
    t.amount AS spent,
    NULL::numeric AS received,
    t.private_note AS memo,
    false AS is_credit,
    '[]'::jsonb AS lines,
    t.txn_updated_at,
    t.fetched_at
   FROM ((qbo_transfers t
     LEFT JOIN qbo_accounts a ON (((a.realm_id = t.realm_id) AND (a.qbo_id = t.from_account_ref))))
     LEFT JOIN qbo_accounts a2 ON (((a2.realm_id = t.realm_id) AND (a2.qbo_id = t.to_account_ref))))
  WHERE (t.from_account_ref IS NOT NULL)
    AND t.missing_since IS NULL AND t.qbo_deleted_at IS NULL
UNION ALL
 SELECT t.realm_id,
    t.to_account_ref AS account_ref,
    a.name AS account_name,
    a.account_type,
    a.account_sub_type,
        CASE
            WHEN (a.account_type = 'Bank'::text) THEN 'bank'::text
            WHEN (a.account_type = 'Credit Card'::text) THEN 'credit_card'::text
            WHEN ((a.account_type = 'Long Term Liability'::text) AND (a.account_sub_type = 'NotesPayable'::text)) THEN 'notes_payable'::text
            ELSE 'other'::text
        END AS register_kind,
    'Transfer'::text AS source_entity,
    t.qbo_id AS source_qbo_id,
    'TransferIn'::text AS txn_type,
    t.txn_date,
    NULL::text AS doc_number,
    t.from_account_ref AS payee_ref,
    ('from '::text || COALESCE(a2.name, t.from_account_ref)) AS payee_name,
    NULL::numeric AS spent,
    t.amount AS received,
    t.private_note AS memo,
    false AS is_credit,
    '[]'::jsonb AS lines,
    t.txn_updated_at,
    t.fetched_at
   FROM ((qbo_transfers t
     LEFT JOIN qbo_accounts a ON (((a.realm_id = t.realm_id) AND (a.qbo_id = t.to_account_ref))))
     LEFT JOIN qbo_accounts a2 ON (((a2.realm_id = t.realm_id) AND (a2.qbo_id = t.from_account_ref))))
  WHERE (t.to_account_ref IS NOT NULL)
    AND t.missing_since IS NULL AND t.qbo_deleted_at IS NULL
UNION ALL
 SELECT j.realm_id,
    ((line.jel -> 'AccountRef'::text) ->> 'value'::text) AS account_ref,
    COALESCE(((line.jel -> 'AccountRef'::text) ->> 'name'::text), a.name) AS account_name,
    a.account_type,
    a.account_sub_type,
        CASE
            WHEN (a.account_type = 'Bank'::text) THEN 'bank'::text
            WHEN (a.account_type = 'Credit Card'::text) THEN 'credit_card'::text
            WHEN ((a.account_type = 'Long Term Liability'::text) AND (a.account_sub_type = 'NotesPayable'::text)) THEN 'notes_payable'::text
            ELSE 'other'::text
        END AS register_kind,
    'JournalEntry'::text AS source_entity,
    j.qbo_id AS source_qbo_id,
    'JournalEntry'::text AS txn_type,
    j.txn_date,
    j.doc_number,
    NULL::text AS payee_ref,
    NULL::text AS payee_name,
        CASE
            WHEN (((line.jel ->> 'PostingType'::text) = 'Credit'::text) AND (a.account_type = 'Bank'::text)) THEN ((line.elem ->> 'Amount'::text))::numeric
            WHEN (((line.jel ->> 'PostingType'::text) = 'Debit'::text) AND (a.account_type = 'Credit Card'::text)) THEN ((line.elem ->> 'Amount'::text))::numeric
            WHEN (((line.jel ->> 'PostingType'::text) = 'Debit'::text) AND (a.account_type = 'Long Term Liability'::text)) THEN ((line.elem ->> 'Amount'::text))::numeric
            WHEN (((line.jel ->> 'PostingType'::text) = 'Credit'::text) AND (a.account_type <> ALL (ARRAY['Bank'::text, 'Credit Card'::text, 'Long Term Liability'::text]))) THEN ((line.elem ->> 'Amount'::text))::numeric
            ELSE NULL::numeric
        END AS spent,
        CASE
            WHEN (((line.jel ->> 'PostingType'::text) = 'Debit'::text) AND (a.account_type = 'Bank'::text)) THEN ((line.elem ->> 'Amount'::text))::numeric
            WHEN (((line.jel ->> 'PostingType'::text) = 'Credit'::text) AND (a.account_type = 'Credit Card'::text)) THEN ((line.elem ->> 'Amount'::text))::numeric
            WHEN (((line.jel ->> 'PostingType'::text) = 'Credit'::text) AND (a.account_type = 'Long Term Liability'::text)) THEN ((line.elem ->> 'Amount'::text))::numeric
            WHEN (((line.jel ->> 'PostingType'::text) = 'Debit'::text) AND (a.account_type <> ALL (ARRAY['Bank'::text, 'Credit Card'::text, 'Long Term Liability'::text]))) THEN ((line.elem ->> 'Amount'::text))::numeric
            ELSE NULL::numeric
        END AS received,
    j.private_note AS memo,
    false AS is_credit,
    jsonb_build_array(line.elem) AS lines,
    j.txn_updated_at,
    j.fetched_at
   FROM ((qbo_journal_entries j
     CROSS JOIN LATERAL ( SELECT elem.value AS elem,
            COALESCE((elem.value -> 'JournalEntryLineDetail'::text), '{}'::jsonb) AS jel
           FROM jsonb_array_elements(COALESCE(j.lines, '[]'::jsonb)) elem(value)
          WHERE ((((elem.value -> 'JournalEntryLineDetail'::text) -> 'AccountRef'::text) ->> 'value'::text) IS NOT NULL)) line)
     JOIN qbo_accounts a ON (((a.realm_id = j.realm_id) AND (a.qbo_id = ((line.jel -> 'AccountRef'::text) ->> 'value'::text)) AND ((a.account_type = ANY (ARRAY['Bank'::text, 'Credit Card'::text])) OR (a.account_sub_type = 'LineOfCredit'::text) OR ((a.account_type = 'Long Term Liability'::text) AND (a.account_sub_type = 'NotesPayable'::text))))))
  WHERE j.missing_since IS NULL AND j.qbo_deleted_at IS NULL;

commit;
