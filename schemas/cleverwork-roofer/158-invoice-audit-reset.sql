-- 158-invoice-audit-reset.sql
-- docs/59 Task 6 — per-invoice "Go back" reset.
-- Additive + idempotent. Two parts:
--   1. Broaden credit_memo_requests.status to allow 'cancelled' (a draft credit-memo
--      candidate that a reset retracts before it was ever sent). Broadening a CHECK
--      never invalidates existing rows — no data is dropped (hard rule 1).
--   2. A single-transaction RPC invoice_audit_reset() that the WorkOS-gated
--      /api/invoice-audit/reset route calls. All-or-nothing by design (RT-2):
--        - refuses paid / exported / credit-memo invoices,
--        - APPENDS 'pending' audit rows for every line not already pending
--          (never deletes — hard rule 1; append-only history),
--        - cancels ONLY 'draft' credit-memo candidates (never sent/approved/received),
--        - leaves all communications untouched (sent comms are never reversed),
--        - writes one dashboard_action_log entry,
--        - idempotent: a second call finds nothing to reset and is a no-op.

-- 1. Allow 'cancelled' on credit_memo_requests (additive broadening of the CHECK).
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.credit_memo_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.credit_memo_requests DROP CONSTRAINT %I', v_conname);
  END IF;
  ALTER TABLE public.credit_memo_requests
    ADD CONSTRAINT credit_memo_requests_status_check
    CHECK (status IN ('draft','approved','sent','received','rejected','needs_more_evidence','closed','cancelled'));
END $$;

-- 2. Transactional reset.
CREATE OR REPLACE FUNCTION public.invoice_audit_reset(
  p_invoice_number text,
  p_actor_id       text,
  p_actor_type     text,
  p_actor_display  text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_credit_memo boolean;
  v_paid           boolean;
  v_processed      text;
  v_lines_reset    integer := 0;
  v_cm_cancelled   integer := 0;
  v_action_id      uuid;
  v_actor          text := COALESCE(NULLIF(btrim(p_actor_display), ''), 'operator');
BEGIN
  -- Invoice must exist.
  SELECT is_credit_memo INTO v_is_credit_memo
  FROM public.abc_invoices WHERE invoice_number = p_invoice_number;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- A credit memo is itself a reversal artifact — not resettable here.
  IF v_is_credit_memo THEN
    RETURN jsonb_build_object('ok', false, 'error', 'credit_memo_not_resettable');
  END IF;

  -- Paid invoices cannot be reset (ABC AR is source of truth; fall back to the doc mirror).
  SELECT (ar_status = 'paid') INTO v_paid
  FROM public.abc_invoices WHERE invoice_number = p_invoice_number;
  IF v_paid IS NOT TRUE THEN
    SELECT (payment_status = 'paid') INTO v_paid
    FROM public.invoice_documents WHERE invoice_number = p_invoice_number LIMIT 1;
  END IF;
  IF v_paid IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_paid');
  END IF;

  -- An invoice already exported to (or paid through) the payment ledger is in-flight
  -- or settled — resetting it could desync an external payment file.
  SELECT status INTO v_processed
  FROM public.invoice_payment_processed
  WHERE invoice_number = p_invoice_number AND status IN ('exported','paid')
  ORDER BY processed_at DESC LIMIT 1;
  IF v_processed IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_' || v_processed);
  END IF;

  -- Append a 'pending' audit row for every line whose current status is not already
  -- pending (passed or disputed). Append-only: prior decisions stay in history.
  WITH cur AS (
    SELECT c.invoice_line_id, c.audit_status, l.item_number
    FROM public.v_invoice_line_audit_current c
    JOIN public.abc_invoice_lines l ON l.id = c.invoice_line_id
    WHERE c.invoice_number = p_invoice_number
  ), ins AS (
    INSERT INTO public.invoice_line_audit
      (invoice_line_id, invoice_number, item_number, audit_status, decision,
       approved_by, approval_note, source, decided_by)
    SELECT invoice_line_id, p_invoice_number, item_number, 'pending', 'reset',
           v_actor, 'Reset to pending (Go back)', 'manual', v_actor
    FROM cur
    WHERE audit_status <> 'pending'
    RETURNING 1
  )
  SELECT count(*) INTO v_lines_reset FROM ins;

  -- Cancel ONLY draft credit-memo candidates — never one that has been approved, sent,
  -- or received (those represent real external state).
  UPDATE public.credit_memo_requests
  SET status = 'cancelled',
      packet = COALESCE(packet, '{}'::jsonb)
               || jsonb_build_object('cancelled_by', v_actor,
                                     'cancelled_at', now(),
                                     'cancel_reason', 'invoice_reset'),
      updated_at = now()
  WHERE invoice_number = p_invoice_number AND status = 'draft';
  GET DIAGNOSTICS v_cm_cancelled = ROW_COUNT;

  -- Immutable audit-trail entry — only when the reset actually changed something
  -- (a duplicate/no-op reset, e.g. a double-click, is not logged as an action).
  IF v_lines_reset > 0 OR v_cm_cancelled > 0 THEN
    INSERT INTO public.dashboard_action_log
      (work_key, department, workflow, action_type, decision,
       actor_id, actor_type, actor_display_name, note, payload, source_table, source_pk)
    VALUES
      ('invoice-audit:' || p_invoice_number, 'accounting', 'invoice-audit', 'invoice_reset', NULL,
       COALESCE(NULLIF(btrim(p_actor_id), ''), v_actor),
       COALESCE(NULLIF(btrim(p_actor_type), ''), 'unknown'),
       v_actor,
       'Reset invoice to pending (Go back)',
       jsonb_build_object('lines_reset', v_lines_reset, 'credit_memos_cancelled', v_cm_cancelled),
       'invoice_line_audit', p_invoice_number)
    RETURNING id INTO v_action_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lines_reset', v_lines_reset,
    'credit_memos_cancelled', v_cm_cancelled,
    'action_id', v_action_id
  );
END $$;

COMMENT ON FUNCTION public.invoice_audit_reset(text, text, text, text) IS
  'docs/59 Task 6 — atomic per-invoice reset: append pending audit rows, cancel draft '
  'credit memos, log the action. Refuses paid/exported/credit-memo invoices. Never deletes.';
