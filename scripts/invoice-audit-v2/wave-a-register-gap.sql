-- Wave A register-gap cleanup (docs/81 §6) — executed on prod 2026-08-05.
-- The 54 invoices from outputs/abc-register-gap-2026-07-26/abc_invoices_not_in_register-v2.csv
-- (credit memos included) were stamped pipeline_status='invoice_processed'
-- (source='cleanup_wave_a') in public.invoice_pipeline_status with retroactive evidence:
--   * pdf_linked      — invoice_documents row with storage_path (after running
--                       integrations/bridges/abc-supply/backfill-invoice-pdfs.mjs:
--                       92 PDFs fetched; FC* finance-charge docs 404 at ABC, no PDF exists)
--   * agreement_matched — any line carried a negotiated agreement match
--   * paexp_tags      — distinct 'PAEXP-'||expiry for expired agreements relied on
--   * ocr_* fields    — left NULL: OCR verification is Phase 4 backfill
-- These invoices are already in the QB register — no re-export (decision 2026-08-05).
-- 3 of the 54 also appear in Wave B (benchmark re-audit) and were subsequently
-- moved to 'invoice_audit_pending' by the Wave B persistence step, which is correct.
--
-- Template (adjust the gap(...) list to re-run for a future set):
WITH gap(invoice_number) AS (VALUES ('<invoice list>')),
evidence AS (
  SELECT g.invoice_number,
         EXISTS (SELECT 1 FROM public.invoice_documents d WHERE d.invoice_number = g.invoice_number) AS pdf_linked,
         COALESCE(bool_or(l.negotiated_agreement_id IS NOT NULL), false) AS agreement_matched,
         NULLIF(array_agg(DISTINCT 'PAEXP-' || pa.expiry_date::text)
                FILTER (WHERE pa.expiry_date IS NOT NULL AND pa.expiry_date < current_date), '{}') AS paexp_tags
  FROM gap g
  LEFT JOIN public.v_invoice_audit_line l ON l.invoice_number = g.invoice_number
  LEFT JOIN public.abc_price_agreements pa ON pa.id = l.negotiated_agreement_id
  GROUP BY g.invoice_number
)
INSERT INTO public.invoice_pipeline_status
  (vendor_slug, invoice_number, pipeline_status, processed_at, pdf_linked, agreement_matched, paexp_tags, source, note)
SELECT 'abc', e.invoice_number, 'invoice_processed', now(), e.pdf_linked, e.agreement_matched, e.paexp_tags,
       'cleanup_wave_a', 'Wave A register-gap cleanup (docs/81 sec.6); already in QB register; OCR verification pending Phase 4'
FROM evidence e
ON CONFLICT (vendor_slug, invoice_number) DO UPDATE SET
  pipeline_status = 'invoice_processed',
  processed_at    = COALESCE(public.invoice_pipeline_status.processed_at, now()),
  pdf_linked      = EXCLUDED.pdf_linked,
  agreement_matched = EXCLUDED.agreement_matched,
  paexp_tags      = EXCLUDED.paexp_tags,
  source          = 'cleanup_wave_a';
