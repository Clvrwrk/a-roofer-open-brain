-- 139-price-list-pdf-match-staging.sql
-- Staging for family-level price-list PDFs (Denver/Dallas etc.) that carry NO item codes.
-- Chris's rule: every agreement line must resolve to an item id#, matched by DESCRIPTION where the
-- PDF lacks one. Parsed rows (integrations/bridges/abc-supply/ingest-price-list-pdf.mjs) land here;
-- a trigram match against abc_product_catalog families (match-price-list-staging.mjs) assigns the
-- item_number + a confidence tier (high >=0.6 / review 0.35-0.6 / none) so high-confidence rows can
-- promote to an agreement and ambiguous ones go to human review BEFORE touching the live audit.
-- Additive.
CREATE TABLE IF NOT EXISTS public.price_list_pdf_staging (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_doc      text NOT NULL,
  office          text,
  branch_number   text,
  effective_date  date,
  expiry_date     date,
  raw_description text NOT NULL,
  price           numeric,
  uom             text,
  bd_price        numeric,
  matched_item_number text,
  matched_description text,
  matched_family  text,
  match_score     numeric,         -- trigram containment 0..1
  match_status    text DEFAULT 'pending', -- exact | high | review | none | promoted
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_doc, raw_description)
);
ALTER TABLE public.price_list_pdf_staging ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plps_service_all ON public.price_list_pdf_staging;
CREATE POLICY plps_service_all ON public.price_list_pdf_staging FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS plps_auth_read ON public.price_list_pdf_staging;
CREATE POLICY plps_auth_read ON public.price_list_pdf_staging FOR SELECT TO authenticated, anon USING (true);
GRANT SELECT ON public.price_list_pdf_staging TO anon, authenticated, service_role;
