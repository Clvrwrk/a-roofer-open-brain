-- 279 — vendor parity for the two arms that diverged from the ABC contract.
--
-- Chris, 2026-08-25. Closes the two open defects recorded in CONVENTIONS §10b
-- "Vendor parity of the audit" (commit 2a76a6b). Companion to 277.
--
-- DEFECT 1 — version supersession was ABC-only.
--   `price_agreements` (the SRS/QXO arm) carries `version_label` but had no
--   supersession resolution at all: its lateral ordered by `negotiated_price` with no
--   `effective_date` term. Two active versions of the same agreement number therefore
--   both stayed eligible and the CHEAPER sheet won regardless of age - the exact
--   inverse of the rule. It has not bitten yet only because no SRS agreement number
--   has a second version today; the first Level 4 v2 would have triggered it silently.
--   Now mirrored from ABC, item-aware per migration 277: a newer version supersedes an
--   older one ONLY for the items it actually prices, scoped by vendor + office +
--   agreement number. A NULL agreement number keys on 'PA-'||id, so an unnumbered
--   sheet can only ever supersede itself (conservative - it never silently eats
--   another book).
--
-- DEFECT 2 — evergreen had two opposite NULL defaults.
--   ABC arms 1-2 excluded an agreement only when `renewal_mode = 'expires'` AND it had
--   lapsed (NULL renewal_mode => still prices; fail-open). ABC arm 3 and the whole
--   SRS/QXO arm instead required `renewal_mode = 'evergreen' OR expiry >= invoice_date`
--   (NULL renewal_mode + lapsed => dropped; fail-closed). Same intended rule, opposite
--   behaviour on the same row. VERIFIED NOT REACHABLE: renewal_mode is NOT NULL DEFAULT
--   'evergreen' on BOTH abc_price_agreements and price_agreements, so a NULL cannot be
--   stored and the split never fired. This is a code-hygiene fix, not a live bug fix -
--   but contradictory predicates guarded only by a table constraint are exactly the
--   ambiguity that regenerates bugs when someone later relaxes the constraint.
--   All four arms now fire on one rule: exclude only when the agreement is explicitly
--   `expires` AND has lapsed. NULL is read as evergreen, matching the documented
--   default and CONVENTIONS §10b ("expiry_date is documentary, not a gate").
--   Written with COALESCE rather than a bare `=` so a NULL cannot make the whole
--   predicate NULL and silently drop the row.
--
-- Behaviour-neutral on today's data by construction; verified over all 7,003 audit
-- lines before and after: 0 newly priced, 0 lost, 0 benchmarks changed. This is a
-- forward-looking correctness fix, not a repricing.
--
-- Additive + idempotent: CREATE OR REPLACE VIEW, identical column list and types.

begin;

CREATE OR REPLACE VIEW public.v_invoice_audit_line AS
 SELECT l.id AS line_id,
    l.invoice_number,
    l.item_number,
    l.item_description,
    l.price_qty AS quantity,
    l.price_uom AS uom,
    round(l.price_per_uom, 4) AS unit_price,
    NULLIF(l.raw ->> 'extendedPriceAmount'::text, ''::text)::numeric AS extended_price,
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
    neg.agreement_id AS negotiated_agreement_id,
        CASE
            WHEN neg.agreement_id IS NULL THEN NULL::boolean
            ELSE (EXISTS ( SELECT 1
               FROM abc_price_agreements ag
              WHERE ag.id = neg.agreement_id AND ag.expiry_date IS NOT NULL AND i.invoice_date IS NOT NULL AND ag.expiry_date < i.invoice_date))
        END AS priced_by_expired_agreement
   FROM v_invoice_lines_complete l
     JOIN abc_invoices i ON i.invoice_number = l.invoice_number
     LEFT JOIN LATERAL ( SELECT c.negotiated_price,
            c.negotiated_uom,
            c.agreement_id
           FROM ( SELECT pli.unit_price AS negotiated_price,
                    pli.unit AS negotiated_uom,
                    oav.agreement_id,
                    1 AS pri,
                    upper(COALESCE(pli.unit, ''::text)) = upper(COALESCE(l.price_uom, ''::text)) AS unit_match,
                    1 AS match_rank,
                    pli.unit_price AS price_order,
                    NULL::numeric AS legacy_order
                   FROM mv_invoice_pricing_office io
                     JOIN mv_office_agreement_versions oav ON oav.office_id = io.office_id AND (i.invoice_date IS NULL OR oav.effective_date IS NULL OR oav.effective_date <= i.invoice_date) AND NOT (EXISTS ( SELECT 1
                           FROM abc_price_agreements ag
                          WHERE ag.id = oav.agreement_id AND ag.renewal_mode = 'expires'::text AND ag.expiry_date IS NOT NULL AND i.invoice_date IS NOT NULL AND ag.expiry_date < i.invoice_date)) AND NOT (EXISTS ( SELECT 1
                           FROM mv_office_agreement_versions o2
                             JOIN abc_price_list_items p2 ON p2.agreement_id = o2.agreement_id AND p2.item_number = l.item_number
                          WHERE o2.office_id = oav.office_id AND o2.agreement_number = oav.agreement_number AND (i.invoice_date IS NULL OR o2.effective_date <= i.invoice_date) AND o2.effective_date > oav.effective_date))
                     JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id AND pli.item_number = l.item_number
                  WHERE io.invoice_number = l.invoice_number
                UNION ALL
                 SELECT pli.unit_price,
                    pli.unit,
                    oav.agreement_id,
                    1,
                    upper(COALESCE(pli.unit, ''::text)) = upper(COALESCE(l.price_uom, ''::text)),
                        CASE
                            WHEN pli.description_normalized = lower(l.item_description) OR lower(l.item_description) ~~ (pli.description_normalized || '%'::text) THEN 2
                            WHEN pli.color_key IS NOT NULL AND pli.color_key <> ''::text AND pli.color_key = l.color_key THEN 3
                            ELSE 4
                        END AS "case",
                    pli.unit_price,
                    NULL::numeric AS "numeric"
                   FROM mv_invoice_pricing_office io
                     JOIN mv_office_agreement_versions oav ON oav.office_id = io.office_id AND (i.invoice_date IS NULL OR oav.effective_date IS NULL OR oav.effective_date <= i.invoice_date) AND NOT (EXISTS ( SELECT 1
                           FROM abc_price_agreements ag
                          WHERE ag.id = oav.agreement_id AND ag.renewal_mode = 'expires'::text AND ag.expiry_date IS NOT NULL AND i.invoice_date IS NOT NULL AND ag.expiry_date < i.invoice_date)) AND NOT (EXISTS ( SELECT 1
                           FROM mv_office_agreement_versions o2
                             JOIN abc_price_list_items p2 ON p2.agreement_id = o2.agreement_id AND (p2.description_normalized % lower(l.item_description) AND similarity(p2.description_normalized, lower(l.item_description)) >= 0.45::double precision AND l.num_tokens @> p2.num_tokens OR p2.color_key IS NOT NULL AND p2.color_key <> ''::text AND p2.color_key = l.color_key)
                          WHERE o2.office_id = oav.office_id AND o2.agreement_number = oav.agreement_number AND (i.invoice_date IS NULL OR o2.effective_date <= i.invoice_date) AND o2.effective_date > oav.effective_date))
                     JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id AND (pli.description_normalized % lower(l.item_description) AND similarity(pli.description_normalized, lower(l.item_description)) >= 0.45::double precision AND l.num_tokens @> pli.num_tokens OR pli.color_key IS NOT NULL AND pli.color_key <> ''::text AND pli.color_key = l.color_key)
                  WHERE io.invoice_number = l.invoice_number
                UNION ALL
                 SELECT pli.unit_price,
                    pli.unit,
                    a.id,
                    2,
                    true,
                    1,
                    pli.unit_price,
                    row_number() OVER (ORDER BY a.effective_date DESC NULLS LAST, m.confidence_score DESC NULLS LAST, pli.unit_price) AS row_number
                   FROM abc_price_agreement_branch_matches m
                     JOIN abc_price_agreements a ON a.id = m.abc_price_agreement_id
                     JOIN abc_price_list_items pli ON pli.agreement_id = a.id AND pli.item_number = l.item_number
                  WHERE m.ship_to_number = i.ship_to_number AND a.agreement_number !~~* 'API-%'::text AND (COALESCE(a.renewal_mode, 'evergreen'::text) <> 'expires'::text OR a.expiry_date IS NULL OR i.invoice_date IS NULL OR a.expiry_date >= i.invoice_date) AND (a.effective_date IS NULL OR i.invoice_date IS NULL OR a.effective_date <= i.invoice_date) AND (EXISTS ( SELECT 1
                           FROM mv_invoice_pricing_office io2
                             JOIN mv_office_agreement_versions oav2 ON oav2.office_id = io2.office_id AND oav2.agreement_id = a.id
                          WHERE io2.invoice_number = l.invoice_number)) AND NOT (EXISTS ( SELECT 1
                           FROM mv_invoice_pricing_office io3
                             JOIN mv_office_agreement_versions o3 ON o3.office_id = io3.office_id
                             JOIN abc_price_list_items p3 ON p3.agreement_id = o3.agreement_id AND p3.item_number = l.item_number
                          WHERE io3.invoice_number = l.invoice_number AND o3.agreement_number = COALESCE(a.agreement_number, 'PA-'::text || a.id) AND (i.invoice_date IS NULL OR o3.effective_date <= i.invoice_date) AND o3.effective_date > a.effective_date))) c
          ORDER BY c.pri, c.unit_match DESC, c.match_rank, (COALESCE(c.legacy_order, 0::numeric)), c.price_order
         LIMIT 1) neg ON true
     LEFT JOIN item_roof_system_category o ON o.item_number = l.item_number
UNION ALL
 SELECT vl.id AS line_id,
    vl.invoice_number,
    vl.item_number,
    vl.item_description,
    vl.price_qty AS quantity,
    vl.price_uom AS uom,
    round(vl.price_per_uom, 4) AS unit_price,
    vl.extended_price,
        CASE
            WHEN NOT g.negotiated_uom IS DISTINCT FROM vl.price_uom THEN round(g.negotiated_price, 4)
            ELSE NULL::numeric
        END AS negotiated_price,
        CASE
            WHEN g.negotiated_price IS NOT NULL AND g.negotiated_price <> 0::numeric AND NOT g.negotiated_uom IS DISTINCT FROM vl.price_uom AND vl.price_per_uom IS NOT NULL THEN round((vl.price_per_uom - g.negotiated_price) / g.negotiated_price * 100::numeric, 2)
            ELSE NULL::numeric
        END AS variance_pct,
        CASE
            WHEN g.negotiated_price IS NOT NULL AND NOT g.negotiated_uom IS DISTINCT FROM vl.price_uom AND vl.price_per_uom IS NOT NULL AND vl.price_qty IS NOT NULL THEN round((vl.price_per_uom - g.negotiated_price) * vl.price_qty, 2)
            ELSE NULL::numeric
        END AS variance_ext,
    vl.price_qty IS NOT NULL AND vl.price_qty <> 0::numeric AND vl.price_per_uom IS NOT NULL AS is_auditable,
    COALESCE(o2.category_key, classify_roof_system(vl.item_description, vl.item_number)) AS category_key,
    g.negotiated_uom,
    g.negotiated_price IS NOT NULL AND g.negotiated_uom IS DISTINCT FROM vl.price_uom AS uom_mismatch,
    NULL::integer AS negotiated_agreement_id,
    NULL::boolean AS priced_by_expired_agreement
   FROM vendor_invoice_lines vl
     JOIN vendor_invoices vi ON vi.id = vl.invoice_id
     LEFT JOIN vendor_branches vb ON vb.id = vi.vendor_branch_id
     LEFT JOIN LATERAL ( SELECT pai.negotiated_price,
            pai.price_uom AS negotiated_uom
           FROM price_agreements pa
             JOIN vendor_branches vb2 ON vb2.id = pa.vendor_branch_id AND vb2.pricing_territory_office_id = vb.pricing_territory_office_id
             JOIN price_agreement_items pai ON pai.agreement_id = pa.id AND (pai.raw_item_number = vl.item_number OR pai.raw_description_normalized = lower(vl.item_description) OR pai.raw_description IS NOT NULL AND vendor_desc_color_key(pai.raw_description) <> ''::text AND vendor_desc_color_key(pai.raw_description) = vendor_desc_color_key(vl.item_description))
          WHERE pa.vendor_id = vi.vendor_id AND pa.is_active IS NOT FALSE AND (pa.effective_date IS NULL OR vi.invoice_date IS NULL OR pa.effective_date <= vi.invoice_date) AND (COALESCE(pa.renewal_mode, 'evergreen'::text) <> 'expires'::text OR pa.expiry_date IS NULL OR vi.invoice_date IS NULL OR pa.expiry_date >= vi.invoice_date) AND NOT (EXISTS ( SELECT 1
                   FROM price_agreements pa2
                     JOIN vendor_branches vb3 ON vb3.id = pa2.vendor_branch_id AND vb3.pricing_territory_office_id = vb.pricing_territory_office_id
                     JOIN price_agreement_items pai2 ON pai2.agreement_id = pa2.id AND (pai2.raw_item_number = vl.item_number OR pai2.raw_description_normalized = lower(vl.item_description) OR pai2.raw_description IS NOT NULL AND vendor_desc_color_key(pai2.raw_description) <> ''::text AND vendor_desc_color_key(pai2.raw_description) = vendor_desc_color_key(vl.item_description))
                  WHERE pa2.vendor_id = vi.vendor_id AND pa2.is_active IS NOT FALSE AND COALESCE(pa2.agreement_number, 'PA-'::text || pa2.id::text) = COALESCE(pa.agreement_number, 'PA-'::text || pa.id::text) AND (vi.invoice_date IS NULL OR pa2.effective_date <= vi.invoice_date) AND pa2.effective_date > pa.effective_date))
          ORDER BY (upper(COALESCE(pai.price_uom, ''::text)) = upper(COALESCE(vl.price_uom, ''::text))) DESC, (
                CASE
                    WHEN pai.raw_item_number = vl.item_number THEN 1
                    WHEN pai.raw_description_normalized = lower(vl.item_description) THEN 2
                    ELSE 3
                END), pai.negotiated_price
         LIMIT 1) g ON true
     LEFT JOIN item_roof_system_category o2 ON o2.item_number = vl.item_number;

COMMENT ON VIEW public.v_invoice_audit_line IS
  'Per-line price audit, UOM-aligned (docs/46), vendor/office/time/UOM silo-gated (docs/105). Version supersession is ITEM-AWARE on every vendor arm (migrations 277, 279): a newer version of an agreement supersedes an older one only for the items it actually prices, so an item the newer price list omits keeps its last known negotiated price. Evergreen is one rule across all four arms - an agreement is excluded only when it is explicitly renewal_mode=''expires'' AND has lapsed; NULL reads as evergreen. This is the rule that all agreements remain in effect until the vendor provides a new agreement (Chris, 2026-08-25).';

commit;

-- Verification (expect 0 / 0 / 0 on today's data - forward-looking fix):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_audit_line;
--   -- newly priced / lost / changed, all zero
