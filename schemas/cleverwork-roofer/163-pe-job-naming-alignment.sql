-- 163-pe-job-naming-alignment.sql
-- Job-first ABC ↔ AccuLynx naming alignment (Chris, 2026-06-29).
-- ABC orderName (Job) is authoritative; Customer PO# should be {OFFICE}-{NUM}-{seq}.
-- Replaces PO-only matching in v_invoice_acculynx_match / v_order_acculynx_match.

DROP VIEW IF EXISTS public.v_invoice_acculynx_match;
DROP VIEW IF EXISTS public.v_order_acculynx_match;
DROP VIEW IF EXISTS public.v_pe_job_label_parse;

CREATE VIEW public.v_pe_job_label_parse AS
SELECT
  i.invoice_number,
  i.order_number,
  i.purchase_order_number,
  i.order_name,
  i.invoice_date,
  trim(split_part(i.order_name, ':', 1)) AS parsed_job_prefix,
  nullif(trim(substring(i.order_name FROM position(':' IN i.order_name) + 1)), '') AS parsed_client_name,
  (i.order_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*temp\s*-') AS is_temp_job,
  regexp_replace(
    upper(regexp_replace(trim(split_part(coalesce(i.order_name, ''), ':', 1)), '\s+', '', 'g')),
    '[^A-Z0-9]', '', 'g'
  ) AS job_norm
FROM public.abc_invoices i;

CREATE VIEW public.v_invoice_acculynx_match AS
WITH jobs AS (
  SELECT aj.id,
    trim(split_part(aj.job_name, ':', 1)) AS pe_job_number,
    nullif(trim(substring(aj.job_name FROM position(':' IN aj.job_name) + 1)), '') AS client_name,
    aj.job_category_name, aj.trade_types, aj.current_milestone,
    aj.location_street1, aj.location_city, aj.location_state,
    regexp_replace(upper(split_part(aj.job_name, ':', 1)), '[^A-Z0-9]', '', 'g') AS jn_norm,
    (aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*temp\s*-') AS is_temp_job
  FROM public.acculynx_jobs aj
  WHERE aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-'
),
parsed AS (
  SELECT p.*,
    row_number() OVER (
      PARTITION BY p.job_norm
      ORDER BY p.invoice_date NULLS LAST, p.invoice_number
    ) AS material_seq
  FROM public.v_pe_job_label_parse p
  WHERE p.job_norm <> ''
),
expected AS (
  SELECT p.*,
    regexp_replace(p.parsed_job_prefix, '\s+', '', 'g') || '-' || p.material_seq::text AS expected_po
  FROM parsed p
),
po_norm AS (
  SELECT i.invoice_number,
    regexp_replace(
      upper(regexp_replace(coalesce(i.purchase_order_number, ''), '^PO', '', 'i')),
      '[^A-Z0-9]', '', 'g'
    ) AS po_norm
  FROM public.abc_invoices i
),
joined AS (
  SELECT
    coalesce(e.invoice_number, i.invoice_number) AS invoice_number,
    i.purchase_order_number,
    i.order_name,
    i.invoice_date,
    i.total_amount,
    e.expected_po,
    e.material_seq,
    e.is_temp_job,
    e.parsed_job_prefix,
    e.parsed_client_name,
    pn.po_norm,
    j.id AS acculynx_job_id,
    j.pe_job_number,
    coalesce(j.client_name, e.parsed_client_name) AS client_name,
    j.job_category_name,
    j.trade_types,
    j.current_milestone,
    j.location_street1,
    j.location_city,
    j.location_state,
    CASE
      WHEN j.id IS NOT NULL AND e.expected_po IS NOT NULL
        AND upper(regexp_replace(coalesce(i.purchase_order_number, ''), '\s+', '', 'g')) = upper(e.expected_po)
        THEN 'aligned'
      WHEN e.expected_po IS NOT NULL
        AND upper(regexp_replace(coalesce(i.purchase_order_number, ''), '\s+', '', 'g')) <> upper(e.expected_po)
        THEN 'po_mismatch'
      WHEN j.id IS NOT NULL AND e.is_temp_job THEN 'temp_job'
      WHEN j.id IS NOT NULL THEN 'aligned'
      WHEN e.job_norm IS NOT NULL AND e.job_norm <> '' THEN 'needs_link'
      WHEN pn.po_norm <> '' THEN 'needs_link'
      ELSE 'job_blank'
    END AS naming_status,
    CASE
      WHEN e.job_norm IS NOT NULL AND e.job_norm <> '' THEN 'job_field'
      WHEN pn.po_norm <> '' THEN 'po_field'
      ELSE 'unmatched'
    END AS match_method,
    (j.id IS NOT NULL) AS matched
  FROM public.abc_invoices i
  LEFT JOIN expected e ON e.invoice_number = i.invoice_number
  LEFT JOIN po_norm pn ON pn.invoice_number = i.invoice_number
  LEFT JOIN jobs j ON j.jn_norm = e.job_norm AND e.job_norm <> '' AND NOT e.is_temp_job
)
SELECT DISTINCT ON (invoice_number)
  invoice_number, purchase_order_number, order_name, invoice_date, total_amount,
  expected_po AS canonical_po,
  coalesce(pe_job_number, parsed_job_prefix) AS pe_job_number,
  client_name, job_category_name, trade_types, current_milestone,
  location_street1, location_city, location_state,
  acculynx_job_id, naming_status, match_method, material_seq, is_temp_job, matched
FROM joined
ORDER BY invoice_number, matched DESC, (naming_status = 'aligned') DESC;

CREATE VIEW public.v_order_acculynx_match AS
WITH order_po AS (
  SELECT o.order_number,
    o.raw->'salesOrder'->>'purchaseOrder' AS purchase_order,
    regexp_replace(
      upper(regexp_replace(coalesce(o.raw->'salesOrder'->>'purchaseOrder', ''), '^PO', '', 'i')),
      '[^A-Z0-9]', '', 'g'
    ) AS po_norm,
    upper(trim(split_part(coalesce(o.raw->'salesOrder'->>'purchaseOrder', ''), ':', 1))) AS po_job_prefix,
    nullif(trim(substring(o.raw->'salesOrder'->>'purchaseOrder' FROM position(':' IN o.raw->'salesOrder'->>'purchaseOrder') + 1)), '') AS po_client_name
  FROM public.abc_orders o
),
jobs AS (
  SELECT aj.id,
    trim(split_part(aj.job_name, ':', 1)) AS pe_job_number,
    nullif(trim(substring(aj.job_name FROM position(':' IN aj.job_name) + 1)), '') AS client_name,
    aj.job_category_name, aj.trade_types, aj.current_milestone,
    aj.location_street1, aj.location_city, aj.location_state,
    regexp_replace(upper(split_part(aj.job_name, ':', 1)), '[^A-Z0-9]', '', 'g') AS jn_norm
  FROM public.acculynx_jobs aj
  WHERE aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-'
),
parsed_po AS (
  SELECT op.*,
    CASE
      WHEN op.purchase_order ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*\d+\s*-\s*\d+\s*$'
        THEN regexp_replace(upper(trim(split_part(op.purchase_order, '-', 1) || '-' || split_part(op.purchase_order, '-', 2))), '\s+', '', 'g')
      WHEN op.purchase_order ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-'
        THEN regexp_replace(upper(trim(split_part(op.purchase_order, ':', 1))), '\s+', '', 'g')
      ELSE NULL
    END AS derived_job_norm
  FROM order_po op
)
SELECT DISTINCT ON (n.order_number)
  n.order_number,
  n.purchase_order,
  j.id AS acculynx_job_id,
  j.pe_job_number,
  coalesce(j.client_name, n.po_client_name) AS client_name,
  j.job_category_name,
  j.trade_types,
  j.current_milestone,
  j.location_street1,
  j.location_city,
  j.location_state,
  CASE
    WHEN j.id IS NOT NULL AND n.purchase_order ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*\d+\s*-\s*\d+\s*$'
      AND upper(regexp_replace(n.purchase_order, '\s+', '', 'g')) =
          upper(regexp_replace(j.pe_job_number, '\s+', '', 'g') || '-' || split_part(n.purchase_order, '-', 3))
      THEN 'aligned'
    WHEN j.id IS NOT NULL THEN 'po_mismatch'
    ELSE 'needs_link'
  END AS naming_status,
  (j.id IS NOT NULL) AS matched
FROM parsed_po n
LEFT JOIN jobs j ON j.jn_norm = coalesce(n.derived_job_norm, n.po_norm) AND coalesce(n.derived_job_norm, n.po_norm) <> ''
ORDER BY n.order_number, matched DESC;

COMMENT ON VIEW public.v_invoice_acculynx_match IS
  'Invoice ↔ AccuLynx match (job-first). Job field (order_name) is authoritative; canonical PO = {office}-{num}-{material_seq}.';

COMMENT ON VIEW public.v_order_acculynx_match IS
  'Order ↔ AccuLynx match. Parses PO as {office}-{num}-{seq} or legacy {office}-{num}: {client}.';

GRANT SELECT ON public.v_pe_job_label_parse TO anon, authenticated, service_role;
