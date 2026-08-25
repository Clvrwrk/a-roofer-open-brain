-- 277 — item-aware version supersession (the evergreen rule, applied per ITEM).
--
-- Chris, 2026-08-25. Companion to 272/273; supersedes nothing.
--
-- THE RULE (Chris, confirmed 2026-08-25): "All agreements remain in effect until
-- the vendor provides a new agreement." Active for ABC, SRS and QXO. QXO has never
-- had a binding agreement, so its lines legitimately fall to the No-Price triage.
-- ABC and SRS DO have binding agreements, so every line on every invoice must be
-- audited against the last known vendor price.
--
-- THE BUG. `renewal_mode = 'evergreen'` already keeps an expired agreement pricing
-- lines, and all 13 agreements on file are tagged evergreen — so expiry was never
-- the problem. The problem is one level down, in version supersession.
--
-- `mv_office_agreement_versions` carries one row per (office, agreement_number,
-- effective_date). The audit picked the NEWEST version effective on or before the
-- invoice date and then joined items ONLY from that version:
--
--     AND NOT EXISTS (SELECT 1 FROM mv_office_agreement_versions o2
--                     WHERE o2.office_id = oav.office_id
--                       AND o2.agreement_number = oav.agreement_number
--                       AND o2.effective_date <= i.invoice_date
--                       AND o2.effective_date > oav.effective_date)
--
-- That clause is item-blind. It reads a newer version's item list as the complete
-- world, so an item the newer list happens to omit loses its benchmark entirely and
-- falls out as No-Price — even though the vendor never repriced it.
--
-- Wichita is the live case. Agreement 2036874-16 has four versions:
--     id   4  eff 2025-09-15  131 items
--     id   5  eff 2026-04-27  111 items
--     id   7  eff 2026-06-01  164 items
--     id 105  eff 2026-06-15  157 items   <- August invoices resolved here
-- Of the 77 distinct items that came out No-Price on August Wichita invoices,
-- 17 are priced in v4/v5/v7 and ZERO appear in v105. A shorter new list does not
-- repeal the prices it omits.
--
-- THE FIX. Make supersession item-aware: a newer version supersedes an older one
-- ONLY FOR THE ITEMS IT ACTUALLY PRICES. Applied to all three ABC arms, each using
-- that arm's own item-match predicate (exact / fuzzy / branch-match).
--
-- Strictly additive by construction: when the newer version DOES carry the item the
-- clause is unchanged, so the winner is unchanged. Extra candidates appear only for
-- items a newer version dropped. Simulated over all 5,642 auditable ABC lines before
-- applying: 191 lines newly priced, 0 existing benchmarks changed, 0 lost.
--
-- The UOM gate is untouched — the audit still refuses rather than converts (docs/46).
-- The office and vendor gates are untouched (docs/105). The final tie-break still
-- picks the LOWEST price.
--
-- Additive + idempotent: CREATE OR REPLACE VIEW, same column list and types, so the
-- dependent mv_invoice_audit_line / v_invoice_audit_line_cascade / v_no_price_repeats
-- keep working and simply see the corrected derivation on next refresh.

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
                  WHERE m.ship_to_number = i.ship_to_number AND a.agreement_number !~~* 'API-%'::text AND (a.renewal_mode = 'evergreen'::text OR a.expiry_date IS NULL OR i.invoice_date IS NULL OR a.expiry_date >= i.invoice_date) AND (a.effective_date IS NULL OR i.invoice_date IS NULL OR a.effective_date <= i.invoice_date) AND (EXISTS ( SELECT 1
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
          WHERE pa.vendor_id = vi.vendor_id AND pa.is_active IS NOT FALSE AND (pa.effective_date IS NULL OR vi.invoice_date IS NULL OR pa.effective_date <= vi.invoice_date) AND (pa.renewal_mode = 'evergreen'::text OR pa.expiry_date IS NULL OR vi.invoice_date IS NULL OR pa.expiry_date >= vi.invoice_date)
          ORDER BY (upper(COALESCE(pai.price_uom, ''::text)) = upper(COALESCE(vl.price_uom, ''::text))) DESC, (
                CASE
                    WHEN pai.raw_item_number = vl.item_number THEN 1
                    WHEN pai.raw_description_normalized = lower(vl.item_description) THEN 2
                    ELSE 3
                END), pai.negotiated_price
         LIMIT 1) g ON true
     LEFT JOIN item_roof_system_category o2 ON o2.item_number = vl.item_number;

COMMENT ON VIEW public.v_invoice_audit_line IS
  'Per-line price audit, UOM-aligned (docs/46), vendor/office/time/UOM silo-gated (docs/105). Version supersession is ITEM-AWARE (migration 277): a newer version of an agreement supersedes an older one only for the items it actually prices, so an item the newer price list omits keeps its last known negotiated price. This is the evergreen rule applied per item - all agreements remain in effect until the vendor provides a new one (Chris, 2026-08-25).';

commit;

-- Verification:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_audit_line;
--   -- expect: 191 more ABC lines carrying negotiated_price, 0 changed benchmarks
--   select count(*) filter (where negotiated_price is not null) from mv_invoice_audit_line;
