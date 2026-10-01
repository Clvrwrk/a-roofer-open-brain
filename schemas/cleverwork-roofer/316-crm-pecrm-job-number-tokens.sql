-- 316 — CRM job numbers ("-PECRM") never join an AccuLynx job; FL and GA join the prefix lists.
--
-- The CRM (Clvrwrk/CRM_PWA, migration 20261004020000_crm_job_numbers.sql) numbers every job it
-- creates "<PREFIX>-<n>-PECRM" (TX-460-PECRM), continuing past the highest AccuLynx number for
-- the prefix. AccuLynx does not know about CRM numbers and may later issue its own TX-460, so the
-- "-PECRM" suffix is the ONLY thing that tells the two jobs apart. Material POs follow the same
-- convention with a sequence: KS-160-1 (AccuLynx), TX-460-PECRM-1 (CRM).
--
-- Every job-number join token in this brain truncated to "<PREFIX><n>", so purchase-order or
-- vendor-invoice text "TX-460-PECRM-1" tokenised to "TX460" and joined AccuLynx TX-460. Worse,
-- the vendor_invoices canonicalise trigger (mig 255) would have REWRITTEN the printed PO to the
-- AccuLynx job number on insert, destroying the CRM reference.
--
-- Rule (docs/118): a job number whose job-number part contains "PECRM" (any case, any position,
-- with or without a dash) is a CRM number.
--   1. Its join key keeps the marker: <PREFIX><n>PECRM (TX460PECRM). Every existing regex is
--      unchanged byte-for-byte; the key is the old token with "PECRM" appended only when the
--      marker is present, so no key without the marker can change.
--   2. It never joins an AccuLynx job — every AccuLynx join fails closed when either side
--      carries the marker (job-name, PO-token, client-name fallback alike).
--   3. The match views report it as naming_status 'crm_job' instead of 'needs_link', so it is
--      never queued for a human to hand-link to an AccuLynx job.
-- And FL / GA (25 + 48 AccuLynx jobs, verified 2026-10-01) are added to every office prefix
-- allowlist that lacked them.
--
-- Additive + idempotent: CREATE OR REPLACE only, same names / column lists / signatures, so
-- dependents (v_credit_memo_match, v_credit_memo_tbd, mv_order_acculynx_match, v_qbo_job_costs,
-- v_qbo_job_cost_unattributed, refresh_wip_ar_master) and grants are untouched.
-- mv_order_acculynx_match picks up the change on its 15-minute cron refresh.
-- Rollback: docs/118-rollback-pre-316.sql — the exact pre-316 live definitions, captured from prod
-- with pg_get_viewdef / pg_get_functiondef before this migration was applied.

-- 1. ABC job-label parse: FL/GA temp jobs ------------------------------------------------------
-- job_norm is a full normalisation, so "TX-460-PECRM: Smith" already keys as TX460PECRM.
CREATE OR REPLACE VIEW public.v_pe_job_label_parse AS
 SELECT invoice_number,
    order_number,
    purchase_order_number,
    order_name,
    invoice_date,
    TRIM(BOTH FROM split_part(order_name, ':'::text, 1)) AS parsed_job_prefix,
    NULLIF(TRIM(BOTH FROM SUBSTRING(order_name FROM (POSITION((':'::text) IN (order_name)) + 1))), ''::text) AS parsed_client_name,
    (order_name ~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-\s*temp\s*-'::text) AS is_temp_job,
    regexp_replace(upper(regexp_replace(TRIM(BOTH FROM split_part(COALESCE(order_name, ''::text), ':'::text, 1)), '\s+'::text, ''::text, 'g'::text)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS job_norm
   FROM abc_invoices i;

-- 2. ABC invoice → AccuLynx job (mig 294 + the CRM rule) -----------------------------------------
CREATE OR REPLACE VIEW public.v_invoice_acculynx_match AS
 WITH jobs_all AS (
         SELECT aj.id,
            NULLIF(TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)), 'N/A'::text) AS pe_job_number,
            NULLIF(TRIM(BOTH FROM SUBSTRING(aj.job_name FROM (POSITION((':'::text) IN (aj.job_name)) + 1))), ''::text) AS client_name,
            aj.job_category_name,
            aj.trade_types,
            aj.current_milestone,
            aj.location_street1,
            aj.location_city,
            aj.location_state,
            regexp_replace(upper(split_part(aj.job_name, ':'::text, 1)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS jn_norm,
            upper(regexp_replace("substring"(TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)), '^\s*([A-Za-z]{2,3}\s*-\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text))
              || CASE WHEN split_part(aj.job_name, ':'::text, 1) ~* 'pecrm'::text THEN 'PECRM'::text ELSE ''::text END AS job_tok,
            (aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc|ins|fl|ga)\s*-\s*temp\s*-'::text) AS is_temp_job,
            (aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc|ins|fl|ga)\s*-'::text) AS is_prefixed,
            COALESCE(split_part(aj.job_name, ':'::text, 1) ~* 'pecrm'::text, false) AS is_crm_numbered,
            regexp_replace(upper(COALESCE(NULLIF(TRIM(BOTH FROM SUBSTRING(aj.job_name FROM (POSITION((':'::text) IN (aj.job_name)) + 1))), ''::text), aj.job_name)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS client_norm
           FROM acculynx_jobs aj
        ), jobs AS (
         -- joinable AccuLynx jobs: office-prefixed and never a CRM number
         SELECT jobs_all.id,
            jobs_all.pe_job_number,
            jobs_all.client_name,
            jobs_all.job_category_name,
            jobs_all.trade_types,
            jobs_all.current_milestone,
            jobs_all.location_street1,
            jobs_all.location_city,
            jobs_all.location_state,
            jobs_all.jn_norm,
            jobs_all.job_tok,
            jobs_all.is_temp_job,
            jobs_all.is_prefixed,
            jobs_all.client_norm
           FROM jobs_all
          WHERE jobs_all.is_prefixed AND NOT jobs_all.is_crm_numbered
        ), byname AS (
         SELECT jobs_all.client_norm,
            min(jobs_all.id) AS id,
            count(*) AS n
           FROM jobs_all
          WHERE ((NOT jobs_all.is_temp_job) AND (NOT jobs_all.is_crm_numbered) AND (length(jobs_all.client_norm) >= 5))
          GROUP BY jobs_all.client_norm
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
          WHERE (p.job_norm <> ''::text)
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
            ((regexp_replace(p.parsed_job_prefix, '\s+'::text, ''::text, 'g'::text) || '-'::text) || (p.material_seq)::text) AS expected_po
           FROM parsed p
        ), po_norm AS (
         SELECT i.invoice_number,
            regexp_replace(upper(regexp_replace(COALESCE(i.purchase_order_number, ''::text), '^PO'::text, ''::text, 'i'::text)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS po_norm
           FROM abc_invoices i
        ), toks AS (
         SELECT i.invoice_number,
            NULLIF(upper(regexp_replace("substring"(TRIM(BOTH FROM split_part(COALESCE(i.order_name, ''::text), ':'::text, 1)), '^\s*([A-Za-z]{2,3}\s*-\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text)
              || CASE WHEN split_part(COALESCE(i.order_name, ''::text), ':'::text, 1) ~* 'pecrm'::text THEN 'PECRM'::text ELSE ''::text END AS name_tok,
            NULLIF(upper(regexp_replace("substring"(TRIM(BOTH FROM COALESCE(i.purchase_order_number, ''::text)), '^\s*([A-Za-z]{2,3}\s*-?\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text)
              || CASE WHEN COALESCE(i.purchase_order_number, ''::text) ~* 'pecrm'::text THEN 'PECRM'::text ELSE ''::text END AS po_tok,
            (split_part(COALESCE(i.order_name, ''::text), ':'::text, 1) ~* 'pecrm'::text OR COALESCE(i.purchase_order_number, ''::text) ~* 'pecrm'::text) AS is_crm,
            NULLIF(regexp_replace(upper(COALESCE(NULLIF(TRIM(BOTH FROM SUBSTRING(COALESCE(i.order_name, ''::text) FROM (POSITION((':'::text) IN (COALESCE(i.order_name, ''::text))) + 1))), ''::text), COALESCE(i.order_name, ''::text))), '[^A-Z0-9]'::text, ''::text, 'g'::text), ''::text) AS name_norm
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
            COALESCE(tk.is_crm, false) AS is_crm,
            COALESCE(j1.id, j2.id, j3.id, j4.id) AS job_id,
                CASE
                    WHEN (j1.id IS NOT NULL) THEN 'job_name'::text
                    WHEN (j2.id IS NOT NULL) THEN 'job_token'::text
                    WHEN (j3.id IS NOT NULL) THEN 'po_token'::text
                    WHEN (j4.id IS NOT NULL) THEN 'client_name'::text
                    ELSE NULL::text
                END AS link_method
           FROM (((((((abc_invoices i
             LEFT JOIN expected e ON ((e.invoice_number = i.invoice_number)))
             LEFT JOIN po_norm pn ON ((pn.invoice_number = i.invoice_number)))
             LEFT JOIN toks tk ON ((tk.invoice_number = i.invoice_number)))
             -- every arm fails closed on a CRM number (docs/118)
             LEFT JOIN jobs j1 ON (((j1.jn_norm = e.job_norm) AND (e.job_norm <> ''::text) AND (NOT e.is_temp_job) AND (NOT COALESCE(tk.is_crm, false)))))
             LEFT JOIN jobs j2 ON (((j1.id IS NULL) AND (j2.job_tok IS NOT NULL) AND (j2.job_tok = tk.name_tok) AND (NOT j2.is_temp_job) AND (NOT COALESCE(e.is_temp_job, false)) AND (NOT COALESCE(tk.is_crm, false)))))
             LEFT JOIN jobs j3 ON (((j1.id IS NULL) AND (j2.id IS NULL) AND (j3.job_tok IS NOT NULL) AND (j3.job_tok = tk.po_tok) AND (NOT j3.is_temp_job) AND (NOT COALESCE(e.is_temp_job, false)) AND (NOT COALESCE(tk.is_crm, false)))))
             LEFT JOIN byname j4 ON (((j1.id IS NULL) AND (j2.id IS NULL) AND (j3.id IS NULL) AND (tk.name_tok IS NULL) AND (tk.name_norm IS NOT NULL) AND (length(tk.name_norm) >= 5) AND (j4.client_norm = tk.name_norm) AND (j4.n = 1) AND (NOT COALESCE(tk.is_crm, false)))))
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
                    WHEN ((j.id IS NOT NULL) AND (l.expected_po IS NOT NULL) AND (upper(regexp_replace(COALESCE(l.purchase_order_number, ''::text), '\s+'::text, ''::text, 'g'::text)) = upper(l.expected_po))) THEN 'aligned'::text
                    WHEN ((j.id IS NOT NULL) AND l.is_temp_job) THEN 'temp_job'::text
                    WHEN ((j.id IS NOT NULL) AND (l.expected_po IS NOT NULL)) THEN 'po_mismatch'::text
                    WHEN (j.id IS NOT NULL) THEN 'aligned'::text
                    WHEN l.is_crm THEN 'crm_job'::text
                    WHEN ((l.job_norm IS NOT NULL) AND (l.job_norm <> ''::text)) THEN 'needs_link'::text
                    WHEN (l.po_norm <> ''::text) THEN 'needs_link'::text
                    ELSE 'job_blank'::text
                END AS naming_status,
                CASE
                    WHEN ((l.job_norm IS NOT NULL) AND (l.job_norm <> ''::text)) THEN 'job_field'::text
                    WHEN (l.po_norm <> ''::text) THEN 'po_field'::text
                    ELSE 'unmatched'::text
                END AS match_method,
            (j.id IS NOT NULL) AS matched
           FROM (linked l
             LEFT JOIN jobs_all j ON ((j.id = l.job_id)))
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

-- 3. ABC order → AccuLynx job --------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_order_acculynx_match AS
 WITH order_po AS (
         SELECT o.order_number,
            ((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text) AS purchase_order,
            regexp_replace(upper(regexp_replace(COALESCE(((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text), ''::text), '^PO'::text, ''::text, 'i'::text)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS po_norm,
            upper(TRIM(BOTH FROM split_part(COALESCE(((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text), ''::text), ':'::text, 1))) AS po_job_prefix,
            NULLIF(TRIM(BOTH FROM SUBSTRING(((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text) FROM (POSITION((':'::text) IN (((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text))) + 1))), ''::text) AS po_client_name,
            COALESCE(((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text), ''::text) ~* 'pecrm'::text AS is_crm
           FROM abc_orders o
        ), jobs AS (
         SELECT aj.id,
            TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)) AS pe_job_number,
            NULLIF(TRIM(BOTH FROM SUBSTRING(aj.job_name FROM (POSITION((':'::text) IN (aj.job_name)) + 1))), ''::text) AS client_name,
            aj.job_category_name,
            aj.trade_types,
            aj.current_milestone,
            aj.location_street1,
            aj.location_city,
            aj.location_state,
            regexp_replace(upper(split_part(aj.job_name, ':'::text, 1)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS jn_norm
           FROM acculynx_jobs aj
          WHERE (aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-'::text)
            AND (split_part(aj.job_name, ':'::text, 1) !~* 'pecrm'::text)
        ), parsed_po AS (
         SELECT op.order_number,
            op.purchase_order,
            op.po_norm,
            op.po_job_prefix,
            op.po_client_name,
            op.is_crm,
                CASE
                    -- CRM number: the key keeps the marker (TX-460-PECRM-1 → TX460PECRM)
                    WHEN op.is_crm THEN NULLIF(regexp_replace(upper(COALESCE("substring"(TRIM(BOTH FROM op.purchase_order), '^\s*([A-Za-z]{2,3}\s*-?\s*[0-9]+)'::text), ''::text)), '[^A-Z0-9]'::text, ''::text, 'g'::text), ''::text) || 'PECRM'::text
                    WHEN (op.purchase_order ~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-\s*\d+\s*-\s*\d+\s*$'::text) THEN regexp_replace(upper(TRIM(BOTH FROM ((split_part(op.purchase_order, '-'::text, 1) || '-'::text) || split_part(op.purchase_order, '-'::text, 2)))), '\s+'::text, ''::text, 'g'::text)
                    WHEN (op.purchase_order ~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-'::text) THEN regexp_replace(upper(TRIM(BOTH FROM split_part(op.purchase_order, ':'::text, 1))), '\s+'::text, ''::text, 'g'::text)
                    ELSE NULL::text
                END AS derived_job_norm
           FROM order_po op
        )
 SELECT DISTINCT ON (n.order_number) n.order_number,
    n.purchase_order,
    j.id AS acculynx_job_id,
    j.pe_job_number,
    COALESCE(j.client_name, n.po_client_name) AS client_name,
    j.job_category_name,
    j.trade_types,
    j.current_milestone,
    j.location_street1,
    j.location_city,
    j.location_state,
        CASE
            WHEN ((j.id IS NOT NULL) AND (n.purchase_order ~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-\s*\d+\s*-\s*\d+\s*$'::text) AND (upper(regexp_replace(n.purchase_order, '\s+'::text, ''::text, 'g'::text)) = upper(((regexp_replace(j.pe_job_number, '\s+'::text, ''::text, 'g'::text) || '-'::text) || split_part(n.purchase_order, '-'::text, 3))))) THEN 'aligned'::text
            WHEN (j.id IS NOT NULL) THEN 'po_mismatch'::text
            WHEN n.is_crm THEN 'crm_job'::text
            ELSE 'needs_link'::text
        END AS naming_status,
    (j.id IS NOT NULL) AS matched
   FROM (parsed_po n
     LEFT JOIN jobs j ON (((j.jn_norm = COALESCE(n.derived_job_norm, n.po_norm)) AND (COALESCE(n.derived_job_norm, n.po_norm) <> ''::text) AND (NOT n.is_crm))))
  ORDER BY n.order_number, (j.id IS NOT NULL) DESC;

-- 4. SRS / QXO vendor invoice → AccuLynx job (mig 250) -------------------------------------------
CREATE OR REPLACE VIEW public.v_vendor_invoice_acculynx_match AS
 WITH jobs AS (
         SELECT aj.id,
            TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)) AS pe_job_number,
            NULLIF(TRIM(BOTH FROM SUBSTRING(aj.job_name FROM (POSITION((':'::text) IN (aj.job_name)) + 1))), ''::text) AS client_name,
            aj.job_category_name,
            aj.current_milestone,
            upper(regexp_replace("substring"(TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)), '^\s*([A-Za-z]{2}\s*-\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)) AS job_tok
           FROM acculynx_jobs aj
          WHERE ((aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-'::text) AND (aj.job_name !~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-\s*temp\s*-'::text)
            AND (split_part(aj.job_name, ':'::text, 1) !~* 'pecrm'::text))
        )
 SELECT vi.invoice_number,
    vi.po_number AS purchase_order_number,
    vi.invoice_date,
    j.id AS acculynx_job_id,
    j.pe_job_number,
    j.client_name,
    j.job_category_name,
    j.current_milestone,
        CASE
            WHEN (j.id IS NOT NULL) THEN 'po_token'::text
            ELSE NULL::text
        END AS link_method,
    (j.id IS NOT NULL) AS matched
   FROM (vendor_invoices vi
     LEFT JOIN jobs j ON (((j.job_tok IS NOT NULL) AND (COALESCE(vi.po_number, ''::text) !~* 'pecrm'::text)
       AND (j.job_tok = NULLIF(upper(regexp_replace("substring"(btrim(COALESCE(vi.po_number, ''::text)), '^\s*([A-Za-z]{2}\s*-?\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text)))));

-- 5. Vendor PO token + the canonicalise trigger (migs 254/255) -----------------------------------
-- The token keeps the CRM marker, so TX-460-PECRM-1 tokenises to TX460PECRM, not TX460.
CREATE OR REPLACE FUNCTION public.vendor_invoice_po_token(p_po text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT NULLIF(upper(regexp_replace(
           substring(btrim(COALESCE(p_po, '')), '^\s*([A-Za-z]{2}\s*-?\s*[0-9]+)'),
           '[^A-Za-z0-9]', '', 'g')), '')
         || CASE WHEN COALESCE(p_po, '') ~* 'pecrm' THEN 'PECRM' ELSE '' END;
$function$;

-- A CRM-numbered PO is never rewritten to an AccuLynx job number: it is left exactly as printed.
CREATE OR REPLACE FUNCTION public.vendor_invoices_canonicalize_po()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_tok text; v_job text;
BEGIN
  v_tok := public.vendor_invoice_po_token(NEW.po_number);
  IF v_tok IS NULL THEN RETURN NEW; END IF;
  -- CRM job number (docs/118): never canonicalise to an AccuLynx job.
  IF v_tok ~ 'PECRM$' THEN RETURN NEW; END IF;

  SELECT TRIM(BOTH FROM split_part(aj.job_name, ':', 1)) INTO v_job
  FROM public.acculynx_jobs aj
  WHERE aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-'
    AND aj.job_name !~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-\s*temp\s*-'
    AND split_part(aj.job_name, ':', 1) !~* 'pecrm'
    AND upper(regexp_replace(
          substring(TRIM(BOTH FROM split_part(aj.job_name, ':', 1)), '^\s*([A-Za-z]{2}\s*-\s*[0-9]+)'),
          '[^A-Za-z0-9]', '', 'g')) = v_tok
  LIMIT 1;

  -- No job for this token: leave the printed PO untouched (fail open).
  IF v_job IS NULL OR v_job = COALESCE(NEW.po_number, '') THEN RETURN NEW; END IF;

  NEW.raw := COALESCE(NEW.raw, '{}'::jsonb)
             || jsonb_build_object('po_number_as_printed',
                  COALESCE(NEW.raw->>'po_number_as_printed', NEW.po_number))
             || jsonb_build_object('po_number_source', 'acculynx_job_number (trigger, migration 255)');
  NEW.po_number := v_job;
  RETURN NEW;
END $function$;

-- 6. Job-name parse: the prefix keeps -PECRM ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parse_job_name(p_job_name text)
 RETURNS TABLE(prefix text, rest text)
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
AS $function$
DECLARE
  v_match text[];
BEGIN
  IF p_job_name IS NULL OR p_job_name = '' THEN
    RETURN QUERY SELECT NULL::text, NULL::text;
    RETURN;
  END IF;

  -- State-code prefix: KS-104, CO-325, TX-12, MC-59, GA-41, KC-5, INS-6; CRM: TX-460-PECRM
  v_match := regexp_match(p_job_name, '^([A-Z]{2,3}-[0-9]+(?:-PECRM)?):\s*(.*)$');
  IF v_match IS NOT NULL THEN
    RETURN QUERY SELECT v_match[1], NULLIF(trim(v_match[2]), '');
    RETURN;
  END IF;

  -- Bare-number prefix: 68: Ravinder Jain
  v_match := regexp_match(p_job_name, '^([0-9]+):\s*(.*)$');
  IF v_match IS NOT NULL THEN
    RETURN QUERY SELECT v_match[1], NULLIF(trim(v_match[2]), '');
    RETURN;
  END IF;

  -- N/A literal: N/A: Ernest Lynn  → no job number, name = Ernest Lynn
  v_match := regexp_match(p_job_name, '^N/A:\s*(.*)$');
  IF v_match IS NOT NULL THEN
    RETURN QUERY SELECT NULL::text, NULLIF(trim(v_match[1]), '');
    RETURN;
  END IF;

  -- No colon → full string is the name, no job number
  RETURN QUERY SELECT NULL::text, NULLIF(trim(p_job_name), '');
END;
$function$;

-- 7. QBO Customer:Job → job-cost key (feeds wip_ar_master by exact job_number) -------------------
-- The "Customer:Job" branch already keeps the whole last segment (…:TX-460-PECRM); the bare
-- branch now accepts the CRM form too instead of dropping it to unattributed.
CREATE OR REPLACE VIEW public.v_qbo_job_cost_lines AS
 WITH bill_lines AS (
         SELECT 'bill'::text AS source,
            b.qbo_id AS qbo_txn_id,
            b.txn_date,
            b.vendor_name,
            (1)::numeric AS sign,
            l.value AS line
           FROM (qbo_bills b
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.lines, (b.raw -> 'Line'::text))) l(value))
        ), purchase_lines AS (
         SELECT 'purchase'::text AS source,
            p.qbo_id AS qbo_txn_id,
            p.txn_date,
            p.entity_name AS vendor_name,
            (
                CASE
                    WHEN COALESCE(p.credit, false) THEN '-1'::integer
                    ELSE 1
                END)::numeric AS sign,
            l.value AS line
           FROM (qbo_purchases p
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.lines, (p.raw -> 'Line'::text))) l(value))
        ), all_lines AS (
         SELECT bill_lines.source,
            bill_lines.qbo_txn_id,
            bill_lines.txn_date,
            bill_lines.vendor_name,
            bill_lines.sign,
            bill_lines.line
           FROM bill_lines
        UNION ALL
         SELECT purchase_lines.source,
            purchase_lines.qbo_txn_id,
            purchase_lines.txn_date,
            purchase_lines.vendor_name,
            purchase_lines.sign,
            purchase_lines.line
           FROM purchase_lines
        ), named AS (
         SELECT all_lines.source,
            all_lines.qbo_txn_id,
            all_lines.txn_date,
            all_lines.vendor_name,
            all_lines.sign,
            all_lines.line,
            COALESCE((((all_lines.line -> 'AccountBasedExpenseLineDetail'::text) -> 'CustomerRef'::text) ->> 'name'::text), (((all_lines.line -> 'ItemBasedExpenseLineDetail'::text) -> 'CustomerRef'::text) ->> 'name'::text)) AS customer_ref_name
           FROM all_lines
        )
 SELECT source,
    qbo_txn_id,
    txn_date,
    vendor_name,
    customer_ref_name,
        CASE
            WHEN (customer_ref_name ~~ '%:%'::text) THEN NULLIF(TRIM(BOTH FROM "substring"(customer_ref_name, ':([^:]+)$'::text)), ''::text)
            WHEN ((customer_ref_name ~ '^[A-Z]{2,4}-[0-9]+(-PECRM)?$'::text) OR (customer_ref_name ~ '^[0-9]+$'::text)) THEN TRIM(BOTH FROM customer_ref_name)
            ELSE NULL::text
        END AS job_number,
    COALESCE((((line -> 'AccountBasedExpenseLineDetail'::text) -> 'AccountRef'::text) ->> 'name'::text), (((line -> 'ItemBasedExpenseLineDetail'::text) -> 'ItemRef'::text) ->> 'name'::text)) AS account_or_item,
    (sign * ((line ->> 'Amount'::text))::numeric) AS amount
   FROM named
  WHERE ((customer_ref_name IS NOT NULL) AND ((line ->> 'Amount'::text) IS NOT NULL));
