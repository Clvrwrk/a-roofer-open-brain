-- 154 — Invoice Audit benchmark cascade (additive, idempotent)
-- docs/59 Task 1. Powers morning_abc_sync v3 (docs/57 §1) AND the Invoice Audit UI.
--
-- Per line, a price benchmark is chosen by cascade:
--   1. negotiated agreement price (from v_invoice_audit_line — branch + effective_date + UOM matched)
--   2. else ABC API/list price (v_branch_item_api_price, by the invoice's branch, UOM-aligned)
--      -> used ONLY when invoice_price > api_price (overcharge vs list)
--   3. else the "third" price:
--        - normal invoice  -> recent_price  = newest PRIOR invoice, same item + same ship_to + same UOM
--        - credit memo      -> org_inv_price = same item's price on the ORIGINAL invoice referenced
--   4. else none (true coverage gap -> Jordan)
--
-- benchmark_source ∈ {negotiated, api, recent, org_inv, none}. Undercharges are never netted by consumers.
-- ADDITIVE: new sibling view; does NOT alter v_invoice_audit_line. Rollback = DROP VIEW (holds no data).
-- NOTE (perf): recent_price is a correlated lookup; consumers filter to small scopes (open+60d) so it stays cheap.
--              Materialize if ever queried view-wide. NOTE (credit memos): CM amounts may be negative; the
--              org_inv comparison is for CM review display — consumers handle sign as needed.

CREATE OR REPLACE VIEW v_invoice_audit_line_cascade AS
WITH br AS (  -- ship_to -> home branch (prefer home_branch)
  SELECT DISTINCT ON (ship_to_number) ship_to_number, branch_number
  FROM abc_ship_to_branch_access
  ORDER BY ship_to_number, home_branch DESC NULLS LAST
),
api AS (  -- latest API/list price per branch + item
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
    -- original-invoice price for credit memos. NOTE: original_invoice_reference carries a different
    -- suffix ("NNNNNNNNNN-1") than invoice_number ("NNNNNNNNNN-001"), so match on the BASE number
    -- (10-digit part before the dash). ~82% of referenced originals resolve; the rest aren't in the DB.
    CASE WHEN COALESCE(i.is_credit_memo, false) THEN (
        SELECT ol.price_per_uom
          FROM abc_invoice_lines ol
         WHERE split_part(ol.invoice_number, '-', 1) = split_part(i.original_invoice_reference, '-', 1)
           AND ol.item_number = l.item_number
           AND ol.price_uom = l.price_uom
           AND ol.price_per_uom IS NOT NULL
         ORDER BY ol.price_per_uom
         LIMIT 1 )
    END                               AS org_inv_price
  FROM abc_invoice_lines l
  JOIN abc_invoices i ON i.invoice_number = l.invoice_number
  LEFT JOIN br ON br.ship_to_number = i.ship_to_number
  LEFT JOIN api a ON a.branch_number = br.branch_number AND a.item_number = l.item_number
  LEFT JOIN v_invoice_audit_line al ON al.line_id = l.id
),
casc AS (
  SELECT enr.*,
    CASE WHEN is_credit_memo THEN org_inv_price ELSE recent_price END AS third_price
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
