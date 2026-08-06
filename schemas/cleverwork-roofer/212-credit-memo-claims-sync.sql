-- 212 — credit-memo claim-set ↔ live-engine sync. Applied to prod 2026-08-05.
--
-- Chris's QA (3 invoices): CM drafts gated Approve on claim lines the LIVE engine
-- no longer flags — the claim sets were frozen wave-run snapshots and migrations
-- 205/207/208/209 moved office pricing underneath them. Symptoms: "0/1 reviewed"
-- with no reviewable row; "1/2 reviewed" stuck because claim #2's line is now
-- No-Price/passed; stale totals ($17.25 vs live $11.25).
--
-- credit_memo_claims_sync(invoice) re-aligns an UN-SENT CM's latest-run claim set:
--   * live claim lines (negotiated present, no UOM mismatch, variance >= 0.05,
--     current audit status not 'passed') are upserted with live numbers — human
--     review stamps persist on surviving rows; new claims start unreviewed;
--   * rows the engine no longer flags flip classification -> 'engine_resolved'
--     (they drop out of the pending/approve gates and the email);
--   * the CM retotals; zero remaining claims cancels the draft.
-- Sent/received CMs are history and never touched.
-- credit_memo_claims_sync_all() runs it for every open CM; scheduled with the
-- 15-min matview refresh so claim sets can never drift from the engine again.

CREATE OR REPLACE FUNCTION public.credit_memo_claims_sync(p_invoice text)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
  v_cm record;
  v_run text;
  v_credit numeric := 0;
  v_count int := 0;
BEGIN
  SELECT * INTO v_cm FROM public.credit_memo_requests
  WHERE invoice_number = p_invoice AND request_kind = 'requested' AND status IN ('draft','approved')
  ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'no_open_cm');
  END IF;

  SELECT run_label INTO v_run FROM public.invoice_line_reaudit
  WHERE invoice_number = p_invoice ORDER BY created_at DESC LIMIT 1;
  IF v_run IS NULL THEN v_run := 'engine_sync'; END IF;

  -- Refresh existing rows to live numbers; resolve rows the engine no longer flags.
  UPDATE public.invoice_line_reaudit r
  SET invoiced_price = s.unit_price,
      office_price = s.negotiated_price,
      variance_ext = s.variance_ext,
      classification = CASE WHEN s.is_claim THEN 'discrepancy' ELSE 'engine_resolved' END
  FROM (
    SELECT l.line_id, l.unit_price, l.negotiated_price, l.variance_ext,
           (l.negotiated_price IS NOT NULL AND NOT l.uom_mismatch AND l.variance_ext >= 0.05
            AND COALESCE(c.audit_status, 'pending') <> 'passed') AS is_claim
    FROM public.v_invoice_audit_line l
    LEFT JOIN public.v_invoice_line_audit_current c ON c.invoice_line_id = l.line_id
    WHERE l.invoice_number = p_invoice
  ) s
  WHERE r.invoice_number = p_invoice AND r.run_label = v_run AND r.line_id = s.line_id
    AND r.classification IN ('discrepancy', 'engine_resolved');

  -- Claim rows whose line no longer exists in the live view (or lack a line_id)
  -- can never be reviewed — resolve them out of the gate.
  UPDATE public.invoice_line_reaudit r
  SET classification = 'engine_resolved'
  WHERE r.invoice_number = p_invoice AND r.run_label = v_run AND r.classification = 'discrepancy'
    AND (r.line_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.v_invoice_audit_line l WHERE l.line_id = r.line_id AND l.invoice_number = p_invoice));

  -- Add live claims the run is missing (new claims start unreviewed — human checks them).
  INSERT INTO public.invoice_line_reaudit
    (run_label, invoice_number, line_id, item_number, item_description, quantity, uom,
     invoiced_price, office_price, variance_ext, classification, match_method)
  SELECT v_run, p_invoice, l.line_id, l.item_number, l.item_description, l.quantity, l.uom,
         l.unit_price, l.negotiated_price, l.variance_ext, 'discrepancy', 'engine_sync'
  FROM public.v_invoice_audit_line l
  LEFT JOIN public.v_invoice_line_audit_current c ON c.invoice_line_id = l.line_id
  WHERE l.invoice_number = p_invoice
    AND l.negotiated_price IS NOT NULL AND NOT l.uom_mismatch AND l.variance_ext >= 0.05
    AND COALESCE(c.audit_status, 'pending') <> 'passed'
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_line_reaudit r
      WHERE r.invoice_number = p_invoice AND r.run_label = v_run AND r.line_id = l.line_id);

  SELECT COALESCE(sum(variance_ext), 0), count(*) INTO v_credit, v_count
  FROM public.invoice_line_reaudit
  WHERE invoice_number = p_invoice AND run_label = v_run
    AND classification = 'discrepancy' AND variance_ext >= 0.05;

  IF v_count = 0 THEN
    UPDATE public.credit_memo_requests
    SET status = 'cancelled',
        approved_by = NULL, approved_at = NULL,
        expected_credit = 0, line_count = 0,
        packet = COALESCE(packet, '{}'::jsonb) || jsonb_build_object('cancel_reason', 'engine_sync_no_claims', 'cancelled_at', now()),
        updated_at = now()
    WHERE id = v_cm.id;
  ELSE
    UPDATE public.credit_memo_requests
    SET expected_credit = round(v_credit, 2), line_count = v_count, updated_at = now()
    WHERE id = v_cm.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'claims', v_count, 'credit', round(v_credit, 2),
                            'cancelled', v_count = 0);
END $function$;

CREATE OR REPLACE FUNCTION public.credit_memo_claims_sync_all()
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
  r record;
  n int := 0;
  cancelled int := 0;
  res jsonb;
BEGIN
  FOR r IN SELECT DISTINCT invoice_number FROM public.credit_memo_requests
           WHERE request_kind = 'requested' AND status IN ('draft','approved') LOOP
    res := public.credit_memo_claims_sync(r.invoice_number);
    n := n + 1;
    IF COALESCE((res->>'cancelled')::boolean, false) THEN cancelled := cancelled + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'synced', n, 'cancelled', cancelled);
END $function$;

-- Keep claim sets continuously aligned: sync runs right after the pricing
-- matviews refresh.
SELECT cron.unschedule('refresh-office-pricing-matviews');
SELECT cron.schedule('refresh-office-pricing-matviews', '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_office_agreement_versions;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_pricing_office;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_vendor_office_item_history;
    SELECT public.credit_memo_claims_sync_all();$$);
