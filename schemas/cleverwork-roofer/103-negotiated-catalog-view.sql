-- 103-negotiated-catalog-view.sql
-- Negotiated Item Catalog: top-200 purchased items by REAL spend, broken out by
-- branch × year, with negotiated coverage. Live from abc_line_items (the purchase
-- ledger, 2023-2026). Replaces the synthetic YEAR_FACTOR sample data. Read-only.
CREATE OR REPLACE VIEW public.v_negotiated_catalog AS
WITH agg AS (
  SELECT li.item_number,
    max(li.item_description) AS description,
    li.branch_number, li.branch_state, li.source_year::int AS year,
    sum(li.ext_price)::numeric AS spend, sum(li.inv_qty)::numeric AS qty
  FROM public.abc_line_items li
  WHERE li.source_year IS NOT NULL AND li.item_number IS NOT NULL
  GROUP BY li.item_number, li.branch_number, li.branch_state, li.source_year
),
tot AS (SELECT item_number, sum(spend) AS total FROM agg GROUP BY item_number),
top AS (SELECT item_number FROM tot ORDER BY total DESC LIMIT 200)
SELECT
  a.item_number, a.description, a.branch_number, a.branch_state, a.year,
  round(a.spend, 2) AS spend, round(a.qty, 2) AS qty,
  coalesce(nullif(avb.branch_name, ''), 'Branch ' || a.branch_number) AS branch_name,
  coalesce(nullif(trim(coalesce(avb.city, '') || ', ' || coalesce(nullif(avb.state, ''), a.branch_state, '')), ','), 'Unassigned') || ' area' AS office,
  EXISTS (SELECT 1 FROM public.abc_price_list_items pli WHERE pli.item_number = a.item_number) AS covered
FROM agg a
JOIN top t ON t.item_number = a.item_number
LEFT JOIN public.abc_vendor_branches avb ON avb.branch_number = a.branch_number;
