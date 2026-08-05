-- 201 (a-e) — Audit engine cutover to office-inherited pricing (docs/81 §4, docs/82 R1)
-- Approved by Chris 2026-08-05 ("cut over now"). Applied to prod 2026-08-05 as five
-- migrations (201, 201b fuzzy tier, 201c matviews, 201d matview repoint, 201e split arms);
-- this file is the CONSOLIDATED final state.
--
-- BEFORE: the negotiated_price lateral joined agreements ONLY via ship-to branch-matches —
-- 2-hr-window inheriting branches read 100% No-Price (baseline: 5,878/6,464 lines).
-- AFTER (final): office-first, invoice-date-effective, lowest-price-wins with three arms:
--   A: exact item_number on office in-force agreements (rank 1)
--   B: description match via trigram GIN (equality/prefix rank 2, fuzzy >= 0.45 rank 3)
--      — needed because agreements like Richardson's PA-1 carry their own item numbering
--   C: legacy ship-to fallback (pre-201 behavior, pri 2) so no previously-priced line regresses
-- In-force = newest version per agreement_number effective <= invoice_date (evergreen —
-- expiry never disqualifies, docs/81 §4). Pick order: pri, unit-matched, match_rank, lowest price.
-- Helpers materialized (mv_invoice_pricing_office, mv_office_agreement_versions) with a
-- 15-min pg_cron refresh — plain views recomputed per line cost ~30s; final: ~1.7s full scan.
-- RESULT (2026-08-05): No-Price 5,878 -> 3,946 · flagged 486 -> 789 · UOM-review 0 -> 106 ·
-- unaudited gross overcharge $6,627.58 -> $10,922.09. View output columns unchanged.

CREATE INDEX IF NOT EXISTS idx_abc_pli_desc_trgm
  ON public.abc_price_list_items USING gin (description_normalized gin_trgm_ops);

CREATE OR REPLACE VIEW public.v_office_agreement_versions AS
SELECT DISTINCT vb.pricing_territory_office_id AS office_id,
       a.id AS agreement_id,
       COALESCE(a.agreement_number, 'PA-' || a.id) AS agreement_number,
       a.effective_date,
       a.expiry_date
FROM abc_price_agreements a
LEFT JOIN abc_price_agreement_branch_matches m ON m.abc_price_agreement_id = a.id
JOIN vendor_branches vb
  ON vb.pricing_status = 'covered'
 AND vb.pricing_territory_office_id IS NOT NULL
 AND NULLIF(regexp_replace(COALESCE(vb.branch_number, ''), '^0+', ''), '')
     = NULLIF(regexp_replace(COALESCE(a.branch_number, m.branch_number), '^0+', ''), '')
WHERE COALESCE(a.agreement_number, '') !~* '^API-'
  AND EXISTS (SELECT 1 FROM abc_price_list_items i WHERE i.agreement_id = a.id);

CREATE OR REPLACE VIEW public.v_invoice_pricing_office AS
SELECT DISTINCT ON (i.invoice_number)
       i.invoice_number,
       vb.pricing_territory_office_id AS office_id
FROM abc_invoices i
JOIN abc_ship_to_branch_access sba ON sba.ship_to_number = i.ship_to_number AND sba.home_branch = true
JOIN vendor_branches vb ON vb.branch_number = sba.branch_number AND vb.pricing_status = 'covered'
WHERE vb.pricing_territory_office_id IS NOT NULL
ORDER BY i.invoice_number;

-- 201c — materialized helpers (tiny; refreshed every 15 min by pg_cron)
DROP MATERIALIZED VIEW IF EXISTS public.mv_office_agreement_versions;
CREATE MATERIALIZED VIEW public.mv_office_agreement_versions AS
SELECT * FROM public.v_office_agreement_versions;
CREATE UNIQUE INDEX IF NOT EXISTS mv_office_agreement_versions_uq
  ON public.mv_office_agreement_versions (office_id, agreement_id);

DROP MATERIALIZED VIEW IF EXISTS public.mv_invoice_pricing_office;
CREATE MATERIALIZED VIEW public.mv_invoice_pricing_office AS
SELECT * FROM public.v_invoice_pricing_office;
CREATE UNIQUE INDEX IF NOT EXISTS mv_invoice_pricing_office_uq
  ON public.mv_invoice_pricing_office (invoice_number);

SELECT cron.schedule('refresh-office-pricing-matviews', '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_office_agreement_versions;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_pricing_office;$$);

-- 201e — final audit views (three-arm lateral)
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
          -- arm C: legacy ship-to fallback (pre-201 behavior)
          SELECT pli.unit_price, pli.unit, a.id, 2,
                 true, 1, pli.unit_price,
                 row_number() OVER (ORDER BY a.effective_date DESC NULLS LAST, m.confidence_score DESC NULLS LAST, pli.unit_price)
          FROM abc_price_agreement_branch_matches m
          JOIN abc_price_agreements a ON a.id = m.abc_price_agreement_id
          JOIN abc_price_list_items pli ON pli.agreement_id = a.id AND pli.item_number = l.item_number
          WHERE m.ship_to_number = i.ship_to_number AND a.agreement_number !~~* 'API-%'
            AND (a.effective_date IS NULL OR i.invoice_date IS NULL OR a.effective_date <= i.invoice_date)
        ) c
        ORDER BY c.pri, c.unit_match DESC, c.match_rank, COALESCE(c.legacy_order, 0), c.price_order
        LIMIT 1) neg ON true
     LEFT JOIN item_roof_system_category o ON o.item_number = l.item_number;

-- v_invoice_audit_invoice: identical priced-CTE lateral (aliases i_1/l); roll CTE + invoice
-- rollup body unchanged from migration 200. Full applied text lives in Supabase migration
-- history as 201e_office_pricing_split_arms (2026-08-05).
