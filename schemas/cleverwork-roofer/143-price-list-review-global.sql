-- 143-price-list-review-global.sql
-- Price List Review hierarchy — data foundation (P4).
--
-- Target hierarchy:
--   PE Office → GLOBAL PRICE LIST → Vendor → Vendor/Branch → Current Agreement → Archived Agreements
--
-- This migration delivers the GLOBAL PRICE LIST level: one row per (PE office, item) that
-- aggregates, across all branches "within 2 hours" of the office, the:
--   • Lowest OPEN invoice price   (ar_status='open', effective price_per_uom)
--   • API price                   (current ABC API price)
--   • Min | Max | Mean negotiated price (across the office's branches' agreements)
--
-- "Branches within 2 hours" = branches that share the office's pricing_territory_office_id.
-- That assignment IS the office's 120-minute google_routes_bearing_v1 drive-time isochrone
-- (schema 70-vendor-territory-pricing). We reuse that existing true-drive-time grouping rather
-- than computing a parallel one (branch_office_candidate.drive_minutes is currently unpopulated).
--
-- UOM: every price is expressed in the item's price_uom — the canonical "Global Price List UOM"
-- (docs/46). Invoice prices use price_per_uom (already in price_uom). API prices quoted in the
-- ship/stocking unit are converted up via units_per_price_uom — mirroring schemas 121 & 128.
-- Negotiated agreement prices are quoted in price_uom by contract, so need no conversion.
--
-- Item universe = the Global Price Agreement set (frequently_ordered_import), matching the
-- Price Agreement Audit scope. Additive + idempotent (CREATE OR REPLACE VIEW).

CREATE OR REPLACE VIEW public.v_price_list_global AS
WITH gpa AS (
  SELECT DISTINCT item_number FROM public.frequently_ordered_import WHERE item_number IS NOT NULL
),
terr AS ( -- each office's territory branches (the "within 2 hours" group)
  SELECT o.id AS office_id, o.name AS office_name,
         regexp_replace(vb.branch_number, '^0+', '') AS bn
  FROM public.office o
  JOIN public.vendor_branches vb ON vb.pricing_territory_office_id = o.id
),
offices AS (SELECT DISTINCT office_id, office_name FROM terr),
ship AS ( -- ship-to numbers that belong to each office's territory branches
  SELECT DISTINCT t.office_id, m.ship_to_number
  FROM terr t
  JOIN public.abc_price_agreement_branch_matches m
    ON regexp_replace(m.branch_number, '^0+', '') = t.bn
  WHERE m.ship_to_number IS NOT NULL
),
neg AS ( -- negotiated prices across the office's branches (agreement unit = price_uom)
  SELECT t.office_id,
         pli.item_number,
         min(pli.unit_price)         AS neg_min,
         max(pli.unit_price)         AS neg_max,
         round(avg(pli.unit_price), 4) AS neg_mean,
         count(*)                    AS neg_samples
  FROM terr t
  JOIN public.abc_price_agreement_branch_matches m
    ON regexp_replace(m.branch_number, '^0+', '') = t.bn
  JOIN public.abc_price_list_items pli
    ON pli.agreement_id = m.abc_price_agreement_id
  GROUP BY t.office_id, pli.item_number
),
open_inv AS ( -- lowest OPEN invoice price per office+item (price_per_uom already canonical)
  SELECT s.office_id,
         l.item_number,
         min(l.price_per_uom) AS lowest_open_invoice_price,
         count(*)             AS open_invoice_samples
  FROM ship s
  JOIN public.abc_invoices i
    ON i.ship_to_number = s.ship_to_number AND i.ar_status = 'open'
  JOIN public.v_invoice_lines_complete l
    ON l.invoice_number = i.invoice_number AND l.price_per_uom IS NOT NULL
  GROUP BY s.office_id, l.item_number
),
api AS ( -- representative API price per office+item, normalized to canonical price_uom
  SELECT t.office_id,
         a.item_number,
         min(
           CASE
             WHEN um.price_uom IS NOT NULL
              AND a.api_uom = um.ship_uom
              AND um.ship_uom IS DISTINCT FROM um.price_uom
              AND um.units_per_price_uom IS NOT NULL AND um.units_per_price_uom <> 0
             THEN a.api_price * um.units_per_price_uom
             ELSE a.api_price
           END
         ) AS api_price_canonical
  FROM terr t
  JOIN public.v_branch_item_api_price a ON a.branch_number_norm = t.bn
  LEFT JOIN public.v_item_uom_map um ON um.item_number = a.item_number
  GROUP BY t.office_id, a.item_number
)
SELECT
  o.office_id,
  o.office_name,
  g.item_number,
  COALESCE(um.price_uom, n_uom.unit) AS canonical_uom,
  oi.lowest_open_invoice_price,
  oi.open_invoice_samples,
  ap.api_price_canonical,
  n.neg_min,
  n.neg_max,
  n.neg_mean,
  n.neg_samples
FROM gpa g
CROSS JOIN offices o
LEFT JOIN public.v_item_uom_map um ON um.item_number = g.item_number
LEFT JOIN neg n      ON n.office_id  = o.office_id AND n.item_number  = g.item_number
LEFT JOIN open_inv oi ON oi.office_id = o.office_id AND oi.item_number = g.item_number
LEFT JOIN api ap     ON ap.office_id = o.office_id AND ap.item_number = g.item_number
-- canonical UOM fallback when the item has no learned UOM map row: the agreement unit.
LEFT JOIN LATERAL (
  SELECT pli.unit
  FROM public.abc_price_list_items pli
  WHERE pli.item_number = g.item_number AND pli.unit IS NOT NULL
  LIMIT 1
) n_uom ON true
-- keep only rows where the office actually has at least one price signal for the item.
WHERE n.item_number IS NOT NULL OR oi.item_number IS NOT NULL OR ap.item_number IS NOT NULL;

COMMENT ON VIEW public.v_price_list_global IS
  'Global Price List level of the Price List Review hierarchy: per PE office + GPA item, the '
  'lowest OPEN invoice price, API price, and min|max|mean negotiated price aggregated across all '
  'branches within the office''s 2-hour drive-time territory (pricing_territory_office_id). All '
  'prices in the item canonical price_uom (docs/46). Reuses the territory/UOM model from schemas 70/121/128.';

GRANT SELECT ON public.v_price_list_global TO service_role;
REVOKE ALL ON public.v_price_list_global FROM anon, authenticated;
