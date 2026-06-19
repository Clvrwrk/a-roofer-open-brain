-- 120-invoice-audit-canonical-uom.sql
-- UOM normalization, part 2 of 4: rebuild the invoice-audit views on the canonical
-- columns from migration 119. Replaces the fragile migration-117 neg_factor logic
-- (which divided the agreement price by a per-line conversion factor and depended on
-- the resolved qty/uom pair staying in sync) with a direct, single-unit comparison.
--
-- Canonical rule:
--   invoice effective price = abc_invoice_lines.price_per_uom (in price_uom)
--   compared to the agreement unit_price (in its own unit) ONLY when the units match
--   (price_uom = agreement unit). Units match on 99.96% of lines; the rare mismatch is
--   surfaced via uom_mismatch (variance NULL) for manual review rather than guessed.
--
-- Display: quantity/uom/unit_price are all emitted in the pricing UOM so a row reads
--   "33 SQ @ $139.51 vs $153.91 negotiated" instead of mixing BD and SQ.
--
-- Additive + idempotent (CREATE OR REPLACE VIEW).

CREATE OR REPLACE VIEW public.v_invoice_audit_line AS
WITH neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number,
    pli.item_number,
    pli.unit_price AS negotiated_price,
    pli.unit       AS negotiated_uom
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price
)
SELECT
  l.id                AS line_id,
  l.invoice_number,
  l.item_number,
  l.item_description,
  l.price_qty         AS quantity,        -- quantity in the pricing UOM
  l.price_uom         AS uom,             -- the pricing / agreement unit (e.g. SQ)
  round(l.price_per_uom, 4) AS unit_price,-- canonical effective price in price_uom
  NULLIF(l.raw->>'extendedPriceAmount','')::numeric AS extended_price,
  -- agreement price, only when its unit matches the line's pricing unit
  CASE WHEN n.negotiated_uom IS NOT DISTINCT FROM l.price_uom
       THEN round(n.negotiated_price, 4) END AS negotiated_price,
  CASE
    WHEN n.negotiated_price IS NOT NULL AND n.negotiated_price <> 0
     AND n.negotiated_uom IS NOT DISTINCT FROM l.price_uom
     AND l.price_per_uom IS NOT NULL
    THEN round((l.price_per_uom - n.negotiated_price) / n.negotiated_price * 100, 2)
  END AS variance_pct,
  CASE
    WHEN n.negotiated_price IS NOT NULL
     AND n.negotiated_uom IS NOT DISTINCT FROM l.price_uom
     AND l.price_per_uom IS NOT NULL AND l.price_qty IS NOT NULL
    THEN round((l.price_per_uom - n.negotiated_price) * l.price_qty, 2)
  END AS variance_ext,
  (l.price_qty IS NOT NULL AND l.price_qty <> 0 AND l.price_per_uom IS NOT NULL) AS is_auditable,
  COALESCE(o.category_key, classify_roof_system(l.item_description, l.item_number)) AS category_key,
  -- new trailing columns (CREATE OR REPLACE requires appends at the end):
  n.negotiated_uom,
  -- TRUE when an agreement exists but is priced in a different unit than the invoice line
  (n.negotiated_price IS NOT NULL AND n.negotiated_uom IS DISTINCT FROM l.price_uom) AS uom_mismatch
FROM public.abc_invoice_lines l
JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
LEFT JOIN neg n ON n.ship_to_number = i.ship_to_number AND n.item_number = l.item_number
LEFT JOIN public.item_roof_system_category o ON o.item_number = l.item_number;


CREATE OR REPLACE VIEW public.v_invoice_audit_invoice AS
WITH neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number,
    pli.item_number,
    pli.unit_price AS negotiated_price,
    pli.unit       AS negotiated_uom
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price
), priced AS (
  SELECT
    l.invoice_number,
    l.id AS line_id,
    l.price_qty AS qty,
    NULLIF(l.raw->>'extendedPriceAmount','')::numeric AS ext,
    l.price_per_uom AS eff_price,
    CASE WHEN n.negotiated_uom IS NOT DISTINCT FROM l.price_uom
         THEN n.negotiated_price END AS negotiated_price,
    cur.audit_status,
    cur.decision
  FROM public.abc_invoice_lines l
  JOIN public.abc_invoices i_1 ON i_1.invoice_number = l.invoice_number
  LEFT JOIN neg n ON n.ship_to_number = i_1.ship_to_number AND n.item_number = l.item_number
  LEFT JOIN public.v_invoice_line_audit_current cur ON cur.invoice_line_id = l.id
), roll AS (
  SELECT
    priced.invoice_number,
    count(*) AS line_count,
    count(*) FILTER (WHERE priced.negotiated_price IS NULL) AS no_price_lines,
    count(*) FILTER (
      WHERE priced.negotiated_price IS NOT NULL AND priced.negotiated_price <> 0
        AND priced.qty IS NOT NULL AND priced.qty <> 0
        AND abs((priced.eff_price - priced.negotiated_price) / priced.negotiated_price * 100) >= 0.01
    ) AS flagged_lines,
    COALESCE(sum(CASE
      WHEN priced.negotiated_price IS NOT NULL AND priced.qty > 0
       AND priced.eff_price > priced.negotiated_price
       AND COALESCE(priced.audit_status, '') <> 'passed'
      THEN (priced.eff_price - priced.negotiated_price) * priced.qty ELSE 0 END), 0) AS at_risk,
    COALESCE(sum(CASE
      WHEN priced.negotiated_price IS NOT NULL AND priced.qty > 0
       AND priced.eff_price > priced.negotiated_price
       AND priced.audit_status = 'passed'
       AND priced.decision = ANY (ARRAY['credit-flag','credit-noflag'])
      THEN (priced.eff_price - priced.negotiated_price) * priced.qty ELSE 0 END), 0) AS credit_memo_amount,
    COALESCE(max(CASE
      WHEN priced.negotiated_price IS NOT NULL AND priced.negotiated_price <> 0
       AND priced.qty IS NOT NULL AND priced.qty <> 0
      THEN abs((priced.eff_price - priced.negotiated_price) / priced.negotiated_price * 100) ELSE 0 END), 0) AS worst_pct
  FROM priced
  GROUP BY priced.invoice_number
)
SELECT
  i.invoice_number,
  i.ship_to_number,
  i.invoice_date,
  i.order_date,
  i.total_amount,
  i.is_credit_memo,
  i.sales_type,
  i.purchase_order_number,
  i.order_name,
  rb.no AS branch_number,
  COALESCE(NULLIF(avb.branch_name, ''), NULLIF(vb.branch_name, ''), rb.nm, 'Branch ' || COALESCE(rb.no, i.ship_to_number)) AS branch_name,
  COALESCE((SELECT o.name FROM public.office o WHERE o.id = vb.pricing_territory_office_id),
           NULLIF(TRIM(BOTH FROM (COALESCE(rb.city, avb.city, '') || ', ') || COALESCE(rb.state, avb.state, '')), ',') || ' area',
           'Unassigned') AS office,
  COALESCE(rb.city, avb.city, '') AS branch_city,
  COALESCE(rb.state, avb.state, '') AS branch_state,
  COALESCE(r.line_count, 0::bigint) AS line_count,
  COALESCE(r.no_price_lines, 0::bigint) AS no_price_lines,
  COALESCE(r.flagged_lines, 0::bigint) AS flagged_lines,
  round(COALESCE(r.at_risk, 0), 2) AS at_risk,
  round(COALESCE(r.worst_pct, 0), 2) AS worst_pct,
  round(COALESCE(r.credit_memo_amount, 0), 2) AS credit_memo_amount
FROM public.abc_invoices i
CROSS JOIN LATERAL (
  SELECT NULLIF((i.raw -> 'branch') ->> 'number', '') AS no,
         NULLIF((i.raw -> 'branch') ->> 'name', '')   AS nm,
         NULLIF((i.raw -> 'branch') ->> 'city', '')   AS city,
         NULLIF((i.raw -> 'branch') ->> 'state', '')  AS state) rb
LEFT JOIN LATERAL (
  SELECT a.branch_name, a.city, a.state
  FROM public.abc_vendor_branches a
  WHERE rb.no IS NOT NULL AND ltrim(a.branch_number, '0') = ltrim(rb.no, '0')
  LIMIT 1) avb ON true
LEFT JOIN LATERAL (
  SELECT v.branch_name, v.pricing_territory_office_id
  FROM public.vendor_branches v
  WHERE rb.no IS NOT NULL AND ltrim(v.branch_number, '0') = ltrim(rb.no, '0')
  ORDER BY (v.pricing_territory_office_id IS NOT NULL) DESC
  LIMIT 1) vb ON true
LEFT JOIN roll r ON r.invoice_number = i.invoice_number;
