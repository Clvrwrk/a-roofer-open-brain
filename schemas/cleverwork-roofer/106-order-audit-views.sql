-- 106-order-audit-views.sql
-- Read-only views for Operations → Order Audit: PE Office → Vendor/Branch →
-- Order → Line drill-down over live ABC orders. Additive + idempotent. No writes.
--
-- KEY DIFFERENCE vs Invoice Audit: ABC order LINES carry no price (orders are
-- pre-pricing), so this is a VERIFICATION + COVERAGE audit, not a variance audit:
--   1. AcuLynx verification — does the order PO map to a PE job? (v_order_acculynx_match)
--   2. Negotiated coverage — is each ordered item covered by a current price
--      agreement for that ship-to? Uncovered lines are the audit finding.
--
-- DATA-MAP NOTES (see skills/cleverwork-roofer/abc-supply-api):
--   * PO lives in raw->'salesOrder'->>'purchaseOrder' ("CO-227: DUANE RI" =
--     "{PE job#}: {client}"). The purchase_order_number COLUMN is empty for the
--     existing 3,178 rows (sync bug fixed 2026-06-18, applies to new pulls only),
--     so these views read PO from raw.
--   * Order date = raw->'dates'->>'orderedOn'; order $ total = raw->'orderAmounts'
--     ->>'total'; order status = raw->'salesOrder'->>'status'.
--   * Office: branch_number → vendor_branches.pricing_territory_office_id →
--     office.name, else "<branch city, ST> area".

-- Negotiated price per (ship_to_number, item_number): collapse the
-- agreement→branch matches to one price (highest confidence, then lowest price).
-- Shared by the line + order rollup views below.
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
  l.item_description,
  l.quantity::numeric AS quantity,
  l.uom,
  n.negotiated_price::numeric AS negotiated_price,
  (n.negotiated_price IS NOT NULL) AS covered
FROM public.abc_order_lines l
JOIN public.abc_orders o ON o.order_number = l.order_number
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
    count(*) FILTER (WHERE n.negotiated_price IS NULL) AS uncovered_lines
  FROM public.abc_order_lines l
  JOIN public.abc_orders o ON o.order_number = l.order_number
  LEFT JOIN neg n ON n.ship_to_number = o.ship_to_number AND n.item_number = l.item_number
  GROUP BY l.order_number
)
SELECT
  o.order_number,
  o.raw->'salesOrder'->>'purchaseOrder' AS purchase_order_number,
  (o.raw->'dates'->>'orderedOn') AS ordered_on,
  (o.raw->'dates'->>'deliveryRequestedFor') AS delivery_requested_for,
  o.raw->'salesOrder'->>'status' AS order_status,
  o.order_type,
  coalesce((o.raw->'orderAmounts'->>'total')::numeric, 0) AS order_total,
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
  coalesce(r.uncovered_lines, 0) AS uncovered_lines
FROM public.abc_orders o
LEFT JOIN public.abc_vendor_branches avb ON avb.branch_number = o.branch_number
LEFT JOIN public.vendor_branches vb ON vb.branch_number = o.branch_number
LEFT JOIN roll r ON r.order_number = o.order_number;

-- Order ↔ AcuLynx crosswalk (mirror of v_invoice_acculynx_match, schema 104).
-- PE job number lives in acculynx_jobs.job_name ("KS-157: client"); match the
-- normalized order PO to the job_name prefix.
DROP VIEW IF EXISTS public.v_order_acculynx_match;
CREATE VIEW public.v_order_acculynx_match AS
WITH normpo AS (
  SELECT o.order_number,
    o.raw->'salesOrder'->>'purchaseOrder' AS purchase_order,
    regexp_replace(upper(regexp_replace(coalesce(o.raw->'salesOrder'->>'purchaseOrder', ''), '^PO', '', 'i')), '[^A-Z0-9]', '', 'g') AS po_norm
  FROM public.abc_orders o
),
jobs AS (
  SELECT aj.id,
    trim(split_part(aj.job_name, ':', 1)) AS pe_job_number,
    nullif(trim(substring(aj.job_name FROM position(':' IN aj.job_name) + 1)), '') AS client_name,
    aj.job_category_name, aj.trade_types, aj.current_milestone,
    aj.location_street1, aj.location_city, aj.location_state,
    regexp_replace(upper(split_part(aj.job_name, ':', 1)), '[^A-Z0-9]', '', 'g') AS jn_norm
  FROM public.acculynx_jobs aj
  WHERE aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-?\s*[0-9]'
)
SELECT DISTINCT ON (n.order_number)
  n.order_number, n.purchase_order,
  j.id AS acculynx_job_id, j.pe_job_number, j.client_name,
  j.job_category_name, j.trade_types, j.current_milestone,
  j.location_street1, j.location_city, j.location_state,
  (j.id IS NOT NULL) AS matched
FROM normpo n
LEFT JOIN jobs j ON j.jn_norm = n.po_norm AND n.po_norm <> ''
ORDER BY n.order_number, (j.id IS NOT NULL) DESC;
