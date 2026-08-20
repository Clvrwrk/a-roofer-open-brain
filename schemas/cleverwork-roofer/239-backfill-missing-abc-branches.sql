-- 239 — backfill ABC branches that invoice against us but have no vendor_branches row.
-- Additive + idempotent (ON CONFLICT DO NOTHING on the (vendor_id, branch_number) key).
-- Applied to prod 2026-08-19.
--
-- Found while auditing the ABC/QXO branch-number collision (migration 238). Five ABC branch
-- numbers appear on real invoices with NO abc-supply row in vendor_branches at all — which
-- is exactly why the unscoped display lateral reached for QXO's row: ABC had nothing there.
-- The earlier read that "branches 472/184/516 have no office assigned" was WRONG; those
-- were QXO's rows. ABC's rows did not exist, and FOUR of the five sit INSIDE a 2-hour
-- office isochrone and should have been priced all along:
--
--   472 Lenexa, KS      -> Kansas City, MO             (Lenexa is KC metro)
--   184 Conley, GA      -> Atlanta (Jonesboro), GA
--   516 Doraville, GA   -> Atlanta (Jonesboro), GA
--   519 Smyrna, GA      -> Atlanta (Jonesboro), GA
--   036 Longview, TX    -> outside every boundary      (correctly out_of_boundary)
--
-- Geocodes come from abc_vendor_branches (the ABC branch master, 720 rows / 696 geocoded).
-- Office assignment is computed by ST_Contains against each office's stored 2-hour
-- isochrone (office.boundary, drive_time_minutes = 120) — the same rule the rest of the
-- territory model uses, not a hand assignment.
--
-- branch_number is stored BARE (not zero-padded) to match raw->'branch'->>'number', because
-- v_invoice_pricing_office joins vb.branch_number = i.branch_number_extracted with NO
-- normalisation. Existing ABC rows follow the same convention.
INSERT INTO public.vendor_branches
  (vendor_id, branch_number, branch_name, city, state, latitude, longitude,
   geocode_status, geocoded_at, pricing_territory_office_id, suggested_office_id,
   pricing_status, pricing_status_computed_at, territory_decided_by, territory_decided_at, notes)
SELECT
  (SELECT id FROM public.vendors WHERE slug = 'abc-supply'),
  ltrim(b.branch_number, '0'),
  b.branch_name, b.city, b.state, b.latitude, b.longitude,
  'ok', now(),
  o.id, o.id,
  CASE WHEN o.id IS NOT NULL THEN 'covered' ELSE 'out_of_boundary' END,
  now(),
  'migration-239 (isochrone containment)', now(),
  'Backfilled 2026-08-19: invoiced against us but missing from vendor_branches.'
FROM public.abc_vendor_branches b
LEFT JOIN LATERAL (
  SELECT o2.id FROM public.office o2
   WHERE o2.boundary IS NOT NULL
     AND ST_Contains(o2.boundary, ST_SetSRID(ST_MakePoint(b.longitude, b.latitude), 4326))
   LIMIT 1) o ON true
WHERE ltrim(b.branch_number, '0') IN ('472', '184', '516', '519', '36')
  AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
ON CONFLICT (vendor_id, branch_number) DO NOTHING;

REFRESH MATERIALIZED VIEW public.mv_invoice_pricing_office;
REFRESH MATERIALIZED VIEW public.mv_office_agreement_versions;

-- Verified after apply: all five rows exist with the offices above; the four covered ones
-- now resolve their PE office through the vendor-scoped pricing path. Their lines still
-- price as no-price, because the office->AGREEMENT gap is a separate problem — see docs/98:
-- Atlanta has no agreement for ANY vendor, and QXO has no agreement at ANY office.
