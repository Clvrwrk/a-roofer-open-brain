-- 229b: alex_no_price_triage() — the Alex pass (PEC-195), callable nightly + on demand.
-- 1) refresh agreement_gap_queue from v_no_price_repeats (threshold: 2+ purchases in
--    the calendar year per (vendor, office) — the approved A3 rule)
-- 2) stamp EVERY pending No-Price line passed/valid as Alex (agent): repeats note the
--    queue, non-repeats note the rule. Lines with an unknown office are left alone
--    (silo doctrine: unknown office fails closed) and reported.
-- Returns a jsonb summary. Additive + idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.alex_no_price_triage()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_queued integer;
  v_stamped integer;
  v_repeats integer;
  v_skipped_no_office integer;
BEGIN
  INSERT INTO public.agreement_gap_queue (vendor_slug, office, item_number, item_description, purchases_ytd, spend_ytd, last_purchase)
  SELECT vendor_slug, office, item_number, item_description, purchases_ytd, spend_ytd, last_purchase
  FROM public.v_no_price_repeats
  WHERE purchases_ytd >= 2
  ON CONFLICT (vendor_slug, office, item_number) DO UPDATE
  SET purchases_ytd = EXCLUDED.purchases_ytd,
      spend_ytd = EXCLUDED.spend_ytd,
      last_purchase = EXCLUDED.last_purchase,
      item_description = COALESCE(EXCLUDED.item_description, agreement_gap_queue.item_description),
      updated_at = now();
  GET DIAGNOSTICS v_queued = ROW_COUNT;

  WITH cur AS (SELECT invoice_line_id, audit_status FROM public.v_invoice_line_audit_current),
  pend AS (
    SELECT l.line_id, l.invoice_number, l.item_number, vv.vendor_slug, i.office
    FROM public.v_invoice_audit_line l
    JOIN public.v_invoice_audit_invoice i ON i.invoice_number = l.invoice_number
    JOIN public.v_invoice_audit_invoice_vendor vv ON vv.invoice_number = l.invoice_number
    LEFT JOIN cur ON cur.invoice_line_id::text = l.line_id::text
    WHERE l.negotiated_price IS NULL
      AND l.is_auditable IS NOT FALSE
      AND COALESCE(i.is_credit_memo, false) = false
      AND COALESCE(cur.audit_status, 'pending') NOT IN ('passed','disputed')
  ),
  eligible AS (
    SELECT p.*, EXISTS (
      SELECT 1 FROM public.agreement_gap_queue q
      WHERE q.vendor_slug = p.vendor_slug AND q.office = p.office
        AND q.item_number = p.item_number AND q.status IN ('candidate','in_review')
    ) AS is_repeat
    FROM pend p WHERE COALESCE(p.office, '') <> ''
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
  SELECT count(*), count(*) FILTER (WHERE was_repeat) INTO v_stamped, v_repeats FROM ins;

  SELECT count(*) INTO v_skipped_no_office FROM (
    SELECT l.line_id
    FROM public.v_invoice_audit_line l
    JOIN public.v_invoice_audit_invoice i ON i.invoice_number = l.invoice_number
    LEFT JOIN public.v_invoice_line_audit_current cur ON cur.invoice_line_id::text = l.line_id::text
    WHERE l.negotiated_price IS NULL AND l.is_auditable IS NOT FALSE
      AND COALESCE(i.is_credit_memo, false) = false
      AND COALESCE(cur.audit_status, 'pending') NOT IN ('passed','disputed')
      AND COALESCE(i.office, '') = ''
  ) t;

  RETURN jsonb_build_object(
    'queued_or_refreshed', v_queued,
    'stamped', v_stamped,
    'repeat_lines', v_repeats,
    'skipped_unknown_office', v_skipped_no_office,
    'candidates_open', (SELECT count(*) FROM public.agreement_gap_queue WHERE status = 'candidate')
  );
END $$;

-- The audit-line views are heavy; PostgREST's default role timeout kills the RPC.
-- Give the function its own budget (applies only inside this function).
ALTER FUNCTION public.alex_no_price_triage() SET statement_timeout = '180s';
