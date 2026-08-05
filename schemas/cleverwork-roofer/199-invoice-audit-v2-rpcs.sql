-- 199 — Invoice Audit v2 RPCs (docs/81 Phase 3). Additive + idempotent.
-- Applied to prod 2026-08-05.

-- Process button (pure stamp, docs/81 decision 9): every invoice in
-- 'invoice_audit_pending' flips to 'invoice_audit_complete' with a completion date.
-- No export side effects.
CREATE OR REPLACE FUNCTION public.invoice_audit_process_stamp(p_actor text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.invoice_pipeline_status
  SET pipeline_status = 'invoice_audit_complete',
      audit_completed_at = now(),
      note = trim(both ' · ' from coalesce(note, '') || ' · stamped complete by ' || coalesce(p_actor, 'dashboard'))
  WHERE pipeline_status = 'invoice_audit_pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- 60-day payment-verification sweep (docs/81 decisions 3+4): invoices sitting in
-- Awaiting Payment (status='exported') whose INVOICE DATE is >= 60 days old move to
-- 'paid_pending_verification'. Idempotent; run before listing the Manage panel.
CREATE OR REPLACE FUNCTION public.invoice_payment_verification_sweep()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.invoice_payment_processed
  SET status = 'paid_pending_verification', updated_at = now()
  WHERE status = 'exported'
    AND invoice_date IS NOT NULL
    AND invoice_date <= current_date - 60;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
