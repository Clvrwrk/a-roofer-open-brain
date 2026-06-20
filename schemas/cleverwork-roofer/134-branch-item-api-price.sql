-- 134-branch-item-api-price.sql
-- Shared "API Price" lookup for every line drill-down (Chris, 2026-06-19): Invoice Audit,
-- Order Audit, Price Agreement Audit, Agreement Builder, Estimate Audit all show the current
-- ABC API price per item per branch as a column.
--
-- Source = the per-branch API price seed (product_vendor_price_observations, source='api',
-- source_ref='api:{branch}:{cycle}'), written by integrations/bridges/abc-supply/price-seed.mjs
-- and refreshed monthly on the 15th. One row per (item_number, branch) = the latest API price.
-- Additive + idempotent.

CREATE OR REPLACE VIEW public.v_branch_item_api_price AS
SELECT DISTINCT ON (p.manufacturer_sku, ltrim(split_part(o.source_ref, ':', 2), '0'))
  p.manufacturer_sku                              AS item_number,
  p.id                                            AS product_id,
  split_part(o.source_ref, ':', 2)                AS branch_number,
  ltrim(split_part(o.source_ref, ':', 2), '0')    AS branch_number_norm,
  o.observed_price                                AS api_price,
  o.observed_uom                                  AS api_uom,
  o.price_in_base_uom                             AS api_price_base_uom,
  o.base_uom,
  o.observed_at,
  split_part(o.source_ref, ':', 3)                AS cycle
FROM public.product_vendor_price_observations o
JOIN public.products p ON p.id = o.product_id
JOIN public.vendors  v ON v.id = o.vendor_id AND v.slug = 'abc-supply'
WHERE o.source = 'api'
ORDER BY p.manufacturer_sku, ltrim(split_part(o.source_ref, ':', 2), '0'), o.observed_at DESC;

COMMENT ON VIEW public.v_branch_item_api_price IS
  'Current ABC API price per (item_number, branch) from the monthly price seed (product_vendor_price_observations source=api). Joined into every line dashboard as the "API Price" column. branch_number_norm strips leading zeros for matching against raw->branch / vendor_branches.';

GRANT SELECT ON public.v_branch_item_api_price TO anon, authenticated, service_role;
