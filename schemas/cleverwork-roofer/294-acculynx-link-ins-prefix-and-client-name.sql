-- 294 — AccuLynx job link: accept the INS- prefix and fall back to a unique client name.
--
-- Chris 2026-09-16: "why do so many invoices need the AccuLynx job link?" — measured on
-- prod: the link works whenever the job box or PO carries the PE job number (KS-224,
-- TX-457 …). The match rate fell from 82% (April) to 38% (September) because the mix
-- shifted to commercial / account purchases whose job box is an account bucket
-- ("Commercial", "DFW Account", "Storm/wichita") and whose PO is free text (CP-25-1692,
-- "ss 09/14/26", "29-3") — nothing there names an AccuLynx job. Two smaller gaps were
-- the matcher's own (docs/109 F45), and this migration closes them:
--
--   1. The prefix allowlist (ks|kc|mc|tx|co|ok|nc, mig 237) does not know INS- — the twelve
--      insurance jobs ("INS-11: Trang Lam"). Allowlist + every token regex now accept a
--      two-OR-three-letter prefix.
--   2. When the job box is a bare client name ("Trang Lam") that matches the client part of
--      exactly ONE AccuLynx job (any prefix, N/A included), link to it — link_method
--      'client_name'. Uniqueness is the guard: a name shared by two jobs never links.
--      Names shorter than five characters never link (buckets and initials).
--
-- Chris 2026-09-22: "fix with your recommendations". Same 21 output columns, same order, so
-- the dependent v_credit_memo_match is untouched. The commercial CP-25-xxxx projects are
-- not in AccuLynx at all and need their own link (a separate build, not this migration).
-- Additive + idempotent (CREATE OR REPLACE VIEW). Rollback: re-run mig 275's definition.

CREATE OR REPLACE VIEW public.v_invoice_acculynx_match AS
 WITH jobs_all AS (
         -- every AccuLynx job, with the client part of the name normalised for the name fallback
         SELECT aj.id,
            NULLIF(TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)), 'N/A'::text) AS pe_job_number,
            NULLIF(TRIM(BOTH FROM SUBSTRING(aj.job_name FROM POSITION((':'::text) IN (aj.job_name)) + 1)), ''::text) AS client_name,
            aj.job_category_name,
            aj.trade_types,
            aj.current_milestone,
            aj.location_street1,
            aj.location_city,
            aj.location_state,
            regexp_replace(upper(split_part(aj.job_name, ':'::text, 1)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS jn_norm,
            upper(regexp_replace("substring"(TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)), '^\s*([A-Za-z]{2,3}\s*-\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)) AS job_tok,
            aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc|ins)\s*-\s*temp\s*-'::text AS is_temp_job,
            aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc|ins)\s*-'::text AS is_prefixed,
            regexp_replace(upper(COALESCE(NULLIF(TRIM(BOTH FROM SUBSTRING(aj.job_name FROM POSITION((':'::text) IN (aj.job_name)) + 1)), ''::text), aj.job_name)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS client_norm
           FROM acculynx_jobs aj
        ), jobs AS (
         -- mig 237 tiers: prefixed jobs only (now including INS-)
         SELECT * FROM jobs_all WHERE is_prefixed
        ), byname AS (
         -- mig 294 fallback: the client name must identify exactly one non-temp job
         SELECT client_norm, min(id) AS id, count(*) AS n
           FROM jobs_all
          WHERE NOT is_temp_job AND length(client_norm) >= 5
          GROUP BY client_norm
        ), parsed AS (
         SELECT p.invoice_number,
            p.order_number,
            p.purchase_order_number,
            p.order_name,
            p.invoice_date,
            p.parsed_job_prefix,
            p.parsed_client_name,
            p.is_temp_job,
            p.job_norm,
            row_number() OVER (PARTITION BY p.job_norm ORDER BY p.invoice_date, p.invoice_number) AS material_seq
           FROM v_pe_job_label_parse p
          WHERE p.job_norm <> ''::text
        ), expected AS (
         SELECT p.invoice_number,
            p.order_number,
            p.purchase_order_number,
            p.order_name,
            p.invoice_date,
            p.parsed_job_prefix,
            p.parsed_client_name,
            p.is_temp_job,
            p.job_norm,
            p.material_seq,
            (regexp_replace(p.parsed_job_prefix, '\s+'::text, ''::text, 'g'::text) || '-'::text) || p.material_seq::text AS expected_po
           FROM parsed p
        ), po_norm AS (
         SELECT i.invoice_number,
            regexp_replace(upper(regexp_replace(COALESCE(i.purchase_order_number, ''::text), '^PO'::text, ''::text, 'i'::text)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS po_norm
           FROM abc_invoices i
        ), toks AS (
         SELECT i.invoice_number,
            NULLIF(upper(regexp_replace("substring"(TRIM(BOTH FROM split_part(COALESCE(i.order_name, ''::text), ':'::text, 1)), '^\s*([A-Za-z]{2,3}\s*-\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text) AS name_tok,
            NULLIF(upper(regexp_replace("substring"(TRIM(BOTH FROM COALESCE(i.purchase_order_number, ''::text)), '^\s*([A-Za-z]{2,3}\s*-?\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text) AS po_tok,
            -- the job box as a bare client name (the part after ':' when the box carries a prefix)
            NULLIF(regexp_replace(upper(COALESCE(NULLIF(TRIM(BOTH FROM SUBSTRING(COALESCE(i.order_name, ''::text) FROM POSITION((':'::text) IN (COALESCE(i.order_name, ''::text))) + 1)), ''::text), COALESCE(i.order_name, ''::text))), '[^A-Z0-9]'::text, ''::text, 'g'::text), ''::text) AS name_norm
           FROM abc_invoices i
        ), linked AS (
         SELECT i.invoice_number,
            i.purchase_order_number,
            i.order_name,
            i.invoice_date,
            i.total_amount,
            e.expected_po,
            e.material_seq,
            e.is_temp_job,
            e.parsed_job_prefix,
            e.parsed_client_name,
            e.job_norm,
            pn.po_norm,
            COALESCE(j1.id, j2.id, j3.id, j4.id) AS job_id,
                CASE
                    WHEN j1.id IS NOT NULL THEN 'job_name'::text
                    WHEN j2.id IS NOT NULL THEN 'job_token'::text
                    WHEN j3.id IS NOT NULL THEN 'po_token'::text
                    WHEN j4.id IS NOT NULL THEN 'client_name'::text
                    ELSE NULL::text
                END AS link_method
           FROM abc_invoices i
             LEFT JOIN expected e ON e.invoice_number = i.invoice_number
             LEFT JOIN po_norm pn ON pn.invoice_number = i.invoice_number
             LEFT JOIN toks tk ON tk.invoice_number = i.invoice_number
             LEFT JOIN jobs j1 ON j1.jn_norm = e.job_norm AND e.job_norm <> ''::text AND NOT e.is_temp_job
             LEFT JOIN jobs j2 ON j1.id IS NULL AND j2.job_tok IS NOT NULL AND j2.job_tok = tk.name_tok AND NOT j2.is_temp_job AND NOT COALESCE(e.is_temp_job, false)
             LEFT JOIN jobs j3 ON j1.id IS NULL AND j2.id IS NULL AND j3.job_tok IS NOT NULL AND j3.job_tok = tk.po_tok AND NOT j3.is_temp_job AND NOT COALESCE(e.is_temp_job, false)
             LEFT JOIN byname j4 ON j1.id IS NULL AND j2.id IS NULL AND j3.id IS NULL AND tk.name_tok IS NULL AND tk.name_norm IS NOT NULL AND length(tk.name_norm) >= 5 AND j4.client_norm = tk.name_norm AND j4.n = 1
        ), joined AS (
         SELECT l.invoice_number,
            l.purchase_order_number,
            l.order_name,
            l.invoice_date,
            l.total_amount,
            l.expected_po,
            l.material_seq,
            l.is_temp_job,
            l.parsed_job_prefix,
            l.parsed_client_name,
            l.po_norm,
            l.link_method,
            j.id AS acculynx_job_id,
            j.pe_job_number,
            COALESCE(j.client_name, l.parsed_client_name) AS client_name,
            j.job_category_name,
            j.trade_types,
            j.current_milestone,
            j.location_street1,
            j.location_city,
            j.location_state,
                CASE
                    WHEN j.id IS NOT NULL AND l.expected_po IS NOT NULL AND upper(regexp_replace(COALESCE(l.purchase_order_number, ''::text), '\s+'::text, ''::text, 'g'::text)) = upper(l.expected_po) THEN 'aligned'::text
                    WHEN j.id IS NOT NULL AND l.is_temp_job THEN 'temp_job'::text
                    WHEN j.id IS NOT NULL AND l.expected_po IS NOT NULL THEN 'po_mismatch'::text
                    WHEN j.id IS NOT NULL THEN 'aligned'::text
                    WHEN l.job_norm IS NOT NULL AND l.job_norm <> ''::text THEN 'needs_link'::text
                    WHEN l.po_norm <> ''::text THEN 'needs_link'::text
                    ELSE 'job_blank'::text
                END AS naming_status,
                CASE
                    WHEN l.job_norm IS NOT NULL AND l.job_norm <> ''::text THEN 'job_field'::text
                    WHEN l.po_norm <> ''::text THEN 'po_field'::text
                    ELSE 'unmatched'::text
                END AS match_method,
            j.id IS NOT NULL AS matched
           FROM linked l
             LEFT JOIN jobs_all j ON j.id = l.job_id
        )
 SELECT DISTINCT ON (invoice_number) invoice_number,
    purchase_order_number,
    order_name,
    invoice_date,
    total_amount,
    expected_po AS canonical_po,
    COALESCE(pe_job_number, parsed_job_prefix) AS pe_job_number,
    client_name,
    job_category_name,
    trade_types,
    current_milestone,
    location_street1,
    location_city,
    location_state,
    acculynx_job_id,
    naming_status,
    match_method,
    material_seq,
    is_temp_job,
    matched,
    link_method
   FROM joined
  ORDER BY invoice_number, matched DESC, (naming_status = 'aligned'::text) DESC;

COMMENT ON VIEW public.v_invoice_acculynx_match IS
  'ABC invoice → AccuLynx job. Tiers: job name (mig 237) → job token in the job box → job token in the PO → unique client name (mig 294). Prefix allowlist ks|kc|mc|tx|co|ok|nc|ins. Commercial CP-25-xxxx projects are not in AccuLynx and cannot link here.';
