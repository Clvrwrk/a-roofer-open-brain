-- 317 — dashed ABC order POs get a dash-free AccuLynx job key (docs/119).
--
-- Bug (docs/118 open item 1): in v_order_acculynx_match the AccuLynx side keys a job by stripping
-- every non-alphanumeric (jobs.jn_norm: "KS-160" -> KS160), but the PO side kept the dash
-- (parsed_po.derived_job_norm: "KS-160-1" -> KS-160, "TX-460" -> TX-460, "TX-387: Smith" -> TX-387).
-- The join `jn_norm = COALESCE(derived_job_norm, po_norm)` therefore failed for EVERY order whose PO
-- uses the canonical dashed form. Only dash-free POs ("TX219") matched, through the same branches'
-- dash-free output. Measured 2026-10-01: 1,817 dashed office-prefixed POs, 0 matched.
--
-- Fix: the two canonical shapes produce a key normalised exactly like jn_norm
-- (upper, then strip [^A-Z0-9]):
--   <PFX>-<n>-<seq>           KS-160-1        -> KS160   (unchanged regex; key normalisation fixed)
--   <PFX>-<n>[: client]       TX-460, TX-387: ZACH -> TX460 / TX387   (new, explicit shape test)
-- Every other dashed PO ("TX-380 DAVID COPELAN", "TX-383 & TX-382", "GA-GATOR") keeps the old
-- dash-bearing expression byte-for-byte, so it still fails closed: no guessing which job a
-- free-text PO means. The `<PFX>-<n>` shape test is deliberately anchored on the job-number part
-- so a future "TX-46-1: Smith" can never collapse to TX461 and land on AccuLynx TX-461.
--
-- Built on migration 316 (docs/118, the CRM -PECRM rule; applied to prod 2026-10-01 11:03 UTC) and
-- must be applied after it: the CRM rule is kept as is —
-- a PO containing PECRM keys as <PFX><n>PECRM, never joins AccuLynx, and reports 'crm_job'.
-- FL/GA stay in the prefix lists. The 'aligned' / 'po_mismatch' CASE is unchanged.
--
-- Additive + idempotent: CREATE OR REPLACE VIEW, same name and column list, so
-- mv_order_acculynx_match (mig 288) and grants are untouched. The matview picks the change up on
-- its 15-minute cron (refresh-order-acculynx-match); refresh it by hand to surface it immediately.
-- Rollback: re-run the v_order_acculynx_match block of migration 316 (section 3).

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
                    -- CRM number: the key keeps the marker (TX-460-PECRM-1 → TX460PECRM) — mig 316, unchanged
                    WHEN op.is_crm THEN NULLIF(regexp_replace(upper(COALESCE("substring"(TRIM(BOTH FROM op.purchase_order), '^\s*([A-Za-z]{2,3}\s*-?\s*[0-9]+)'::text), ''::text)), '[^A-Z0-9]'::text, ''::text, 'g'::text), ''::text) || 'PECRM'::text
                    -- KS-160-1 → KS160 (mig 317: normalised like jobs.jn_norm)
                    WHEN (op.purchase_order ~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-\s*\d+\s*-\s*\d+\s*$'::text) THEN regexp_replace(upper((split_part(op.purchase_order, '-'::text, 1) || '-'::text) || split_part(op.purchase_order, '-'::text, 2)), '[^A-Z0-9]'::text, ''::text, 'g'::text)
                    -- TX-460 / TX-387: CLIENT → TX460 / TX387 (mig 317)
                    WHEN (split_part(op.purchase_order, ':'::text, 1) ~* '^(ks|kc|mc|tx|co|ok|nc|fl|ga)\s*-\s*\d+\s*$'::text) THEN regexp_replace(upper(split_part(op.purchase_order, ':'::text, 1)), '[^A-Z0-9]'::text, ''::text, 'g'::text)
                    -- any other dashed PO keeps the old dash-bearing key and so fails closed
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
