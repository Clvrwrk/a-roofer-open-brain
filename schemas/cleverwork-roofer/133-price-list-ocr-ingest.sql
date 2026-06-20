-- 133-price-list-ocr-ingest.sql
-- Wire the validated OCR price-list pipeline into the vendor-agnostic price layer
-- (Chris, 2026-06-19 — "point OCR ingest at product_vendor_price_observations").
--
-- The OCR EXTRACTION step (vendor PDF -> Unstructured.io hi_res -> Table HTML -> staged rows)
-- lands rows in a staging table (e.g. abc_price_list_pdf_import). This migration adds the
-- durable, idempotent NORMALIZE + LOAD step that every vendor's price list flows through:
--   1. ingest_price_list_observations(source_doc, vendor_slug, staging cols) — matches each
--      staged item# to a canonical product (products.manufacturer_sku) and upserts a
--      price observation. Price is normalized to base_uom ONLY when the price-list UOM already
--      equals the product base_uom; otherwise the observation is recorded but flagged
--      needs_review (no blind UOM conversion — UOM canonical rule, docs/46). Re-running the
--      same source_doc updates in place (unique idx pvpo_unique_source).
--   2. v_price_list_ingest_review — the human queue: every staged row with its match status
--      (matched_clean | matched_uom_review | no_canonical_product). Unmatched items are
--      candidate NEW canonical products / color variants for a vendor to seed.
--
-- This is the recurring multi-vendor ingest loop; ABC's staged PA list is the first payload.
-- Additive + idempotent.

-- Ingest one OCR'd price-list document from abc_price_list_pdf_import into observations.
-- Returns a one-row summary (matched / normalized / flagged / unmatched).
CREATE OR REPLACE FUNCTION public.ingest_price_list_observations(
  p_source_doc   text,
  p_vendor_slug  text DEFAULT 'abc-supply'
) RETURNS TABLE (matched int, normalized int, needs_review int, unmatched int)
LANGUAGE plpgsql AS $$
DECLARE
  v_vendor_id uuid;
BEGIN
  SELECT id INTO v_vendor_id FROM public.vendors WHERE slug = p_vendor_slug;
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'unknown vendor slug: %', p_vendor_slug;
  END IF;

  -- Upsert one observation per matched canonical product.
  INSERT INTO public.product_vendor_price_observations (
    product_id, vendor_id, observed_at, observed_price, observed_uom,
    price_in_base_uom, base_uom, source, source_ref,
    observer_type, observer_id, confidence_score, needs_review, review_reason, raw_extracted_text
  )
  SELECT DISTINCT ON (p.id)
    p.id,
    v_vendor_id,
    COALESCE(s.effective_date::timestamptz, now()),
    s.unit_price,
    s.uom,
    CASE WHEN s.uom = p.base_uom THEN s.unit_price ELSE NULL END,
    p.base_uom,
    'price_list',
    p_source_doc,
    'agent',
    'ocr:' || p_source_doc,
    90,
    (s.uom IS DISTINCT FROM p.base_uom),
    CASE WHEN s.uom IS DISTINCT FROM p.base_uom
         THEN 'uom_normalization_needed: price-list ' || COALESCE(s.uom,'?') || ' vs base ' || COALESCE(p.base_uom,'?')
         ELSE NULL END,
    s.item_description
  FROM public.abc_price_list_pdf_import s
  JOIN public.products p ON p.manufacturer_sku = s.item_number
  WHERE s.source_doc = p_source_doc AND s.item_number IS NOT NULL AND s.unit_price IS NOT NULL
  ORDER BY p.id, s.effective_date DESC NULLS LAST
  ON CONFLICT (vendor_id, source, source_ref, product_id) DO UPDATE SET
    observed_at       = EXCLUDED.observed_at,
    observed_price    = EXCLUDED.observed_price,
    observed_uom      = EXCLUDED.observed_uom,
    price_in_base_uom = EXCLUDED.price_in_base_uom,
    base_uom          = EXCLUDED.base_uom,
    needs_review      = EXCLUDED.needs_review,
    review_reason     = EXCLUDED.review_reason,
    confidence_score  = EXCLUDED.confidence_score,
    raw_extracted_text= EXCLUDED.raw_extracted_text;

  RETURN QUERY
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE o.price_in_base_uom IS NOT NULL)::int,
    count(*) FILTER (WHERE o.needs_review)::int,
    (SELECT count(DISTINCT s.item_number)::int
       FROM public.abc_price_list_pdf_import s
       LEFT JOIN public.products p ON p.manufacturer_sku = s.item_number
      WHERE s.source_doc = p_source_doc AND s.item_number IS NOT NULL AND p.id IS NULL)
  FROM public.product_vendor_price_observations o
  WHERE o.vendor_id = v_vendor_id AND o.source = 'price_list' AND o.source_ref = p_source_doc;
END;
$$;

COMMENT ON FUNCTION public.ingest_price_list_observations(text, text) IS
  'Normalize+load step of the OCR price-list ingest loop: match staged abc_price_list_pdf_import rows (by source_doc) to canonical products and upsert price observations (idempotent). Normalizes to base_uom only on exact UOM match; flags the rest needs_review. Returns matched/normalized/needs_review/unmatched counts.';

-- Human review queue: every staged price-list row + its match disposition.
CREATE OR REPLACE VIEW public.v_price_list_ingest_review AS
SELECT
  s.source_doc,
  s.item_number,
  s.item_description,
  s.unit_price,
  s.uom,
  s.effective_date,
  s.expiry_date,
  p.id          AS product_id,
  p.internal_sku,
  p.name        AS product_name,
  p.base_uom,
  CASE
    WHEN p.id IS NULL                  THEN 'no_canonical_product'
    WHEN s.uom IS DISTINCT FROM p.base_uom THEN 'matched_uom_review'
    ELSE 'matched_clean'
  END AS match_status
FROM public.abc_price_list_pdf_import s
LEFT JOIN public.products p ON p.manufacturer_sku = s.item_number
WHERE s.item_number IS NOT NULL;

COMMENT ON VIEW public.v_price_list_ingest_review IS
  'OCR price-list ingest review queue: each staged item with match_status (matched_clean | matched_uom_review | no_canonical_product). no_canonical_product rows are candidate new canonical products/variants for that vendor.';

GRANT SELECT ON public.v_price_list_ingest_review TO anon, authenticated, service_role;
