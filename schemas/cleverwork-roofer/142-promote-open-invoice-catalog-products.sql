-- 142-promote-open-invoice-catalog-products.sql
-- Promote the 68 ABC catalog items that appear on OPEN invoices and ARE priceable via the ABC
-- pricing API, but were never promoted from raw abc_product_catalog into the curated products
-- table. Without a products row the per-branch API price (v_branch_item_api_price, mig 134) has
-- nowhere to attach, so these lines showed no "API Price" on the Invoice Audit.
--
-- This only creates the catalog rows; the live ABC prices are written separately by
-- integrations/bridges/abc-supply/fill-open-invoice-api-prices.mjs (which reads products to know
-- where to attach each observation). Run this migration FIRST, then that script.
--
-- Metadata is sourced entirely from abc_product_catalog (the authoritative ABC catalog):
--   name/description  = item_description
--   base_uom          = the "stocking" UOM from uoms[]
--   manufacturer_id   = explicit supplier->manufacturer alias map (fallback MISCELLANEOUS VENDOR)
--   taxonomy_id       = ABC hierarchy (group/category/productType) label match into product_taxonomy
--                       (fallback Other Products / Tools & Equipment / Application for the single
--                        'Truck & Van' productType that has no taxonomy row)
--   internal_sku      = 'M' || manufacturer.legacy_id || '-' || manufacturer_sku  (existing convention)
--
-- Additive + idempotent (rule 1): INSERT ... WHERE NOT EXISTS on manufacturer_sku; re-running is a
-- no-op. No products are modified or deleted. Items ABC will not price (freight/fuel/delivery
-- charges, NS* special-order metal, "call for pricing" items) are intentionally NOT promoted here.

WITH target_items(item_number) AS (VALUES
 ('02TKFH2WW'),('04TKAHRWW'),('11TRICECR2'),('17AVSBAWW'),('0170030023'),('02OCO25BW'),('02OCO25EG'),('02TKSFF4RS'),
 ('04OCAPEBW'),('04OCAPEEG'),('04TKPHRRS3'),('11CTWGS2'),('14IP81576'),('14IP81598'),('14QE200TBR'),('14QERF6BK'),
 ('17AMLPBA292225'),('17LO2000DB'),('3854801827'),('4843000092'),('51MIHC716O'),('GWV24TB'),('0170030003'),('14MIFS68BK'),
 ('17LO750SWH'),('SGDE125BK'),('SGDE185BK'),('17MIV15WG'),('08CS307603'),('08VCG5WCOT'),('1285074042'),('14MI1PML'),
 ('17AWASC5'),('17LO750SML'),('1R9CS3170C'),('1SXCS3170'),('2322882740'),('0150080057'),('14IP81891'),('17MIRJG50P'),
 ('1SXCS1432'),('08MHDP85'),('58MHP22044'),('0180000755'),('3767811659'),('83MIGBRAC5'),('AAE34BK'),('AAE34RB'),('AAE34WH'),
 ('ABE34BK'),('ADS3410BK'),('ADS3410RB'),('ADS3410WH'),('AEC5LBK'),('AEC5LRB'),('AEC5LWH'),('AEC5RBK'),('AEC5RRB'),('AEC5RWH'),
 ('AGC21178BK'),('AGC21178RB'),('AGC21178WH'),('ASM5IRB'),('ASM5IWH'),('ASM5OBK'),('ASM5ORB'),('ASM5OWH'),('GSC812BHRB')
),
supplier_alias(supplier_name, manufacturer_name) AS (VALUES
 ('ACM SUPPLIER','AMERICAN CONSTRUCTION METALS'),
 ('AMERICAN CONSTRUCTION','AMERICAN CONSTRUCTION METALS'),
 ('OWENS CORNING SALES LLC','OWENS CORNING'),
 ('TAMKO BUILDING PRODUCTS INC','TAMKO ROOFING PRODUCTS'),
 ('WESTLAKE/BORAL ROOFING/MONIER','WESTLAKE ROYAL BUILDING PRODUCTS'),
 ('IPS CORPORATION','IPS CORPORATION'),
 ('LOMANCO INC','LOMANCO'),
 ('MULEHIDE PRODUCTS CO INC','MULE HIDE PRODUCTS'),
 ('QUALITY EDGE INC','QUALITY EDGE'),
 ('AIR VENT INC','AIR VENT INC'),
 ('CARLISLE (VERSICO)','CARLISLE SYNTEC'),
 ('CARLISLE CONSTRUCTION','CARLISLE SYNTEC'),
 ('SEAMLESS GUTTER PRODUCTS','SEAMLESS GUTTER PRODUCTS INC'),
 ('TARCO INC','TARCO INC'),
 ('CERTAINTEED LLC-ROOFING','CERTAINTEED'),
 ('VELUX AMERICA LLC','VELUX AMERICA'),
 ('FLAMCO','FLAMCO INC'),
 ('VENTAMATIC LTD','VENTAMATIC LTD')
),
resolved AS (
  SELECT
    c.item_number,
    c.item_description,
    (SELECT u->>'code' FROM jsonb_array_elements(c.uoms) u WHERE u->>'description'='stocking' LIMIT 1) AS stocking_uom,
    -- manufacturer: alias map, else MISCELLANEOUS VENDOR
    COALESCE(m_alias.id, m_misc.id) AS manufacturer_id,
    COALESCE(m_alias.legacy_id, m_misc.legacy_id) AS manufacturer_legacy_id,
    -- taxonomy: ABC hierarchy label match, else Tools & Equipment / Application (legacy 33)
    COALESCE(t.id, t_fallback.id) AS taxonomy_id
  FROM target_items i
  JOIN abc_product_catalog c ON c.item_number = i.item_number
  LEFT JOIN supplier_alias sa ON sa.supplier_name = c.supplier_name
  LEFT JOIN manufacturers m_alias ON m_alias.name = sa.manufacturer_name
  CROSS JOIN LATERAL (SELECT id, legacy_id FROM manufacturers WHERE name='MISCELLANEOUS VENDOR' LIMIT 1) m_misc
  LEFT JOIN product_taxonomy t
    ON lower(t.major_group)  = lower(c.hierarchy->'productGroup'->>'label')
   AND lower(t.category)     = lower(c.hierarchy->'productGroup'->'category'->>'label')
   AND lower(t.product_type) = lower(c.hierarchy->'productGroup'->'category'->'productType'->>'label')
  CROSS JOIN LATERAL (SELECT id FROM product_taxonomy WHERE legacy_id=33 LIMIT 1) t_fallback
)
INSERT INTO products (internal_sku, manufacturer_sku, name, manufacturer_id, taxonomy_id, base_uom, description_normalized, is_active)
SELECT
  'M' || r.manufacturer_legacy_id || '-' || r.item_number,
  r.item_number,
  r.item_description,
  r.manufacturer_id,
  r.taxonomy_id,
  r.stocking_uom,
  upper(r.item_description),
  true
FROM resolved r
WHERE r.stocking_uom IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.manufacturer_sku = r.item_number);
