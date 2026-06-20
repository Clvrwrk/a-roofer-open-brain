-- 141-product-images-bucket.sql
-- Store ABC product images for the price-list image chip (Chris, 2026-06-20). Public bucket (images
-- are not sensitive) so the chip renders a direct CDN URL; image_storage_path on the catalog tracks
-- which items have a stored image. Images are fetched by
-- integrations/bridges/abc-supply/fetch-product-images.mjs from abc_product_catalog.images[0].href.
-- Additive + idempotent.
ALTER TABLE public.abc_product_catalog ADD COLUMN IF NOT EXISTS image_storage_path text;
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;
