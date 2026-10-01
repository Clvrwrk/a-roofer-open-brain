-- ROLLBACK for migration 316 (docs/118). NOT a migration: kept out of schemas/ so no runner applies it.
-- The exact pre-316 live definitions, captured from prod (rnhmvcpsvtqjlffpsayu) with pg_get_viewdef /
-- pg_get_functiondef on 2026-10-01, before 316 was applied. Same names, columns and signatures as 316,
-- so CREATE OR REPLACE swaps them back in place; dependents and grants are untouched. Run as ONE
-- transaction, then wait for the 15-minute mv_order_acculynx_match refresh (or refresh it).

BEGIN;

CREATE OR REPLACE VIEW public.v_pe_job_label_parse AS
 SELECT invoice_number,
    order_number,
    purchase_order_number,
    order_name,
    invoice_date,
    TRIM(BOTH FROM split_part(order_name, ':'::text, 1)) AS parsed_job_prefix,
    NULLIF(TRIM(BOTH FROM SUBSTRING(order_name FROM (POSITION((':'::text) IN (order_name)) + 1))), ''::text) AS parsed_client_name,
    (order_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*temp\s*-'::text) AS is_temp_job,
    regexp_replace(upper(regexp_replace(TRIM(BOTH FROM split_part(COALESCE(order_name, ''::text), ':'::text, 1)), '\s+'::text, ''::text, 'g'::text)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS job_norm
   FROM abc_invoices i;

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
            upper(regexp_replace("substring"(TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)), '^\s*([A-Za-z]{2,3}\s*-\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)) AS job_tok,
            (aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc|ins)\s*-\s*temp\s*-'::text) AS is_temp_job,
            (aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc|ins)\s*-'::text) AS is_prefixed,
            regexp_replace(upper(COALESCE(NULLIF(TRIM(BOTH FROM SUBSTRING(aj.job_name FROM (POSITION((':'::text) IN (aj.job_name)) + 1))), ''::text), aj.job_name)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS client_norm
           FROM acculynx_jobs aj
        ), jobs AS (
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
          WHERE jobs_all.is_prefixed
        ), byname AS (
         SELECT jobs_all.client_norm,
            min(jobs_all.id) AS id,
            count(*) AS n
           FROM jobs_all
          WHERE ((NOT jobs_all.is_temp_job) AND (length(jobs_all.client_norm) >= 5))
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
            NULLIF(upper(regexp_replace("substring"(TRIM(BOTH FROM split_part(COALESCE(i.order_name, ''::text), ':'::text, 1)), '^\s*([A-Za-z]{2,3}\s*-\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text) AS name_tok,
            NULLIF(upper(regexp_replace("substring"(TRIM(BOTH FROM COALESCE(i.purchase_order_number, ''::text)), '^\s*([A-Za-z]{2,3}\s*-?\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text) AS po_tok,
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
             LEFT JOIN jobs j1 ON (((j1.jn_norm = e.job_norm) AND (e.job_norm <> ''::text) AND (NOT e.is_temp_job))))
             LEFT JOIN jobs j2 ON (((j1.id IS NULL) AND (j2.job_tok IS NOT NULL) AND (j2.job_tok = tk.name_tok) AND (NOT j2.is_temp_job) AND (NOT COALESCE(e.is_temp_job, false)))))
             LEFT JOIN jobs j3 ON (((j1.id IS NULL) AND (j2.id IS NULL) AND (j3.job_tok IS NOT NULL) AND (j3.job_tok = tk.po_tok) AND (NOT j3.is_temp_job) AND (NOT COALESCE(e.is_temp_job, false)))))
             LEFT JOIN byname j4 ON (((j1.id IS NULL) AND (j2.id IS NULL) AND (j3.id IS NULL) AND (tk.name_tok IS NULL) AND (tk.name_norm IS NOT NULL) AND (length(tk.name_norm) >= 5) AND (j4.client_norm = tk.name_norm) AND (j4.n = 1))))
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

CREATE OR REPLACE VIEW public.v_order_acculynx_match AS
 WITH order_po AS (
         SELECT o.order_number,
            ((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text) AS purchase_order,
            regexp_replace(upper(regexp_replace(COALESCE(((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text), ''::text), '^PO'::text, ''::text, 'i'::text)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS po_norm,
            upper(TRIM(BOTH FROM split_part(COALESCE(((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text), ''::text), ':'::text, 1))) AS po_job_prefix,
            NULLIF(TRIM(BOTH FROM SUBSTRING(((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text) FROM (POSITION((':'::text) IN (((o.raw -> 'salesOrder'::text) ->> 'purchaseOrder'::text))) + 1))), ''::text) AS po_client_name
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
          WHERE (aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-'::text)
        ), parsed_po AS (
         SELECT op.order_number,
            op.purchase_order,
            op.po_norm,
            op.po_job_prefix,
            op.po_client_name,
                CASE
                    WHEN (op.purchase_order ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*\d+\s*-\s*\d+\s*$'::text) THEN regexp_replace(upper(TRIM(BOTH FROM ((split_part(op.purchase_order, '-'::text, 1) || '-'::text) || split_part(op.purchase_order, '-'::text, 2)))), '\s+'::text, ''::text, 'g'::text)
                    WHEN (op.purchase_order ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-'::text) THEN regexp_replace(upper(TRIM(BOTH FROM split_part(op.purchase_order, ':'::text, 1))), '\s+'::text, ''::text, 'g'::text)
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
            WHEN ((j.id IS NOT NULL) AND (n.purchase_order ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*\d+\s*-\s*\d+\s*$'::text) AND (upper(regexp_replace(n.purchase_order, '\s+'::text, ''::text, 'g'::text)) = upper(((regexp_replace(j.pe_job_number, '\s+'::text, ''::text, 'g'::text) || '-'::text) || split_part(n.purchase_order, '-'::text, 3))))) THEN 'aligned'::text
            WHEN (j.id IS NOT NULL) THEN 'po_mismatch'::text
            ELSE 'needs_link'::text
        END AS naming_status,
    (j.id IS NOT NULL) AS matched
   FROM (parsed_po n
     LEFT JOIN jobs j ON (((j.jn_norm = COALESCE(n.derived_job_norm, n.po_norm)) AND (COALESCE(n.derived_job_norm, n.po_norm) <> ''::text))))
  ORDER BY n.order_number, (j.id IS NOT NULL) DESC;

CREATE OR REPLACE VIEW public.v_vendor_invoice_acculynx_match AS
 WITH jobs AS (
         SELECT aj.id,
            TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)) AS pe_job_number,
            NULLIF(TRIM(BOTH FROM SUBSTRING(aj.job_name FROM (POSITION((':'::text) IN (aj.job_name)) + 1))), ''::text) AS client_name,
            aj.job_category_name,
            aj.current_milestone,
            upper(regexp_replace("substring"(TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)), '^\s*([A-Za-z]{2}\s*-\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)) AS job_tok
           FROM acculynx_jobs aj
          WHERE ((aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-'::text) AND (aj.job_name !~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*temp\s*-'::text))
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
     LEFT JOIN jobs j ON (((j.job_tok IS NOT NULL) AND (j.job_tok = NULLIF(upper(regexp_replace("substring"(btrim(COALESCE(vi.po_number, ''::text)), '^\s*([A-Za-z]{2}\s*-?\s*[0-9]+)'::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text)))));

CREATE OR REPLACE FUNCTION public.vendor_invoice_po_token(p_po text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT NULLIF(upper(regexp_replace(
           substring(btrim(COALESCE(p_po, '')), '^\s*([A-Za-z]{2}\s*-?\s*[0-9]+)'),
           '[^A-Za-z0-9]', '', 'g')), '');
$function$
;

CREATE OR REPLACE FUNCTION public.vendor_invoices_canonicalize_po()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_tok text; v_job text;
BEGIN
  v_tok := public.vendor_invoice_po_token(NEW.po_number);
  IF v_tok IS NULL THEN RETURN NEW; END IF;

  SELECT TRIM(BOTH FROM split_part(aj.job_name, ':', 1)) INTO v_job
  FROM public.acculynx_jobs aj
  WHERE aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-'
    AND aj.job_name !~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*temp\s*-'
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
END $function$
;

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

  -- State-code prefix: KS-104, CO-325, TX-12, MC-59, GA-41, KC-5, INS-6
  v_match := regexp_match(p_job_name, '^([A-Z]{2,3}-[0-9]+):\s*(.*)$');
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
$function$
;

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
            WHEN ((customer_ref_name ~ '^[A-Z]{2,4}-[0-9]+$'::text) OR (customer_ref_name ~ '^[0-9]+$'::text)) THEN TRIM(BOTH FROM customer_ref_name)
            ELSE NULL::text
        END AS job_number,
    COALESCE((((line -> 'AccountBasedExpenseLineDetail'::text) -> 'AccountRef'::text) ->> 'name'::text), (((line -> 'ItemBasedExpenseLineDetail'::text) -> 'ItemRef'::text) ->> 'name'::text)) AS account_or_item,
    (sign * ((line ->> 'Amount'::text))::numeric) AS amount
   FROM named
  WHERE ((customer_ref_name IS NOT NULL) AND ((line ->> 'Amount'::text) IS NOT NULL));

COMMIT;
