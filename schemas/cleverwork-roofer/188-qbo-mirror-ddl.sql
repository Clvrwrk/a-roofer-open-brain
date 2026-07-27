-- 188 — QuickBooks Online relational mirror (PEC-102 / docs/76)
--
-- Destination for full historical QBO extract into PE Supabase.
-- Production QBO is READ-ONLY forever (PEC-98 / docs/74). This schema is the
-- mutable copy. Additive + idempotent; archive never delete.
--
-- Unique key: (realm_id, qbo_id) per entity table.
-- Lines live in jsonb on the parent for v1 (normalize later if needed).

-- ---------------------------------------------------------------------------
-- Sync control
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.qbo_sync_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key         text NOT NULL UNIQUE,
  realm_id        text NOT NULL,
  mode            text NOT NULL DEFAULT 'backfill', -- backfill | thursday | cdc | smoke
  status          text NOT NULL DEFAULT 'running', -- running | ok | failed
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  entities        text[] NOT NULL DEFAULT '{}',
  stats           jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings        jsonb NOT NULL DEFAULT '[]'::jsonb,
  error           text,
  content_hash    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qbo_sync_watermarks (
  realm_id        text NOT NULL,
  entity          text NOT NULL, -- Account | Customer | Invoice | Purchase | CDC | ...
  watermark_at    timestamptz,   -- MetaData.LastUpdatedTime high-water
  last_run_key    text,
  last_count      integer,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, entity)
);

-- ---------------------------------------------------------------------------
-- Shared column convention helpers via comments on first table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.qbo_company_info (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  company_name    text,
  legal_name      text,
  country         text,
  fiscal_year_start_month integer,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);

CREATE TABLE IF NOT EXISTS public.qbo_accounts (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  name            text,
  fully_qualified_name text,
  account_type    text,
  account_sub_type text,
  classification  text,
  active          boolean,
  current_balance numeric,
  currency_ref    text,
  parent_ref      text,
  sync_token      text,
  txn_updated_at  timestamptz,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);
CREATE INDEX IF NOT EXISTS qbo_accounts_type_idx ON public.qbo_accounts (realm_id, account_type);
CREATE INDEX IF NOT EXISTS qbo_accounts_name_idx ON public.qbo_accounts (realm_id, name);

CREATE TABLE IF NOT EXISTS public.qbo_customers (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  display_name    text,
  company_name    text,
  active          boolean,
  balance         numeric,
  currency_ref    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);
CREATE INDEX IF NOT EXISTS qbo_customers_name_idx ON public.qbo_customers (realm_id, display_name);

CREATE TABLE IF NOT EXISTS public.qbo_vendors (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  display_name    text,
  company_name    text,
  active          boolean,
  balance         numeric,
  currency_ref    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);
CREATE INDEX IF NOT EXISTS qbo_vendors_name_idx ON public.qbo_vendors (realm_id, display_name);

CREATE TABLE IF NOT EXISTS public.qbo_classes (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  name            text,
  fully_qualified_name text,
  active          boolean,
  parent_ref      text,
  sync_token      text,
  txn_updated_at  timestamptz,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);

-- ---------------------------------------------------------------------------
-- AR / AP / register entities (header + lines jsonb)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.qbo_invoices (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  doc_number      text,
  txn_date        date,
  due_date        date,
  total_amt       numeric,
  balance         numeric,
  currency_ref    text,
  customer_ref    text,
  customer_name   text,
  private_note    text,
  email_status    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);
CREATE INDEX IF NOT EXISTS qbo_invoices_txn_date_idx ON public.qbo_invoices (realm_id, txn_date);
CREATE INDEX IF NOT EXISTS qbo_invoices_doc_idx ON public.qbo_invoices (realm_id, doc_number);
CREATE INDEX IF NOT EXISTS qbo_invoices_customer_idx ON public.qbo_invoices (realm_id, customer_ref);

CREATE TABLE IF NOT EXISTS public.qbo_payments (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  txn_date        date,
  total_amt       numeric,
  currency_ref    text,
  customer_ref    text,
  customer_name   text,
  deposit_to_account_ref text,
  private_note    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);
CREATE INDEX IF NOT EXISTS qbo_payments_txn_date_idx ON public.qbo_payments (realm_id, txn_date);

CREATE TABLE IF NOT EXISTS public.qbo_bills (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  doc_number      text,
  txn_date        date,
  due_date        date,
  total_amt       numeric,
  balance         numeric,
  currency_ref    text,
  vendor_ref      text,
  vendor_name     text,
  private_note    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);
CREATE INDEX IF NOT EXISTS qbo_bills_txn_date_idx ON public.qbo_bills (realm_id, txn_date);
CREATE INDEX IF NOT EXISTS qbo_bills_vendor_idx ON public.qbo_bills (realm_id, vendor_ref);

CREATE TABLE IF NOT EXISTS public.qbo_bill_payments (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  doc_number      text,
  txn_date        date,
  total_amt       numeric,
  pay_type        text,
  vendor_ref      text,
  vendor_name     text,
  bank_account_ref text,
  private_note    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);

-- Bank / CC / LOC register core (Expense / Check / CreditCardCredit via Purchase)
CREATE TABLE IF NOT EXISTS public.qbo_purchases (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  doc_number      text,
  txn_date        date,
  total_amt       numeric,
  payment_type    text,          -- Cash | Check | CreditCard
  credit          boolean,       -- true = Credit Card Credit / refund-like
  account_ref     text,          -- bank/CC/LOC GL
  account_name    text,
  entity_ref      text,          -- vendor
  entity_name     text,
  private_note    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);
CREATE INDEX IF NOT EXISTS qbo_purchases_txn_date_idx ON public.qbo_purchases (realm_id, txn_date);
CREATE INDEX IF NOT EXISTS qbo_purchases_account_idx ON public.qbo_purchases (realm_id, account_ref);
CREATE INDEX IF NOT EXISTS qbo_purchases_doc_idx ON public.qbo_purchases (realm_id, doc_number);

CREATE TABLE IF NOT EXISTS public.qbo_deposits (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  txn_date        date,
  total_amt       numeric,
  deposit_to_account_ref text,
  deposit_to_account_name text,
  private_note    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);
CREATE INDEX IF NOT EXISTS qbo_deposits_txn_date_idx ON public.qbo_deposits (realm_id, txn_date);

CREATE TABLE IF NOT EXISTS public.qbo_journal_entries (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  doc_number      text,
  txn_date        date,
  private_note    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);
CREATE INDEX IF NOT EXISTS qbo_journals_txn_date_idx ON public.qbo_journal_entries (realm_id, txn_date);

CREATE TABLE IF NOT EXISTS public.qbo_vendor_credits (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  doc_number      text,
  txn_date        date,
  total_amt       numeric,
  balance         numeric,
  vendor_ref      text,
  vendor_name     text,
  private_note    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);

CREATE TABLE IF NOT EXISTS public.qbo_credit_memos (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  doc_number      text,
  txn_date        date,
  total_amt       numeric,
  balance         numeric,
  customer_ref    text,
  customer_name   text,
  private_note    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);

CREATE TABLE IF NOT EXISTS public.qbo_transfers (
  realm_id        text NOT NULL,
  qbo_id          text NOT NULL,
  txn_date        date,
  amount          numeric,
  from_account_ref text,
  to_account_ref  text,
  private_note    text,
  sync_token      text,
  txn_updated_at  timestamptz,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, qbo_id)
);

-- Report snapshots (TB / P&L / BS / CF / AR aging / AP aging)
CREATE TABLE IF NOT EXISTS public.qbo_report_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id        text NOT NULL,
  report_name     text NOT NULL, -- BalanceSheet | ProfitAndLoss | TrialBalance | CashFlow | AgedReceivableDetail | AgedPayableDetail
  as_of_date      date,
  start_date      date,
  end_date        date,
  accounting_method text,        -- Cash | Accrual (label only; PE books are cash)
  summarize_column_by text,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (realm_id, report_name, content_hash)
);
CREATE INDEX IF NOT EXISTS qbo_reports_lookup_idx
  ON public.qbo_report_snapshots (realm_id, report_name, as_of_date DESC);

-- ---------------------------------------------------------------------------
-- RLS deny-by-default (service_role only) — house pattern mig 177
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'qbo_sync_runs','qbo_sync_watermarks','qbo_company_info','qbo_accounts',
    'qbo_customers','qbo_vendors','qbo_classes','qbo_invoices','qbo_payments',
    'qbo_bills','qbo_bill_payments','qbo_purchases','qbo_deposits',
    'qbo_journal_entries','qbo_vendor_credits','qbo_credit_memos','qbo_transfers',
    'qbo_report_snapshots'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.qbo_purchases IS
  'QBO Purchase entities (Expense/Check/CreditCard) — primary bank/CC/LOC register mirror for ABC Supply and other cards. PEC-102.';
COMMENT ON TABLE public.qbo_sync_runs IS
  'QBO mirror run ledger. Production QBO is read-only (PEC-98); this table records extract batches only.';
