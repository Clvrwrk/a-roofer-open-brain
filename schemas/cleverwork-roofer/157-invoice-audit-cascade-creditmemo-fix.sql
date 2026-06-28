-- 157 — Invoice Audit cascade: credit-memo line coverage fix (additive, idempotent)
-- docs/59 Task 3. Supersedes the v_invoice_audit_line_cascade body in migration 154.
--
-- Bug (found in Task 3 preview verification): migration 154 sourced its main CTE from
-- abc_invoice_lines, but credit-memo lines DO NOT live in abc_invoice_lines — they live in
-- v_invoice_lines_complete (the same source v_invoice_audit_line uses, keyed on l.id). So the
-- cascade returned ZERO rows for every credit-memo invoice, and the D7 "Org Inv Price"
-- comparison never reached any credit memo. (RT-1 validated open+60d NORMAL invoices, which
-- exclude credit memos, so it didn't surface there.)
--
-- Fix: point the main `enr` CTE at v_invoice_lines_complete so line_id (l.id) matches
-- v_invoice_audit_line for ALL lines (incl. credit memos) and CM lines get org_inv_price.
-- The recent_price / org_inv_price benchmark lookups stay on abc_invoice_lines: a credit
-- memo's referenced ORIGINAL invoice (and prior "recent" invoices) are normal invoices that
-- live in abc_invoice_lines. Everything else is byte-for-byte the migration-154 definition.
--
-- ADDITIVE: CREATE OR REPLACE only; no drops, holds no data. Rollback = re-apply 154's body.

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
  FROM v_invoice_lines_complete l
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
