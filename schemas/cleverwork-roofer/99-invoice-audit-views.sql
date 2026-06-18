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
-- Perf note: the per-invoice rollups MUST be a single grouped pass (CTE `roll`);
-- correlated subqueries over the line view time out on the match-table fan-out.

CREATE OR REPLACE VIEW public.v_invoice_audit_line AS
WITH neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number, pli.item_number, pli.unit_price AS negotiated_price
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price ASC
)
SELECT
  l.id AS line_id,
  l.invoice_number,
  l.item_number,
  l.item_description,
  l.quantity::numeric AS quantity,
  l.uom,
  l.unit_price::numeric AS unit_price,
  l.extended_price::numeric AS extended_price,
  n.negotiated_price::numeric AS negotiated_price,
  CASE WHEN n.negotiated_price IS NOT NULL AND n.negotiated_price <> 0
       THEN round(((l.unit_price - n.negotiated_price) / n.negotiated_price * 100)::numeric, 2) END AS variance_pct,
  CASE WHEN n.negotiated_price IS NOT NULL
       THEN round(((l.unit_price - n.negotiated_price) * l.quantity)::numeric, 2) END AS variance_ext
FROM public.abc_invoice_lines l
JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
LEFT JOIN neg n ON n.ship_to_number = i.ship_to_number AND n.item_number = l.item_number;

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
roll AS (
  SELECT
    l.invoice_number,
    count(*) AS line_count,
    count(*) FILTER (WHERE n.negotiated_price IS NULL) AS no_price_lines,
    count(*) FILTER (WHERE n.negotiated_price IS NOT NULL AND n.negotiated_price <> 0 AND abs((l.unit_price - n.negotiated_price) / n.negotiated_price * 100) >= 0.01) AS flagged_lines,
    coalesce(sum(CASE WHEN n.negotiated_price IS NOT NULL AND l.unit_price > n.negotiated_price THEN (l.unit_price - n.negotiated_price) * l.quantity ELSE 0 END), 0) AS at_risk,
    coalesce(max(CASE WHEN n.negotiated_price IS NOT NULL AND n.negotiated_price <> 0 THEN abs((l.unit_price - n.negotiated_price) / n.negotiated_price * 100) ELSE 0 END), 0) AS worst_pct
  FROM public.abc_invoice_lines l
  JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
  LEFT JOIN neg n ON n.ship_to_number = i.ship_to_number AND n.item_number = l.item_number
  GROUP BY l.invoice_number
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
  round(coalesce(r.worst_pct, 0), 2) AS worst_pct
FROM public.abc_invoices i
LEFT JOIN brmatch bm ON bm.ship_to_number = i.ship_to_number
LEFT JOIN public.abc_vendor_branches avb ON avb.branch_number = bm.branch_number
LEFT JOIN public.vendor_branches vb ON vb.branch_number = bm.branch_number
LEFT JOIN roll r ON r.invoice_number = i.invoice_number;
