-- 121-order-audit-canonical-uom.sql
-- UOM normalization, part 3 of 4: rebuild the order-audit views on canonical UOM.
--
-- Orders are the worst offenders today: v_order_audit_line / v_order_audit_order had
-- NO UOM handling at all and compared the raw ordered-UOM unit price (e.g. $52.97/BD)
-- straight to the agreement's pricing-UOM price (e.g. $153.91/SQ), producing live
-- variances of -80% to -100% that were pure UOM artifacts.
--
-- Orders (unlike invoices) carry NO priceQty / priceConversionFactor -- only orderedQty
-- (stocking UOM), unitPrice (per stocking UOM) and amount. So we align to the agreement
-- unit using v_item_uom_map (learned from the invoice feed, 100% coverage):
--   obs_price_in_price_uom = order_unit_price * units_per_price_uom   when ordered in ship_uom
--                          = order_unit_price                          when ordered in price_uom
-- and compare only when the agreement's unit matches the item's price_uom; otherwise the
-- line is flagged uom_mismatch (variance NULL) for review.
--
-- Additive + idempotent (CREATE OR REPLACE VIEW).

CREATE OR REPLACE VIEW public.v_order_audit_line AS
WITH neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number,
    pli.item_number,
    pli.unit_price AS negotiated_price,
    pli.unit       AS negotiated_uom
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price
), base AS (
  SELECT
    (l.order_number || '|' || l.line_key) AS line_id,
    l.order_number,
    l.line_key,
    l.item_number,
    COALESCE(NULLIF(c.item_description, ''), NULLIF(c.marketing_description, ''), NULLIF(c.family_name, ''), '') AS item_description,
    NULLIF(l.raw->'orderedQty'->>'value','')::numeric AS ord_qty,
    COALESCE(NULLIF(l.raw->'orderedQty'->>'uom',''), NULLIF(l.raw->'orderedQty'->>'uomCode','')) AS ord_uom,
    NULLIF(l.raw->'unitPrice'->>'value','')::numeric AS ord_unit_price,
    NULLIF(l.raw->>'amount','')::numeric AS amount,
    o.ship_to_number,
    um.ship_uom, um.price_uom, um.units_per_price_uom,
    n.negotiated_price, n.negotiated_uom,
    COALESCE(ovr.category_key, c.category_key) AS category_key
  FROM public.abc_order_lines l
  JOIN public.abc_orders o ON o.order_number = l.order_number
  LEFT JOIN public.abc_product_catalog c ON c.item_number = l.item_number
  LEFT JOIN public.v_item_uom_map um ON um.item_number = l.item_number
  LEFT JOIN neg n ON n.ship_to_number = o.ship_to_number AND n.item_number = l.item_number
  LEFT JOIN public.item_roof_system_category ovr ON ovr.item_number = l.item_number
), conv AS (
  SELECT b.*,
    COALESCE(b.price_uom, b.ord_uom) AS canon_uom,
    CASE
      WHEN b.price_uom IS NOT NULL AND b.ord_uom = b.ship_uom
       AND b.ship_uom IS DISTINCT FROM b.price_uom
       AND b.units_per_price_uom IS NOT NULL AND b.units_per_price_uom <> 0
      THEN b.units_per_price_uom ELSE 1 END AS conv_factor
  FROM base b
)
SELECT
  line_id,
  order_number,
  line_key,
  item_number,
  item_description,
  CASE WHEN ord_qty IS NOT NULL THEN round(ord_qty / conv_factor, 4) END AS quantity,
  canon_uom AS uom,
  CASE WHEN ord_unit_price IS NOT NULL THEN round(ord_unit_price * conv_factor, 4) END AS unit_price,
  amount AS extended_price,
  CASE WHEN negotiated_uom IS NOT DISTINCT FROM canon_uom THEN negotiated_price END AS negotiated_price,
  CASE
    WHEN negotiated_price IS NOT NULL AND negotiated_price <> 0
     AND negotiated_uom IS NOT DISTINCT FROM canon_uom
     AND ord_unit_price IS NOT NULL
    THEN round(((ord_unit_price * conv_factor) - negotiated_price) / negotiated_price * 100, 2)
  END AS variance_pct,
  CASE
    WHEN negotiated_price IS NOT NULL
     AND negotiated_uom IS NOT DISTINCT FROM canon_uom
     AND ord_unit_price IS NOT NULL AND ord_qty IS NOT NULL
    THEN round(((ord_unit_price * conv_factor) - negotiated_price) * (ord_qty / conv_factor), 2)
  END AS variance_ext,
  (negotiated_price IS NOT NULL AND negotiated_uom IS NOT DISTINCT FROM canon_uom) AS covered,
  category_key,
  negotiated_uom,
  (negotiated_price IS NOT NULL AND negotiated_uom IS DISTINCT FROM canon_uom) AS uom_mismatch
FROM conv;


CREATE OR REPLACE VIEW public.v_order_audit_order AS
WITH neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number,
    pli.item_number,
    pli.unit_price AS negotiated_price,
    pli.unit       AS negotiated_uom
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price
), conv AS (
  SELECT
    l.order_number,
    NULLIF(l.raw->'orderedQty'->>'value','')::numeric AS ord_qty,
    NULLIF(l.raw->>'amount','')::numeric AS amount,
    CASE
      WHEN um.price_uom IS NOT NULL
       AND COALESCE(NULLIF(l.raw->'orderedQty'->>'uom',''), NULLIF(l.raw->'orderedQty'->>'uomCode','')) = um.ship_uom
       AND um.ship_uom IS DISTINCT FROM um.price_uom
       AND um.units_per_price_uom IS NOT NULL AND um.units_per_price_uom <> 0
      THEN um.units_per_price_uom ELSE 1 END AS conv_factor,
    COALESCE(um.price_uom, COALESCE(NULLIF(l.raw->'orderedQty'->>'uom',''), NULLIF(l.raw->'orderedQty'->>'uomCode',''))) AS canon_uom,
    NULLIF(l.raw->'unitPrice'->>'value','')::numeric AS ord_unit_price,
    n.negotiated_price, n.negotiated_uom
  FROM public.abc_order_lines l
  JOIN public.abc_orders o_1 ON o_1.order_number = l.order_number
  LEFT JOIN public.v_item_uom_map um ON um.item_number = l.item_number
  LEFT JOIN neg n ON n.ship_to_number = o_1.ship_to_number AND n.item_number = l.item_number
), roll AS (
  SELECT
    conv.order_number,
    count(*) AS line_count,
    count(*) FILTER (WHERE conv.negotiated_price IS NOT NULL AND conv.negotiated_uom IS NOT DISTINCT FROM conv.canon_uom) AS covered_lines,
    count(*) FILTER (WHERE conv.negotiated_price IS NULL OR conv.negotiated_uom IS DISTINCT FROM conv.canon_uom) AS uncovered_lines,
    count(*) FILTER (
      WHERE conv.negotiated_price IS NOT NULL AND conv.negotiated_price <> 0
        AND conv.negotiated_uom IS NOT DISTINCT FROM conv.canon_uom
        AND conv.ord_unit_price IS NOT NULL
        AND abs(((conv.ord_unit_price * conv.conv_factor) - conv.negotiated_price) / conv.negotiated_price * 100) >= 0.01
    ) AS flagged_lines,
    COALESCE(sum(CASE
      WHEN conv.negotiated_price IS NOT NULL AND conv.negotiated_uom IS NOT DISTINCT FROM conv.canon_uom
       AND (conv.ord_unit_price * conv.conv_factor) > conv.negotiated_price
      THEN ((conv.ord_unit_price * conv.conv_factor) - conv.negotiated_price) * (conv.ord_qty / conv.conv_factor)
      ELSE 0 END), 0) AS at_risk,
    COALESCE(max(CASE
      WHEN conv.negotiated_price IS NOT NULL AND conv.negotiated_price <> 0
       AND conv.negotiated_uom IS NOT DISTINCT FROM conv.canon_uom
       AND conv.ord_unit_price IS NOT NULL
      THEN abs(((conv.ord_unit_price * conv.conv_factor) - conv.negotiated_price) / conv.negotiated_price * 100)
      ELSE 0 END), 0) AS worst_pct,
    COALESCE(sum(conv.amount), 0) AS line_total
  FROM conv
  GROUP BY conv.order_number
)
SELECT
  o.order_number,
  (o.raw -> 'salesOrder') ->> 'purchaseOrder' AS purchase_order_number,
  COALESCE(NULLIF((o.raw -> 'salesOrder') ->> 'createdDate', ''), (o.raw -> 'dates') ->> 'orderedOn') AS ordered_on,
  (o.raw -> 'dates') ->> 'deliveryRequestedFor' AS delivery_requested_for,
  (o.raw -> 'salesOrder') ->> 'status' AS order_status,
  o.order_type,
  COALESCE(((o.raw -> 'orderAmounts') ->> 'total')::numeric, 0) AS order_total,
  CASE
    WHEN ((o.raw -> 'salesOrder') ->> 'status') ~~* 'invoiced'
      OR COALESCE(NULLIF((o.raw -> 'salesOrder') ->> 'createdDate', ''), (o.raw -> 'dates') ->> 'orderedOn')::date < (CURRENT_DATE - 60)
    THEN 'archived' ELSE 'active' END AS disposition,
  CASE
    WHEN ((o.raw -> 'salesOrder') ->> 'status') ~~* 'invoiced' THEN 'invoiced'
    WHEN COALESCE(NULLIF((o.raw -> 'salesOrder') ->> 'createdDate', ''), (o.raw -> 'dates') ->> 'orderedOn')::date < (CURRENT_DATE - 60) THEN 'aged_60d'
    ELSE NULL END AS archive_reason,
  o.branch_number,
  o.ship_to_number,
  COALESCE(NULLIF(avb.branch_name, ''), NULLIF(vb.branch_name, ''), 'Branch ' || COALESCE(o.branch_number, o.ship_to_number)) AS branch_name,
  COALESCE((SELECT ofc.name FROM public.office ofc WHERE ofc.id = vb.pricing_territory_office_id),
           NULLIF(TRIM(BOTH FROM (COALESCE(avb.city, '') || ', ') || COALESCE(avb.state, '')), ',') || ' area',
           'Unassigned') AS office,
  COALESCE(avb.city, '') AS branch_city,
  COALESCE(avb.state, '') AS branch_state,
  COALESCE(r.line_count, 0::bigint) AS line_count,
  COALESCE(r.covered_lines, 0::bigint) AS covered_lines,
  COALESCE(r.uncovered_lines, 0::bigint) AS uncovered_lines,
  COALESCE(r.flagged_lines, 0::bigint) AS flagged_lines,
  round(COALESCE(r.at_risk, 0), 2) AS at_risk,
  round(COALESCE(r.worst_pct, 0), 2) AS worst_pct,
  round(COALESCE(r.line_total, 0), 2) AS line_total
FROM public.abc_orders o
LEFT JOIN public.abc_vendor_branches avb ON avb.branch_number = o.branch_number
LEFT JOIN public.vendor_branches vb ON vb.branch_number = o.branch_number
LEFT JOIN roll r ON r.order_number = o.order_number;
