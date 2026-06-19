-- 99-invoice-audit-views.sql
-- Read-only views for Accounting → Invoice Audit: PE Office → Vendor/Branch →
-- Invoice → Line drill-down over live ABC invoices, with per-line variance vs
-- negotiated pricing. Additive + idempotent (CREATE OR REPLACE VIEW). No writes.
--
-- Negotiated price: collapse abc_price_agreement_branch_matches → abc_price_list_items
-- to ONE price per (ship_to_number, item_number), choosing the highest-confidence
-- match (then lowest price). Lines with no match → No Price (the key audit finding).
-- Office: ship_to → branch_number (best match) → vendor_branches.pricing_territory_office_id
-- → office.name, else "<branch city, ST> area".
--
-- Pricing (Item 3 fix): the displayed/compared invoice price is the EFFECTIVE per-UOM
-- price = extended_price / quantity, NOT abc_invoice_lines.unit_price. For bundled SKUs
-- (e.g. shingles at 3 BD/SQ) unit_price is per-bundle while quantity is in squares, so raw
-- unit_price overstates the true per-square price by the pack factor (showed $387/SQ for a
-- $129/SQ item). effective_unit_price (extended/qty) is correct for every line.
--
-- Robustness (Item 6 guard): quantity/uom/extended are COALESCEd from raw so a future
-- ingestion column-mapping drift (the 2026-06-18 nested-key bug) can't silently surface a
-- line with blank qty/price as auditable. is_auditable flags lines that still lack qty/ext.
--
-- At Risk (Item 2 fix): the per-invoice at_risk counts overcharge ONLY on lines not yet
-- audited; a 'passed' audit (incl. the historical backfill) removes the line from exposure.
-- credit_memo_amount is the parallel total for audited lines dispositioned to a credit memo.
--
-- Perf note: the per-invoice rollups MUST be a single grouped pass (CTE `roll`);
-- correlated subqueries over the line view time out on the match-table fan-out.

CREATE OR REPLACE VIEW public.v_invoice_audit_line AS
WITH neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number, pli.item_number, pli.unit_price AS negotiated_price
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price ASC
),
base AS (
  SELECT
    l.id AS line_id,
    l.invoice_number,
    l.item_number,
    l.item_description,
    i.ship_to_number,
    COALESCE(l.quantity::numeric, nullif(l.raw->'shippedQty'->>'value', '')::numeric, nullif(l.raw->'priceQty'->>'value', '')::numeric) AS qty,
    COALESCE(l.uom, nullif(l.raw->'shippedQty'->>'uom', ''), nullif(l.raw->'priceQty'->>'uom', '')) AS uom,
    COALESCE(l.extended_price::numeric, nullif(l.raw->>'extendedPriceAmount', '')::numeric) AS ext
  FROM public.abc_invoice_lines l
  JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
)
SELECT
  b.line_id,
  b.invoice_number,
  b.item_number,
  b.item_description,
  b.qty AS quantity,
  b.uom,
  CASE WHEN b.qty IS NOT NULL AND b.qty <> 0 THEN round((b.ext / b.qty)::numeric, 4) END AS unit_price,
  b.ext AS extended_price,
  n.negotiated_price::numeric AS negotiated_price,
  CASE WHEN n.negotiated_price IS NOT NULL AND n.negotiated_price <> 0 AND b.qty IS NOT NULL AND b.qty <> 0
       THEN round((((b.ext / b.qty) - n.negotiated_price) / n.negotiated_price * 100)::numeric, 2) END AS variance_pct,
  CASE WHEN n.negotiated_price IS NOT NULL AND b.qty IS NOT NULL AND b.qty <> 0
       THEN round((((b.ext / b.qty) - n.negotiated_price) * b.qty)::numeric, 2) END AS variance_ext,
  -- appended last so CREATE OR REPLACE stays additive
  (b.qty IS NOT NULL AND b.qty <> 0 AND b.ext IS NOT NULL) AS is_auditable,
  -- roof-system segmentation (schema 114): curated override else keyword classifier
  coalesce(o.category_key, public.classify_roof_system(b.item_description, b.item_number)) AS category_key
FROM base b
LEFT JOIN neg n ON n.ship_to_number = b.ship_to_number AND n.item_number = b.item_number
LEFT JOIN public.item_roof_system_category o ON o.item_number = b.item_number;

CREATE OR REPLACE VIEW public.v_invoice_audit_invoice AS
WITH brmatch AS (
  SELECT DISTINCT ON (ship_to_number) ship_to_number, branch_number
  FROM public.abc_price_agreement_branch_matches
  ORDER BY ship_to_number, confidence_score DESC NULLS LAST
),
neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number, pli.item_number, pli.unit_price AS negotiated_price
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price ASC
),
priced AS (
  SELECT
    l.invoice_number,
    l.id AS line_id,
    COALESCE(l.quantity::numeric, nullif(l.raw->'shippedQty'->>'value', '')::numeric, nullif(l.raw->'priceQty'->>'value', '')::numeric) AS qty,
    COALESCE(l.extended_price::numeric, nullif(l.raw->>'extendedPriceAmount', '')::numeric) AS ext,
    n.negotiated_price,
    cur.audit_status,
    cur.decision
  FROM public.abc_invoice_lines l
  JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
  LEFT JOIN neg n ON n.ship_to_number = i.ship_to_number AND n.item_number = l.item_number
  LEFT JOIN public.v_invoice_line_audit_current cur ON cur.invoice_line_id = l.id
),
roll AS (
  SELECT
    invoice_number,
    count(*) AS line_count,
    count(*) FILTER (WHERE negotiated_price IS NULL) AS no_price_lines,
    count(*) FILTER (WHERE negotiated_price IS NOT NULL AND negotiated_price <> 0 AND qty IS NOT NULL AND qty <> 0
                       AND abs(((ext / qty) - negotiated_price) / negotiated_price * 100) >= 0.01) AS flagged_lines,
    coalesce(sum(CASE WHEN negotiated_price IS NOT NULL AND qty > 0 AND (ext / qty) > negotiated_price
                       AND coalesce(audit_status, '') <> 'passed'
                      THEN ((ext / qty) - negotiated_price) * qty ELSE 0 END), 0) AS at_risk,
    coalesce(sum(CASE WHEN negotiated_price IS NOT NULL AND qty > 0 AND (ext / qty) > negotiated_price
                       AND audit_status = 'passed' AND decision IN ('credit-flag', 'credit-noflag')
                      THEN ((ext / qty) - negotiated_price) * qty ELSE 0 END), 0) AS credit_memo_amount,
    coalesce(max(CASE WHEN negotiated_price IS NOT NULL AND negotiated_price <> 0 AND qty IS NOT NULL AND qty <> 0
                      THEN abs(((ext / qty) - negotiated_price) / negotiated_price * 100) ELSE 0 END), 0) AS worst_pct
  FROM priced
  GROUP BY invoice_number
)
SELECT
  i.invoice_number, i.ship_to_number, i.invoice_date, i.order_date,
  i.total_amount::numeric AS total_amount, i.is_credit_memo, i.sales_type,
  i.purchase_order_number, i.order_name,
  bm.branch_number,
  coalesce(nullif(avb.branch_name, ''), nullif(vb.branch_name, ''), 'Branch ' || coalesce(bm.branch_number, i.ship_to_number)) AS branch_name,
  coalesce(
    (SELECT o.name FROM public.office o WHERE o.id = vb.pricing_territory_office_id),
    nullif(trim(coalesce(avb.city, '') || ', ' || coalesce(avb.state, '')), ',') || ' area',
    'Unassigned'
  ) AS office,
  coalesce(avb.city, '') AS branch_city,
  coalesce(avb.state, '') AS branch_state,
  coalesce(r.line_count, 0) AS line_count,
  coalesce(r.no_price_lines, 0) AS no_price_lines,
  coalesce(r.flagged_lines, 0) AS flagged_lines,
  round(coalesce(r.at_risk, 0), 2) AS at_risk,
  round(coalesce(r.worst_pct, 0), 2) AS worst_pct,
  -- appended last so CREATE OR REPLACE stays additive
  round(coalesce(r.credit_memo_amount, 0), 2) AS credit_memo_amount
FROM public.abc_invoices i
LEFT JOIN brmatch bm ON bm.ship_to_number = i.ship_to_number
LEFT JOIN public.abc_vendor_branches avb ON avb.branch_number = bm.branch_number
LEFT JOIN public.vendor_branches vb ON vb.branch_number = bm.branch_number
LEFT JOIN roll r ON r.invoice_number = i.invoice_number;
