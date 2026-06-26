-- 153-invoice-payment-processed-ledger.sql
-- Additive ledger for Invoice Audit "Invoices To Be Paid" CSV processing.
-- Server-only: Command Center writes through service-role API routes. No direct
-- anon/authenticated Data API access is granted.

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
  processed_by text,
  processed_by_actor jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'command_center_invoice_audit',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payment_processed_invoice_number_key UNIQUE (invoice_number)
);

CREATE INDEX IF NOT EXISTS invoice_payment_processed_batch_idx
  ON public.invoice_payment_processed (batch_id, processed_at DESC);

CREATE INDEX IF NOT EXISTS invoice_payment_processed_processed_at_idx
  ON public.invoice_payment_processed (processed_at DESC);

ALTER TABLE public.invoice_payment_processed ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.invoice_payment_processed FROM anon;
REVOKE ALL ON TABLE public.invoice_payment_processed FROM authenticated;

COMMENT ON TABLE public.invoice_payment_processed IS
  'One row per invoice exported through the Command Center Invoice Audit to-be-paid CSV workflow. Server-only; service role writes from /api/invoice-audit/to-be-paid.csv.';
COMMENT ON COLUMN public.invoice_payment_processed.batch_id IS
  'Shared UUID for one Process button/download action.';
COMMENT ON COLUMN public.invoice_payment_processed.csv_row IS
  'Exact row payload used to render the exported payable CSV.';
