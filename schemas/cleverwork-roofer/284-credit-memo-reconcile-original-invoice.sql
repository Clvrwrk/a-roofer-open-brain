-- 284 — credit-memo reconcile matches by ORIGINAL INVOICE first (Chris 2026-09-01).
--
-- "When processing a CM from any vendor we should be looking for the original
--  invoice being listed so we are not matching to the closest request — it's an
--  exact match."
--
-- SRS credit memos name the invoice they credit ("Orig Inv#: <invoice>" in the
-- portal CSV; same marker on the PDFs). The ingest now lifts that into
-- vendor_invoices.raw.original_invoice_number(s). ABC memos that name their
-- original carry it in v_credit_memo_match at match_confidence='exact'
-- (originalInvoiceReference, migration 236 protocol).
--
-- Match ladder (vendor-scoped throughout — silo doctrine):
--   1. ORIGINAL INVOICE: the memo names invoice X and an open request
--      (approved|sent) exists on (vendor, X):
--        · amounts equal   → matched_exact, request auto-received
--        · amounts differ  → amount_mismatch receipt linked to THAT request,
--                            review pending (human decides in Sent CM)
--   2. AMOUNT (fallback, memo names nothing): single exact-amount open request
--      → matched_exact; else ambiguous / amount_mismatch(closest, context only)
--      / no_open_request → review pending. (mig 282 behavior, unchanged.)
--
-- Also re-evaluates receipts already sitting review_status='pending' whose memo
-- can NOW resolve an original invoice (the ref arrived with a later re-ingest):
-- re-links them to the right request; an exact amount match completes them.
--
-- Additive + idempotent (CREATE OR REPLACE; re-running changes nothing).

-- A memo that NAMES its original invoice must never stay linked to a "closest
-- by amount" request on a different invoice (mig 282 legacy links). If none of
-- the memo's named originals has an open request, the receipt is a plain vendor
-- credit: original = what the memo says, no request attached.
create or replace function public.credit_memo_reconcile_correct_links()
returns integer language plpgsql as $$
DECLARE v_n int;
BEGIN
  UPDATE public.credit_memo_receipts r
  SET original_invoice_number = vi.raw->>'original_invoice_number',
      matched_request_id = NULL,
      expected_credit = NULL,
      match_state = 'no_open_request'
  FROM public.vendor_invoices vi
  JOIN public.vendors ven ON ven.id = vi.vendor_id
  WHERE r.review_status = 'pending'
    AND ven.slug = r.vendor_slug
    AND vi.invoice_number = r.cm_invoice_number
    AND vi.raw->>'original_invoice_number' IS NOT NULL
    AND r.original_invoice_number IS DISTINCT FROM vi.raw->>'original_invoice_number'
    AND NOT EXISTS (
      SELECT 1 FROM public.credit_memo_requests q
      WHERE q.request_kind = 'requested' AND q.status IN ('approved','sent')
        AND q.vendor_slug = r.vendor_slug
        AND (q.invoice_number = vi.raw->>'original_invoice_number'
             OR (vi.raw ? 'original_invoice_numbers'
                 AND vi.raw->'original_invoice_numbers' ? q.invoice_number)));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

create or replace function public.credit_memo_reconcile()
returns jsonb
language plpgsql
as $function$
DECLARE
  v_doc record; v_req record; v_n int; v_counts jsonb := '{}'::jsonb; v_state text; v_review text;
  v_rr record; v_basis text;
BEGIN
  -- ── pass 0a: unhook mig-282-era "closest by amount" links that the memo's own
  --    Orig Inv# contradicts (no open request on the named original ⇒ the receipt
  --    is a plain vendor credit, not an answer to any request) ──────────────────
  PERFORM public.credit_memo_reconcile_correct_links();

  -- ── pass 0: re-evaluate pending receipts whose memo now names its original ──
  FOR v_rr IN
    SELECT r.cm_invoice_number, r.vendor_slug, r.cm_total, q.id AS req_id,
           q.invoice_number AS req_invoice, q.expected_credit, q.status AS req_status
    FROM public.credit_memo_receipts r
    JOIN public.vendor_invoices vi ON vi.invoice_number = r.cm_invoice_number
    JOIN public.vendors ven ON ven.id = vi.vendor_id AND ven.slug = r.vendor_slug
    JOIN public.credit_memo_requests q
      ON q.request_kind = 'requested' AND q.vendor_slug = r.vendor_slug
     AND q.status IN ('approved','sent')
     AND (q.invoice_number = vi.raw->>'original_invoice_number'
          OR (vi.raw ? 'original_invoice_numbers'
              AND vi.raw->'original_invoice_numbers' ? q.invoice_number))
    WHERE r.review_status = 'pending'
  LOOP
    IF round(v_rr.expected_credit, 2) = round(-v_rr.cm_total, 2) THEN
      UPDATE public.credit_memo_requests
      SET status = 'received', received_at = now(), received_by = 'credit_memo_reconcile',
          external_credit_memo_number = v_rr.cm_invoice_number,
          packet = COALESCE(packet,'{}'::jsonb) || jsonb_build_object('satisfied', true,
                   'satisfied_at', now(), 'matched_cm_total', v_rr.cm_total, 'match_basis', 'original_invoice'),
          updated_at = now()
      WHERE id = v_rr.req_id;
      UPDATE public.credit_memo_receipts
      SET matched_request_id = v_rr.req_id, original_invoice_number = v_rr.req_invoice,
          expected_credit = v_rr.expected_credit, match_state = 'matched_exact', review_status = 'none'
      WHERE cm_invoice_number = v_rr.cm_invoice_number AND vendor_slug = v_rr.vendor_slug
        AND review_status = 'pending';
      v_counts := jsonb_set(v_counts, ARRAY['relinked:completed'],
                  to_jsonb(COALESCE((v_counts->>'relinked:completed')::int,0)+1));
    ELSE
      UPDATE public.credit_memo_receipts
      SET matched_request_id = v_rr.req_id, original_invoice_number = v_rr.req_invoice,
          expected_credit = v_rr.expected_credit, match_state = 'amount_mismatch'
      WHERE cm_invoice_number = v_rr.cm_invoice_number AND vendor_slug = v_rr.vendor_slug
        AND review_status = 'pending';
      v_counts := jsonb_set(v_counts, ARRAY['relinked:pending'],
                  to_jsonb(COALESCE((v_counts->>'relinked:pending')::int,0)+1));
    END IF;
  END LOOP;

  -- ── main scan: new credit-memo documents ────────────────────────────────────
  FOR v_doc IN
    SELECT 'abc-supply'::text AS vendor_slug,
           i.invoice_number, i.total_amount, i.invoice_date,
           (SELECT to_jsonb(array_agg(DISTINCT m.original_invoice_number))
            FROM public.v_credit_memo_match m
            WHERE m.invoice_number = i.invoice_number
              AND m.match_confidence = 'exact'
              AND m.original_invoice_number IS NOT NULL) AS originals
    FROM public.abc_invoices i
    WHERE i.is_credit_memo AND i.total_amount < 0
      AND i.invoice_date >= DATE '2026-08-01'
    UNION ALL
    SELECT ven.slug AS vendor_slug,
           vi.invoice_number, vi.total_due AS total_amount, vi.invoice_date,
           CASE
             WHEN vi.raw ? 'original_invoice_numbers' AND jsonb_array_length(vi.raw->'original_invoice_numbers') > 0
               THEN vi.raw->'original_invoice_numbers'
             WHEN vi.raw->>'original_invoice_number' IS NOT NULL
               THEN jsonb_build_array(vi.raw->>'original_invoice_number')
             ELSE NULL
           END AS originals
    FROM public.vendor_invoices vi
    JOIN public.vendors ven ON ven.id = vi.vendor_id
    WHERE (vi.doc_type = 'credit' OR vi.total_due < 0)
      AND vi.total_due < 0
      AND vi.invoice_date >= DATE '2026-08-01'
      AND ven.slug <> 'abc-supply'
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.credit_memo_receipts r
      WHERE r.cm_invoice_number = v_doc.invoice_number
        AND r.vendor_slug = v_doc.vendor_slug);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.credit_memo_requests q
      WHERE q.external_credit_memo_number = v_doc.invoice_number
        AND q.vendor_slug = v_doc.vendor_slug);

    v_req := NULL; v_basis := NULL;

    -- ladder rung 1: the memo names its original invoice
    IF v_doc.originals IS NOT NULL THEN
      SELECT * INTO v_req FROM public.credit_memo_requests q
      WHERE q.request_kind = 'requested' AND q.status IN ('approved','sent')
        AND q.vendor_slug = v_doc.vendor_slug
        AND v_doc.originals ? q.invoice_number
      ORDER BY q.sent_at NULLS LAST LIMIT 1;
      IF v_req.id IS NOT NULL THEN v_basis := 'original_invoice'; END IF;
    END IF;

    -- ladder rung 2: exact amount (only when no original named a request)
    IF v_basis IS NULL THEN
      SELECT count(*) INTO v_n FROM public.credit_memo_requests q
      WHERE q.request_kind = 'requested' AND q.status IN ('approved','sent')
        AND q.vendor_slug = v_doc.vendor_slug
        AND round(q.expected_credit, 2) = round(-v_doc.total_amount, 2);
      IF v_n = 1 THEN
        SELECT * INTO v_req FROM public.credit_memo_requests q
        WHERE q.request_kind = 'requested' AND q.status IN ('approved','sent')
          AND q.vendor_slug = v_doc.vendor_slug
          AND round(q.expected_credit, 2) = round(-v_doc.total_amount, 2) LIMIT 1;
        v_basis := 'amount';
      END IF;
    END IF;

    IF v_req.id IS NOT NULL AND round(v_req.expected_credit, 2) = round(-v_doc.total_amount, 2) THEN
      UPDATE public.credit_memo_requests
      SET status = 'received', received_at = now(), received_by = 'credit_memo_reconcile',
          external_credit_memo_number = v_doc.invoice_number,
          packet = COALESCE(packet,'{}'::jsonb) || jsonb_build_object('satisfied', true,
                   'satisfied_at', now(), 'matched_cm_total', v_doc.total_amount, 'match_basis', v_basis),
          updated_at = now()
      WHERE id = v_req.id;
      v_state := 'matched_exact'; v_review := 'none';
      INSERT INTO public.credit_memo_receipts
        (cm_invoice_number, vendor_slug, cm_total, cm_invoice_date, matched_request_id,
         original_invoice_number, expected_credit, match_state, review_status)
      VALUES (v_doc.invoice_number, v_doc.vendor_slug, v_doc.total_amount, v_doc.invoice_date,
              v_req.id, v_req.invoice_number, v_req.expected_credit, v_state, v_review);
    ELSIF v_basis = 'original_invoice' THEN
      -- memo names the invoice but amounts differ: a real discrepancy on a KNOWN
      -- request — always a human decision, linked to the right request.
      v_state := 'amount_mismatch';
      INSERT INTO public.credit_memo_receipts
        (cm_invoice_number, vendor_slug, cm_total, cm_invoice_date, matched_request_id,
         original_invoice_number, expected_credit, match_state, review_status)
      VALUES (v_doc.invoice_number, v_doc.vendor_slug, v_doc.total_amount, v_doc.invoice_date,
              v_req.id, v_req.invoice_number, v_req.expected_credit, v_state, 'pending');
    ELSE
      IF EXISTS (SELECT 1 FROM public.credit_memo_requests q
                 WHERE q.request_kind='requested' AND q.status IN ('approved','sent')
                   AND q.vendor_slug = v_doc.vendor_slug
                   AND round(q.expected_credit,2) = round(-v_doc.total_amount,2)) THEN
        v_state := 'ambiguous';
      ELSIF EXISTS (SELECT 1 FROM public.credit_memo_requests q
                    WHERE q.request_kind='requested' AND q.status IN ('approved','sent')
                      AND q.vendor_slug = v_doc.vendor_slug) THEN
        v_state := 'amount_mismatch';
      ELSE v_state := 'no_open_request'; END IF;
      -- closest open request by amount, for reviewer CONTEXT only (never auto-matched)
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
