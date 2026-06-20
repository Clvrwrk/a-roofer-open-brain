-- 135-price-seed-item-view.sql
-- The item set the ABC API price seed covers = canonical products we actually purchase
-- (appear on invoice or order lines), ~606 items. Drives price-seed.mjs --scope=purchased and
-- the monthly-15th cron, so the "API Price" column populates for the audited line universe
-- (not just the 99 GPA items). Additive + idempotent.

CREATE OR REPLACE VIEW public.v_price_seed_item AS
SELECT DISTINCT p.id AS product_id, p.manufacturer_sku AS item_number, p.base_uom
FROM public.products p
WHERE p.manufacturer_sku IS NOT NULL
  AND (
    p.manufacturer_sku IN (SELECT item_number FROM public.v_invoice_lines_complete WHERE item_number IS NOT NULL)
    OR p.manufacturer_sku IN (SELECT item_number FROM public.v_order_audit_line WHERE item_number IS NOT NULL)
  );

COMMENT ON VIEW public.v_price_seed_item IS
  'Canonical products we purchase (on invoice or order lines) = the API price seed item set (~606). price-seed.mjs --scope=purchased.';

GRANT SELECT ON public.v_price_seed_item TO anon, authenticated, service_role;
