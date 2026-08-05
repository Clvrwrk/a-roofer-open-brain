-- 197 — Invoice Audit v2 status model (docs/81, approved 2026-08-05)
-- Two-axis status contract:
--   pipeline/audit axis: invoice_processed -> invoice_audit_pending -> invoice_audit_complete
--   paid axis:           exported (Awaiting Payment) -> paid_pending_verification -> paid_verified
-- Additive + idempotent per hard rule 1. Applied to prod 2026-08-05.

-- 1) Invoice-level pipeline status (cross-vendor; ABC + QXO + SRS)
CREATE TABLE IF NOT EXISTS public.invoice_pipeline_status (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vendor_slug           text NOT NULL DEFAULT 'abc',
  invoice_number        text NOT NULL,
  pipeline_status       text NOT NULL DEFAULT 'invoice_processed'
                        CHECK (pipeline_status IN ('invoice_processed','invoice_audit_pending','invoice_audit_complete')),
  processed_at          timestamptz,
  audit_completed_at    timestamptz,
  -- Stage-1 step evidence (docs/81 §2 "Invoice Processed" definition)
  pdf_linked            boolean,
  ocr_verified_at       timestamptz,
  ocr_line_sum          numeric(14,2),
  ocr_subtotal          numeric(14,2),
  ocr_matches_subtotal  boolean,          -- NULL = OCR pending (Phase 4 backfill)
  agreement_matched     boolean,          -- false = no agreement anywhere -> valid as billed
  paexp_tags            text[],           -- e.g. {PAEXP-2026-05-31}
  qb_file_name          text,             -- INV-PROCESSED-[date_processed].csv it shipped in
  qb_included_at        timestamptz,
  source                text NOT NULL DEFAULT 'pipeline_v2',  -- pipeline_v2 | cleanup_wave_a | cleanup_wave_b
  note                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_slug, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoice_pipeline_status_status
  ON public.invoice_pipeline_status (pipeline_status);
CREATE INDEX IF NOT EXISTS idx_invoice_pipeline_status_invoice
  ON public.invoice_pipeline_status (invoice_number);

-- 2) Paid-verification statuses on the payment ledger
ALTER TABLE public.invoice_payment_processed
  DROP CONSTRAINT IF EXISTS invoice_payment_processed_status_check;
ALTER TABLE public.invoice_payment_processed
  ADD CONSTRAINT invoice_payment_processed_status_check
  CHECK (status IN ('exported','paid','returned','void','paid_pending_verification','paid_verified'));

ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.invoice_payment_processed ADD COLUMN IF NOT EXISTS verified_by text;

-- 3) PAEXP tag at the line-review level (docs/81 §4: every audited line under a
--    lapsed-but-in-force agreement carries PAEXP-[date_expired])
ALTER TABLE public.invoice_line_audit ADD COLUMN IF NOT EXISTS paexp_tag text;

-- 4) Broaden invoice_line_audit.source: legalize the value release-credit-holds
--    already writes, plus the v2 pipeline writer
ALTER TABLE public.invoice_line_audit
  DROP CONSTRAINT IF EXISTS invoice_line_audit_source_check;
ALTER TABLE public.invoice_line_audit
  ADD CONSTRAINT invoice_line_audit_source_check
  CHECK (source IN ('auto_match','manual','backfill','credit-memo-reconcile','pipeline_v2'));

-- 5) updated_at maintenance
CREATE OR REPLACE FUNCTION public.tg_invoice_pipeline_status_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_pipeline_status_updated_at ON public.invoice_pipeline_status;
CREATE TRIGGER trg_invoice_pipeline_status_updated_at
  BEFORE UPDATE ON public.invoice_pipeline_status
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_pipeline_status_updated_at();
