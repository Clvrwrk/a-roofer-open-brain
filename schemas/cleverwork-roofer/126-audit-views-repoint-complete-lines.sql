-- 126-audit-views-repoint-complete-lines.sql
-- Phase 2 of the ABC API 10-line truncation fix (docs/47 #2, docs/48): repoint every
-- invoice line-audit view from abc_invoice_lines (API, capped at 10) to
-- v_invoice_lines_complete (API lines for un-truncated invoices + full CSV lines for the
-- 145 truncated ones). After this, the live audit interrogates EVERY line item.
--
-- Idempotent: CREATE OR REPLACE VIEW only; DROP CONSTRAINT IF EXISTS. No table/atom drops.
--
-- FK relax: invoice_line_audit.invoice_line_id previously REFERENCES abc_invoice_lines(id).
-- Complete-set lines for truncated invoices live in abc_invoice_lines_full (different
-- table, globally-unique uuids), so a human/System audit decision on one of those lines
-- would violate the FK. We drop the FK (keep the column + index). Invoice lines are never
-- deleted (rule 1), so the ON DELETE CASCADE was already dead weight.

ALTER TABLE public.invoice_line_audit DROP CONSTRAINT IF EXISTS invoice_line_audit_invoice_line_id_fkey;

-- Extend the complete-line view with created_at/updated_at (needed by v_abc_invoice_lines_with_pdf).
CREATE OR REPLACE VIEW public.v_invoice_lines_complete AS
SELECT l.id, l.invoice_number, l.line_key, l.line_number, l.item_number, l.item_description,
       l.quantity, l.uom, l.unit_price, l.extended_price, l.effective_unit_price,
       l.ship_uom, l.ship_qty, l.price_uom, l.price_qty, l.price_conversion_factor, l.price_per_uom,
       l.raw, 'abc_api'::text AS line_source, l.created_at, l.updated_at
FROM public.abc_invoice_lines l
JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
WHERE NOT COALESCE(i.lines_truncated_by_api, false)
UNION ALL
SELECT f.id, f.invoice_number, f.line_key, f.line_number, f.item_number, f.item_description,
       f.quantity, f.uom, f.unit_price, f.extended_price, NULL::numeric AS effective_unit_price,
       f.ship_uom, f.ship_qty, f.price_uom, f.price_qty, f.price_conversion_factor, f.price_per_uom,
       f.raw, f.line_source, f.created_at, NULL::timestamptz AS updated_at
FROM public.abc_invoice_lines_full f;

-- ===== Repointed views (FROM abc_invoice_lines -> FROM v_invoice_lines_complete) =====

CREATE OR REPLACE VIEW public.v_item_uom_map AS
SELECT item_number,
    mode() WITHIN GROUP (ORDER BY ship_uom) AS ship_uom,
    mode() WITHIN GROUP (ORDER BY price_uom) AS price_uom,
    mode() WITHIN GROUP (ORDER BY price_conversion_factor) AS units_per_price_uom,
    count(*) AS line_count
   FROM public.v_invoice_lines_complete
  WHERE price_uom IS NOT NULL
  GROUP BY item_number;

CREATE OR REPLACE VIEW public.v_invoice_audit_line AS
 WITH neg AS (
         SELECT DISTINCT ON (m.ship_to_number, pli.item_number) m.ship_to_number,
            pli.item_number,
            pli.unit_price AS negotiated_price,
            pli.unit AS negotiated_uom
           FROM abc_price_agreement_branch_matches m
             JOIN abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
          ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price
        )
 SELECT l.id AS line_id,
    l.invoice_number,
    l.item_number,
    l.item_description,
    l.price_qty AS quantity,
    l.price_uom AS uom,
    round(l.price_per_uom, 4) AS unit_price,
    NULLIF(l.raw ->> 'extendedPriceAmount'::text, ''::text)::numeric AS extended_price,
        CASE
            WHEN NOT n.negotiated_uom IS DISTINCT FROM l.price_uom THEN round(n.negotiated_price, 4)
            ELSE NULL::numeric
        END AS negotiated_price,
        CASE
            WHEN n.negotiated_price IS NOT NULL AND n.negotiated_price <> 0::numeric AND NOT n.negotiated_uom IS DISTINCT FROM l.price_uom AND l.price_per_uom IS NOT NULL THEN round((l.price_per_uom - n.negotiated_price) / n.negotiated_price * 100::numeric, 2)
            ELSE NULL::numeric
        END AS variance_pct,
        CASE
            WHEN n.negotiated_price IS NOT NULL AND NOT n.negotiated_uom IS DISTINCT FROM l.price_uom AND l.price_per_uom IS NOT NULL AND l.price_qty IS NOT NULL THEN round((l.price_per_uom - n.negotiated_price) * l.price_qty, 2)
            ELSE NULL::numeric
        END AS variance_ext,
    l.price_qty IS NOT NULL AND l.price_qty <> 0::numeric AND l.price_per_uom IS NOT NULL AS is_auditable,
    COALESCE(o.category_key, classify_roof_system(l.item_description, l.item_number)) AS category_key,
    n.negotiated_uom,
    n.negotiated_price IS NOT NULL AND n.negotiated_uom IS DISTINCT FROM l.price_uom AS uom_mismatch
   FROM v_invoice_lines_complete l
     JOIN abc_invoices i ON i.invoice_number = l.invoice_number
     LEFT JOIN neg n ON n.ship_to_number = i.ship_to_number AND n.item_number = l.item_number
     LEFT JOIN item_roof_system_category o ON o.item_number = l.item_number;

CREATE OR REPLACE VIEW public.v_invoice_audit_invoice AS
 WITH neg AS (
         SELECT DISTINCT ON (m.ship_to_number, pli.item_number) m.ship_to_number,
            pli.item_number,
            pli.unit_price AS negotiated_price,
            pli.unit AS negotiated_uom
           FROM abc_price_agreement_branch_matches m
             JOIN abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
          ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price
        ), priced AS (
         SELECT l.invoice_number,
            l.id AS line_id,
            l.price_qty AS qty,
            NULLIF(l.raw ->> 'extendedPriceAmount'::text, ''::text)::numeric AS ext,
            l.price_per_uom AS eff_price,
                CASE
                    WHEN NOT n.negotiated_uom IS DISTINCT FROM l.price_uom THEN n.negotiated_price
                    ELSE NULL::numeric
                END AS negotiated_price,
            cur.audit_status,
            cur.decision
           FROM v_invoice_lines_complete l
             JOIN abc_invoices i_1 ON i_1.invoice_number = l.invoice_number
             LEFT JOIN neg n ON n.ship_to_number = i_1.ship_to_number AND n.item_number = l.item_number
             LEFT JOIN v_invoice_line_audit_current cur ON cur.invoice_line_id = l.id
        ), roll AS (
         SELECT priced.invoice_number,
            count(*) AS line_count,
            count(*) FILTER (WHERE priced.negotiated_price IS NULL) AS no_price_lines,
            count(*) FILTER (WHERE priced.negotiated_price IS NOT NULL AND priced.negotiated_price <> 0::numeric AND priced.qty IS NOT NULL AND priced.qty <> 0::numeric AND abs((priced.eff_price - priced.negotiated_price) / priced.negotiated_price * 100::numeric) >= 0.01) AS flagged_lines,
            COALESCE(sum(
                CASE
                    WHEN priced.negotiated_price IS NOT NULL AND priced.qty > 0::numeric AND priced.eff_price > priced.negotiated_price AND COALESCE(priced.audit_status, ''::text) <> 'passed'::text THEN (priced.eff_price - priced.negotiated_price) * priced.qty
                    ELSE 0::numeric
                END), 0::numeric) AS at_risk,
            COALESCE(sum(
                CASE
                    WHEN priced.negotiated_price IS NOT NULL AND priced.qty > 0::numeric AND priced.eff_price > priced.negotiated_price AND priced.audit_status = 'passed'::text AND (priced.decision = ANY (ARRAY['credit-flag'::text, 'credit-noflag'::text])) THEN (priced.eff_price - priced.negotiated_price) * priced.qty
                    ELSE 0::numeric
                END), 0::numeric) AS credit_memo_amount,
            COALESCE(max(
                CASE
                    WHEN priced.negotiated_price IS NOT NULL AND priced.negotiated_price <> 0::numeric AND priced.qty IS NOT NULL AND priced.qty <> 0::numeric THEN abs((priced.eff_price - priced.negotiated_price) / priced.negotiated_price * 100::numeric)
                    ELSE 0::numeric
                END), 0::numeric) AS worst_pct
           FROM priced
          GROUP BY priced.invoice_number
        )
 SELECT i.invoice_number,
    i.ship_to_number,
    i.invoice_date,
    i.order_date,
    i.total_amount,
    i.is_credit_memo,
    i.sales_type,
    i.purchase_order_number,
    i.order_name,
    rb.no AS branch_number,
    COALESCE(NULLIF(avb.branch_name, ''::text), NULLIF(vb.branch_name, ''::text), rb.nm, 'Branch '::text || COALESCE(rb.no, i.ship_to_number)) AS branch_name,
    COALESCE(( SELECT o.name
           FROM office o
          WHERE o.id = vb.pricing_territory_office_id), NULLIF(TRIM(BOTH FROM (COALESCE(rb.city, avb.city, ''::text) || ', '::text) || COALESCE(rb.state, avb.state, ''::text)), ','::text) || ' area'::text, 'Unassigned'::text) AS office,
    COALESCE(rb.city, avb.city, ''::text) AS branch_city,
    COALESCE(rb.state, avb.state, ''::text) AS branch_state,
    COALESCE(r.line_count, 0::bigint) AS line_count,
    COALESCE(r.no_price_lines, 0::bigint) AS no_price_lines,
    COALESCE(r.flagged_lines, 0::bigint) AS flagged_lines,
    round(COALESCE(r.at_risk, 0::numeric), 2) AS at_risk,
    round(COALESCE(r.worst_pct, 0::numeric), 2) AS worst_pct,
    round(COALESCE(r.credit_memo_amount, 0::numeric), 2) AS credit_memo_amount
   FROM abc_invoices i
     CROSS JOIN LATERAL ( SELECT NULLIF((i.raw -> 'branch'::text) ->> 'number'::text, ''::text) AS no,
            NULLIF((i.raw -> 'branch'::text) ->> 'name'::text, ''::text) AS nm,
            NULLIF((i.raw -> 'branch'::text) ->> 'city'::text, ''::text) AS city,
            NULLIF((i.raw -> 'branch'::text) ->> 'state'::text, ''::text) AS state) rb
     LEFT JOIN LATERAL ( SELECT a.branch_name,
            a.city,
            a.state
           FROM abc_vendor_branches a
          WHERE rb.no IS NOT NULL AND ltrim(a.branch_number, '0'::text) = ltrim(rb.no, '0'::text)
         LIMIT 1) avb ON true
     LEFT JOIN LATERAL ( SELECT v.branch_name,
            v.pricing_territory_office_id
           FROM vendor_branches v
          WHERE rb.no IS NOT NULL AND ltrim(v.branch_number, '0'::text) = ltrim(rb.no, '0'::text)
          ORDER BY (v.pricing_territory_office_id IS NOT NULL) DESC
         LIMIT 1) vb ON true
     LEFT JOIN roll r ON r.invoice_number = i.invoice_number;

CREATE OR REPLACE VIEW public.v_branch_item_spend AS
 SELECT COALESCE(NULLIF(ltrim((i.raw -> 'branch'::text) ->> 'number'::text, '0'::text), ''::text), (i.raw -> 'branch'::text) ->> 'number'::text) AS branch_number,
    l.item_number,
    sum(l.price_qty) AS qty_36mo,
    round(sum(COALESCE(l.extended_price, NULLIF(l.raw ->> 'extendedPriceAmount'::text, ''::text)::numeric)), 2) AS spend_36mo,
    count(*) AS line_count,
    max(i.invoice_date) AS last_purchased_at,
    mode() WITHIN GROUP (ORDER BY l.price_uom) AS price_uom
   FROM v_invoice_lines_complete l
     JOIN abc_invoices i ON i.invoice_number = l.invoice_number
  WHERE i.invoice_date >= (CURRENT_DATE - '3 years'::interval) AND NULLIF((i.raw -> 'branch'::text) ->> 'number'::text, ''::text) IS NOT NULL AND l.item_number IS NOT NULL
  GROUP BY (COALESCE(NULLIF(ltrim((i.raw -> 'branch'::text) ->> 'number'::text, '0'::text), ''::text), (i.raw -> 'branch'::text) ->> 'number'::text)), l.item_number;

CREATE OR REPLACE VIEW public.v_recent_invoice_price AS
 SELECT DISTINCT ON (i.ship_to_number, l.item_number) i.ship_to_number,
    l.item_number,
    l.price_per_uom AS unit_price,
    i.invoice_date::date AS invoice_date,
    l.price_uom
   FROM v_invoice_lines_complete l
     JOIN abc_invoices i ON i.invoice_number = l.invoice_number
  WHERE i.invoice_date >= (CURRENT_DATE - 60) AND l.price_per_uom IS NOT NULL
  ORDER BY i.ship_to_number, l.item_number, i.invoice_date DESC;

CREATE OR REPLACE VIEW public.v_invoice_line_audit_eval AS
 WITH m AS (
         SELECT DISTINCT ON (l.id) l.id AS invoice_line_id,
            l.invoice_number,
            l.item_number,
            i.invoice_date,
            l.price_per_uom AS unit_price,
            l.price_uom,
            pa.id AS agreement_id,
            pa.effective_date,
            pa.expiry_date,
            pli.unit_price AS negotiated_price,
            pli.unit AS negotiated_uom,
            CURRENT_DATE >= pa.effective_date AND (pa.expiry_date IS NULL OR CURRENT_DATE <= pa.expiry_date) AS agreement_current
           FROM v_invoice_lines_complete l
             JOIN abc_invoices i ON i.invoice_number = l.invoice_number
             JOIN abc_price_agreement_branch_matches bm ON bm.ship_to_number = i.ship_to_number
             JOIN abc_price_agreements pa ON pa.id = bm.abc_price_agreement_id
             JOIN abc_price_list_items pli ON pli.agreement_id = pa.id AND pli.item_number = l.item_number
          WHERE i.invoice_date >= pa.effective_date AND (pa.expiry_date IS NULL OR i.invoice_date <= pa.expiry_date)
          ORDER BY l.id, bm.confidence_score DESC NULLS LAST, pli.unit_price
        )
 SELECT invoice_line_id,
    invoice_number,
    item_number,
    invoice_date,
    unit_price,
    agreement_id,
    effective_date,
    expiry_date,
    negotiated_price,
    agreement_current,
    round(abs(unit_price - negotiated_price), 2) AS price_diff,
    NOT negotiated_uom IS DISTINCT FROM price_uom AND round(unit_price, 2) = round(negotiated_price, 2) AS price_matches,
    price_uom,
    negotiated_uom
   FROM m;

CREATE OR REPLACE VIEW public.v_credit_memo_audit AS
 WITH cm AS (
         SELECT c.invoice_number,
            c.invoice_date,
            c.total_amount,
            c.ship_to_number,
            c.original_invoice_reference,
            split_part(COALESCE(c.original_invoice_reference, ''::text), '-'::text, 1) AS orig_root
           FROM abc_invoices c
          WHERE c.is_credit_memo OR c.total_amount < 0::numeric
        ), orig AS (
         SELECT cm_1.invoice_number AS cm_inv,
            ( SELECT i.invoice_number
                   FROM abc_invoices i
                  WHERE cm_1.orig_root <> ''::text AND split_part(i.invoice_number, '-'::text, 1) = cm_1.orig_root
                  ORDER BY (i.invoice_number = (cm_1.orig_root || '-001'::text)) DESC, i.invoice_number
                 LIMIT 1) AS orig_inv
           FROM cm cm_1
        ), ln AS (
         SELECT cm_1.invoice_number AS cm_inv,
                CASE
                    WHEN ol.unit_price IS NULL THEN 'no_original'::text
                    WHEN round(cl.unit_price, 2) = round(ol.unit_price, 2) THEN 'match'::text
                    ELSE 'mismatch'::text
                END AS st
           FROM cm cm_1
             JOIN orig o_1 ON o_1.cm_inv = cm_1.invoice_number
             JOIN v_invoice_lines_complete cl ON cl.invoice_number = cm_1.invoice_number
             LEFT JOIN v_invoice_lines_complete ol ON ol.invoice_number = o_1.orig_inv AND ol.item_number = cl.item_number
        ), brmatch AS (
         SELECT DISTINCT ON (abc_price_agreement_branch_matches.ship_to_number) abc_price_agreement_branch_matches.ship_to_number,
            abc_price_agreement_branch_matches.branch_number
           FROM abc_price_agreement_branch_matches
          ORDER BY abc_price_agreement_branch_matches.ship_to_number, abc_price_agreement_branch_matches.confidence_score DESC NULLS LAST
        )
 SELECT cm.invoice_number,
    cm.invoice_date,
    cm.total_amount AS credit_amount,
    cm.ship_to_number,
    cm.original_invoice_reference,
    o.orig_inv AS original_invoice_number,
    COALESCE(NULLIF(avb.branch_name, ''::text), 'Branch '::text || COALESCE(bm.branch_number, cm.ship_to_number)) AS branch_name,
    COALESCE(agg.matched, 0::bigint) AS matched_lines,
    COALESCE(agg.mismatch, 0::bigint) AS mismatch_lines,
    COALESCE(agg.no_orig, 0::bigint) AS unmatched_lines,
    COALESCE(agg.matched, 0::bigint) + COALESCE(agg.mismatch, 0::bigint) + COALESCE(agg.no_orig, 0::bigint) AS line_count,
        CASE
            WHEN o.orig_inv IS NULL THEN 'no_reference'::text
            WHEN COALESCE(agg.mismatch, 0::bigint) > 0 THEN 'mismatch'::text
            WHEN COALESCE(agg.no_orig, 0::bigint) > 0 THEN 'partial'::text
            WHEN COALESCE(agg.matched, 0::bigint) > 0 THEN 'matches'::text
            ELSE 'no_reference'::text
        END AS match_status
   FROM cm
     JOIN orig o ON o.cm_inv = cm.invoice_number
     LEFT JOIN brmatch bm ON bm.ship_to_number = cm.ship_to_number
     LEFT JOIN abc_vendor_branches avb ON avb.branch_number = bm.branch_number
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE ln.st = 'match'::text) AS matched,
            count(*) FILTER (WHERE ln.st = 'mismatch'::text) AS mismatch,
            count(*) FILTER (WHERE ln.st = 'no_original'::text) AS no_orig
           FROM ln
          WHERE ln.cm_inv = cm.invoice_number) agg ON true;

CREATE OR REPLACE VIEW public.v_abc_invoice_lines_with_pdf AS
 SELECT t.id,
    t.invoice_number,
    t.line_key,
    t.line_number,
    t.item_number,
    t.item_description,
    t.quantity,
    t.uom,
    t.unit_price,
    t.extended_price,
    t.raw,
    t.created_at,
    t.updated_at,
    t.effective_unit_price,
    d.storage_bucket,
    d.storage_path,
    d.original_filename,
    d.customer_number AS pdf_customer_number,
    t.ship_uom,
    t.ship_qty,
    t.price_uom,
    t.price_qty,
    t.price_per_uom
   FROM v_invoice_lines_complete t
     LEFT JOIN invoice_documents d ON d.invoice_number = t.invoice_number;
