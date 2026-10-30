-- 217 — office-silo the legacy ship-to fallback arm (docs/81 §4 addendum).
-- Applied to prod 2026-08-06.
--
-- Chris 2026-08-06: "price agreements are office specific and can't be shared
-- amongst PE offices due to regional pricing structures." The same disease
-- migration 208 cured across VENDORS existed across OFFICES within ABC: the
-- legacy ship-to fallback (arm C of migration 201; pri-2 arm of migration 209)
-- joined agreements purely via abc_price_agreement_branch_matches.ship_to_number.
-- The fuzzy matcher attached every agreement in the 2036874-x national-account
-- family to every ship-to in the family at confidence 80, so Denver's -9,
-- Kansas City's -20, and Wichita's -16 priced each other's offices' invoices.
--
-- Measured before this migration (prod, 2026-08-06): 188 invoice lines priced
-- by an out-of-office agreement, 94 flagged as overcharges, 65 claim rows on
-- 46 APPROVED credit-memo requests totaling $3,212.04 of erroneous claims.
-- No affected CM had been sent (sent/received are history and untouchable).
--
-- Fix: every arm that reads abc_price_agreement_branch_matches now requires the
-- agreement to be in the invoice's / ship-to's own office set
-- (mv_office_agreement_versions ∋ (office_id, agreement_id)). The fallback arm
-- survives only for same-office matches (its remaining value: superseded
-- versions and no-regression coverage inside the silo). Invoices with no
-- pricing office read No-Price rather than risk a wrong-office challenge.
--
-- Remediation in the same wave: credit_memo_claims_sync_all() re-aligned every
-- open CM against the fixed engine (migration 212 machinery) — cross-office
-- claim rows flip to 'engine_resolved', CMs retotal, empty CMs cancel.
--
-- Views replaced (column lists unchanged): v_invoice_audit_line,
-- v_invoice_audit_invoice, v_order_audit_line, v_order_audit_order.

CREATE OR REPLACE VIEW public.v_invoice_audit_line AS
 SELECT l.id AS line_id,
    l.invoice_number,
    l.item_number,
    l.item_description,
    l.price_qty AS quantity,
    l.price_uom AS uom,
    round(l.price_per_uom, 4) AS unit_price,
    NULLIF(l.raw ->> 'extendedPriceAmount', '')::numeric AS extended_price,
        CASE
            WHEN NOT neg.negotiated_uom IS DISTINCT FROM l.price_uom THEN round(neg.negotiated_price, 4)
            ELSE NULL::numeric
        END AS negotiated_price,
        CASE
            WHEN neg.negotiated_price IS NOT NULL AND neg.negotiated_price <> 0::numeric AND NOT neg.negotiated_uom IS DISTINCT FROM l.price_uom AND l.price_per_uom IS NOT NULL THEN round((l.price_per_uom - neg.negotiated_price) / neg.negotiated_price * 100::numeric, 2)
            ELSE NULL::numeric
        END AS variance_pct,
        CASE
            WHEN neg.negotiated_price IS NOT NULL AND NOT neg.negotiated_uom IS DISTINCT FROM l.price_uom AND l.price_per_uom IS NOT NULL AND l.price_qty IS NOT NULL THEN round((l.price_per_uom - neg.negotiated_price) * l.price_qty, 2)
            ELSE NULL::numeric
        END AS variance_ext,
    l.price_qty IS NOT NULL AND l.price_qty <> 0::numeric AND l.price_per_uom IS NOT NULL AS is_auditable,
    COALESCE(o.category_key, classify_roof_system(l.item_description, l.item_number)) AS category_key,
    neg.negotiated_uom,
    neg.negotiated_price IS NOT NULL AND neg.negotiated_uom IS DISTINCT FROM l.price_uom AS uom_mismatch,
    neg.agreement_id AS negotiated_agreement_id
   FROM v_invoice_lines_complete l
     JOIN abc_invoices i ON i.invoice_number = l.invoice_number
     LEFT JOIN LATERAL (
        SELECT c.negotiated_price, c.negotiated_uom, c.agreement_id
        FROM (
          -- arm A: exact item number on office in-force agreements
          SELECT pli.unit_price AS negotiated_price, pli.unit AS negotiated_uom, oav.agreement_id, 1 AS pri,
                 (upper(COALESCE(pli.unit, '')) = upper(COALESCE(l.price_uom, ''))) AS unit_match,
                 1 AS match_rank, pli.unit_price AS price_order, NULL::numeric AS legacy_order
          FROM mv_invoice_pricing_office io
          JOIN mv_office_agreement_versions oav ON oav.office_id = io.office_id
            AND (i.invoice_date IS NULL OR oav.effective_date IS NULL OR oav.effective_date <= i.invoice_date)
            AND NOT EXISTS (
              SELECT 1 FROM mv_office_agreement_versions o2
              WHERE o2.office_id = oav.office_id AND o2.agreement_number = oav.agreement_number
                AND (i.invoice_date IS NULL OR o2.effective_date <= i.invoice_date)
                AND o2.effective_date > oav.effective_date)
          JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id
            AND pli.item_number = l.item_number
          WHERE io.invoice_number = l.invoice_number
          UNION ALL
          -- arm B: description match (trigram-GIN-driven; equality/prefix rank above fuzzy)
          SELECT pli.unit_price, pli.unit, oav.agreement_id, 1,
                 (upper(COALESCE(pli.unit, '')) = upper(COALESCE(l.price_uom, ''))),
                 CASE WHEN pli.description_normalized = lower(l.item_description)
                        OR lower(l.item_description) LIKE pli.description_normalized || '%' THEN 2
                      ELSE 3 END,
                 pli.unit_price, NULL::numeric
          FROM mv_invoice_pricing_office io
          JOIN mv_office_agreement_versions oav ON oav.office_id = io.office_id
            AND (i.invoice_date IS NULL OR oav.effective_date IS NULL OR oav.effective_date <= i.invoice_date)
            AND NOT EXISTS (
              SELECT 1 FROM mv_office_agreement_versions o2
              WHERE o2.office_id = oav.office_id AND o2.agreement_number = oav.agreement_number
                AND (i.invoice_date IS NULL OR o2.effective_date <= i.invoice_date)
                AND o2.effective_date > oav.effective_date)
          JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id
            AND pli.description_normalized % lower(l.item_description)
            AND similarity(pli.description_normalized, lower(l.item_description)) >= 0.45
          WHERE io.invoice_number = l.invoice_number
          UNION ALL
          -- arm C: legacy ship-to fallback — OFFICE-SILOED (217): the matched
          -- agreement must belong to the invoice's own pricing office.
          SELECT pli.unit_price, pli.unit, a.id, 2,
                 true, 1, pli.unit_price,
                 row_number() OVER (ORDER BY a.effective_date DESC NULLS LAST, m.confidence_score DESC NULLS LAST, pli.unit_price)
          FROM abc_price_agreement_branch_matches m
          JOIN abc_price_agreements a ON a.id = m.abc_price_agreement_id
          JOIN abc_price_list_items pli ON pli.agreement_id = a.id AND pli.item_number = l.item_number
          WHERE m.ship_to_number = i.ship_to_number AND a.agreement_number !~~* 'API-%'
            AND (a.effective_date IS NULL OR i.invoice_date IS NULL OR a.effective_date <= i.invoice_date)
            AND EXISTS (
              SELECT 1 FROM mv_invoice_pricing_office io2
              JOIN mv_office_agreement_versions oav2
                ON oav2.office_id = io2.office_id AND oav2.agreement_id = a.id
              WHERE io2.invoice_number = l.invoice_number)
        ) c
        ORDER BY c.pri, c.unit_match DESC, c.match_rank, COALESCE(c.legacy_order, 0), c.price_order
        LIMIT 1) neg ON true
     LEFT JOIN item_roof_system_category o ON o.item_number = l.item_number;

CREATE OR REPLACE VIEW public.v_invoice_audit_invoice AS
 WITH priced AS (
         SELECT l.invoice_number,
            l.id AS line_id,
            l.price_qty AS qty,
            NULLIF(l.raw ->> 'extendedPriceAmount', '')::numeric AS ext,
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
                            upper(COALESCE(pli.unit, '')) = upper(COALESCE(l.price_uom, '')) AS unit_match,
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
                            upper(COALESCE(pli.unit, '')) = upper(COALESCE(l.price_uom, '')),
                                CASE
                                    WHEN pli.description_normalized = lower(l.item_description) OR lower(l.item_description) LIKE pli.description_normalized || '%' THEN 2
                                    ELSE 3
                                END,
                            pli.unit_price,
                            NULL::numeric
                           FROM mv_invoice_pricing_office io
                             JOIN mv_office_agreement_versions oav ON oav.office_id = io.office_id AND (i_1.invoice_date IS NULL OR oav.effective_date IS NULL OR oav.effective_date <= i_1.invoice_date) AND NOT (EXISTS ( SELECT 1
                                   FROM mv_office_agreement_versions o2
                                  WHERE o2.office_id = oav.office_id AND o2.agreement_number = oav.agreement_number AND (i_1.invoice_date IS NULL OR o2.effective_date <= i_1.invoice_date) AND o2.effective_date > oav.effective_date))
                             JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id AND pli.description_normalized % lower(l.item_description) AND similarity(pli.description_normalized, lower(l.item_description)) >= 0.45
                          WHERE io.invoice_number = l.invoice_number
                        UNION ALL
                         -- legacy ship-to fallback — OFFICE-SILOED (217)
                         SELECT pli.unit_price,
                            pli.unit,
                            2,
                            true,
                            1,
                            pli.unit_price,
                            row_number() OVER (ORDER BY a.effective_date DESC NULLS LAST, m.confidence_score DESC NULLS LAST, pli.unit_price)
                           FROM abc_price_agreement_branch_matches m
                             JOIN abc_price_agreements a ON a.id = m.abc_price_agreement_id
                             JOIN abc_price_list_items pli ON pli.agreement_id = a.id AND pli.item_number = l.item_number
                          WHERE m.ship_to_number = i_1.ship_to_number AND a.agreement_number !~~* 'API-%'
                            AND (a.effective_date IS NULL OR i_1.invoice_date IS NULL OR a.effective_date <= i_1.invoice_date)
                            AND EXISTS ( SELECT 1 FROM mv_invoice_pricing_office io2
                                  JOIN mv_office_agreement_versions oav2 ON oav2.office_id = io2.office_id AND oav2.agreement_id = a.id
                                  WHERE io2.invoice_number = l.invoice_number)) c
                  ORDER BY c.pri, c.unit_match DESC, c.match_rank, COALESCE(c.legacy_order, 0::numeric), c.price_order
                 LIMIT 1) neg ON true
             LEFT JOIN v_invoice_line_audit_current cur ON cur.invoice_line_id = l.id
        ), roll AS (
         SELECT priced.invoice_number,
            count(*) AS line_count,
            count(*) FILTER (WHERE priced.negotiated_price IS NULL) AS no_price_lines,
            count(*) FILTER (WHERE priced.negotiated_price IS NOT NULL AND priced.negotiated_price <> 0::numeric AND priced.qty IS NOT NULL AND priced.qty <> 0::numeric AND abs((priced.eff_price - priced.negotiated_price) / priced.negotiated_price * 100::numeric) >= 0.01) AS flagged_lines,
            COALESCE(sum(
                CASE
                    WHEN priced.negotiated_price IS NOT NULL AND priced.qty > 0::numeric AND priced.eff_price > priced.negotiated_price AND (COALESCE(priced.audit_status, '') <> ALL (ARRAY['passed'::text, 'disputed'::text])) THEN (priced.eff_price - priced.negotiated_price) * priced.qty
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
    COALESCE(NULLIF(avb.branch_name, ''), NULLIF(vb.branch_name, ''), rb.nm, 'Branch ' || COALESCE(rb.no, i.ship_to_number)) AS branch_name,
    COALESCE(( SELECT o.name
           FROM office o
          WHERE o.id = vb.pricing_territory_office_id), NULLIF(TRIM(BOTH FROM (COALESCE(rb.city, avb.city, '') || ', ') || COALESCE(rb.state, avb.state, '')), ',') || ' area', 'Unassigned') AS office,
    COALESCE(rb.city, avb.city, '') AS branch_city,
    COALESCE(rb.state, avb.state, '') AS branch_state,
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
          WHERE rb.no IS NOT NULL AND ltrim(a.branch_number, '0') = ltrim(rb.no, '0')
         LIMIT 1) avb ON true
     LEFT JOIN LATERAL ( SELECT v.branch_name,
            v.pricing_territory_office_id
           FROM vendor_branches v
          WHERE rb.no IS NOT NULL AND ltrim(v.branch_number, '0') = ltrim(rb.no, '0')
          ORDER BY (v.pricing_territory_office_id IS NOT NULL) DESC
         LIMIT 1) vb ON true
     LEFT JOIN roll r ON r.invoice_number = i.invoice_number;

-- Order audit: same office-silo constraint on the pri-2 ship-to arm of the
-- shared neg CTE (migration 209 bodies otherwise unchanged).

CREATE OR REPLACE VIEW public.v_order_audit_line AS
 WITH neg AS (
         SELECT DISTINCT ON (u.ship_to_number, u.item_number) u.ship_to_number,
            u.item_number,
            u.negotiated_price,
            u.negotiated_uom
           FROM ( SELECT spo.ship_to_number,
                    pli.item_number,
                    pli.unit_price AS negotiated_price,
                    pli.unit AS negotiated_uom,
                    1 AS pri,
                    NULL::numeric AS conf
                   FROM v_ship_to_pricing_office spo
                     JOIN mv_office_agreement_versions oav ON oav.office_id = spo.office_id AND (oav.effective_date IS NULL OR oav.effective_date <= CURRENT_DATE) AND NOT (EXISTS ( SELECT 1
                           FROM mv_office_agreement_versions o2
                          WHERE o2.office_id = oav.office_id AND o2.agreement_number = oav.agreement_number AND o2.effective_date <= CURRENT_DATE AND o2.effective_date > oav.effective_date))
                     JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id
                UNION ALL
                 -- legacy ship-to arm — OFFICE-SILOED (217)
                 SELECT m.ship_to_number,
                    pli.item_number,
                    pli.unit_price,
                    pli.unit,
                    2,
                    m.confidence_score
                   FROM abc_price_agreement_branch_matches m
                     JOIN abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
                     JOIN v_ship_to_pricing_office spo2 ON spo2.ship_to_number = m.ship_to_number
                     JOIN mv_office_agreement_versions oav2 ON oav2.office_id = spo2.office_id AND oav2.agreement_id = m.abc_price_agreement_id) u
          ORDER BY u.ship_to_number, u.item_number, u.pri, u.negotiated_price, u.conf DESC NULLS LAST
        ), base AS (
         SELECT (l.order_number || '|') || l.line_key AS line_id,
            l.order_number,
            l.line_key,
            l.item_number,
            COALESCE(NULLIF(c.item_description, ''), NULLIF(c.marketing_description, ''), NULLIF(c.family_name, ''), '') AS item_description,
            NULLIF((l.raw -> 'orderedQty') ->> 'value', '')::numeric AS ord_qty,
            COALESCE(NULLIF((l.raw -> 'orderedQty') ->> 'uom', ''), NULLIF((l.raw -> 'orderedQty') ->> 'uomCode', '')) AS ord_uom,
            NULLIF((l.raw -> 'unitPrice') ->> 'value', '')::numeric AS ord_unit_price,
            NULLIF(l.raw ->> 'amount', '')::numeric AS amount,
            o.ship_to_number,
            um.ship_uom,
            um.price_uom,
            um.units_per_price_uom,
            n.negotiated_price,
            n.negotiated_uom,
            COALESCE(ovr.category_key, c.category_key) AS category_key
           FROM abc_order_lines l
             JOIN abc_orders o ON o.order_number = l.order_number
             LEFT JOIN abc_product_catalog c ON c.item_number = l.item_number
             LEFT JOIN v_item_uom_map um ON um.item_number = l.item_number
             LEFT JOIN neg n ON n.ship_to_number = o.ship_to_number AND n.item_number = l.item_number
             LEFT JOIN item_roof_system_category ovr ON ovr.item_number = l.item_number
        ), conv AS (
         SELECT b.line_id,
            b.order_number,
            b.line_key,
            b.item_number,
            b.item_description,
            b.ord_qty,
            b.ord_uom,
            b.ord_unit_price,
            b.amount,
            b.ship_to_number,
            b.ship_uom,
            b.price_uom,
            b.units_per_price_uom,
            b.negotiated_price,
            b.negotiated_uom,
            b.category_key,
            COALESCE(b.price_uom, b.ord_uom) AS canon_uom,
                CASE
                    WHEN b.price_uom IS NOT NULL AND b.ord_uom = b.ship_uom AND b.ship_uom IS DISTINCT FROM b.price_uom AND b.units_per_price_uom IS NOT NULL AND b.units_per_price_uom <> 0::numeric THEN b.units_per_price_uom
                    ELSE 1::numeric
                END AS conv_factor
           FROM base b
        )
 SELECT line_id,
    order_number,
    line_key,
    item_number,
    item_description,
        CASE
            WHEN ord_qty IS NOT NULL THEN round(ord_qty / conv_factor, 4)
            ELSE NULL::numeric
        END AS quantity,
    canon_uom AS uom,
        CASE
            WHEN ord_unit_price IS NOT NULL THEN round(ord_unit_price * conv_factor, 4)
            ELSE NULL::numeric
        END AS unit_price,
    amount AS extended_price,
        CASE
            WHEN NOT negotiated_uom IS DISTINCT FROM canon_uom THEN negotiated_price
            ELSE NULL::numeric
        END AS negotiated_price,
        CASE
            WHEN negotiated_price IS NOT NULL AND negotiated_price <> 0::numeric AND NOT negotiated_uom IS DISTINCT FROM canon_uom AND ord_unit_price IS NOT NULL THEN round((ord_unit_price * conv_factor - negotiated_price) / negotiated_price * 100::numeric, 2)
            ELSE NULL::numeric
        END AS variance_pct,
        CASE
            WHEN negotiated_price IS NOT NULL AND NOT negotiated_uom IS DISTINCT FROM canon_uom AND ord_unit_price IS NOT NULL AND ord_qty IS NOT NULL THEN round((ord_unit_price * conv_factor - negotiated_price) * (ord_qty / conv_factor), 2)
            ELSE NULL::numeric
        END AS variance_ext,
    negotiated_price IS NOT NULL AND NOT negotiated_uom IS DISTINCT FROM canon_uom AS covered,
    category_key,
    negotiated_uom,
    negotiated_price IS NOT NULL AND negotiated_uom IS DISTINCT FROM canon_uom AS uom_mismatch
   FROM conv;

CREATE OR REPLACE VIEW public.v_order_audit_order AS
 WITH neg AS (
         SELECT DISTINCT ON (u.ship_to_number, u.item_number) u.ship_to_number,
            u.item_number,
            u.negotiated_price,
            u.negotiated_uom
           FROM ( SELECT spo.ship_to_number,
                    pli.item_number,
                    pli.unit_price AS negotiated_price,
                    pli.unit AS negotiated_uom,
                    1 AS pri,
                    NULL::numeric AS conf
                   FROM v_ship_to_pricing_office spo
                     JOIN mv_office_agreement_versions oav ON oav.office_id = spo.office_id AND (oav.effective_date IS NULL OR oav.effective_date <= CURRENT_DATE) AND NOT (EXISTS ( SELECT 1
                           FROM mv_office_agreement_versions o2
                          WHERE o2.office_id = oav.office_id AND o2.agreement_number = oav.agreement_number AND o2.effective_date <= CURRENT_DATE AND o2.effective_date > oav.effective_date))
                     JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id
                UNION ALL
                 -- legacy ship-to arm — OFFICE-SILOED (217)
                 SELECT m.ship_to_number,
                    pli.item_number,
                    pli.unit_price,
                    pli.unit,
                    2,
                    m.confidence_score
                   FROM abc_price_agreement_branch_matches m
                     JOIN abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
                     JOIN v_ship_to_pricing_office spo2 ON spo2.ship_to_number = m.ship_to_number
                     JOIN mv_office_agreement_versions oav2 ON oav2.office_id = spo2.office_id AND oav2.agreement_id = m.abc_price_agreement_id) u
          ORDER BY u.ship_to_number, u.item_number, u.pri, u.negotiated_price, u.conf DESC NULLS LAST
        ), conv AS (
         SELECT l.order_number,
            NULLIF((l.raw -> 'orderedQty') ->> 'value', '')::numeric AS ord_qty,
            NULLIF(l.raw ->> 'amount', '')::numeric AS amount,
                CASE
                    WHEN um.price_uom IS NOT NULL AND COALESCE(NULLIF((l.raw -> 'orderedQty') ->> 'uom', ''), NULLIF((l.raw -> 'orderedQty') ->> 'uomCode', '')) = um.ship_uom AND um.ship_uom IS DISTINCT FROM um.price_uom AND um.units_per_price_uom IS NOT NULL AND um.units_per_price_uom <> 0::numeric THEN um.units_per_price_uom
                    ELSE 1::numeric
                END AS conv_factor,
            COALESCE(um.price_uom, COALESCE(NULLIF((l.raw -> 'orderedQty') ->> 'uom', ''), NULLIF((l.raw -> 'orderedQty') ->> 'uomCode', ''))) AS canon_uom,
            NULLIF((l.raw -> 'unitPrice') ->> 'value', '')::numeric AS ord_unit_price,
            n.negotiated_price,
            n.negotiated_uom
           FROM abc_order_lines l
             JOIN abc_orders o_1 ON o_1.order_number = l.order_number
             LEFT JOIN v_item_uom_map um ON um.item_number = l.item_number
             LEFT JOIN neg n ON n.ship_to_number = o_1.ship_to_number AND n.item_number = l.item_number
        ), roll AS (
         SELECT conv.order_number,
            count(*) AS line_count,
            count(*) FILTER (WHERE conv.negotiated_price IS NOT NULL AND NOT conv.negotiated_uom IS DISTINCT FROM conv.canon_uom) AS covered_lines,
            count(*) FILTER (WHERE conv.negotiated_price IS NULL OR conv.negotiated_uom IS DISTINCT FROM conv.canon_uom) AS uncovered_lines,
            count(*) FILTER (WHERE conv.negotiated_price IS NOT NULL AND conv.negotiated_price <> 0::numeric AND NOT conv.negotiated_uom IS DISTINCT FROM conv.canon_uom AND conv.ord_unit_price IS NOT NULL AND abs((conv.ord_unit_price * conv.conv_factor - conv.negotiated_price) / conv.negotiated_price * 100::numeric) >= 0.01) AS flagged_lines,
            COALESCE(sum(
                CASE
                    WHEN conv.negotiated_price IS NOT NULL AND NOT conv.negotiated_uom IS DISTINCT FROM conv.canon_uom AND (conv.ord_unit_price * conv.conv_factor) > conv.negotiated_price THEN (conv.ord_unit_price * conv.conv_factor - conv.negotiated_price) * (conv.ord_qty / conv.conv_factor)
                    ELSE 0::numeric
                END), 0::numeric) AS at_risk,
            COALESCE(max(
                CASE
                    WHEN conv.negotiated_price IS NOT NULL AND conv.negotiated_price <> 0::numeric AND NOT conv.negotiated_uom IS DISTINCT FROM conv.canon_uom AND conv.ord_unit_price IS NOT NULL THEN abs((conv.ord_unit_price * conv.conv_factor - conv.negotiated_price) / conv.negotiated_price * 100::numeric)
                    ELSE 0::numeric
                END), 0::numeric) AS worst_pct,
            COALESCE(sum(conv.amount), 0::numeric) AS line_total
           FROM conv
          GROUP BY conv.order_number
        )
 SELECT o.order_number,
    (o.raw -> 'salesOrder') ->> 'purchaseOrder' AS purchase_order_number,
    COALESCE(NULLIF((o.raw -> 'salesOrder') ->> 'createdDate', ''), (o.raw -> 'dates') ->> 'orderedOn') AS ordered_on,
    (o.raw -> 'dates') ->> 'deliveryRequestedFor' AS delivery_requested_for,
    (o.raw -> 'salesOrder') ->> 'status' AS order_status,
    o.order_type,
    COALESCE(((o.raw -> 'orderAmounts') ->> 'total')::numeric, 0::numeric) AS order_total,
        CASE
            WHEN ((o.raw -> 'salesOrder') ->> 'status') ILIKE 'invoiced' OR COALESCE(NULLIF((o.raw -> 'salesOrder') ->> 'createdDate', ''), (o.raw -> 'dates') ->> 'orderedOn')::date < (CURRENT_DATE - 60) THEN 'archived'
            ELSE 'active'
        END AS disposition,
        CASE
            WHEN ((o.raw -> 'salesOrder') ->> 'status') ILIKE 'invoiced' THEN 'invoiced'
            WHEN COALESCE(NULLIF((o.raw -> 'salesOrder') ->> 'createdDate', ''), (o.raw -> 'dates') ->> 'orderedOn')::date < (CURRENT_DATE - 60) THEN 'aged_60d'
            ELSE NULL::text
        END AS archive_reason,
    o.branch_number,
    o.ship_to_number,
    COALESCE(NULLIF(avb.branch_name, ''), NULLIF(vb.branch_name, ''), 'Branch ' || COALESCE(o.branch_number, o.ship_to_number)) AS branch_name,
    COALESCE(( SELECT ofc.name
           FROM office ofc
          WHERE ofc.id = vb.pricing_territory_office_id), NULLIF(TRIM(BOTH FROM (COALESCE(avb.city, '') || ', ') || COALESCE(avb.state, '')), ',') || ' area', 'Unassigned') AS office,
    COALESCE(avb.city, '') AS branch_city,
    COALESCE(avb.state, '') AS branch_state,
    COALESCE(r.line_count, 0::bigint) AS line_count,
    COALESCE(r.covered_lines, 0::bigint) AS covered_lines,
    COALESCE(r.uncovered_lines, 0::bigint) AS uncovered_lines,
    COALESCE(r.flagged_lines, 0::bigint) AS flagged_lines,
    round(COALESCE(r.at_risk, 0::numeric), 2) AS at_risk,
    round(COALESCE(r.worst_pct, 0::numeric), 2) AS worst_pct,
    round(COALESCE(r.line_total, 0::numeric), 2) AS line_total
   FROM abc_orders o
     LEFT JOIN abc_vendor_branches avb ON avb.branch_number = o.branch_number
     LEFT JOIN vendor_branches vb ON vb.branch_number = o.branch_number AND vb.vendor_id = (( SELECT vendors.id
           FROM vendors
          WHERE vendors.slug = 'abc-supply'))
     LEFT JOIN roll r ON r.order_number = o.order_number;
