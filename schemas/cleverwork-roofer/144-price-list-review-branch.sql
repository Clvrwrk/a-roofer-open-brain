-- 144-price-list-review-branch.sql
-- Price List Review hierarchy — branch level (P4).
--
-- Builds on 143 (the Global Price List level). Delivers the two branch-level views the
-- nested Price List Review UI drills into:
--
--   PE Office → Global Price List → Vendor → Vendor/Branch → CURRENT agreement → ARCHIVED agreements
--                                                            └── v_price_list_branch_pricing ──┘ └ v_price_list_branch_agreements
--
--   • v_price_list_branch_pricing             — per (branch, item): the CURRENT negotiated price plus the
--                                        IMMEDIATE-LAST (prior) negotiated price, with the delta.
--                                        "Current" = the active-in-window agreement, else the most
--                                        recent; "prior" = the next agreement back that priced the item.
--   • v_price_list_branch_agreements  — per branch: every matched agreement newest→oldest, flagged
--                                        current vs archived, with item counts + date ranges.
--
-- Branch identity = vendor_branches.branch_number with leading zeros stripped (the normalized key
-- used in 143 and v_branch_price_list / 101). Agreement↔branch mapping = abc_price_agreement_branch_matches.
-- "Active" = current_date BETWEEN effective_date AND coalesce(expiry_date,'2999-01-01') (matches 101).
--
-- UOM: negotiated agreement prices are quoted in the item's price_uom by contract (docs/46), so they
-- need no conversion; canonical_uom is surfaced for a single consistent display unit per row.
-- Additive + idempotent (CREATE OR REPLACE VIEW). Service-role-only posture (CONVENTIONS §4).

-- ── One office per normalized branch (territory assignment), de-duplicated. ──────────────────
CREATE OR REPLACE VIEW public.v_pl_branch_office AS
SELECT DISTINCT ON (regexp_replace(vb.branch_number, '^0+', ''))
  regexp_replace(vb.branch_number, '^0+', '') AS branch_number,
  vb.pricing_territory_office_id              AS office_id,
  vb.branch_name,
  vb.city,
  vb.state
FROM public.vendor_branches vb
WHERE vb.branch_number IS NOT NULL
ORDER BY regexp_replace(vb.branch_number, '^0+', ''), vb.pricing_territory_office_id NULLS LAST;

-- ── Per (branch, item): current + immediate-prior negotiated price. ──────────────────────────
CREATE OR REPLACE VIEW public.v_price_list_branch_pricing AS
WITH matched AS (
  SELECT
    regexp_replace(m.branch_number, '^0+', '') AS branch_number,
    pli.item_number,
    pli.unit_price::numeric                    AS unit_price,
    pli.unit,
    pa.id                                      AS agreement_id,
    pa.agreement_number,
    pa.version_label,
    pa.effective_date,
    pa.expiry_date,
    (current_date BETWEEN pa.effective_date AND coalesce(pa.expiry_date, '2999-01-01')) AS agreement_active
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_agreements pa  ON pa.id = m.abc_price_agreement_id
  JOIN public.abc_price_list_items pli ON pli.agreement_id = pa.id
  WHERE m.branch_number IS NOT NULL AND pli.item_number IS NOT NULL
),
dedup AS ( -- an agreement can match a branch via several ship-tos; collapse to one price per agreement
  SELECT DISTINCT ON (branch_number, item_number, agreement_id)
    branch_number, item_number, unit_price, unit, agreement_id, agreement_number,
    version_label, effective_date, expiry_date, agreement_active
  FROM matched
  ORDER BY branch_number, item_number, agreement_id, effective_date DESC NULLS LAST
),
ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY branch_number, item_number
      ORDER BY agreement_active DESC, effective_date DESC NULLS LAST, agreement_id DESC
    ) AS rn
  FROM dedup
)
SELECT
  cur.branch_number,
  o.office_id,
  cur.item_number,
  pli_meta.description,
  pli_meta.manufacturer,
  pli_meta.category_key,
  COALESCE(um.price_uom, cur.unit)   AS canonical_uom,
  cur.unit_price                     AS current_price,
  cur.agreement_id                   AS current_agreement_id,
  cur.agreement_number               AS current_agreement_number,
  cur.effective_date                 AS current_effective_date,
  cur.expiry_date                    AS current_expiry_date,
  cur.agreement_active               AS current_active,
  prv.unit_price                     AS prior_price,
  prv.agreement_id                   AS prior_agreement_id,
  prv.agreement_number               AS prior_agreement_number,
  prv.effective_date                 AS prior_effective_date,
  prv.expiry_date                    AS prior_expiry_date,
  CASE WHEN prv.unit_price IS NOT NULL
       THEN round(cur.unit_price - prv.unit_price, 4) END AS price_delta,
  CASE WHEN prv.unit_price IS NOT NULL AND prv.unit_price <> 0
       THEN round((cur.unit_price - prv.unit_price) / prv.unit_price * 100, 2) END AS price_delta_pct
FROM ranked cur
LEFT JOIN ranked prv
  ON prv.branch_number = cur.branch_number AND prv.item_number = cur.item_number AND prv.rn = 2
LEFT JOIN public.v_item_uom_map um ON um.item_number = cur.item_number
LEFT JOIN public.v_pl_branch_office o ON o.branch_number = cur.branch_number
-- item description/manufacturer/category from any agreement line for the item (display only)
LEFT JOIN LATERAL (
  SELECT pli2.description, pli2.manufacturer,
         coalesce(irc.category_key, pli2.category_key) AS category_key
  FROM public.abc_price_list_items pli2
  LEFT JOIN public.item_roof_system_category irc ON irc.item_number = pli2.item_number
  WHERE pli2.item_number = cur.item_number
  ORDER BY pli2.id DESC
  LIMIT 1
) pli_meta ON true
WHERE cur.rn = 1;

COMMENT ON VIEW public.v_price_list_branch_pricing IS
  'Branch level of the Price List Review hierarchy: per (normalized branch, item) the current '
  'negotiated price and the immediate-prior (last-archived) negotiated price, with delta and pct. '
  'Current = active-in-window agreement else most recent; prior = next agreement back pricing the '
  'item. Price in the item canonical price_uom (docs/46). Builds on 101/143.';

-- ── Per branch: agreements newest→oldest (current + archived history). ───────────────────────
CREATE OR REPLACE VIEW public.v_price_list_branch_agreements AS
WITH bm AS (
  SELECT regexp_replace(m.branch_number, '^0+', '') AS branch_number,
         m.abc_price_agreement_id                   AS agreement_id,
         max(m.confidence_score)                    AS confidence_score
  FROM public.abc_price_agreement_branch_matches m
  WHERE m.branch_number IS NOT NULL
  GROUP BY 1, 2
),
counts AS (
  SELECT agreement_id, count(*) AS item_count
  FROM public.abc_price_list_items
  GROUP BY agreement_id
)
SELECT
  bm.branch_number,
  o.office_id,
  pa.id                AS agreement_id,
  pa.agreement_number,
  pa.version_label,
  pa.effective_date,
  pa.expiry_date,
  pa.staleness_status,
  pa.pdf_storage_path,
  bm.confidence_score,
  (current_date BETWEEN pa.effective_date AND coalesce(pa.expiry_date, '2999-01-01')) AS agreement_active,
  coalesce(c.item_count, 0) AS item_count,
  row_number() OVER (
    PARTITION BY bm.branch_number
    ORDER BY (current_date BETWEEN pa.effective_date AND coalesce(pa.expiry_date, '2999-01-01')) DESC,
             pa.effective_date DESC NULLS LAST, pa.id DESC
  ) AS recency_rank
FROM bm
JOIN public.abc_price_agreements pa ON pa.id = bm.agreement_id
LEFT JOIN counts c ON c.agreement_id = pa.id
LEFT JOIN public.v_pl_branch_office o ON o.branch_number = bm.branch_number;

COMMENT ON VIEW public.v_price_list_branch_agreements IS
  'Branch agreement history for the Price List Review hierarchy: every agreement matched to a '
  'normalized branch, newest→oldest (recency_rank=1 is current). Flags active vs archived with item '
  'counts and date ranges. Powers the Current → Archived Agreements drill-down.';

GRANT SELECT ON public.v_pl_branch_office,
                public.v_price_list_branch_pricing,
                public.v_price_list_branch_agreements TO service_role;
REVOKE ALL ON public.v_pl_branch_office       FROM anon, authenticated;
REVOKE ALL ON public.v_price_list_branch_pricing             FROM anon, authenticated;
REVOKE ALL ON public.v_price_list_branch_agreements  FROM anon, authenticated;
