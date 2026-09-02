-- 282 — credit_memo_reconcile goes cross-vendor + vendor-scoped (Chris directive 2026-09-01).
--
-- Mig 220 built the receipt reconcile for ABC only: it scanned abc_invoices for
-- credit-memo documents and matched them to open requests BY AMOUNT ALONE —
-- vendor parity gap (an SRS credit could never reconcile; worse, an ABC credit
-- doc could satisfy an SRS request of the same amount, violating the silo
-- doctrine: every money join keys (vendor_slug, invoice_number)).
--
-- This version:
--   * scans ABC credits (abc_invoices) AND SRS/QXO credits (vendor_invoices
--     doc_type='credit' or total_due < 0) — one eval, every vendor (CONVENTIONS §10b);
--   * vendor-scopes every match, guard, and receipt row;
--   * keeps mig 220's contract exactly: a single exact-amount open request
--     (approved|sent) auto-marks the request 'received' (dual record: request
--     status + credit_memo_receipts matched_exact); anything else — ambiguous,
--     amount_mismatch, no_open_request — lands as review_status='pending',
--     which the Sent CM workspace renders in the human-review table
--     (Approve / Re-request). A discrepancy is ALWAYS a human decision.
--
-- Downstream (no schema change needed here):
--   * v_qb_export_pending already carries the received CM document as a
--     cm_actual row, pairing in the QB register against the cm_tbd line the
--     sent request exported — the dual confirmation.
--   * Chase-It KPI reads requests: 'sent' = outstanding, 'received' = collected.
--
-- Additive + idempotent (hard rule 1): CREATE OR REPLACE + a legacy backfill.

-- Legacy receipts predate the vendor_slug column being populated; every one of
-- them came from the ABC-only loop of mig 220.
update public.credit_memo_receipts
   set vendor_slug = 'abc-supply'
 where vendor_slug is null;

create or replace function public.credit_memo_reconcile()
returns jsonb
language plpgsql
as $function$
DECLARE
  v_doc record; v_req record; v_n int; v_counts jsonb := '{}'::jsonb; v_state text; v_review text;
BEGIN
  FOR v_doc IN
    -- ABC credit-memo documents (mirror: abc_invoices)
    SELECT 'abc-supply'::text AS vendor_slug,
           i.invoice_number, i.total_amount, i.invoice_date
    FROM public.abc_invoices i
    WHERE i.is_credit_memo AND i.total_amount < 0
      AND i.invoice_date >= DATE '2026-08-01'
    UNION ALL
    -- SRS / QXO credit-memo documents (mirror: vendor_invoices). Negative total
    -- IS a credit memo (Chris 2026-08-25); doc_type 'credit' is the parsed flag.
    SELECT ven.slug AS vendor_slug,
           vi.invoice_number, vi.total_due AS total_amount, vi.invoice_date
    FROM public.vendor_invoices vi
    JOIN public.vendors ven ON ven.id = vi.vendor_id
    WHERE (vi.doc_type = 'credit' OR vi.total_due < 0)
      AND vi.total_due < 0
      AND vi.invoice_date >= DATE '2026-08-01'
      AND ven.slug <> 'abc-supply'
  LOOP
    -- already reconciled? (vendor-scoped: invoice numbers collide across vendors)
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.credit_memo_receipts r
      WHERE r.cm_invoice_number = v_doc.invoice_number
        AND r.vendor_slug = v_doc.vendor_slug);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.credit_memo_requests q
      WHERE q.external_credit_memo_number = v_doc.invoice_number
        AND q.vendor_slug = v_doc.vendor_slug);

    SELECT count(*) INTO v_n FROM public.credit_memo_requests q
    WHERE q.request_kind = 'requested' AND q.status IN ('approved','sent')
      AND q.vendor_slug = v_doc.vendor_slug
      AND round(q.expected_credit, 2) = round(-v_doc.total_amount, 2);
    IF v_n = 1 THEN
      SELECT * INTO v_req FROM public.credit_memo_requests q
      WHERE q.request_kind = 'requested' AND q.status IN ('approved','sent')
        AND q.vendor_slug = v_doc.vendor_slug
        AND round(q.expected_credit, 2) = round(-v_doc.total_amount, 2) LIMIT 1;
      UPDATE public.credit_memo_requests
      SET status = 'received', received_at = now(), received_by = 'credit_memo_reconcile',
          external_credit_memo_number = v_doc.invoice_number,
          packet = COALESCE(packet,'{}'::jsonb) || jsonb_build_object('satisfied', true,
                   'satisfied_at', now(), 'matched_cm_total', v_doc.total_amount),
          updated_at = now()
      WHERE id = v_req.id;
      v_state := 'matched_exact'; v_review := 'none';
      INSERT INTO public.credit_memo_receipts
        (cm_invoice_number, vendor_slug, cm_total, cm_invoice_date, matched_request_id,
         original_invoice_number, expected_credit, match_state, review_status)
      VALUES (v_doc.invoice_number, v_doc.vendor_slug, v_doc.total_amount, v_doc.invoice_date,
              v_req.id, v_req.invoice_number, v_req.expected_credit, v_state, v_review);
    ELSE
      IF v_n > 1 THEN v_state := 'ambiguous';
      ELSIF EXISTS (SELECT 1 FROM public.credit_memo_requests q
                    WHERE q.request_kind='requested' AND q.status IN ('approved','sent')
                      AND q.vendor_slug = v_doc.vendor_slug) THEN
        v_state := 'amount_mismatch';
      ELSE v_state := 'no_open_request'; END IF;
      -- closest open request by amount, for reviewer context (not auto-matched)
      SELECT * INTO v_req FROM public.credit_memo_requests q
      WHERE q.request_kind='requested' AND q.status IN ('approved','sent')
        AND q.vendor_slug = v_doc.vendor_slug
      ORDER BY abs(round(q.expected_credit,2) - round(-v_doc.total_amount,2)) LIMIT 1;
      INSERT INTO public.credit_memo_receipts
        (cm_invoice_number, vendor_slug, cm_total, cm_invoice_date, matched_request_id,
         original_invoice_number, expected_credit, match_state, review_status)
      VALUES (v_doc.invoice_number, v_doc.vendor_slug, v_doc.total_amount, v_doc.invoice_date,
              CASE WHEN v_state IN ('amount_mismatch') THEN v_req.id END,
              v_req.invoice_number, v_req.expected_credit, v_state, 'pending');
    END IF;
    v_counts := jsonb_set(v_counts, ARRAY[v_doc.vendor_slug || ':' || v_state],
                to_jsonb(COALESCE((v_counts->>(v_doc.vendor_slug || ':' || v_state))::int,0)+1));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'new_receipts', v_counts);
END $function$;
