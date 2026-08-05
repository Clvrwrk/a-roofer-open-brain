-- 202 — Per-line human review acknowledgment for credit-memo claims (Chris 2026-08-05)
-- Every claim line must be individually acknowledged by the human in the loop before the
-- invoice's Credit Memo Approve button activates (server-enforced in
-- /api/credit-memos/approve, mirrored in the UI as checkbox-gated greying).
-- Additive + idempotent. Applied to prod 2026-08-05.

ALTER TABLE public.invoice_line_reaudit ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE public.invoice_line_reaudit ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invoice_line_reaudit_review
  ON public.invoice_line_reaudit (invoice_number, classification)
  WHERE classification = 'discrepancy';
