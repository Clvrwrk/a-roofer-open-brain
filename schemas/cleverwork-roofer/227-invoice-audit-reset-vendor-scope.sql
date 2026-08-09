-- 227 — invoice_audit_reset vendor scoping (docs/87 deferred #1; SRS parity gap #4).
-- Applied to prod 2026-08-09.
--
-- The v2 "Go back" reset was ABC-keyed: existence/credit-memo/paid guards read
-- abc_invoices directly (404 for every SRS/QXO invoice), and the CM-cancel /
-- review-clear writes filtered on bare invoice_number (cross-vendor collision
-- hazard). This version:
--   * resolves the invoice's vendor via v_invoice_audit_invoice_vendor; an
--     explicit p_vendor_slug wins; a 2-vendor collision without one fails closed
--   * ABC guard semantics unchanged (same abc_invoices reads); generic vendors
--     guard via vendor_invoices (doc_type='credit' = credit memo, ar_status paid)
--   * every write now carries the vendor: line re-pend rows stamp vendor_slug,
--     CM cancel and review clear filter on it
--   * line re-pend only touches lines belonging to the resolved vendor's mirror
CREATE OR REPLACE FUNCTION public.invoice_audit_reset(p_invoice_number text, p_actor_id text, p_actor_type text, p_actor_display text, p_vendor_slug text DEFAULT NULL)
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
  -- Vendor resolution: explicit param wins; otherwise the number must resolve to
  -- exactly one vendor (fail closed on collision — docs/87).
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

  -- v2: reset withdraws the invoice from this week's email — draft AND approved
  -- (sent requests are history and never reversed here)
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

  -- v2: clear the human claim-line review acknowledgments (migration 202)
  UPDATE public.invoice_line_reaudit
  SET reviewed_by = NULL, reviewed_at = NULL
  WHERE invoice_number = p_invoice_number
    AND vendor_slug = v_vendor
    AND reviewed_at IS NOT NULL;
  GET DIAGNOSTICS v_reviews_clear = ROW_COUNT;

  -- v2: sync the pipeline axis — un-stamp completion; audit_pending iff claim lines exist
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

-- 227b (applied 2026-08-09): the superseded 4-arg overload made calls ambiguous
-- (42725). Function-overload replacement, not a data drop:
DROP FUNCTION IF EXISTS public.invoice_audit_reset(text, text, text, text);
