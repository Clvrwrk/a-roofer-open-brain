-- 132-best-vendor-price-view.sql
-- Global Price Agreement: best-vendor-price selection over the EXISTING vendor-agnostic
-- catalog (Chris, 2026-06-19 — "extend the existing layer, don't reinvent").
--
-- The canonical layer already exists and is ABC-seeded (built 2026-06-04..08):
--   products / product_color_variants  = canonical catalog (~682 products)
--   v_current_negotiated_pricing        = per product x vendor negotiated price (price_uom)
--   product_vendor_price_observations   = per-vendor actual/spot prices (price_in_base_uom)
--   vendors                             = ABC, Home Depot, Lowes, QXO, SRS (only ABC has data yet)
--
-- This migration adds the two missing read views the handoff called `v_best_vendor_price`:
--   1. v_vendor_price_normalized — one row per (product, vendor): the vendor's representative
--      price normalized to the product's base_uom. Prefers the negotiated price; falls back to
--      the latest observed price. Negotiated prices whose price_uom != base_uom are FLAGGED
--      (uom_mismatch) and NOT normalized — we never fabricate a converted price without a known
--      factor (UOM canonical rule, docs/46). Today all 20 such rows are SQ-priced / BD-base with
--      no bd_per_sq; they surface for review instead of polluting the comparison.
--   2. v_best_vendor_price — the estimate-time selection: the single lowest normalized price per
--      canonical product, the winning vendor, and how many vendors are priced (the competition
--      depth that makes the "best" meaningful once non-ABC vendors are ingested via OCR).
--
-- Additive + idempotent. No tables touched; pure read views.

CREATE OR REPLACE VIEW public.v_vendor_price_normalized AS
WITH neg AS (
  -- One row per (product, vendor): the lowest negotiated price across that vendor's branches,
  -- normalized to base_uom only when the agreement's price_uom already equals base_uom.
  SELECT
    n.product_id,
    n.vendor_id,
    p.base_uom,
    min(n.negotiated_price) FILTER (WHERE n.price_uom = p.base_uom)  AS price_base_uom,
    min(n.negotiated_price)                                          AS negotiated_raw_price,
    (max(n.price_uom) FILTER (WHERE n.price_uom <> p.base_uom)) IS NOT NULL AS uom_mismatch,
    min(n.price_uom)                                                AS negotiated_price_uom,
    bool_or(n.ceo_verified)                                         AS ceo_verified,
    max(n.expiry_date)                                             AS expiry_date
  FROM public.v_current_negotiated_pricing n
  JOIN public.products p ON p.id = n.product_id
  GROUP BY n.product_id, n.vendor_id, p.base_uom
),
obs AS (
  -- Latest observed (actual/spot) price per (product, vendor), already in base_uom.
  SELECT DISTINCT ON (o.product_id, o.vendor_id)
    o.product_id,
    o.vendor_id,
    o.price_in_base_uom,
    o.base_uom,
    o.observed_at,
    o.source AS observed_source
  FROM public.product_vendor_price_observations o
  WHERE o.price_in_base_uom IS NOT NULL
  ORDER BY o.product_id, o.vendor_id, o.observed_at DESC NULLS LAST
)
SELECT
  COALESCE(neg.product_id, obs.product_id)  AS product_id,
  COALESCE(neg.vendor_id,  obs.vendor_id)   AS vendor_id,
  COALESCE(neg.base_uom,   obs.base_uom)    AS base_uom,
  -- representative price: negotiated (normalized) wins, else latest observed
  COALESCE(neg.price_base_uom, obs.price_in_base_uom) AS price_base_uom,
  CASE
    WHEN neg.price_base_uom    IS NOT NULL THEN 'negotiated'
    WHEN obs.price_in_base_uom IS NOT NULL THEN 'observed'
    WHEN neg.uom_mismatch                  THEN 'uom_mismatch'
    ELSE 'unpriced'
  END AS price_source,
  neg.negotiated_raw_price,
  neg.negotiated_price_uom,
  COALESCE(neg.uom_mismatch, false)         AS negotiated_uom_mismatch,
  neg.ceo_verified,
  neg.expiry_date,
  obs.price_in_base_uom                     AS observed_price_base_uom,
  obs.observed_at,
  obs.observed_source
FROM neg
FULL OUTER JOIN obs USING (product_id, vendor_id);

COMMENT ON VIEW public.v_vendor_price_normalized IS
  'Per (product, vendor) representative price normalized to product.base_uom. Prefers negotiated (price_uom=base_uom), falls back to latest observed (price_in_base_uom). Negotiated rows priced in a different UOM with no known factor are flagged (negotiated_uom_mismatch) and left unnormalized — never converted blind (docs/46).';

CREATE OR REPLACE VIEW public.v_best_vendor_price AS
SELECT DISTINCT ON (vp.product_id)
  vp.product_id,
  pr.internal_sku,
  pr.name              AS product_name,
  pr.base_uom,
  pr.impact_class,
  pr.is_top20,
  vp.vendor_id         AS best_vendor_id,
  ven.name             AS best_vendor_name,
  ven.slug             AS best_vendor_slug,
  vp.price_base_uom    AS best_price,
  vp.price_source      AS best_price_source,
  vp.ceo_verified      AS best_price_ceo_verified,
  vp.expiry_date       AS best_price_expiry_date,
  cnt.vendors_priced
FROM public.v_vendor_price_normalized vp
JOIN public.products pr ON pr.id = vp.product_id
JOIN public.vendors  ven ON ven.id = vp.vendor_id
JOIN LATERAL (
  SELECT count(DISTINCT vp2.vendor_id) AS vendors_priced
  FROM public.v_vendor_price_normalized vp2
  WHERE vp2.product_id = vp.product_id AND vp2.price_base_uom IS NOT NULL
) cnt ON true
WHERE vp.price_base_uom IS NOT NULL
ORDER BY vp.product_id, vp.price_base_uom ASC, (vp.price_source = 'negotiated') DESC;

COMMENT ON VIEW public.v_best_vendor_price IS
  'Estimate-time vendor selection: the single lowest base_uom price per canonical product across all vendors, the winning vendor, and vendors_priced (competition depth). Negotiated beats observed on a price tie. Today ABC-only; multi-vendor the moment OCR ingest adds non-ABC observations.';

GRANT SELECT ON public.v_vendor_price_normalized TO anon, authenticated, service_role;
GRANT SELECT ON public.v_best_vendor_price        TO anon, authenticated, service_role;
