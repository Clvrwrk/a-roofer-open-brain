-- 101-branch-price-list-view.sql
-- Effective negotiated price list per vendor branch = exactly the prices the
-- Invoice Audit compares against. Per (ship_to, item) the best-confidence price
-- across ALL agreements matched to that ship_to (the central agreement id 1
-- supplies most items; active in-window agreements preferred when present).
-- Read-only. Powers /accounting/price-list/branch + the territory popup/side-card
-- "Active Price List" link.
--
-- DATA NOTE (2026-06-18): the central agreement (id 1, 231 items) is EXPIRED
-- (2026-04-20) and the API-generated per-branch agreements are empty shells, so
-- most branches resolve to expired-but-real prices. The page flags active/expired
-- per agreement; renewal is tracked via the staleness/expiry system (schema 71).

DROP VIEW IF EXISTS public.v_branch_price_list;
CREATE VIEW public.v_branch_price_list AS
WITH bm AS (
  SELECT DISTINCT ON (ship_to_number) ship_to_number, branch_number
  FROM public.abc_price_agreement_branch_matches
  ORDER BY ship_to_number, confidence_score DESC NULLS LAST
)
SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
  bm.branch_number,
  m.ship_to_number,
  pli.item_number,
  pli.description,
  pli.unit,
  pli.unit_price::numeric AS unit_price,
  pli.manufacturer,
  pli.product_category,
  pa.id AS agreement_id,
  pa.agreement_number,
  pa.version_label,
  pa.effective_date,
  pa.expiry_date,
  (current_date BETWEEN pa.effective_date AND coalesce(pa.expiry_date, '2999-01-01')) AS agreement_active,
  coalesce(o.category_key, pli.category_key) AS category_key  -- roof-system segment (schema 114)
FROM public.abc_price_agreement_branch_matches m
JOIN bm ON bm.ship_to_number = m.ship_to_number
JOIN public.abc_price_agreements pa ON pa.id = m.abc_price_agreement_id
JOIN public.abc_price_list_items pli ON pli.agreement_id = pa.id
LEFT JOIN public.item_roof_system_category o ON o.item_number = pli.item_number
ORDER BY m.ship_to_number, pli.item_number,
  m.confidence_score DESC NULLS LAST,
  (current_date BETWEEN pa.effective_date AND coalesce(pa.expiry_date, '2999-01-01')) DESC,
  pa.effective_date DESC;
