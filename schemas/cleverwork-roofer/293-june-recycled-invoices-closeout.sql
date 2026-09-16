-- 293 — close out the ABC June 2026 invoices recycled by the triage-race reopen.
--
-- Chris, 2026-09-16: "The invoices that we recycled from ABC month 06 can be marked
-- processed with a note reminding us these are complete processed and should never be
-- brought back into the invoice audit workflow."
--
-- The seven June invoices are the ones migs 289/290 reopened (KS-173/174/167/176/177/169/181):
--   2011009179-001 · 2011010454-001 · 2011012396-001 · 2011014809-001 · 2011017518-001
--   2011016277-001 · 2011284893-001
-- Six were register-exported 2026-08-25 (loaded to QuickBooks); 2011284893-001 went out in
-- the 2026-07-27 payment CSV and sits in Pay-It verification.
--
-- Four things make "processed, never again" real rather than a note nobody reads:
--   1. invoice_audit_closeout — a durable, human-attributed record per (vendor, invoice) that
--      the reset RPC (and any future reopen script) must honour. New table, service-role only.
--   2. Every line still pending on these invoices is decided valid under Chris's name with the
--      closeout reason in the note. Decided lines are never re-stamped by Alex's triage.
--   3. invoice_payment_processed gets a 'paid' row (source = 'closeout') for the six invoices
--      that have none, so the app's payment state reads processed, they leave the To-Be-Paid
--      set, and the Pay-It queue is untouched (it lists paid_pending_verification only).
--      2011284893-001 already has its 2026-07-27 row and is left to Lucinda's verification.
--   4. invoice_audit_reset() refuses a closed-out invoice with error 'invoice_closed_out'
--      before it writes anything (the existing paid / exported refusals still apply after).
--
-- Deliberately NOT touched: Chris's own 2026-09-15 17:49 discrepancy decision on
-- 2011009179-001 17LO750GSB and the $20.00 DRAFT credit-memo request it sits in — a human
-- decision is a decision; cancel or approve the draft in the Weekly CM view.
--
-- Additive + idempotent. Rollback: DELETE FROM invoice_audit_closeout (the guard lifts);
-- the audit rows and ledger rows are history and stay.

-- 1 · the closeout register
CREATE TABLE IF NOT EXISTS public.invoice_audit_closeout (
  vendor_slug    text        NOT NULL DEFAULT 'abc-supply',
  invoice_number text        NOT NULL,
  closed_by      text        NOT NULL,
  closed_at      timestamptz NOT NULL DEFAULT now(),
  reason         text        NOT NULL,
  source         text        NOT NULL DEFAULT 'manual',
  PRIMARY KEY (vendor_slug, invoice_number)
);
COMMENT ON TABLE public.invoice_audit_closeout IS
  'Invoices a human has declared complete and processed: never brought back into the invoice audit workflow. invoice_audit_reset() refuses them; reopen scripts must check here first (mig 293).';
ALTER TABLE public.invoice_audit_closeout ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoice_audit_closeout' AND policyname = 'service_role_all') THEN
    CREATE POLICY service_role_all ON public.invoice_audit_closeout FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON public.invoice_audit_closeout TO service_role;

-- 2 · the seven June invoices
INSERT INTO public.invoice_audit_closeout (vendor_slug, invoice_number, closed_by, reason, source)
SELECT 'abc-supply', x.invoice_number, 'Chris Hussey',
       'Chris 2026-09-16: ABC June 2026 invoice recycled by the triage-race reopen (migs 289/290) is complete and processed — do not bring it back into the invoice audit workflow.',
       'mig 293'
FROM (VALUES ('2011009179-001'), ('2011010454-001'), ('2011012396-001'), ('2011014809-001'),
             ('2011017518-001'), ('2011016277-001'), ('2011284893-001')) AS x(invoice_number)
ON CONFLICT (vendor_slug, invoice_number) DO NOTHING;

-- 3 · decide every still-pending line on them, under Chris's name, with the reason
INSERT INTO public.invoice_line_audit
  (invoice_line_id, invoice_number, vendor_slug, item_number, audit_status, decision, approved_by,
   approval_note, source, decided_at, decided_by)
SELECT a.invoice_line_id, a.invoice_number, 'abc-supply', a.item_number, 'passed', 'valid', 'Chris Hussey',
       'Closed 2026-09-16 on Chris''s instruction: ABC June 2026 invoice recycled by the triage-race reopen is complete and processed — do not bring this invoice back into the invoice audit workflow (invoice_audit_closeout, mig 293).',
       'manual', now(), 'Chris Hussey'
FROM public.v_invoice_line_audit_current a
JOIN public.invoice_audit_closeout c ON c.invoice_number = a.invoice_number AND c.vendor_slug = 'abc-supply'
WHERE a.audit_status = 'pending' AND c.source = 'mig 293';

-- 4 · mark processed in the payment ledger where no ledger row exists (one closeout batch)
WITH batch AS (SELECT gen_random_uuid() AS id)
INSERT INTO public.invoice_payment_processed
  (batch_id, vendor, vendor_slug, invoice_number, invoice_date, total_due, purchase_order_number,
   approved_to_pay, csv_file_name, csv_row, status, processed_by, processed_by_actor, processed_at,
   paid_confirmed_by, paid_source, source)
SELECT b.id, 'ABC Supply', 'abc-supply', i.invoice_number, i.invoice_date::date, i.total_amount, i.purchase_order_number,
       true, 'closeout-2026-09-16-abc-june-recycled (no CSV — human ruling)',
       jsonb_build_object('closeout', true, 'note', c.reason),
       'paid', 'Chris Hussey', jsonb_build_object('id', 'chris-hussey', 'type', 'human', 'display', 'Chris Hussey'), now(),
       'Chris Hussey', 'closeout: complete and processed per Chris 2026-09-16 — do not re-audit', 'closeout'
FROM public.invoice_audit_closeout c
JOIN public.abc_invoices i ON i.invoice_number = c.invoice_number
CROSS JOIN batch b
WHERE c.source = 'mig 293'
  AND NOT EXISTS (SELECT 1 FROM public.invoice_payment_processed p
                  WHERE p.invoice_number = c.invoice_number AND p.vendor_slug = 'abc-supply');

-- 5 · pipeline status reads processed too
INSERT INTO public.invoice_pipeline_status (vendor_slug, invoice_number, pipeline_status, processed_at, audit_completed_at, source, note)
SELECT 'abc-supply', c.invoice_number, 'invoice_processed', now(), now(), 'mig 293', 'closed out by Chris 2026-09-16 — complete and processed; never re-audit'
FROM public.invoice_audit_closeout c WHERE c.source = 'mig 293'
ON CONFLICT (vendor_slug, invoice_number) DO UPDATE
SET pipeline_status = 'invoice_processed',
    processed_at = COALESCE(public.invoice_pipeline_status.processed_at, now()),
    audit_completed_at = COALESCE(public.invoice_pipeline_status.audit_completed_at, now()),
    note = trim(both ' · ' from COALESCE(public.invoice_pipeline_status.note, '') || ' · closed out by Chris 2026-09-16 — never re-audit'),
    updated_at = now();

-- 6 · the reset RPC refuses closed-out invoices before it writes anything
CREATE OR REPLACE FUNCTION public.invoice_audit_reset(p_invoice_number text, p_actor_id text, p_actor_type text, p_actor_display text, p_vendor_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_vendor         text;
  v_vendor_count   integer;
  v_exists         boolean;
  v_is_cm          boolean;
  v_paid           boolean;
  v_processed      text;
  v_lines_reset    integer := 0;
  v_cm_cancelled   integer := 0;
  v_reviews_clear  integer := 0;
  v_has_claims     boolean := false;
  v_pipeline       text := NULL;
  v_action_id      uuid;
  v_actor          text := COALESCE(NULLIF(btrim(p_actor_display), ''), 'operator');
BEGIN
  IF p_vendor_slug IS NOT NULL AND btrim(p_vendor_slug) <> '' THEN
    v_vendor := btrim(p_vendor_slug);
  ELSE
    SELECT count(DISTINCT vendor_slug), min(vendor_slug) INTO v_vendor_count, v_vendor
    FROM public.v_invoice_audit_invoice_vendor WHERE invoice_number = p_invoice_number;
    IF COALESCE(v_vendor_count, 0) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    ELSIF v_vendor_count > 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ambiguous_vendor');
    END IF;
  END IF;

  -- mig 293: a human closed this invoice out — it never comes back into the audit workflow.
  IF EXISTS (SELECT 1 FROM public.invoice_audit_closeout c
             WHERE c.invoice_number = p_invoice_number AND c.vendor_slug = v_vendor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_closed_out');
  END IF;

  IF v_vendor = 'abc-supply' THEN
    SELECT true, COALESCE(is_credit_memo, false) INTO v_exists, v_is_cm
    FROM public.abc_invoices WHERE invoice_number = p_invoice_number;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;
  ELSE
    SELECT true, (i.doc_type = 'credit') INTO v_exists, v_is_cm
    FROM public.vendor_invoices i
    JOIN public.vendors v ON v.id = i.vendor_id
    WHERE i.invoice_number = p_invoice_number AND v.slug = v_vendor;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;
  END IF;
  IF v_is_cm THEN
    RETURN jsonb_build_object('ok', false, 'error', 'credit_memo_not_resettable');
  END IF;

  IF v_vendor = 'abc-supply' THEN
    SELECT (ar_status = 'paid') INTO v_paid
    FROM public.abc_invoices WHERE invoice_number = p_invoice_number;
  ELSE
    SELECT (i.ar_status = 'paid') INTO v_paid
    FROM public.vendor_invoices i JOIN public.vendors v ON v.id = i.vendor_id
    WHERE i.invoice_number = p_invoice_number AND v.slug = v_vendor;
  END IF;
  IF v_paid IS NOT TRUE THEN
    SELECT (d.payment_status = 'paid') INTO v_paid
    FROM public.invoice_documents d
    LEFT JOIN public.vendors v ON v.id = d.vendor_id
    WHERE d.invoice_number = p_invoice_number
      AND (v.slug IS NULL OR v.slug = v_vendor)
    LIMIT 1;
  END IF;
  IF v_paid IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_paid');
  END IF;

  SELECT status INTO v_processed
  FROM public.invoice_payment_processed
  WHERE invoice_number = p_invoice_number
    AND vendor_slug = v_vendor
    AND status IN ('exported','paid','paid_pending_verification','paid_verified')
  ORDER BY processed_at DESC LIMIT 1;
  IF v_processed IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_' || v_processed);
  END IF;

  WITH cur AS (
    SELECT c.invoice_line_id, c.item_number
    FROM public.v_invoice_line_audit_current c
    WHERE c.invoice_number = p_invoice_number
      AND c.audit_status <> 'pending'
      AND CASE WHEN v_vendor = 'abc-supply'
            THEN EXISTS (SELECT 1 FROM public.abc_invoice_lines al WHERE al.id = c.invoice_line_id)
            ELSE EXISTS (SELECT 1 FROM public.vendor_invoice_lines vl WHERE vl.id = c.invoice_line_id)
          END
  ), ins AS (
    INSERT INTO public.invoice_line_audit
      (invoice_line_id, invoice_number, vendor_slug, item_number, audit_status, decision,
       approved_by, approval_note, source, decided_by)
    SELECT invoice_line_id, p_invoice_number, v_vendor, item_number, 'pending', 'reset',
           v_actor, 'Reset to pending (Go back)', 'manual', v_actor
    FROM cur
    RETURNING 1
  )
  SELECT count(*) INTO v_lines_reset FROM ins;

  UPDATE public.credit_memo_requests
  SET status = 'cancelled',
      approved_by = NULL,
      approved_at = NULL,
      packet = COALESCE(packet, '{}'::jsonb)
               || jsonb_build_object('cancelled_by', v_actor,
                                     'cancelled_at', now(),
                                     'cancel_reason', 'invoice_reset'),
      updated_at = now()
  WHERE invoice_number = p_invoice_number
    AND vendor_slug = v_vendor
    AND request_kind = 'requested'
    AND status IN ('draft', 'approved');
  GET DIAGNOSTICS v_cm_cancelled = ROW_COUNT;

  UPDATE public.invoice_line_reaudit
  SET reviewed_by = NULL, reviewed_at = NULL
  WHERE invoice_number = p_invoice_number
    AND vendor_slug = v_vendor
    AND reviewed_at IS NOT NULL;
  GET DIAGNOSTICS v_reviews_clear = ROW_COUNT;

  SELECT EXISTS (
    SELECT 1 FROM public.invoice_line_reaudit r
    WHERE r.invoice_number = p_invoice_number
      AND r.vendor_slug = v_vendor
      AND r.classification = 'discrepancy'
      AND COALESCE(r.variance_ext, 0) >= 0.05
      AND r.run_label = (SELECT r2.run_label FROM public.invoice_line_reaudit r2
                         WHERE r2.invoice_number = p_invoice_number
                           AND r2.vendor_slug = v_vendor
                         ORDER BY r2.created_at DESC LIMIT 1)
  ) INTO v_has_claims;

  UPDATE public.invoice_pipeline_status
  SET pipeline_status = CASE WHEN v_has_claims THEN 'invoice_audit_pending' ELSE 'invoice_processed' END,
      audit_completed_at = NULL,
      note = trim(both ' · ' from COALESCE(note, '') || ' · reset by ' || v_actor || ' ' || now()::date)
  WHERE invoice_number = p_invoice_number
  RETURNING pipeline_status INTO v_pipeline;

  IF v_lines_reset > 0 OR v_cm_cancelled > 0 OR v_reviews_clear > 0 OR v_pipeline IS NOT NULL THEN
    INSERT INTO public.dashboard_action_log
      (work_key, department, workflow, action_type, decision,
       actor_id, actor_type, actor_display_name, note, payload, source_table, source_pk)
    VALUES
      ('invoice-audit:' || p_invoice_number, 'accounting', 'invoice-audit', 'invoice_reset', NULL,
       COALESCE(NULLIF(btrim(p_actor_id), ''), v_actor),
       COALESCE(NULLIF(btrim(p_actor_type), ''), 'unknown'),
       v_actor,
       'Reset invoice (Go back, v2, vendor-scoped)',
       jsonb_build_object('vendor_slug', v_vendor, 'lines_reset', v_lines_reset,
                          'credit_memos_cancelled', v_cm_cancelled,
                          'reviews_cleared', v_reviews_clear, 'pipeline_status', v_pipeline),
       'invoice_line_audit', p_invoice_number)
    RETURNING id INTO v_action_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'vendor_slug', v_vendor,
    'lines_reset', v_lines_reset,
    'credit_memos_cancelled', v_cm_cancelled,
    'reviews_cleared', v_reviews_clear,
    'pipeline_status', v_pipeline,
    'action_id', v_action_id
  );
END $function$;

-- 7 · one action-log row so the decision is visible on the dashboard trail
INSERT INTO public.dashboard_action_log
  (work_key, department, workflow, action_type, decision, actor_id, actor_type, actor_display_name, note, payload, source_table, source_pk, idempotency_key)
SELECT 'invoice-audit:' || c.invoice_number, 'accounting', 'invoice-audit', 'invoice_closeout', 'mark_done',
       'chris-hussey', 'human', 'Chris Hussey', c.reason,
       jsonb_build_object('vendor_slug', 'abc-supply', 'migration', 293), 'invoice_audit_closeout', c.invoice_number,
       'mig293-closeout-' || c.invoice_number
FROM public.invoice_audit_closeout c
WHERE c.source = 'mig 293'
  AND NOT EXISTS (SELECT 1 FROM public.dashboard_action_log d WHERE d.idempotency_key = 'mig293-closeout-' || c.invoice_number);
