-- 226 · QB bank-ledger CSV export (Chris directive 2026-08-09; PEC ticket in Linear)
-- Purpose: generate a QB-importable CSV per vendor bank ledger (ABC / SRS / QXO).
-- A HUMAN downloads the file and loads it into QuickBooks — QBO stays read-only
-- (hard rule 13, docs/74). This table is only the dedupe/audit ledger recording
-- which rows have been handed to QB, so an invoice or credit memo is exported once.
-- Additive + idempotent (hard rule 1).

CREATE TABLE IF NOT EXISTS public.qb_bank_export_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_slug text NOT NULL,                  -- vendors.slug (docs/87 silo key)
  row_kind text NOT NULL CHECK (row_kind IN ('invoice','cm_tbd','cm_actual')),
  -- doc_number: invoice # for 'invoice'; ORIGINAL invoice # for 'cm_tbd';
  -- the credit-memo invoice # for 'cm_actual'.
  doc_number text NOT NULL,
  txn_date date,
  check_no text,
  bank_description text NOT NULL,
  spent numeric(14,2),
  received numeric(14,2),
  batch_id uuid NOT NULL,
  exported_by text,
  exported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_slug, row_kind, doc_number)
);

CREATE INDEX IF NOT EXISTS qb_bank_export_log_batch_idx
  ON public.qb_bank_export_log (batch_id);
CREATE INDEX IF NOT EXISTS qb_bank_export_log_vendor_idx
  ON public.qb_bank_export_log (vendor_slug, exported_at DESC);

COMMENT ON TABLE public.qb_bank_export_log IS
  'Dedupe/audit ledger for the per-vendor QB bank CSV export (mig 226). Row kinds: invoice (Spent = invoice total, description VENDOR-INV#n), cm_tbd (Received = requested CM value, description CM-TBD-INV#n — QA line proving a requested credit memo eventually arrives), cm_actual (Received = credit memo total, description CMINV#cm-OriginalINV#orig). Check No = <AccuLynx job #>-<customer last name> truncated to 21 chars.';
