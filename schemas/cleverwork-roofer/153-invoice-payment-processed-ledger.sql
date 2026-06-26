-- 153-invoice-payment-processed-ledger.sql
-- Additive ledger for the Invoice Audit "Invoices To Be Paid" -> QuickBooks CSV
-- workflow. One row per invoice that has been exported for payment, tracked
-- through a two-phase lifecycle so "exported for payment" is never confused
-- with "actually paid":
--
--   exported  -> CSV generated & sent to QuickBooks/AP; invoice leaves the
--                To-Be-Paid queue but is NOT yet paid (Awaiting Payment).
--   paid      -> payment confirmed, either manually (paid_source='manual') or
--                reconciled from ABC AR sync (paid_source='abc_ar_sync').
--   returned  -> payment failed / reverted; invoice becomes eligible again.
--   void      -> export cancelled administratively.
--
-- Server-only: Command Center writes through service-role API routes. No direct
-- anon/authenticated Data API access is granted. Additive + idempotent.

CREATE TABLE IF NOT EXISTS public.invoice_payment_processed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  vendor text NOT NULL DEFAULT 'ABC Supply',
  invoice_number text NOT NULL,
  invoice_date date,
  total_due numeric,
  purchase_order_number text,
  discount_message text,
  due_date date,
  terms text,
  discount_amount numeric,
  approved_to_pay boolean NOT NULL DEFAULT true,
  csv_file_name text NOT NULL,
  csv_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'exported',
  processed_by text,
  processed_by_actor jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  paid_confirmed_by text,
  paid_confirmed_actor jsonb,
  paid_source text,
  reconciled_at timestamptz,
  returned_at timestamptz,
  returned_reason text,
  source text NOT NULL DEFAULT 'command_center_invoice_audit',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payment_processed_invoice_number_key UNIQUE (invoice_number)
);

-- Lifecycle columns (additive for any table created by an earlier draft of 153).
ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'exported';
ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS paid_confirmed_by text;
ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS paid_confirmed_actor jsonb;
ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS paid_source text;
ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS returned_reason text;
ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_payment_processed_status_check'
  ) THEN
    ALTER TABLE public.invoice_payment_processed
      ADD CONSTRAINT invoice_payment_processed_status_check
      CHECK (status IN ('exported', 'paid', 'returned', 'void'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invoice_payment_processed_batch_idx
  ON public.invoice_payment_processed (batch_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS invoice_payment_processed_processed_at_idx
  ON public.invoice_payment_processed (processed_at DESC);
CREATE INDEX IF NOT EXISTS invoice_payment_processed_status_idx
  ON public.invoice_payment_processed (status, processed_at DESC);

ALTER TABLE public.invoice_payment_processed ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.invoice_payment_processed FROM anon;
REVOKE ALL ON TABLE public.invoice_payment_processed FROM authenticated;

-- Reconciliation view: joins each ledger row to live ABC AR state so the
-- Command Center can surface exceptions (exported but never cleared, or
-- ledger-paid but ABC still shows open). Drift_flag is the actionable signal.
CREATE OR REPLACE VIEW public.v_invoice_payment_reconciliation AS
SELECT
  p.invoice_number,
  p.batch_id,
  p.status                         AS ledger_status,
  p.total_due,
  p.processed_at,
  p.paid_at,
  p.paid_source,
  p.due_date,
  i.ar_status                      AS abc_ar_status,
  i.date_paid                      AS abc_date_paid,
  i.ar_total_due                   AS abc_ar_total_due,
  (now() - p.processed_at)         AS age_since_export,
  CASE
    WHEN p.status = 'exported' AND i.ar_status = 'paid'                       THEN 'ar_now_paid'
    WHEN p.status = 'exported' AND p.processed_at < now() - interval '14 days' THEN 'exported_uncleared'
    WHEN p.status = 'paid'     AND i.ar_status IS NOT NULL AND i.ar_status <> 'paid' THEN 'paid_but_ar_open'
    ELSE 'ok'
  END AS drift_flag
FROM public.invoice_payment_processed p
LEFT JOIN public.abc_invoices i ON i.invoice_number = p.invoice_number
WHERE p.status IN ('exported', 'paid');

COMMENT ON TABLE public.invoice_payment_processed IS
  'One row per invoice exported through the Command Center Invoice Audit to-be-paid CSV workflow. Two-phase lifecycle (exported -> paid | returned | void). Server-only; service role writes from /api/invoice-audit/* routes.';
COMMENT ON COLUMN public.invoice_payment_processed.batch_id IS
  'Shared UUID for one Process/export action; re-download streams this batch.';
COMMENT ON COLUMN public.invoice_payment_processed.status IS
  'exported (Awaiting Payment) | paid | returned (re-eligible) | void.';
COMMENT ON COLUMN public.invoice_payment_processed.paid_source IS
  'manual (Confirm Paid action) | abc_ar_sync (reconciled from ABC AR status).';
COMMENT ON COLUMN public.invoice_payment_processed.csv_row IS
  'Exact row payload used to render the exported QuickBooks CSV (stable re-download).';
COMMENT ON VIEW public.v_invoice_payment_reconciliation IS
  'Ledger rows joined to live ABC AR state; drift_flag surfaces export/payment disagreements for the reconciliation panel.';
