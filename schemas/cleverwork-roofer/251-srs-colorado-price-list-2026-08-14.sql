-- 251 — SRS Colorado price list, effective 2026-08-14, becomes the Denver office book
-- (Chris, 2026-08-21). Additive + idempotent.
--
-- Source: "Pro Exteriors Colorado Pricing 8-14.pdf", delivered by Blake Wells (the same
-- SRS rep, "B WELLS", who issued quotes 0049345641 and 0049828559). No SRS letterhead —
-- it is an Excel export — but the catalog is built on TOP SHIELD, SRS's house brand, and
-- the rep authorship matches. Stored at agreements/colorado-srs-pricelist-aug2026.pdf.
--
-- SCOPE: the sheet is titled "Colorado Pricing" and carries no branch code. Agreements
-- resolve at the OFFICE level (a branch's pricing_territory_office_id), which is why
-- invoice 0049707508-001 on SBP-DENVER prices off the AMSDE-bound Englewood quote. It is
-- therefore anchored to AMSDE, the same branch the existing Colorado book uses, so it
-- covers all 10 covered SRS branches in the Denver (Greenwood Village), CO territory.
--
-- SUPERSESSION: the Englewood quote (0049345641, 2026-05-28 → 2026-06-27) stays active
-- and is NOT archived — 11 re-audit lines cite it and it remains the correct book for its
-- own window. Date windows decide which applies; this one is open-ended from 2026-08-14.
-- No Colorado SRS invoice has landed since 2026-08-14, so nothing re-prices retroactively.
--
-- APPROVAL: per Chris (2026-08-21) the ceo_verified gate is retired — an agreement that
-- has been added is approved and active. Recorded verified here for that reason; see
-- migration 252, which retires the gate across the remaining surfaces.
--
-- ITEMS: 112 priced rows on the sheet → 9 dropped as $0.00/CALL placeholders (importing
-- those would fabricate discrepancies against a price the vendor never quoted) → 2 exact
-- duplicates collapsed (identical price and UOM) → 101 distinct items loaded.
--
-- KNOWN LIMIT (documented, not a defect introduced here): this sheet carries NO SRS item
-- numbers. The vendor price path matches on
--   pai.raw_item_number = line.item_number OR pai.raw_description_normalized = lower(line.item_description)
-- which is EXACT equality — there is no trigram arm on the vendor side (the ABC side has
-- one at similarity >= 0.45). SRS invoice descriptions read like
-- "3 BD/SQ IKO CAMBRIDGE CHARCOAL GRAY CLASS 3 IMPACT RESISTANT, 56 BD/PAL" and will not
-- equal a price-sheet description, so these 101 rows record the negotiated truth but will
-- not price a line until they carry item numbers. The Melissa Level 4 sheet has sat in
-- exactly this state since 2026-02-16: 97 items, 0 matches. Tracked as the follow-up.

INSERT INTO public.price_agreements
  (id, vendor_id, vendor_branch_id, agreement_number, version_label, effective_date,
   expiry_date, is_active, ceo_verified, ceo_verified_by, ceo_verified_at,
   source_file, source_pdf_url, notes)
SELECT '9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34'::uuid,
       v.id,
       vb.id,
       NULL,
       'SRS Colorado price list 2026-08-14',
       DATE '2026-08-14',
       NULL,
       true,
       true,
       'Chris Hussey',
       now(),
       'Pro Exteriors Colorado Pricing 8-14.pdf',
       'agreements/colorado-srs-pricelist-aug2026.pdf',
       '2026-08-21 (Chris): Colorado-wide SRS price list from Blake Wells, effective 2026-08-14. Governing book for the Denver (Greenwood Village), CO office; supersedes quote 0049345641 forward of that date. Description-only — carries no SRS item numbers, so it does not yet resolve invoice lines.'
FROM public.vendors v
JOIN public.vendor_branches vb
  ON vb.vendor_id = v.id AND vb.branch_number = 'AMSDE'
WHERE v.slug = 'srs'
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.price_agreements WHERE id = '9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34') THEN
    RAISE EXCEPTION '251 agreement row not created — SRS vendor or AMSDE branch missing';
  END IF;
END $$;

INSERT INTO public.price_agreement_items
  (agreement_id, raw_item_number, raw_description, raw_description_normalized,
   negotiated_price, price_uom, match_type, needs_review, approval_status,
   approved_by, approved_at, notes)
SELECT '9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34'::uuid, NULL, d, lower(d), p, u, 'manual', false, 'approved',
       'Chris Hussey', now(), 'Colorado price list 2026-08-14'
FROM (VALUES
  ('GAF TIMBERLINE HDZ 3 BD/SQ', 'SQ', 129.0000),
  ('GAF TIMBERLINE ARMOR SHIELD 3 BD/SQ', 'SQ', 143.0000),
  ('GAF SEAL-A-RIDGE 12" X 25 LF/BD', 'BD', 62.5000),
  ('GAF ARMOR SHIELD HIP AND RIDGE 12" X 25 LF/BD', 'BD', 65.6500),
  ('GAF TIMBERTEX 12" X 20 LF/BD', 'BD', 152.0000),
  ('GAF Z RIDGE 13.25" X 33.75 LF/BD', 'BD', 134.0000),
  ('GAF PRO START STARTER', 'BD', 94.0000),
  ('GAF STARTERMATCH STARTER', 'BD', 146.0000),
  ('GAF WEATHERWATCH ICE & WATER', 'RL', 181.0000),
  ('GAF FELTBUSTER SYNTHETIC UNDERLAYMENT', 'RL', 231.0000),
  ('GAF TIGER PAW ROOF DECK PROTECTION', 'EA', 320.0000),
  ('GAF MASTERFLOW 960 ROOF GALVANIZED 60" SQ NFA', 'EA', 34.2500),
  ('GAF TIMBERLINE ULTRA HDZ 3 BD/SQ', 'SQ', 207.3600),
  ('ATLAS PINNACLE 3 BD/SQ', 'SQ', 128.6500),
  ('ATLAS PINNACLE IMPACT RESISTANT 3BD/SQ', 'SQ', 159.2500),
  ('ATLAS STORM MASTER SHAKE 3 BD/SQ', 'SQ', 190.0100),
  ('ATLAS STORMMASTER HIP AND RIDGE 12" x 31 LF/BD', 'BD', 93.2500),
  ('ATLAS PRO CUT HIP AND RIDGE 12" x 31 LF/BD', 'BD', 78.4500),
  ('ATLAS PRO-CUT HP42 STARTER SHINGLE', 'BD', 131.0000),
  ('ATLAS WEATHERMASTER 200 SE LABEL', 'RL', 128.0000),
  ('ATLAS SUMMIT 180 SYNTHETIC UNDERLAYMENT', 'RL', 171.0000),
  ('ATLAS SUMMIT 60 SYNTHETIC UNDERLAYMENT', 'RL', 140.0000),
  ('IKO CAMBRIDGE AR 3 BD/SQ', 'SQ', 110.0000),
  ('IKO DYNASTY LT SHINGLE 3 BD/SQ', 'SQ', 117.0000),
  ('IKO NORDIC IR ARMOURZONE 3 BD/SQ', 'SQ', 137.0000),
  ('IKO HIP & RIDGE CLASS 4 36.5 LF/BD', 'BD', 112.0000),
  ('IKO LEADING EDGE PLUS STARTER', 'BD', 111.0000),
  ('IKO STORMSHIELD ICE & WATER', 'RL', 144.0000),
  ('IKO STORMTITE SYNTHETIC UNDERLAYMENT', 'RL', 146.0000),
  ('MALARKEY HIGHLANDER AR 3 BD/SQ PORTLAND', 'SQ', 197.5000),
  ('MALARKEY VISTA AR 3 BD/SQ', 'SQ', 135.0000),
  ('MALARKEY RIDGEFLEX SG 12" X 31 LF/BD', 'BD', 84.5000),
  ('MALARKEY EZ RIDGE 10" X 20 LF/BD', 'BX', 170.0000),
  ('MALARKEY 210 SMART START', 'BD', 124.0000),
  ('MALARKEY WINDSOR STARTER', 'BD', 202.0000),
  ('MALARKEY 401 ARCTIC SEAL', 'RL', 144.0000),
  ('MALARKEY 1031 SECURE START PLUS', 'RL', 253.0000),
  ('OC OAKRIDGE AR 3 BD/SQ', 'SQ', 174.0900),
  ('OC TRUDEF DURATION LIFETIME 3 BD/SQ', 'SQ', 179.0900),
  ('OC TRUDEF STORM IR 3 BD/SQ', 'SQ', 198.1100),
  ('OC TRUDEF DURATION LIFETIME FLEX 3 BD/SQ', 'SQ', 207.1100),
  ('OWENS CORNING PROEDGE 33 LF/BD', 'BD', 104.0000),
  ('OWENS CORNING IMPACTRIDGE 33 LF/BD', 'BD', 127.0000),
  ('OWENS CORNING H&R DURA RIDGE DESIGNER 20 LF/BD', 'BD', 155.0000),
  ('OC STARTER STRIP PLUS', 'BD', 90.5000),
  ('OC WEATHERLOCK GRANULATED ICE & WATER', 'RL', 173.0000),
  ('OC RHINOROOF U20 SYNTHETIC UNDERLAYMENT', 'RL', 139.0000),
  ('OC TITANIUM UDL 30 SYNTHETIC', 'RL', 229.0000),
  ('CERTAINTEED LANDMARK AR 3 BD/SQ', 'SQ', 179.0300),
  ('CERTAINTEED LANDMARK IR AND CLIMATEFLEX 3 BD/SQ', 'SQ', 192.6100),
  ('CERTAINTEED NORTHGATE HEAVY LAMINATES 4 BD/SQ', 'SQ', 205.0000),
  ('CERTAINTEED SHADOW RIDGE 12" X 30 LF/BD', 'BD', 98.5000),
  ('CERTAINTEED SHADOW RIDGE CLIMATEFLEX AR 12" X 30 LF/BD', 'BD', 123.0000),
  ('CERTAINTEED CEDARCREST IR 20 LF/BD', 'BD', 130.0000),
  ('CERTAINTEED CEDARCREST 20 LF/BD', 'BD', 121.0000),
  ('CERTAINTEED MOUNTAIN RIDGE 10" x 20 LF/BX', 'BX', 130.0000),
  ('CERTAINTEED PRESIDENTIAL STARTER', 'BD', 131.0000),
  ('CERTAINTEED PRESIDENTIAL IMPACT RESISTANT STARTER', 'BD', 180.0000),
  ('CERTAINTEED WINTERGUARD GRANULATED 2 SQ/RL', 'RL', 171.0000),
  ('CT ROOFRUNNER SYNTHETIC UNDERLAYMENT', 'RL', 158.0000),
  ('CERTAINTEED PATRIOT XL 3 BD/SQ', 'BD', 59.6700),
  ('CT SWIFTSTART STARTER SHINGLE', 'BD', 89.0000),
  ('TAMKO HERITAGE METRIC 3 BD/SQ', 'SQ', 168.5000),
  ('TAMKO HERITAGE PROLINE TITAN XT 3 BD/SQ', 'SQ', 132.0000),
  ('TAMKO CLASS 4 STORMFIGHTER FLEX 3 BD/SQ', 'SQ', 134.0000),
  ('TAMKO HIP AND RIDGE IR 12" X 33 LF/BD', 'BD', 82.0000),
  ('TAMKO HIP AND RIDGE 33 LF/BD', 'BD', 65.5000),
  ('TAMKO SHINGLE STARTER', 'BD', 104.0000),
  ('TAMKO MOISTURE GUARD ICE & WATER', 'RL', 175.0000),
  ('TOP SHIELD STARTER STRIP PLUS', 'BD', 62.0000),
  ('TOP SHIELD TS20 SYNTHETIC UNDERLAYMENT', 'RL', 74.5000),
  ('EMPIRE BIGFOOT 15 AND TOP SHIELD CRAFTGRADE INDEPENDENCE 10 SQ/RL', 'RL', 86.5000),
  ('RESISTO LB1236 AND TOP SHIELD I&W DEFENDER 2SQ/RL', 'RL', 75.0000),
  ('PLASTIC CAP NAILS 1-1/4" 2500/BX', 'BKT', 21.0000),
  ('TOP SHIELD EG COIL ROOFING NAILS', 'BX', 44.0000),
  ('COIL ROOFING NAILS 7/8" 7200/BX', 'BX', 72.5000),
  ('COIL ROOFING NAILS 1-1/2" 7200/BX', 'BX', 74.5000),
  ('COIL ROOFING NAILS 1-3/4" 7200/BX', 'BX', 102.0000),
  ('GEOCEL 2300 CAULK', 'TB', 13.5000),
  ('TOP SHIELD ELASTOMERIC SEALANT CLEAR', 'EA', 11.6500),
  ('TOP SHIELD SEALANT POLYURETHANE 10.1 OZ', 'EA', 12.2500),
  ('TOP SHIELD SPRAY PAINT', 'EA', 11.2500),
  ('LOMANCO/TOP SHIELD 750 GALV', 'PC', 27.2500),
  ('LOMANCO/TOP SHIELD 12" TURBINE VENT BRACED INTERIOR', 'PC', 93.5000),
  ('LOMANCO/TOP SHIELD BATH PRO VENT BRV34', 'PC', 54.5000),
  ('LOMANCO/TOP SHIELD DA-4 DECK-AIR INTAKE VENT', 'PC', 38.5000),
  ('LOMANCO/TOP SHIELD KITCHEN PRO VENT KV68', 'PC', 87.0000),
  ('TOP SHIELD LOR9-4N LO-OMNIRIDGE VENT', 'PC', 24.7500),
  ('TOP SHIELD PRO4SWN OMNIRIDGE VENT W/NAIL', 'PC', 20.5000),
  ('LOMANCO/TOP SHIELD LOR-30 RIDGE VENT', 'RL', 146.0000),
  ('POLYGLASS ELASTOFLEX FIRE RETARDENT', 'RL', 199.0000),
  ('POLYGLASS ELASTOFLEX SA V FR SBS BASE', 'RL', 184.0000),
  ('METAL FLASHINGS STEP FLASHING 4" X 4" X 8"', 'BD', 85.0000),
  ('METAL FLASHINGS STEP FLASHING 8" X 8"', 'BD', 124.0000),
  ('METAL EDGE HEADWALL FLASHING 4 X 5 - 10''', 'EA', 33.2500),
  ('METAL EDGE 1X2', 'EA', 9.0000),
  ('METAL EDGE 2X2', 'EA', 19.4500),
  ('METAL EDGE 2X4', 'EA', 12.0000),
  ('METAL EDGE "D" STYLE 1X2', 'EA', 13.8500),
  ('VALLEY METAL', 'EA', 216.0000),
  ('METAL FLASHINGS W-VALLEY 24" X 10''', 'EA', 69.5000)
) AS s(d, u, p)
WHERE NOT EXISTS (
  SELECT 1 FROM public.price_agreement_items x
  WHERE x.agreement_id = '9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34' AND x.raw_description_normalized = lower(s.d)
);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.price_agreement_items WHERE agreement_id = '9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34';
  IF n <> 101 THEN
    RAISE EXCEPTION '251 expected 101 Colorado items, found %', n;
  END IF;
  RAISE NOTICE '251 ok — SRS Colorado price list loaded with % items', n;
END $$;
