-- 189 — QBO per-register query views (PEC-109 / docs/76)
--
-- Every bank / credit card / notes-payable register becomes a view in schema
-- qbo_registers named EXACTLY like the QBO account (e.g. "ABC Supply",
-- "Amex (1002)", "First United 8597"). Backed by unified v_qbo_register_lines.
-- Additive + idempotent. No QBO writes.

-- ---------------------------------------------------------------------------
-- Supporting indexes for register joins
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS qbo_deposits_account_idx
  ON public.qbo_deposits (realm_id, deposit_to_account_ref);

CREATE INDEX IF NOT EXISTS qbo_payments_deposit_account_idx
  ON public.qbo_payments (realm_id, deposit_to_account_ref);

CREATE INDEX IF NOT EXISTS qbo_bill_payments_bank_account_idx
  ON public.qbo_bill_payments (realm_id, bank_account_ref);

CREATE INDEX IF NOT EXISTS qbo_transfers_from_idx
  ON public.qbo_transfers (realm_id, from_account_ref);

CREATE INDEX IF NOT EXISTS qbo_transfers_to_idx
  ON public.qbo_transfers (realm_id, to_account_ref);

CREATE INDEX IF NOT EXISTS qbo_accounts_type_idx
  ON public.qbo_accounts (realm_id, account_type);

-- ---------------------------------------------------------------------------
-- Catalog: every register-eligible GL account
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_qbo_register_accounts AS
SELECT
  a.realm_id,
  a.qbo_id              AS account_ref,
  a.name                AS account_name,
  a.fully_qualified_name,
  a.account_type,
  a.account_sub_type,
  a.classification,
  a.active,
  a.current_balance,
  CASE
    WHEN a.account_type = 'Bank' THEN 'bank'
    WHEN a.account_type = 'Credit Card' THEN 'credit_card'
    WHEN a.account_sub_type = 'LineOfCredit' THEN 'line_of_credit'
    WHEN a.account_type = 'Long Term Liability'
         AND a.account_sub_type = 'NotesPayable' THEN 'notes_payable'
    WHEN a.account_type = 'Other Current Liability'
         AND a.account_sub_type IN ('LoanPayable', 'OtherCurrentLiabilities')
         AND (
           a.name ILIKE '%loan%'
           OR a.name ILIKE '%mca%'
           OR a.name ILIKE '%loc%'
         ) THEN 'short_term_financing'
    ELSE 'other'
  END                   AS register_kind
FROM public.qbo_accounts a
WHERE a.account_type IN ('Bank', 'Credit Card')
   OR a.account_sub_type = 'LineOfCredit'
   OR (a.account_type = 'Long Term Liability' AND a.account_sub_type = 'NotesPayable')
   OR (
     a.account_type = 'Other Current Liability'
     AND a.account_sub_type IN ('LoanPayable', 'OtherCurrentLiabilities')
     AND (
       a.name ILIKE '%loan%'
       OR a.name ILIKE '%mca%'
       OR a.name ILIKE '%loc%'
     )
   );

COMMENT ON VIEW public.v_qbo_register_accounts IS
  'Register-eligible QBO GL accounts. account_name matches QBO register name 1:1. PEC-109.';

-- ---------------------------------------------------------------------------
-- Unified register lines (Posted-tab shape)
-- spent = money out of the register; received = money into the register
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_qbo_register_lines AS
SELECT
  p.realm_id,
  p.account_ref,
  coalesce(p.account_name, a.name) AS account_name,
  a.account_type,
  a.account_sub_type,
  CASE
    WHEN a.account_type = 'Bank' THEN 'bank'
    WHEN a.account_type = 'Credit Card' THEN 'credit_card'
    WHEN a.account_sub_type = 'LineOfCredit' THEN 'line_of_credit'
    WHEN a.account_type = 'Long Term Liability' AND a.account_sub_type = 'NotesPayable' THEN 'notes_payable'
    ELSE 'other'
  END AS register_kind,
  'Purchase'::text AS source_entity,
  p.qbo_id AS source_qbo_id,
  coalesce(p.payment_type, 'Purchase') AS txn_type,
  p.txn_date,
  p.doc_number,
  p.entity_ref AS payee_ref,
  p.entity_name AS payee_name,
  CASE WHEN coalesce(p.credit, false) THEN NULL ELSE p.total_amt END AS spent,
  CASE WHEN coalesce(p.credit, false) THEN p.total_amt ELSE NULL END AS received,
  p.private_note AS memo,
  p.credit AS is_credit,
  p.lines,
  p.txn_updated_at,
  p.fetched_at
FROM public.qbo_purchases p
LEFT JOIN public.qbo_accounts a
  ON a.realm_id = p.realm_id AND a.qbo_id = p.account_ref

UNION ALL

SELECT
  d.realm_id,
  d.deposit_to_account_ref AS account_ref,
  coalesce(d.deposit_to_account_name, a.name) AS account_name,
  a.account_type,
  a.account_sub_type,
  CASE
    WHEN a.account_type = 'Bank' THEN 'bank'
    WHEN a.account_type = 'Credit Card' THEN 'credit_card'
    ELSE 'other'
  END AS register_kind,
  'Deposit'::text,
  d.qbo_id,
  'Deposit'::text,
  d.txn_date,
  NULL::text AS doc_number,
  NULL::text AS payee_ref,
  NULL::text AS payee_name,
  NULL::numeric AS spent,
  d.total_amt AS received,
  d.private_note,
  false AS is_credit,
  d.lines,
  d.txn_updated_at,
  d.fetched_at
FROM public.qbo_deposits d
LEFT JOIN public.qbo_accounts a
  ON a.realm_id = d.realm_id AND a.qbo_id = d.deposit_to_account_ref
WHERE d.deposit_to_account_ref IS NOT NULL

UNION ALL

SELECT
  pay.realm_id,
  pay.deposit_to_account_ref AS account_ref,
  a.name AS account_name,
  a.account_type,
  a.account_sub_type,
  CASE
    WHEN a.account_type = 'Bank' THEN 'bank'
    WHEN a.account_type = 'Credit Card' THEN 'credit_card'
    ELSE 'other'
  END AS register_kind,
  'Payment'::text,
  pay.qbo_id,
  'Payment'::text,
  pay.txn_date,
  NULL::text AS doc_number,
  pay.customer_ref AS payee_ref,
  pay.customer_name AS payee_name,
  NULL::numeric AS spent,
  pay.total_amt AS received,
  pay.private_note,
  false AS is_credit,
  pay.lines,
  pay.txn_updated_at,
  pay.fetched_at
FROM public.qbo_payments pay
LEFT JOIN public.qbo_accounts a
  ON a.realm_id = pay.realm_id AND a.qbo_id = pay.deposit_to_account_ref
WHERE pay.deposit_to_account_ref IS NOT NULL
  AND coalesce(a.name, '') NOT ILIKE '%undeposited%'

UNION ALL

SELECT
  bp.realm_id,
  bp.bank_account_ref AS account_ref,
  a.name AS account_name,
  a.account_type,
  a.account_sub_type,
  CASE
    WHEN a.account_type = 'Bank' THEN 'bank'
    WHEN a.account_type = 'Credit Card' THEN 'credit_card'
    ELSE 'other'
  END AS register_kind,
  'BillPayment'::text,
  bp.qbo_id,
  coalesce(bp.pay_type, 'BillPayment') AS txn_type,
  bp.txn_date,
  bp.doc_number,
  bp.vendor_ref AS payee_ref,
  bp.vendor_name AS payee_name,
  bp.total_amt AS spent,
  NULL::numeric AS received,
  bp.private_note,
  false AS is_credit,
  bp.lines,
  bp.txn_updated_at,
  bp.fetched_at
FROM public.qbo_bill_payments bp
LEFT JOIN public.qbo_accounts a
  ON a.realm_id = bp.realm_id AND a.qbo_id = bp.bank_account_ref
WHERE bp.bank_account_ref IS NOT NULL

UNION ALL

SELECT
  t.realm_id,
  t.from_account_ref AS account_ref,
  a.name AS account_name,
  a.account_type,
  a.account_sub_type,
  CASE
    WHEN a.account_type = 'Bank' THEN 'bank'
    WHEN a.account_type = 'Credit Card' THEN 'credit_card'
    WHEN a.account_type = 'Long Term Liability' AND a.account_sub_type = 'NotesPayable' THEN 'notes_payable'
    ELSE 'other'
  END AS register_kind,
  'Transfer'::text,
  t.qbo_id,
  'TransferOut'::text,
  t.txn_date,
  NULL::text AS doc_number,
  t.to_account_ref AS payee_ref,
  ('to ' || coalesce(a2.name, t.to_account_ref))::text AS payee_name,
  t.amount AS spent,
  NULL::numeric AS received,
  t.private_note,
  false AS is_credit,
  '[]'::jsonb AS lines,
  t.txn_updated_at,
  t.fetched_at
FROM public.qbo_transfers t
LEFT JOIN public.qbo_accounts a
  ON a.realm_id = t.realm_id AND a.qbo_id = t.from_account_ref
LEFT JOIN public.qbo_accounts a2
  ON a2.realm_id = t.realm_id AND a2.qbo_id = t.to_account_ref
WHERE t.from_account_ref IS NOT NULL

UNION ALL

SELECT
  t.realm_id,
  t.to_account_ref AS account_ref,
  a.name AS account_name,
  a.account_type,
  a.account_sub_type,
  CASE
    WHEN a.account_type = 'Bank' THEN 'bank'
    WHEN a.account_type = 'Credit Card' THEN 'credit_card'
    WHEN a.account_type = 'Long Term Liability' AND a.account_sub_type = 'NotesPayable' THEN 'notes_payable'
    ELSE 'other'
  END AS register_kind,
  'Transfer'::text,
  t.qbo_id,
  'TransferIn'::text,
  t.txn_date,
  NULL::text AS doc_number,
  t.from_account_ref AS payee_ref,
  ('from ' || coalesce(a2.name, t.from_account_ref))::text AS payee_name,
  NULL::numeric AS spent,
  t.amount AS received,
  t.private_note,
  false AS is_credit,
  '[]'::jsonb AS lines,
  t.txn_updated_at,
  t.fetched_at
FROM public.qbo_transfers t
LEFT JOIN public.qbo_accounts a
  ON a.realm_id = t.realm_id AND a.qbo_id = t.to_account_ref
LEFT JOIN public.qbo_accounts a2
  ON a2.realm_id = t.realm_id AND a2.qbo_id = t.from_account_ref
WHERE t.to_account_ref IS NOT NULL

UNION ALL

SELECT
  j.realm_id,
  line.jel -> 'AccountRef' ->> 'value' AS account_ref,
  coalesce(line.jel -> 'AccountRef' ->> 'name', a.name) AS account_name,
  a.account_type,
  a.account_sub_type,
  CASE
    WHEN a.account_type = 'Bank' THEN 'bank'
    WHEN a.account_type = 'Credit Card' THEN 'credit_card'
    WHEN a.account_type = 'Long Term Liability' AND a.account_sub_type = 'NotesPayable' THEN 'notes_payable'
    ELSE 'other'
  END AS register_kind,
  'JournalEntry'::text,
  j.qbo_id,
  'JournalEntry'::text,
  j.txn_date,
  j.doc_number,
  NULL::text AS payee_ref,
  NULL::text AS payee_name,
  CASE
    WHEN line.jel ->> 'PostingType' = 'Credit' AND a.account_type = 'Bank' THEN (line.elem ->> 'Amount')::numeric
    WHEN line.jel ->> 'PostingType' = 'Debit' AND a.account_type = 'Credit Card' THEN (line.elem ->> 'Amount')::numeric
    WHEN line.jel ->> 'PostingType' = 'Debit' AND a.account_type = 'Long Term Liability' THEN (line.elem ->> 'Amount')::numeric
    WHEN line.jel ->> 'PostingType' = 'Credit' AND a.account_type NOT IN ('Bank', 'Credit Card', 'Long Term Liability') THEN (line.elem ->> 'Amount')::numeric
    ELSE NULL
  END AS spent,
  CASE
    WHEN line.jel ->> 'PostingType' = 'Debit' AND a.account_type = 'Bank' THEN (line.elem ->> 'Amount')::numeric
    WHEN line.jel ->> 'PostingType' = 'Credit' AND a.account_type = 'Credit Card' THEN (line.elem ->> 'Amount')::numeric
    WHEN line.jel ->> 'PostingType' = 'Credit' AND a.account_type = 'Long Term Liability' THEN (line.elem ->> 'Amount')::numeric
    WHEN line.jel ->> 'PostingType' = 'Debit' AND a.account_type NOT IN ('Bank', 'Credit Card', 'Long Term Liability') THEN (line.elem ->> 'Amount')::numeric
    ELSE NULL
  END AS received,
  j.private_note,
  false AS is_credit,
  jsonb_build_array(line.elem) AS lines,
  j.txn_updated_at,
  j.fetched_at
FROM public.qbo_journal_entries j
CROSS JOIN LATERAL (
  SELECT
    elem,
    coalesce(elem -> 'JournalEntryLineDetail', '{}'::jsonb) AS jel
  FROM jsonb_array_elements(coalesce(j.lines, '[]'::jsonb)) AS elem
  WHERE elem -> 'JournalEntryLineDetail' -> 'AccountRef' ->> 'value' IS NOT NULL
) line
JOIN public.qbo_accounts a
  ON a.realm_id = j.realm_id
 AND a.qbo_id = line.jel -> 'AccountRef' ->> 'value'
 AND (
   a.account_type IN ('Bank', 'Credit Card')
   OR a.account_sub_type = 'LineOfCredit'
   OR (a.account_type = 'Long Term Liability' AND a.account_sub_type = 'NotesPayable')
 );

COMMENT ON VIEW public.v_qbo_register_lines IS
  'Unified register lines across all QBO registers. Prefer qbo_registers."<QBO name>" for one register. PEC-109.';

-- ---------------------------------------------------------------------------
-- Schema of views named exactly like QBO registers
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS qbo_registers;
COMMENT ON SCHEMA qbo_registers IS
  'One view per QBO bank/CC/LOC/notes-payable register; view name = exact QBO account name. PEC-109.';

GRANT USAGE ON SCHEMA qbo_registers TO service_role;
REVOKE ALL ON SCHEMA qbo_registers FROM anon, authenticated;

-- Drop legacy invented convenience views from earlier PEC-109 draft (if any)
DROP VIEW IF EXISTS public.v_qbo_register_abc_supply CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_first_united CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_bofa_main CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_amex_1002 CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_boa_cc_9797 CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_chan_chase_cc CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_tab_chase_cc CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_costco_citi CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_home_depot CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_wex_fuel CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_aa_cc_1872 CASCADE;
DROP VIEW IF EXISTS public.v_qbo_register_spark_capital_one CASCADE;

CREATE OR REPLACE FUNCTION public.qbo_refresh_register_views()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, qbo_registers
AS $$
DECLARE
  r record;
  created int := 0;
  view_ident text;
  acct_literal text;
BEGIN
  -- Remove views that no longer match a register account (or were renamed in QBO)
  FOR r IN
    SELECT c.relname AS view_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'qbo_registers'
      AND c.relkind = 'v'
      AND NOT EXISTS (
        SELECT 1
        FROM public.v_qbo_register_accounts a
        WHERE a.account_name = c.relname
      )
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS qbo_registers.%I CASCADE', r.view_name);
  END LOOP;

  FOR r IN
    SELECT DISTINCT ON (account_name)
      account_ref,
      account_name
    FROM public.v_qbo_register_accounts
    WHERE account_name IS NOT NULL
      AND btrim(account_name) <> ''
    ORDER BY account_name, account_ref
  LOOP
    view_ident := format('%I', r.account_name);           -- "ABC Supply", "Lowe's Commercial"
    acct_literal := quote_literal(r.account_ref);
    EXECUTE format(
      'CREATE OR REPLACE VIEW qbo_registers.%s AS
         SELECT *
         FROM public.v_qbo_register_lines
         WHERE account_ref = %s
            OR account_name = %L',
      view_ident,
      acct_literal,
      r.account_name
    );
    EXECUTE format(
      'COMMENT ON VIEW qbo_registers.%s IS %L',
      view_ident,
      format('QBO register mirror for %s (account_ref=%s). PEC-109.', r.account_name, r.account_ref)
    );
    EXECUTE format('GRANT SELECT ON qbo_registers.%s TO service_role', view_ident);
    EXECUTE format('REVOKE ALL ON qbo_registers.%s FROM anon, authenticated', view_ident);
    created := created + 1;
  END LOOP;

  RETURN created;
END;
$$;

COMMENT ON FUNCTION public.qbo_refresh_register_views() IS
  'Creates/replaces qbo_registers."<exact QBO account name>" views for every register account. Run after CoA sync. PEC-109.';

GRANT EXECUTE ON FUNCTION public.qbo_refresh_register_views() TO service_role;
REVOKE ALL ON FUNCTION public.qbo_refresh_register_views() FROM anon, authenticated;

-- Dynamic accessor by exact QBO name / account_ref (no invented slugs)
CREATE OR REPLACE FUNCTION public.qbo_register(p_account text)
RETURNS SETOF public.v_qbo_register_lines
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.v_qbo_register_lines r
  WHERE r.account_ref = p_account
     OR r.account_name = p_account;
$$;

COMMENT ON FUNCTION public.qbo_register(text) IS
  'Register lines for one account by exact QBO name or account_ref. Example: select * from qbo_register(''ABC Supply''); PEC-109.';

GRANT EXECUTE ON FUNCTION public.qbo_register(text) TO service_role;
REVOKE ALL ON FUNCTION public.qbo_register(text) FROM anon, authenticated;

GRANT SELECT ON public.v_qbo_register_accounts TO service_role;
GRANT SELECT ON public.v_qbo_register_lines TO service_role;
REVOKE ALL ON public.v_qbo_register_accounts FROM anon, authenticated;
REVOKE ALL ON public.v_qbo_register_lines FROM anon, authenticated;

-- Materialize the named register views from current CoA
SELECT public.qbo_refresh_register_views();
