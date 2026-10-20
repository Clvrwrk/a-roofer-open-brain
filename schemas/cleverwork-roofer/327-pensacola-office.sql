-- 327 — Pensacola, FL office (Chris, 2026-10-20). Additive + idempotent.
--
-- New fixed (brick-and-mortar) Florida office at 545 Brent Lane #141, Pensacola, FL 32503.
-- Coordinates: US Census geocoder exact match "545 BRENT LN, PENSACOLA, FL, 32503"
-- (Public_AR_Current) → 30.474544, -87.222206.
--
-- TERRITORY: Chris ruled a 2-hour drive-time ring, the same as every other office (his
-- request said "two mile"; confirmed 2-hour on 2026-10-20 — a 2-mile ring would exclude
-- SRPEN, 8771 Ely Rd, ~7 mi away). The boundary is NOT written here: it is computed by
--   node scripts/compute-office-drive-time-boundary.mjs --office-id=4a1d6c2e-… --minutes=120
-- (google_routes_bearing_v1 via rpc set_office_boundary), then branches are classified by
--   node scripts/geocode-vendor-branches.mjs --assign-only   (rpc assign_branch_territories)
-- which marks every ABC / SRS / QXO branch inside exactly one active ring as covered.
--
-- region_id is left NULL: it only feeds the ABC regional path, and no ABC Florida book
-- exists. office x ABC posture is deliberately left unrecorded for Chris to rule on.

INSERT INTO public.office
  (id, name, office_type, region_id, address, city, state, postal_code,
   latitude, longitude, geocode_status, drive_time_minutes, is_active, notes)
VALUES
  ('4a1d6c2e-0f3b-4e8a-9c27-5e1b8d3f6a90'::uuid, 'Pensacola, FL', 'brick_mortar', NULL,
   '545 Brent Lane #141', 'Pensacola', 'FL', '32503',
   30.474544, -87.222206, 'manual', 120, true,
   '2026-10-20 (Chris): new fixed Florida office. 2-hour drive-time ring. Main SRS branch SRPEN (SRS Building Prod - Pensacola, 8771 Ely Rd). Coordinates from US Census geocoder exact match.')
ON CONFLICT (id) DO NOTHING;

-- office x vendor posture (mig 245 table). SRS has a book (mig 328); QXO has none by
-- design, the same posture recorded for every other active office.
INSERT INTO public.office_vendor_agreement_status (office_id, vendor_id, status, note, decided_by)
SELECT '4a1d6c2e-0f3b-4e8a-9c27-5e1b8d3f6a90'::uuid, ven.id, s.status, s.note, 'Chris Hussey'
  FROM (VALUES
    ('srs', 'active',  'SRS book from SRPEN quotes 2026-10-19 (mig 328), anchored to SRPEN; inherited by every SRS branch assigned to Pensacola.'),
    ('qxo', 'no_book', 'QXO: no negotiated book, same as every other office. QXO lines price as valid-as-billed by design.')
  ) AS s(slug, status, note)
  JOIN public.vendors ven ON ven.slug = s.slug
ON CONFLICT (office_id, vendor_id) DO UPDATE
   SET status = EXCLUDED.status, note = EXCLUDED.note,
       decided_by = EXCLUDED.decided_by, updated_at = now();

DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.office WHERE id = '4a1d6c2e-0f3b-4e8a-9c27-5e1b8d3f6a90' AND is_active) THEN
    RAISE EXCEPTION '327 Pensacola office row missing';
  END IF;
  SELECT count(*) INTO n FROM public.office_vendor_agreement_status
   WHERE office_id = '4a1d6c2e-0f3b-4e8a-9c27-5e1b8d3f6a90';
  IF n <> 2 THEN
    RAISE EXCEPTION '327 expected 2 office x vendor posture rows (srs, qxo), found %', n;
  END IF;
  RAISE NOTICE '327 ok — Pensacola, FL office created; compute its boundary next';
END $$;
