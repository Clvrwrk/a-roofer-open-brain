-- 289 — two silent leaks in the invoice-audit loop (found 2026-09-15, Chris:
-- "I find it hard to believe every recent invoice passed with zero credit memos").
--
-- LEAK 1 · alex_no_price_triage() stamped lines No-Price that were priced.
--   The nightly order is: job 13 refreshes the office pricing matviews at
--   07:30:00 UTC → the ABC ingest writes tonight's invoices at ~07:30:20–45 →
--   Alex's triage runs at ~07:30:35–07:31:15. The pricing arm of
--   v_invoice_audit_line resolves an invoice's PE office through
--   mv_invoice_pricing_office (office silo, mig 217), so an invoice that is not
--   yet in that matview cannot meet ANY agreement and every line reads
--   negotiated_price IS NULL. The triage's own office test goes through
--   v_invoice_audit_invoice.office, which resolves live from vendor_branches, so
--   the line looked "office known + No-Price" and was stamped passed/valid as Alex.
--   Fifteen minutes later the matview caught up and the same line showed an
--   agreement price — sometimes over it — under a stamp that says No-Price.
--   Measured on prod 2026-09-15: 162 lines on 37 invoices since June carry an
--   Alex No-Price stamp while mv_invoice_audit_line prices them; 11 of those are
--   over agreement ($308.75). None of them ever reached the audit queue.
--   Fix: (a) refresh mv_office_agreement_versions + mv_invoice_pricing_office
--   before evaluating; (b) refuse to stamp any line whose invoice has no row in
--   mv_invoice_pricing_office (counted as skipped, exactly like unknown office —
--   the silo doctrine fails closed). Reopen the over-agreement lines below.
--
-- LEAK 2 · credit_memo_reconcile() only scanned credit memos dated 2026-08-01+.
--   Seven ABC credit memos dated 2026-06-12 → 07-13 name (original_invoice_reference)
--   invoices whose credit-memo requests were sent 2026-08-09 and are still "sent".
--   The date floor (mig 282, to keep historical memos from flooding the review
--   surface) hid them, so Chase It showed the requests as outstanding while the
--   vendor's credit sat in the mirror. Fix: the date floor applies only to memos
--   that name no open request; a memo naming an invoice with an open request is
--   always considered, whatever its date. Vendor arm gets the same rule.
--
-- Additive + idempotent (CREATE OR REPLACE; the reopen inserts only while the
-- line's current row is still the stale Alex stamp). Rollback: re-run mig 229b
-- and mig 285 (both CREATE OR REPLACE); the reopen rows are history, not deletions.

-- ---------------------------------------------------------------------------
-- 1 · alex_no_price_triage(): refresh the office gate first, fail closed without it
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alex_no_price_triage()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET statement_timeout TO '300s'
 SET lock_timeout TO '240s'
AS $function$
DECLARE
  v_queued integer; v_stamped integer; v_repeats integer; v_skipped_no_office integer;
  v_skipped_no_pricing_office integer; v_t0 timestamptz := clock_timestamp(); v_refresh_ms integer;
BEGIN
  -- mig 289: the pricing arm resolves the office through these two matviews. Tonight's
  -- invoices are not in them until the next job-13 tick, so refresh them here or every
  -- new invoice reads No-Price. CONCURRENTLY serialises behind job 13 (or an on-demand
  -- request served by job 15) if one is mid-refresh: PostgREST's role-level lock_timeout
  -- (~8 s) would cancel that wait, so the function carries its own 240 s lock_timeout.
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_office_agreement_versions;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_pricing_office;
  v_refresh_ms := (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer;

  INSERT INTO public.agreement_gap_queue (vendor_slug, office, item_number, item_description, purchases_ytd, spend_ytd, last_purchase)
  SELECT vendor_slug, office, item_number, item_description, purchases_ytd, spend_ytd, last_purchase
  FROM public.v_no_price_repeats WHERE purchases_ytd >= 2
  ON CONFLICT (vendor_slug, office, item_number) DO UPDATE
  SET purchases_ytd = EXCLUDED.purchases_ytd, spend_ytd = EXCLUDED.spend_ytd,
      last_purchase = EXCLUDED.last_purchase,
      item_description = COALESCE(EXCLUDED.item_description, agreement_gap_queue.item_description),
      updated_at = now();
  GET DIAGNOSTICS v_queued = ROW_COUNT;

  -- ONE scan of the per-row audit view (playbook 9: it costs seconds per pass). The
  -- candidate set feeds the stamp AND every diagnostic count in the same statement.
  WITH cur AS (SELECT invoice_line_id, audit_status FROM public.v_invoice_line_audit_current),
  cand AS (
    SELECT l.line_id, l.invoice_number, l.item_number, vv.vendor_slug, i.office,
           -- mig 289: the office the PRICING arm actually used. NULL = the gate never ran.
           io.office_id AS pricing_office_id
    FROM public.v_invoice_audit_line l
    JOIN public.v_invoice_audit_invoice i ON i.invoice_number = l.invoice_number
    JOIN public.v_invoice_audit_invoice_vendor vv ON vv.invoice_number = l.invoice_number
    LEFT JOIN public.mv_invoice_pricing_office io ON io.invoice_number = l.invoice_number
    LEFT JOIN cur ON cur.invoice_line_id::text = l.line_id::text
    WHERE l.negotiated_price IS NULL AND l.is_auditable IS NOT FALSE
      AND COALESCE(i.is_credit_memo, false) = false
      AND COALESCE(cur.audit_status, 'pending') NOT IN ('passed','disputed')
  ),
  eligible AS (
    SELECT p.*, EXISTS (
      SELECT 1 FROM public.agreement_gap_queue q
      WHERE q.vendor_slug = p.vendor_slug AND q.office = p.office
        AND q.item_number = p.item_number AND q.status IN ('candidate','in_review')
    ) AS is_repeat
    FROM cand p
    WHERE COALESCE(p.office, '') <> ''
      -- mig 289: ABC lines are priced through mv_invoice_pricing_office; without a row
      -- there the No-Price reading is meaningless. Vendor (SRS/QXO) lines price through
      -- vendor_branches directly and carry no row here, so only gate the ABC arm.
      AND (p.vendor_slug <> 'abc-supply' OR p.pricing_office_id IS NOT NULL)
  ),
  ins AS (
    INSERT INTO public.invoice_line_audit
      (invoice_line_id, invoice_number, vendor_slug, item_number, audit_status, decision, approved_by, approval_note, source, decided_by)
    SELECT line_id::uuid, invoice_number, vendor_slug, item_number, 'passed', 'valid', 'Alex',
      CASE WHEN is_repeat
        THEN 'No-Price reviewed by Alex — repeat purchase this year; queued in the Agreement Builder as a global product file candidate (PEC-195)'
        ELSE 'No-Price reviewed by Alex — no agreement on file, non-repeat purchase this year (PEC-195)' END,
      'auto_match', 'Alex'
    FROM eligible
    RETURNING (approval_note LIKE '%repeat purchase%') AS was_repeat
  )
  SELECT (SELECT count(*) FROM ins),
         (SELECT count(*) FILTER (WHERE was_repeat) FROM ins),
         (SELECT count(*) FROM cand WHERE COALESCE(office, '') = ''),
         (SELECT count(*) FROM cand WHERE COALESCE(office, '') <> '' AND vendor_slug = 'abc-supply' AND pricing_office_id IS NULL)
    INTO v_stamped, v_repeats, v_skipped_no_office, v_skipped_no_pricing_office;

  RETURN jsonb_build_object(
    'queued_or_refreshed', v_queued, 'stamped', v_stamped, 'repeat_lines', v_repeats,
    'skipped_unknown_office', v_skipped_no_office,
    'skipped_no_pricing_office_row', v_skipped_no_pricing_office,
    'office_matview_refresh_ms', v_refresh_ms,
    'candidates_open', (SELECT count(*) FROM public.agreement_gap_queue WHERE status = 'candidate')
  );
END $function$;

COMMENT ON FUNCTION public.alex_no_price_triage() IS
  'Alex No-Price pass (PEC-195). mig 289: refreshes the office pricing matviews first and never stamps an ABC line whose invoice has no mv_invoice_pricing_office row — a No-Price reading without the office gate is not a reading.';

-- ---------------------------------------------------------------------------
-- 2 · credit_memo_reconcile(): a memo that names an open request is never too old
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_memo_reconcile()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_doc record; v_req record; v_n int; v_counts jsonb := '{}'::jsonb; v_state text; v_review text;
  v_rr record; v_basis text;
BEGIN
  PERFORM public.credit_memo_reconcile_correct_links();

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
      -- mig 289: the date floor keeps historical memos off the review surface, but a
      -- memo that NAMES an invoice with an open request is the answer to that request
      -- whatever its date. Seven June/July ABC memos hid behind this floor.
      AND (i.invoice_date >= DATE '2026-08-01'
           OR EXISTS (
             SELECT 1 FROM public.v_credit_memo_match m
             JOIN public.credit_memo_requests q
               ON q.invoice_number = m.original_invoice_number
              AND q.request_kind = 'requested' AND q.status IN ('approved','sent')
              AND q.vendor_slug = 'abc-supply'
             WHERE m.invoice_number = i.invoice_number AND m.match_confidence = 'exact'))
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
      AND (vi.invoice_date >= DATE '2026-08-01'
           OR EXISTS (
             SELECT 1 FROM public.credit_memo_requests q
             WHERE q.request_kind = 'requested' AND q.status IN ('approved','sent')
               AND q.vendor_slug = ven.slug
               AND (q.invoice_number = vi.raw->>'original_invoice_number'
                    OR (vi.raw ? 'original_invoice_numbers'
                        AND vi.raw->'original_invoice_numbers' ? q.invoice_number))))
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

    -- mig 285: an ASSIGNED all-NULL record (structure of credit_memo_requests),
    -- never `v_req := NULL`, which leaves the record unassigned and makes
    -- `v_req.id` raise when neither ladder rung below selects a row.
    SELECT * INTO v_req FROM public.credit_memo_requests WHERE false;
    v_basis := NULL;

    IF v_doc.originals IS NOT NULL THEN
      SELECT * INTO v_req FROM public.credit_memo_requests q
      WHERE q.request_kind = 'requested' AND q.status IN ('approved','sent')
        AND q.vendor_slug = v_doc.vendor_slug
        AND v_doc.originals ? q.invoice_number
      ORDER BY q.sent_at NULLS LAST LIMIT 1;
      IF v_req.id IS NOT NULL THEN v_basis := 'original_invoice'; END IF;
    END IF;

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

COMMENT ON FUNCTION public.credit_memo_reconcile() IS
  'Cross-vendor credit-memo reconcile (migs 282/284/285). mig 289: a memo naming an invoice with an open request is considered whatever its date; the 2026-08-01 floor applies only to unnamed memos.';

-- ---------------------------------------------------------------------------
-- 3 · Reopen the over-agreement lines the race stamped, on invoices with no human
--     cancellation behind them. The six June lines on invoices whose requests a human
--     cancelled (KS-173/174/176/177/167, $177.00) are NOT reopened here — a human
--     cancellation is a decision; they are listed in docs/109 F39 for Chris to call.
-- ---------------------------------------------------------------------------
INSERT INTO public.invoice_line_audit
  (invoice_line_id, invoice_number, vendor_slug, item_number, audit_status, decision, approved_by,
   approval_note, source, decided_at, decided_by)
SELECT a.invoice_line_id, a.invoice_number, 'abc-supply', a.item_number, 'pending', 'reopened', 'System',
       'Reopened 2026-09-15 (mig 289): the Alex No-Price stamp was written before the office pricing matview knew this invoice; the audit now prices this line over agreement — needs a claim decision',
       'pipeline_v2', now(), 'System'
FROM public.v_invoice_line_audit_current a
JOIN public.mv_invoice_audit_line m ON m.line_id = a.invoice_line_id
WHERE a.invoice_line_id IN (
  '345b0a5a-128e-46ed-9e83-493e2864f542',  -- 2011016277-001 17AVVG55FK  $18.00
  '502c0fc5-167a-4998-b56f-f21040629620',  -- 2011016277-001 GAFNR441BK  $22.50
  'fc9ccd7f-239d-4c48-af9e-f532f67c83a4',  -- 2011284893-001 GPSF88BK    $35.75
  '453d078e-be82-4151-b133-38d969b4c179',  -- 2013736069-001 14IP81716   $3.00
  '3e1b0f41-9caa-4173-928a-63e21a06dbbb'   -- 2013736069-001 17LO750GSZ  $52.50
)
  AND a.decided_by = 'Alex' AND a.approval_note LIKE 'No-Price reviewed by Alex%'
  AND m.negotiated_price IS NOT NULL AND m.variance_pct > 0;
