-- 237 — AccuLynx job linking: add job-token and PO-token tiers. Additive + idempotent.
--
-- Problem: only 185 of 1,089 ABC invoices (17%) resolved an acculynx_job_id, so most
-- surfaces could show a job NUMBER but had no id to deep-link, and executive job-cost
-- attribution silently dropped most invoice cost on the floor.
--
-- Two causes, both in the join key:
--
--  1. The invoice side normalised the WHOLE label. AccuLynx names a job "KS-79: Mark
--     McCall" (norm "KS79"), but the ABC order_name is often "KS-79 Mark McCall" with no
--     colon, which normalised to "KS79MARKMCCALL" and matched nothing.
--
--  2. The view only ever looked at order_name. The job is very often in
--     purchase_order_number instead — "Customer PO#" on the printed invoice/memo is the
--     job key ("KS-160-1", "ks158", "CO-354-1"). That field was never consulted, which is
--     where the bulk of the loss was.
--
-- Fix: keep the existing exact match as tier 1 (unchanged, so nothing that links today
-- changes), then fall back to a canonical JOB TOKEN — the leading "<2 letters><digits>"
-- of the label, e.g. "KS-160-1" -> KS160 (the trailing -1 is the material sequence, not
-- part of the job). Tier 2 takes the token from order_name, tier 3 from
-- purchase_order_number.
--
-- Safety: the token is unambiguous. All 883 non-temp prefixed AccuLynx jobs produce 883
-- DISTINCT tokens — zero collisions — so a token match resolves to exactly one job or
-- none. Verified 2026-08-19. Temp jobs ("KS-TEMP-…") cannot produce a token because TEMP
-- is not digits, so they stay excluded exactly as before.
--
-- Measured lift: 185 -> 863 of 1,089 invoices linked (17% -> 79%); +22 from tier 2,
-- +656 from tier 3. On the credit-memo surface: 73 -> 241 of 261 memos deep-linkable.
--
-- BLAST RADIUS — read before deploying. executive-pipeline.ts attributes invoice cost to
-- jobs through this view filtered on matched = true. Going from 185 to 863 matched
-- invoices will move job-cost and margin numbers on the executive dashboard. That is the
-- correction working (cost that was previously unattributed now lands on its job), but it
-- is a visible change to those figures, not a silent one.
--
-- New column: link_method — 'job_name' (tier 1, exact), 'job_token' (tier 2),
-- 'po_token' (tier 3), NULL when unmatched. Purely additive and APPENDED LAST, because
-- CREATE OR REPLACE VIEW can only add trailing columns; inserting it mid-list fails with
-- 42P16. match_method and naming_status keep their existing values so no consumer breaks.
--
-- Verified after apply: the 185 pre-existing links are preserved byte-for-byte — the
-- tier-1 (link_method='job_name') fingerprint md5 7508797978d4ae5f9aec66485757c9ca is
-- identical to the pre-migration fingerprint over all matched rows.

CREATE OR REPLACE VIEW public.v_invoice_acculynx_match AS
 WITH jobs AS (
         SELECT aj.id,
            TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)) AS pe_job_number,
            NULLIF(TRIM(BOTH FROM SUBSTRING(aj.job_name FROM POSITION((':'::text) IN (aj.job_name)) + 1)), ''::text) AS client_name,
            aj.job_category_name,
            aj.trade_types,
            aj.current_milestone,
            aj.location_street1,
            aj.location_city,
            aj.location_state,
            regexp_replace(upper(split_part(aj.job_name, ':'::text, 1)), '[^A-Z0-9]'::text, ''::text, 'g'::text) AS jn_norm,
            -- canonical job token: leading "<2 letters><digits>", collision-free by design
            upper(regexp_replace(SUBSTRING(TRIM(BOTH FROM split_part(aj.job_name, ':'::text, 1)) FROM '^\s*([A-Za-z]{2}\s*-\s*[0-9]+)'), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)) AS job_tok,
            aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*temp\s*-'::text AS is_temp_job
           FROM acculynx_jobs aj
          WHERE aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-'::text
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
         -- the same canonical token, taken from each invoice-side label
         SELECT i.invoice_number,
            NULLIF(upper(regexp_replace(SUBSTRING(TRIM(BOTH FROM split_part(COALESCE(i.order_name, ''::text), ':'::text, 1)) FROM '^\s*([A-Za-z]{2}\s*-\s*[0-9]+)'), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text) AS name_tok,
            -- the PO often omits the dash ("ks158"), so the dash is optional here
            NULLIF(upper(regexp_replace(SUBSTRING(TRIM(BOTH FROM COALESCE(i.purchase_order_number, ''::text)) FROM '^\s*([A-Za-z]{2}\s*-?\s*[0-9]+)'), '[^A-Za-z0-9]'::text, ''::text, 'g'::text)), ''::text) AS po_tok
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
            COALESCE(j1.id, j2.id, j3.id) AS job_id,
                CASE WHEN j1.id IS NOT NULL THEN 'job_name'::text
                     WHEN j2.id IS NOT NULL THEN 'job_token'::text
                     WHEN j3.id IS NOT NULL THEN 'po_token'::text
                     ELSE NULL::text END AS link_method
           FROM abc_invoices i
             LEFT JOIN expected e ON e.invoice_number = i.invoice_number
             LEFT JOIN po_norm pn ON pn.invoice_number = i.invoice_number
             LEFT JOIN toks tk ON tk.invoice_number = i.invoice_number
             -- tier 1 · exact whole-label normalisation (unchanged behaviour)
             LEFT JOIN jobs j1 ON j1.jn_norm = e.job_norm AND e.job_norm <> ''::text AND NOT e.is_temp_job
             -- tier 2 · job token out of order_name
             LEFT JOIN jobs j2 ON j1.id IS NULL AND j2.job_tok IS NOT NULL AND j2.job_tok = tk.name_tok
                                  AND NOT j2.is_temp_job AND NOT COALESCE(e.is_temp_job, false)
             -- tier 3 · job token out of the Customer PO#
             LEFT JOIN jobs j3 ON j1.id IS NULL AND j2.id IS NULL AND j3.job_tok IS NOT NULL AND j3.job_tok = tk.po_tok
                                  AND NOT j3.is_temp_job AND NOT COALESCE(e.is_temp_job, false)
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
             LEFT JOIN jobs j ON j.id = l.job_id
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
    -- MUST stay last: CREATE OR REPLACE VIEW can only APPEND columns, never reorder
    -- them (42P16 "cannot change name of view column"). Learned the hard way.
    link_method
   FROM joined
  ORDER BY invoice_number, matched DESC, (naming_status = 'aligned'::text) DESC;

COMMENT ON VIEW public.v_invoice_acculynx_match IS
  'ABC invoice -> AccuLynx job. Three link tiers (migration 237), reported in link_method: job_name (exact whole-label norm) > job_token (leading <2 letters><digits> out of order_name) > po_token (same token out of the Customer PO#). Job tokens are collision-free across all 883 non-temp prefixed jobs. Temp jobs never link. Feeds executive job-cost attribution via matched = true.';
