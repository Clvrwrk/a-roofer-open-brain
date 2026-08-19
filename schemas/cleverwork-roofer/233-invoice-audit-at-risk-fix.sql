-- 233 — v_invoice_audit_invoice.at_risk: stop treating a DISPUTED line as settled.
-- Additive + idempotent (CREATE OR REPLACE VIEW; no data touched, fully reversible).
--
-- Defect (found 2026-08-19 while reviewing /accounting/invoice-audit):
--   at_risk read $0.00 for EVERY invoice in the database while v_invoice_audit_line
--   carried $14,775.30 of positive variance across 285 lines. Same page, two numbers,
--   no agreement between them. Invoice 2004367179-001 is the clean example:
--   flagged_lines = 2 and at_risk = $0.00 out of the same CTE.
--
-- Cause: at_risk excluded every line whose audit_status was 'passed' OR 'disputed'.
--   'passed'   = a human looked and accepted the price      -> correctly excluded.
--   'disputed' = a human looked and says we were overcharged -> that is precisely the
--                money still at risk. Excluding it made the headline read $0 exactly
--                when a claim was live. 94 lines / $4,246.58 sat in that bucket.
--
-- Fix: exclude only 'passed'. Recovered money is already tracked separately by
--   credit_memo_amount (passed + credit-flag/credit-noflag), so the two stay distinct:
--     at_risk            = overcharge NOT yet accepted as correct
--     credit_memo_amount = overcharge accepted and turned into a credit claim
--
-- Nothing else in the view changes: column list, order, types, the ABC branch and the
-- SRS branch price resolution are all byte-identical to the prior definition.

CREATE OR REPLACE VIEW public.v_invoice_audit_invoice AS
 WITH priced AS (
         SELECT l.invoice_number,
            l.id AS line_id,
            l.price_qty AS qty,
            NULLIF(l.raw ->> 'extendedPriceAmount'::text, ''::text)::numeric AS ext,
            l.price_per_uom AS eff_price,
                CASE
                    WHEN NOT neg.negotiated_uom IS DISTINCT FROM l.price_uom THEN neg.negotiated_price
                    ELSE NULL::numeric
                END AS negotiated_price,
            cur.audit_status,
            cur.decision
           FROM v_invoice_lines_complete l
             JOIN abc_invoices i_1 ON i_1.invoice_number = l.invoice_number
             LEFT JOIN LATERAL ( SELECT c.negotiated_price,
                    c.negotiated_uom
                   FROM ( SELECT pli.unit_price AS negotiated_price,
                            pli.unit AS negotiated_uom,
                            1 AS pri,
                            upper(COALESCE(pli.unit, ''::text)) = upper(COALESCE(l.price_uom, ''::text)) AS unit_match,
                            1 AS match_rank,
                            pli.unit_price AS price_order,
                            NULL::numeric AS legacy_order
                           FROM mv_invoice_pricing_office io
                             JOIN mv_office_agreement_versions oav ON oav.office_id = io.office_id AND (i_1.invoice_date IS NULL OR oav.effective_date IS NULL OR oav.effective_date <= i_1.invoice_date) AND NOT (EXISTS ( SELECT 1
                                   FROM mv_office_agreement_versions o2
                                  WHERE o2.office_id = oav.office_id AND o2.agreement_number = oav.agreement_number AND (i_1.invoice_date IS NULL OR o2.effective_date <= i_1.invoice_date) AND o2.effective_date > oav.effective_date))
                             JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id AND pli.item_number = l.item_number
                          WHERE io.invoice_number = l.invoice_number
                        UNION ALL
                         SELECT pli.unit_price,
                            pli.unit,
                            1,
                            upper(COALESCE(pli.unit, ''::text)) = upper(COALESCE(l.price_uom, ''::text)),
                                CASE
                                    WHEN pli.description_normalized = lower(l.item_description) OR lower(l.item_description) ~~ (pli.description_normalized || '%'::text) THEN 2
                                    ELSE 3
                                END AS "case",
                            pli.unit_price,
                            NULL::numeric AS "numeric"
                           FROM mv_invoice_pricing_office io
                             JOIN mv_office_agreement_versions oav ON oav.office_id = io.office_id AND (i_1.invoice_date IS NULL OR oav.effective_date IS NULL OR oav.effective_date <= i_1.invoice_date) AND NOT (EXISTS ( SELECT 1
                                   FROM mv_office_agreement_versions o2
                                  WHERE o2.office_id = oav.office_id AND o2.agreement_number = oav.agreement_number AND (i_1.invoice_date IS NULL OR o2.effective_date <= i_1.invoice_date) AND o2.effective_date > oav.effective_date))
                             JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id AND pli.description_normalized % lower(l.item_description) AND similarity(pli.description_normalized, lower(l.item_description)) >= 0.45::double precision
                          WHERE io.invoice_number = l.invoice_number
                        UNION ALL
                         SELECT pli.unit_price,
                            pli.unit,
                            2,
                            true,
                            1,
                            pli.unit_price,
                            row_number() OVER (ORDER BY a.effective_date DESC NULLS LAST, m.confidence_score DESC NULLS LAST, pli.unit_price) AS row_number
                           FROM abc_price_agreement_branch_matches m
                             JOIN abc_price_agreements a ON a.id = m.abc_price_agreement_id
                             JOIN abc_price_list_items pli ON pli.agreement_id = a.id AND pli.item_number = l.item_number
                          WHERE m.ship_to_number = i_1.ship_to_number AND a.agreement_number !~~* 'API-%'::text AND (a.effective_date IS NULL OR i_1.invoice_date IS NULL OR a.effective_date <= i_1.invoice_date) AND (EXISTS ( SELECT 1
                                   FROM mv_invoice_pricing_office io2
                                     JOIN mv_office_agreement_versions oav2 ON oav2.office_id = io2.office_id AND oav2.agreement_id = a.id
                                  WHERE io2.invoice_number = l.invoice_number))) c
                  ORDER BY c.pri, c.unit_match DESC, c.match_rank, (COALESCE(c.legacy_order, 0::numeric)), c.price_order
                 LIMIT 1) neg ON true
             LEFT JOIN v_invoice_line_audit_current cur ON cur.invoice_line_id = l.id
        ), roll AS (
         SELECT priced.invoice_number,
            count(*) AS line_count,
            count(*) FILTER (WHERE priced.negotiated_price IS NULL) AS no_price_lines,
            count(*) FILTER (WHERE priced.negotiated_price IS NOT NULL AND priced.negotiated_price <> 0::numeric AND priced.qty IS NOT NULL AND priced.qty <> 0::numeric AND abs((priced.eff_price - priced.negotiated_price) / priced.negotiated_price * 100::numeric) >= 0.01) AS flagged_lines,
            COALESCE(sum(
                CASE
                    -- 233: 'disputed' is money still at risk, not money settled.
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
     CROSS JOIN LATERAL ( SELECT i.branch_number_extracted AS no,
            i.branch_name_extracted AS nm,
            i.branch_city_extracted AS city,
            i.branch_state_extracted AS state) rb
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
     LEFT JOIN roll r ON r.invoice_number = i.invoice_number
UNION ALL
 SELECT vi.invoice_number,
    COALESCE(vi.branch_key, ''::text) AS ship_to_number,
    vi.invoice_date,
    vi.order_date,
    vi.total_due AS total_amount,
    vi.doc_type = 'credit'::text AS is_credit_memo,
    vi.order_type AS sales_type,
    vi.po_number AS purchase_order_number,
    vi.job_name AS order_name,
    vi.branch_key AS branch_number,
    COALESCE(NULLIF(vb.branch_name, ''::text), 'Branch '::text || COALESCE(vi.branch_key, '?'::text)) AS branch_name,
    COALESCE(( SELECT o.name
           FROM office o
          WHERE o.id = vb.pricing_territory_office_id), 'Unassigned'::text) AS office,
    COALESCE(vb.city, ''::text) AS branch_city,
    COALESCE(vb.state, ''::text) AS branch_state,
    COALESCE(vr.line_count, 0::bigint) AS line_count,
    COALESCE(vr.no_price_lines, 0::bigint) AS no_price_lines,
    COALESCE(vr.flagged_lines, 0::bigint) AS flagged_lines,
    round(COALESCE(vr.at_risk, 0::numeric), 2) AS at_risk,
    round(COALESCE(vr.worst_pct, 0::numeric), 2) AS worst_pct,
    round(COALESCE(vr.credit_memo_amount, 0::numeric), 2) AS credit_memo_amount
   FROM vendor_invoices vi
     LEFT JOIN vendor_branches vb ON vb.id = vi.vendor_branch_id
     LEFT JOIN LATERAL ( SELECT count(*) AS line_count,
            count(*) FILTER (WHERE p.negotiated_price IS NULL) AS no_price_lines,
            count(*) FILTER (WHERE p.negotiated_price IS NOT NULL AND p.negotiated_price <> 0::numeric AND p.qty IS NOT NULL AND p.qty <> 0::numeric AND abs((p.eff_price - p.negotiated_price) / p.negotiated_price * 100::numeric) >= 0.01) AS flagged_lines,
            COALESCE(sum(
                CASE
                    -- 233: 'disputed' is money still at risk, not money settled.
                    WHEN p.negotiated_price IS NOT NULL AND p.qty > 0::numeric AND p.eff_price > p.negotiated_price AND COALESCE(p.audit_status, ''::text) <> 'passed'::text THEN (p.eff_price - p.negotiated_price) * p.qty
                    ELSE 0::numeric
                END), 0::numeric) AS at_risk,
            COALESCE(sum(
                CASE
                    WHEN p.negotiated_price IS NOT NULL AND p.qty > 0::numeric AND p.eff_price > p.negotiated_price AND p.audit_status = 'passed'::text AND (p.decision = ANY (ARRAY['credit-flag'::text, 'credit-noflag'::text])) THEN (p.eff_price - p.negotiated_price) * p.qty
                    ELSE 0::numeric
                END), 0::numeric) AS credit_memo_amount,
            COALESCE(max(
                CASE
                    WHEN p.negotiated_price IS NOT NULL AND p.negotiated_price <> 0::numeric AND p.qty IS NOT NULL AND p.qty <> 0::numeric THEN abs((p.eff_price - p.negotiated_price) / p.negotiated_price * 100::numeric)
                    ELSE 0::numeric
                END), 0::numeric) AS worst_pct
           FROM ( SELECT vl.price_qty AS qty,
                    vl.price_per_uom AS eff_price,
                        CASE
                            WHEN NOT g.negotiated_uom IS DISTINCT FROM vl.price_uom THEN g.negotiated_price
                            ELSE NULL::numeric
                        END AS negotiated_price,
                    cur.audit_status,
                    cur.decision
                   FROM vendor_invoice_lines vl
                     LEFT JOIN v_invoice_line_audit_current cur ON cur.invoice_line_id = vl.id
                     LEFT JOIN LATERAL ( SELECT pai.negotiated_price,
                            pai.price_uom AS negotiated_uom
                           FROM price_agreements pa
                             JOIN vendor_branches vb2 ON vb2.id = pa.vendor_branch_id AND vb2.pricing_territory_office_id = vb.pricing_territory_office_id
                             JOIN price_agreement_items pai ON pai.agreement_id = pa.id AND (pai.raw_item_number = vl.item_number OR pai.raw_description_normalized = lower(vl.item_description))
                          WHERE pa.vendor_id = vi.vendor_id AND pa.is_active IS NOT FALSE AND (pa.effective_date IS NULL OR vi.invoice_date IS NULL OR pa.effective_date <= vi.invoice_date)
                          ORDER BY (upper(COALESCE(pai.price_uom, ''::text)) = upper(COALESCE(vl.price_uom, ''::text))) DESC, pai.negotiated_price
                         LIMIT 1) g ON true
                  WHERE vl.invoice_id = vi.id) p) vr ON true;

COMMENT ON VIEW public.v_invoice_audit_invoice IS
  'Invoice-level audit rollup (ABC + vendor_invoices). at_risk = overcharge on lines not yet accepted as correct (audit_status <> ''passed''); disputed lines stay AT RISK because the money has not come back yet (migration 233). credit_memo_amount tracks the accepted-and-claimed slice separately.';
