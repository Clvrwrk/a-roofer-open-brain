-- cleverwork-roofer/146-invoice-line-audit-communication-thread.sql
-- Add idempotency anchor for communication-driven approvals.
-- ADDITIVE + IDEMPOTENT.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'invoice_line_audit'
  ) THEN
    ALTER TABLE public.invoice_line_audit
      ADD COLUMN IF NOT EXISTS communication_thread_id uuid;

    CREATE UNIQUE INDEX IF NOT EXISTS invoice_line_audit_communication_thread_uidx
      ON public.invoice_line_audit (communication_thread_id)
      WHERE communication_thread_id IS NOT NULL;

    COMMENT ON COLUMN public.invoice_line_audit.communication_thread_id IS
      'Optional idempotency key linking an audit decision to communication_threads.id.';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
