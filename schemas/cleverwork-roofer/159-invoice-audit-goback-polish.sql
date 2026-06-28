-- 159-invoice-audit-goback-polish.sql  (additive, idempotent)
-- Client feedback after the docs/59 deploy:
--   1. Cascade view: expose the invoice_date of the benchmark invoice driving the
--      "Most Recent" (and, for credit memos, "Org Inv") price → new column third_price_date.
--   2. Reset: a credit memo that is open + not paid and has had audit work must also be
--      resettable ("Go back"). Drop the credit-memo refusal from invoice_audit_reset();
--      its lines are in abc_invoice_lines (the invoice_line_audit FK guarantees it), so the
--      append-only re-pend is identical and safe. Keep the paid/exported guards.

-- ── 1. Cascade view + benchmark date (supersedes the 157 body; adds date columns) ──
-- New columns land mid-list, which CREATE OR REPLACE VIEW forbids; DROP+CREATE is safe
-- here (a view holds no data — hard rule 1 untouched; verified no dependent objects).
DROP VIEW IF EXISTS v_invoice_audit_line_cascade;
CREATE VIEW v_invoice_audit_line_cascade AS
WITH br AS (
  SELECT DISTINCT ON (ship_to_number) ship_to_number, branch_number
  FROM abc_ship_to_branch_access
  ORDER BY ship_to_number, home_branch DESC NULLS LAST
),
api AS (
  SELECT DISTINCT ON (branch_number, item_number) branch_number, item_number, api_price, api_uom
  FROM v_branch_item_api_price
  ORDER BY branch_number, item_number, observed_at DESC NULLS LAST
),
enr AS (
  SELECT
    l.id                              AS line_id,
    l.invoice_number,
    l.item_number,
    l.item_description,
    l.price_uom,
    l.price_per_uom                   AS invoice_price,
    l.price_qty                       AS qty,
    i.ship_to_number,
    br.branch_number,
    COALESCE(i.is_credit_memo, false) AS is_credit_memo,
    i.original_invoice_reference,
    (l.price_qty IS NOT NULL AND l.price_qty <> 0 AND l.price_per_uom IS NOT NULL) AS is_auditable,
    al.negotiated_price,
    CASE WHEN a.api_uom = l.price_uom THEN a.api_price END AS api_price,
    ( SELECT pl.price_per_uom
        FROM abc_invoice_lines pl
        JOIN abc_invoices pi ON pi.invoice_number = pl.invoice_number
       WHERE pl.item_number = l.item_number
         AND pi.ship_to_number = i.ship_to_number
         AND pl.price_uom = l.price_uom
         AND pi.invoice_date < i.invoice_date
         AND pl.price_per_uom IS NOT NULL
         AND COALESCE(pi.is_credit_memo, false) = false
       ORDER BY pi.invoice_date DESC
       LIMIT 1 )                      AS recent_price,
    ( SELECT pi.invoice_date
        FROM abc_invoice_lines pl
        JOIN abc_invoices pi ON pi.invoice_number = pl.invoice_number
       WHERE pl.item_number = l.item_number
         AND pi.ship_to_number = i.ship_to_number
         AND pl.price_uom = l.price_uom
         AND pi.invoice_date < i.invoice_date
         AND pl.price_per_uom IS NOT NULL
         AND COALESCE(pi.is_credit_memo, false) = false
       ORDER BY pi.invoice_date DESC
       LIMIT 1 )                      AS recent_invoice_date,
    CASE WHEN COALESCE(i.is_credit_memo, false) THEN (
        SELECT ol.price_per_uom
          FROM abc_invoice_lines ol
         WHERE split_part(ol.invoice_number, '-', 1) = split_part(i.original_invoice_reference, '-', 1)
           AND ol.item_number = l.item_number
           AND ol.price_uom = l.price_uom
           AND ol.price_per_uom IS NOT NULL
         ORDER BY ol.price_per_uom
         LIMIT 1 )
    END                               AS org_inv_price,
    CASE WHEN COALESCE(i.is_credit_memo, false) THEN (
        SELECT oi.invoice_date
          FROM abc_invoice_lines ol
          JOIN abc_invoices oi ON oi.invoice_number = ol.invoice_number
         WHERE split_part(ol.invoice_number, '-', 1) = split_part(i.original_invoice_reference, '-', 1)
           AND ol.item_number = l.item_number
           AND ol.price_uom = l.price_uom
           AND ol.price_per_uom IS NOT NULL
         ORDER BY ol.price_per_uom
         LIMIT 1 )
    END                               AS org_inv_invoice_date
  FROM v_invoice_lines_complete l
  JOIN abc_invoices i ON i.invoice_number = l.invoice_number
  LEFT JOIN br ON br.ship_to_number = i.ship_to_number
  LEFT JOIN api a ON a.branch_number = br.branch_number AND a.item_number = l.item_number
  LEFT JOIN v_invoice_audit_line al ON al.line_id = l.id
),
casc AS (
  SELECT enr.*,
    CASE WHEN is_credit_memo THEN org_inv_price ELSE recent_price END AS third_price,
    CASE WHEN is_credit_memo THEN org_inv_invoice_date ELSE recent_invoice_date END AS third_price_date
  FROM enr
)
SELECT c.*,
  CASE
    WHEN negotiated_price IS NOT NULL THEN 'negotiated'
    WHEN api_price IS NOT NULL AND invoice_price > api_price THEN 'api'
    WHEN third_price IS NOT NULL THEN CASE WHEN is_credit_memo THEN 'org_inv' ELSE 'recent' END
    ELSE 'none'
  END AS benchmark_source,
  CASE
    WHEN negotiated_price IS NOT NULL THEN negotiated_price
    WHEN api_price IS NOT NULL AND invoice_price > api_price THEN api_price
    WHEN third_price IS NOT NULL THEN third_price
  END AS benchmark_price,
  CASE
    WHEN COALESCE(
           CASE WHEN negotiated_price IS NOT NULL THEN negotiated_price
                WHEN api_price IS NOT NULL AND invoice_price > api_price THEN api_price
                WHEN third_price IS NOT NULL THEN third_price END, 0) > 0
    THEN round((invoice_price -
           CASE WHEN negotiated_price IS NOT NULL THEN negotiated_price
                WHEN api_price IS NOT NULL AND invoice_price > api_price THEN api_price
                ELSE third_price END)
         / CASE WHEN negotiated_price IS NOT NULL THEN negotiated_price
                WHEN api_price IS NOT NULL AND invoice_price > api_price THEN api_price
                ELSE third_price END * 100, 2)
  END AS variance_pct,
  CASE
    WHEN COALESCE(
           CASE WHEN negotiated_price IS NOT NULL THEN negotiated_price
                WHEN api_price IS NOT NULL AND invoice_price > api_price THEN api_price
                WHEN third_price IS NOT NULL THEN third_price END, NULL) IS NOT NULL
    THEN round((invoice_price -
           CASE WHEN negotiated_price IS NOT NULL THEN negotiated_price
                WHEN api_price IS NOT NULL AND invoice_price > api_price THEN api_price
                ELSE third_price END) * qty, 2)
  END AS variance_ext
FROM casc c;

-- ── 2. Reset: allow credit memos (open + unpaid + worked). Drop the CM refusal only. ──
CREATE OR REPLACE FUNCTION public.invoice_audit_reset(
  p_invoice_number text,
  p_actor_id       text,
  p_actor_type     text,
  p_actor_display  text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists         boolean;
  v_paid           boolean;
  v_processed      text;
  v_lines_reset    integer := 0;
  v_cm_cancelled   integer := 0;
  v_action_id      uuid;
  v_actor          text := COALESCE(NULLIF(btrim(p_actor_display), ''), 'operator');
BEGIN
  SELECT true INTO v_exists FROM public.abc_invoices WHERE invoice_number = p_invoice_number;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
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

  SELECT status INTO v_processed
  FROM public.invoice_payment_processed
  WHERE invoice_number = p_invoice_number AND status IN ('exported','paid')
  ORDER BY processed_at DESC LIMIT 1;
  IF v_processed IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_' || v_processed);
  END IF;

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

  UPDATE public.credit_memo_requests
  SET status = 'cancelled',
      packet = COALESCE(packet, '{}'::jsonb)
               || jsonb_build_object('cancelled_by', v_actor,
                                     'cancelled_at', now(),
                                     'cancel_reason', 'invoice_reset'),
      updated_at = now()
  WHERE invoice_number = p_invoice_number AND status = 'draft';
  GET DIAGNOSTICS v_cm_cancelled = ROW_COUNT;

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
