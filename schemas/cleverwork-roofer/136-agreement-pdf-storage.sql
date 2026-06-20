-- 136-agreement-pdf-storage.sql
-- Store ABC price-agreement PDFs so the Price Agreement Audit purple "Agreement" pill opens the
-- source document (Chris, 2026-06-20). Mirrors the invoice-PDF pattern: a private Storage bucket
-- plus a signed-URL serving endpoint (/api/price-agreement/pdf/[agreementId]). Additive + idempotent.

ALTER TABLE public.abc_price_agreements ADD COLUMN IF NOT EXISTS pdf_storage_bucket text;
ALTER TABLE public.abc_price_agreements ADD COLUMN IF NOT EXISTS pdf_storage_path text;

-- Private bucket for agreement PDFs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('agreements', 'agreements', false)
ON CONFLICT (id) DO NOTHING;

-- PDFs are uploaded + linked to agreements by integrations/bridges/abc-supply/upload-agreement-pdfs.mjs.
