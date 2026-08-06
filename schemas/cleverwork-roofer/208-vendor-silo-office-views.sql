-- 208 — vendor silo hardening (Chris 2026-08-05: "all vendors should be siloed —
-- no vendor pricing should impact another vendor's price agreement status").
-- Applied to prod 2026-08-05.
--
-- The ABC arms of the office-agreement views joined agreements to vendor_branches
-- by NORMALIZED BRANCH NUMBER ALONE. QXO uses numeric branch numbers that collide
-- with ABC's (113, 249, 304, 412, ...) — once those branches became covered
-- (migration 207) the join could attribute ABC agreements to non-ABC branches.
-- Both arms now require the branch to belong to the ABC vendor.

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
JOIN vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'
WHERE COALESCE(a.agreement_number, '') !~* '^API-'
  AND EXISTS (SELECT 1 FROM abc_price_list_items i WHERE i.agreement_id = a.id);

CREATE OR REPLACE VIEW public.v_office_vendor_agreements AS
SELECT DISTINCT
       vb.pricing_territory_office_id AS office_id,
       vb.vendor_id,
       'abc'::text AS source,
       a.id::text AS agreement_key,
       COALESCE(a.agreement_number, 'PA-' || a.id) AS agreement_number,
       a.effective_date,
       a.expiry_date,
       (SELECT count(*)::int FROM public.abc_price_list_items i WHERE i.agreement_id = a.id) AS item_count
FROM public.abc_price_agreements a
LEFT JOIN public.abc_price_agreement_branch_matches m ON m.abc_price_agreement_id = a.id
JOIN public.vendor_branches vb
  ON vb.pricing_status = 'covered'
 AND vb.pricing_territory_office_id IS NOT NULL
 AND NULLIF(regexp_replace(COALESCE(vb.branch_number, ''), '^0+', ''), '')
     = NULLIF(regexp_replace(COALESCE(a.branch_number, m.branch_number), '^0+', ''), '')
JOIN public.vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'
WHERE COALESCE(a.agreement_number, '') !~* '^API-'
  AND EXISTS (SELECT 1 FROM public.abc_price_list_items i WHERE i.agreement_id = a.id)
UNION ALL
SELECT DISTINCT
       vb.pricing_territory_office_id,
       pa.vendor_id,
       'generic',
       pa.id::text,
       COALESCE(pa.agreement_number, 'PA-' || left(pa.id::text, 8)),
       pa.effective_date,
       pa.expiry_date,
       (SELECT count(*)::int FROM public.price_agreement_items i WHERE i.agreement_id = pa.id)
FROM public.price_agreements pa
JOIN public.vendor_branches vb ON vb.id = pa.vendor_branch_id
WHERE pa.is_active IS NOT FALSE
  AND vb.pricing_territory_office_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.price_agreement_items i WHERE i.agreement_id = pa.id);

-- (REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_office_agreement_versions
--  run separately — cannot execute inside a transaction block.)
