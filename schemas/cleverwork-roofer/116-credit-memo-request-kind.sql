-- 116-credit-memo-request-kind.sql
-- Distinguishes the two credit-memo flows that share credit_memo_requests:
--   received  — a credit memo the vendor ISSUED, audited against its original invoice
--               (invoice_number = the CM doc #; dispositioned approve/review/reject).
--   requested — a credit WE are requesting from the vendor after an Invoice-Audit overcharge
--               disposition (invoice_number = the over-priced invoice; lifecycle draft→sent→
--               received). This is the "track our requested credit memos" tracker.
-- Additive + idempotent.
ALTER TABLE public.credit_memo_requests
  ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'requested';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_memo_requests_kind_check'
  ) THEN
    ALTER TABLE public.credit_memo_requests
      ADD CONSTRAINT credit_memo_requests_kind_check CHECK (request_kind IN ('received', 'requested'));
  END IF;
END $$;
