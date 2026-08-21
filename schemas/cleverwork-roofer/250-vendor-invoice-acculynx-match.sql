-- 250 — job matching for SRS/QXO invoices. Additive. Applied to prod 2026-08-21.
--
-- v_invoice_acculynx_match is built FROM abc_invoices, so it has never covered the
-- vendor_invoices side. The credit-memo workspaces were therefore printing "no job on the
-- PO" against SRS claims whose PO plainly reads KS-189, KS-188, KS-184 … — a confidently
-- WRONG label, not a missing-data one. Caught by rendering the page rather than reading it.
--
-- Applies the SAME canonical job token as migration 237 (leading "<2 letters><digits>", so
-- "KS-189" -> KS189 and any trailing material sequence is ignored) to
-- vendor_invoices.po_number. Tokens are collision-free across all 883 non-temp prefixed
-- AccuLynx jobs, so a match resolves to exactly one job or none. Temp jobs cannot produce a
-- token (TEMP is not digits) and stay excluded, exactly as in 237.
--
-- Measured: 32 of 33 vendor invoices resolve a job.
CREATE OR REPLACE VIEW public.v_vendor_invoice_acculynx_match AS
 WITH jobs AS (
   SELECT aj.id,
          TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)) AS pe_job_number,
          NULLIF(TRIM(BOTH FROM SUBSTRING(aj.job_name FROM POSITION((':'::text) IN (aj.job_name)) + 1)), ''::text) AS client_name,
          aj.job_category_name,
          aj.current_milestone,
          upper(regexp_replace(SUBSTRING(TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)) FROM '^\s*([A-Za-z]{2}\s*-\s*[0-9]+)'), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)) AS job_tok
     FROM public.acculynx_jobs aj
    WHERE aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-'::text
      AND aj.job_name !~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*temp\s*-'::text
 )
 SELECT vi.invoice_number,
        vi.po_number AS purchase_order_number,
        vi.invoice_date,
        j.id            AS acculynx_job_id,
        j.pe_job_number,
        j.client_name,
        j.job_category_name,
        j.current_milestone,
        CASE WHEN j.id IS NOT NULL THEN 'po_token'::text ELSE NULL::text END AS link_method,
        j.id IS NOT NULL AS matched
   FROM public.vendor_invoices vi
   LEFT JOIN jobs j
     ON j.job_tok IS NOT NULL
    AND j.job_tok = NULLIF(upper(regexp_replace(
          SUBSTRING(btrim(COALESCE(vi.po_number, ''::text)) FROM '^\s*([A-Za-z]{2}\s*-?\s*[0-9]+)'),
          '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text);

COMMENT ON VIEW public.v_vendor_invoice_acculynx_match IS
  'SRS/QXO invoice -> AccuLynx job by the canonical PO job token (migration 250), the same token rule migration 237 applies to ABC. v_invoice_acculynx_match covers abc_invoices only; this is its vendor_invoices counterpart.';
