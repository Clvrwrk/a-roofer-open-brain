-- 104-invoice-acculynx-match-view.sql
-- Invoice ↔ AcuLynx job crosswalk. KEY INSIGHT: the PE job number lives in
-- acculynx_jobs.job_name ("KS-157: Kathy Mcmillen" = "{job#}: {client}"), NOT in
-- the (mostly empty) job_number column. Match invoice PO (normalized) to the
-- job_name prefix; expose client name + job category + milestone. Read-only.
--
-- COVERAGE (2026-06-18): 183/560 invoices (33%) match. Ceiling is limited because
-- only 179/1240 AcuLynx jobs carry a PE job number in job_name (the rest are
-- leads/unnumbered), and ~130 invoice POs are non-job refs (addresses, misc).
-- Path to higher coverage = populate PE job numbers on more AcuLynx jobs upstream.
DROP VIEW IF EXISTS public.v_invoice_acculynx_match;
CREATE VIEW public.v_invoice_acculynx_match AS
WITH normpo AS (
  SELECT i.invoice_number, i.purchase_order_number, i.invoice_date, i.total_amount,
    regexp_replace(upper(regexp_replace(coalesce(i.purchase_order_number, ''), '^PO', '', 'i')), '[^A-Z0-9]', '', 'g') AS po_norm
  FROM public.abc_invoices i
),
jobs AS (
  SELECT aj.id,
    trim(split_part(aj.job_name, ':', 1)) AS pe_job_number,
    nullif(trim(substring(aj.job_name FROM position(':' IN aj.job_name) + 1)), '') AS client_name,
    aj.job_category_name, aj.trade_types, aj.current_milestone,
    aj.location_street1, aj.location_city, aj.location_state,
    regexp_replace(upper(split_part(aj.job_name, ':', 1)), '[^A-Z0-9]', '', 'g') AS jn_norm
  FROM public.acculynx_jobs aj
  WHERE aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-?\s*[0-9]'
)
SELECT DISTINCT ON (n.invoice_number)
  n.invoice_number, n.purchase_order_number, n.invoice_date, n.total_amount,
  j.id AS acculynx_job_id, j.pe_job_number, j.client_name,
  j.job_category_name, j.trade_types, j.current_milestone,
  j.location_street1, j.location_city, j.location_state,
  (j.id IS NOT NULL) AS matched
FROM normpo n
LEFT JOIN jobs j ON j.jn_norm = n.po_norm AND n.po_norm <> ''
ORDER BY n.invoice_number, (j.id IS NOT NULL) DESC;
