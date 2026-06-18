-- 107-order-audit-views-priced.sql
-- Corrects + upgrades the Order Audit views (schema 106). Additive + idempotent.
--
-- WHY THIS REVISION (source of truth: https://apidocs.abcsupply.com/get-orders/):
--   1. ABC order LINES ARE PRICED. The mirror-backfill sync mapped the wrong keys
--      (quantity/uom/item_description columns came out 0/empty), but raw carries:
--        • raw->'orderedQty'->>'value'  = quantity   (NOT line.quantity)
--        • raw->'orderedQty'->>'uom'    = unit of measure
--        • raw->'unitPrice'->>'value'   = per-unit price
--        • raw->>'amount'               = line total
--      Lines carry NO description — only links.href to product detail — so the
--      description is looked up from abc_product_catalog by item_number.
--      => Order Audit is now a real VARIANCE audit (order unit price vs negotiated),
--         catching pricing issues BEFORE they reach the Invoice Audit path.
--   2. AUTO-ARCHIVE via 'system': an order is archived (out of the active catch
--      window) once it is Invoiced (salesOrder.status) OR its salesOrder.createdDate
--      is older than 60 days. Computed in-view so it self-maintains daily — no cron.
--      The dashboard defaults to ACTIVE orders (the still-catchable window).
--
-- Office: branch_number -> vendor_branches.pricing_territory_office_id -> office.name,
-- else "<branch city, ST> area". v_order_acculynx_match (106) is unchanged.

DROP VIEW IF EXISTS public.v_order_audit_line;
CREATE VIEW public.v_order_audit_line AS
WITH neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number, pli.item_number, pli.unit_price AS negotiated_price
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price ASC
)
SELECT
  l.order_number || '|' || l.line_key AS line_id,
  l.order_number,
  l.line_key,
  l.item_number,
  coalesce(nullif(c.item_description, ''), nullif(c.marketing_description, ''), nullif(c.family_name, ''), '') AS item_description,
  nullif(l.raw->'orderedQty'->>'value', '')::numeric AS quantity,
  coalesce(nullif(l.raw->'orderedQty'->>'uom', ''), nullif(l.raw->'orderedQty'->>'uomCode', ''), '') AS uom,
  nullif(l.raw->'unitPrice'->>'value', '')::numeric AS unit_price,
  nullif(l.raw->>'amount', '')::numeric AS extended_price,
  n.negotiated_price::numeric AS negotiated_price,
  CASE WHEN n.negotiated_price IS NOT NULL AND n.negotiated_price <> 0
       THEN round(((nullif(l.raw->'unitPrice'->>'value', '')::numeric - n.negotiated_price) / n.negotiated_price * 100)::numeric, 2) END AS variance_pct,
  CASE WHEN n.negotiated_price IS NOT NULL
       THEN round(((nullif(l.raw->'unitPrice'->>'value', '')::numeric - n.negotiated_price) * nullif(l.raw->'orderedQty'->>'value', '')::numeric)::numeric, 2) END AS variance_ext,
  (n.negotiated_price IS NOT NULL) AS covered
FROM public.abc_order_lines l
JOIN public.abc_orders o ON o.order_number = l.order_number
LEFT JOIN public.abc_product_catalog c ON c.item_number = l.item_number
LEFT JOIN neg n ON n.ship_to_number = o.ship_to_number AND n.item_number = l.item_number;

DROP VIEW IF EXISTS public.v_order_audit_order;
CREATE VIEW public.v_order_audit_order AS
WITH neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number, pli.item_number, pli.unit_price AS negotiated_price
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price ASC
),
roll AS (
  SELECT
    l.order_number,
    count(*) AS line_count,
    count(*) FILTER (WHERE n.negotiated_price IS NOT NULL) AS covered_lines,
    count(*) FILTER (WHERE n.negotiated_price IS NULL) AS uncovered_lines,
    count(*) FILTER (WHERE n.negotiated_price IS NOT NULL AND n.negotiated_price <> 0 AND abs((nullif(l.raw->'unitPrice'->>'value', '')::numeric - n.negotiated_price) / n.negotiated_price * 100) >= 0.01) AS flagged_lines,
    coalesce(sum(CASE WHEN n.negotiated_price IS NOT NULL AND nullif(l.raw->'unitPrice'->>'value', '')::numeric > n.negotiated_price
                      THEN (nullif(l.raw->'unitPrice'->>'value', '')::numeric - n.negotiated_price) * nullif(l.raw->'orderedQty'->>'value', '')::numeric ELSE 0 END), 0) AS at_risk,
    coalesce(max(CASE WHEN n.negotiated_price IS NOT NULL AND n.negotiated_price <> 0
                      THEN abs((nullif(l.raw->'unitPrice'->>'value', '')::numeric - n.negotiated_price) / n.negotiated_price * 100) ELSE 0 END), 0) AS worst_pct,
    coalesce(sum(nullif(l.raw->>'amount', '')::numeric), 0) AS line_total
  FROM public.abc_order_lines l
  JOIN public.abc_orders o ON o.order_number = l.order_number
  LEFT JOIN neg n ON n.ship_to_number = o.ship_to_number AND n.item_number = l.item_number
  GROUP BY l.order_number
)
SELECT
  o.order_number,
  o.raw->'salesOrder'->>'purchaseOrder' AS purchase_order_number,
  coalesce(nullif(o.raw->'salesOrder'->>'createdDate', ''), o.raw->'dates'->>'orderedOn') AS ordered_on,
  (o.raw->'dates'->>'deliveryRequestedFor') AS delivery_requested_for,
  o.raw->'salesOrder'->>'status' AS order_status,
  o.order_type,
  coalesce((o.raw->'orderAmounts'->>'total')::numeric, 0) AS order_total,
  CASE WHEN o.raw->'salesOrder'->>'status' ILIKE 'invoiced'
            OR coalesce(nullif(o.raw->'salesOrder'->>'createdDate', ''), o.raw->'dates'->>'orderedOn')::date < (current_date - 60)
       THEN 'archived' ELSE 'active' END AS disposition,
  CASE WHEN o.raw->'salesOrder'->>'status' ILIKE 'invoiced' THEN 'invoiced'
       WHEN coalesce(nullif(o.raw->'salesOrder'->>'createdDate', ''), o.raw->'dates'->>'orderedOn')::date < (current_date - 60) THEN 'aged_60d'
       END AS archive_reason,
  o.branch_number,
  o.ship_to_number,
  coalesce(nullif(avb.branch_name, ''), nullif(vb.branch_name, ''), 'Branch ' || coalesce(o.branch_number, o.ship_to_number)) AS branch_name,
  coalesce(
    (SELECT ofc.name FROM public.office ofc WHERE ofc.id = vb.pricing_territory_office_id),
    nullif(trim(coalesce(avb.city, '') || ', ' || coalesce(avb.state, '')), ',') || ' area',
    'Unassigned'
  ) AS office,
  coalesce(avb.city, '') AS branch_city,
  coalesce(avb.state, '') AS branch_state,
  coalesce(r.line_count, 0) AS line_count,
  coalesce(r.covered_lines, 0) AS covered_lines,
  coalesce(r.uncovered_lines, 0) AS uncovered_lines,
  coalesce(r.flagged_lines, 0) AS flagged_lines,
  round(coalesce(r.at_risk, 0), 2) AS at_risk,
  round(coalesce(r.worst_pct, 0), 2) AS worst_pct,
  round(coalesce(r.line_total, 0), 2) AS line_total
FROM public.abc_orders o
LEFT JOIN public.abc_vendor_branches avb ON avb.branch_number = o.branch_number
LEFT JOIN public.vendor_branches vb ON vb.branch_number = o.branch_number
LEFT JOIN roll r ON r.order_number = o.order_number;
