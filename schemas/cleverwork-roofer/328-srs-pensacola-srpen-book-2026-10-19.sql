-- 328 — SRS Pensacola book from SRPEN quotes 2026-10-19 (Chris, 2026-10-20).
-- Additive + idempotent. Apply AFTER 327 and after the Pensacola boundary + branch
-- assignment, so the SRPEN anchor is already covered by the office (mig 299 trap).
--
-- SOURCE: five SRS quotes from SRPEN (SRS Building Prod - Pensacola, 8771 Ely Rd),
-- account S036198 0001, salesperson B WELLS (same rep as the Colorado book, mig 251),
-- quoted by T HUETTIG, activation 2026-10-19, close 2026-11-18:
--   0051901988, 0051905629, 0051905940, 0051906003, 0051906137
-- Dropbox: PE_Open_Brain/PE_Job_Documents/rematerialpricingrequestpensacolafl/
-- Every row carries an SRS item number, so it matches invoice lines on raw_item_number
-- (unlike the description-only Colorado sheet).
--
-- RULINGS (Chris, 2026-10-20):
--   * Conflicts — latest quote wins. GAF0699900TA: $103 on 0051901988 (08:56) vs $100 on
--     0051906003 (10:12) → $100. TOPTS381900: $9 on 0051901988 vs $11 on the four later
--     quotes → $11.
--   * Evergreen — effective 2026-10-19, stays in effect until SRS issues a new list
--     (mig 270 doctrine). The quotes' 30-day close date (11/18/26) is documentary only.
--   * Scope — anchored to SRPEN; every SRS branch assigned to the Pensacola office
--     inherits it (Denver/AMSDE precedent, mig 251).
--
-- UOM: price_uom is the quote's PRICE UOM (CONVENTIONS §10c), not the order UOM. Two
-- rows differ: TOP1PCBTS orders BKT / prices BX; TOPTS750GB orders PC / prices EA.
-- TAMPST is flagged on the quote "DISC 9-26, replacement TAMSS"; TAMSS was not quoted.
--
-- 27 distinct SKUs.

DO $$
DECLARE n int;
BEGIN
  -- SRPEN must resolve to exactly one SRS branch: its native code, its SBP- name, an
  -- alias (mig 253), or its street address. Fail closed rather than guess.
  SELECT count(DISTINCT vb.id) INTO n
    FROM public.vendor_branches vb
    JOIN public.vendors v ON v.id = vb.vendor_id AND v.slug = 'srs'
   WHERE vb.branch_number IN ('SRPEN', 'SBP-PENSACOLA')
      OR vb.id IN (SELECT a.vendor_branch_id FROM public.vendor_branch_alias a
                    WHERE a.vendor_id = v.id AND upper(a.alias_key) = 'SRPEN')
      OR (vb.city ILIKE 'Pensacola' AND vb.address ILIKE '%8771%Ely%');
  IF n <> 1 THEN
    RAISE EXCEPTION '328 SRPEN must resolve to exactly 1 SRS branch, found % — resolve branch identity first', n;
  END IF;
END $$;

INSERT INTO public.price_agreements
  (id, vendor_id, vendor_branch_id, agreement_number, version_label, effective_date,
   expiry_date, renewal_mode, is_active, ceo_verified, ceo_verified_by, ceo_verified_at,
   source_file, notes)
SELECT '484ede71-87b2-462f-b1cb-e2dc57619fda'::uuid,
       v.id,
       vb.id,
       NULL,
       'SRS Pensacola SRPEN quotes 2026-10-19',
       DATE '2026-10-19',
       NULL,
       'evergreen',
       true,
       true,
       'Chris Hussey',
       now(),
       'Quote0051901988.pdf; Quote0051905629.pdf; Quote0051905940.pdf; Quote0051906003.pdf; Quote0051906137.pdf',
       '2026-10-20 (Chris): Pensacola, FL office SRS book, built from five SRPEN quotes dated 2026-10-19 (B Wells). Evergreen until SRS issues a new list; quote close date 2026-11-18 is documentary. Price conflicts resolved latest-quote-wins (GAF0699900TA $100, TOPTS381900 $11).'
  FROM public.vendors v
  JOIN public.vendor_branches vb ON vb.vendor_id = v.id
 WHERE v.slug = 'srs'
   AND (vb.branch_number IN ('SRPEN', 'SBP-PENSACOLA')
        OR vb.id IN (SELECT a.vendor_branch_id FROM public.vendor_branch_alias a
                      WHERE a.vendor_id = v.id AND upper(a.alias_key) = 'SRPEN')
        OR (vb.city ILIKE 'Pensacola' AND vb.address ILIKE '%8771%Ely%'))
 LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.price_agreement_items
  (agreement_id, raw_item_number, raw_description, raw_description_normalized,
   negotiated_price, price_uom, match_type, needs_review, approval_status,
   approved_by, approved_at, notes)
SELECT '484ede71-87b2-462f-b1cb-e2dc57619fda'::uuid, s.item, s.d, lower(s.d), s.p, s.u,
       'item_number', false, 'approved', 'Chris Hussey', now(), 'SRPEN ' || s.src
FROM (VALUES
  ('TAM31005423',      '3 BD/SQ TAMKO HERITAGE WEATHERED WOOD LINE 2, 42 BD/PAL',                      'SQ',    95.00, 'quotes 0051901988, 0051905940'),
  ('TAM31005009',      '3 BD/SQ TAMKO HP TITAN XT RUSTIC CEDAR PROLINE, LINE 4, 36 BD/PAL',            'SQ',   104.00, 'quote 0051901988'),
  ('TAM31005432',      '3 BD/SQ TAMKO HP TITAN XT WEATHERED WOOD LINE 2, PROLINE, CLASS 3, 36 BD/PAL', 'SQ',   104.00, 'quote 0051905629'),
  ('GAF0699900TA',     '3 BD/SQ GAF TL NATURAL SHADOW WEATHERED WOOD TIMBERLINE, 39 BD/PAL',          'SQ',   100.00, 'quote 0051906003 (latest; 0051901988 said 103.00)'),
  ('GAF0405180TU',     '3 BD/SQ GAF TIMBERLINE HDZ SG CHARCOAL STAINGUARD, CLASS 3, 39 BD/PAL',        'SQ',   106.00, 'quote 0051901988'),
  ('GAF0405900TA',     '3 BD/SQ GAF TIMBERLINE HDZ SG WEATHERED WOOD STAINGUARD, CLASS 3, 39 BD/PAL',  'SQ',   106.00, 'quote 0051906137'),
  ('TAMHRARWW',        '33'' BD TAMKO HIP & RIDGE WEATHERED WOOD LINE 2, CLASS 3, 42 BD/PAL',          'BD',    68.50, 'quotes 0051901988, 0051905629, 0051905940'),
  ('TAMPST',           '105'' TAMKO PERFORATED STARTER STRIP 72 BD/PAL (DISC 9-26, REPL TAMSS)',      'BD',    57.00, 'quotes 0051901988, 0051905629, 0051905940'),
  ('GAF0864900SA',     '12" X 25'' GAF SEAL-A-RIDGE WEATHERED WOOD FOR BOLD HDZ SIERRA SAND, CLASS 3, 52 BD/PAL', 'BD', 58.00, 'quotes 0051901988, 0051906003, 0051906137'),
  ('GAFSTPS',          '120.33 LF/BD GAF PRO START STARTER 51 BD/PAL',                                 'BD',    57.00, 'quotes 0051901988, 0051906003, 0051906137'),
  ('MAXXTSF10',        '10 SQ/RL MAXFELT XT SYNTHETIC UNDERLAYMENT 64 RL/PAL',                         'RL',    63.00, 'quotes 0051901988, 0051905629, 0051905940, 0051906003'),
  ('GAFFBS10',         '10 SQ/RL GAF FELTBUSTER SYNTHETIC UNDERLAYMENT HIGH TRACTION, 49 RL/PAL',      'RL',   116.00, 'quote 0051906137'),
  ('CON7PSM1W',        '2 SQ/RL CMI SECUREGRIP ICE & WATER SELF-ADHERED, 25 RL/PAL',                   'RL',    58.00, 'all five quotes'),
  ('TOP1PCBTS',        '1" 3M/BKT TOP SHIELD PLASTIC CAPS PLASTIC BUCKET, CONTINENTAL MATERIALS',     'BX',    14.00, 'all five quotes (orders BKT, prices BX)'),
  ('TOPCOIL114',       '1-1/4" 7.2M/BX TOP SHIELD EG COIL ROOFING NAILS 48 BX/PAL',                    'BX',    35.00, 'all five quotes'),
  ('TOP15238112RS45B', '2-3/8" .113 4500/BX TOP SHIELD BRIGHT RING SHANK COIL NAILS CONTINENTAL MATERIALS, 8D', 'BX', 42.00, 'all five quotes'),
  ('FLASF448',         '4" X 4" X 8" 100 PC/BD FLAMCO GALV ECON STEP FLASH MILL GALVANIZED, ECONOMY',  'BD',    88.00, 'all five quotes'),
  ('TOPEDF2655WHTS',   '5-1/2" X 2-1/2" X 10'' TOP SHIELD STEEL 26GA EAVE DRIP WHITE 2-1/2" FACE, 25 PC/BD, MILLENNIUM METALS', 'PC', 10.00, 'all five quotes'),
  ('TOPAF2645AGTS',    '4" X 5" X 10'' 26 GA TOP SHIELD AC GLVM ANGLE FLASHING MILL ACRYLIC COATED GALVALUME, 20 PC/BD', 'PC', 14.00, 'quote 0051901988'),
  ('POLPG400475G',     'HAZMAT 4.75 GAL POLYGLASS PG400 PLASTIC ROOF CEMENT TROWEL GRADE, 36 -4.75G/PAL', '475G', 40.00, 'all five quotes'),
  ('TOPTS381900',      '10.1 OZ TOP SHIELD ELASTOMERIC SEALANT CLEAR PLASTIC TUBE',                     'EA',    11.00, 'quotes 0051905629, 0051905940, 0051906003, 0051906137 (0051901988 said 9.00)'),
  ('TOPSFACH',         'HAZMAT 12 OZ TOP SHIELD ROOF ACCESSORY PAINT CHARCOAL GEOCEL/SHERWIN WILLIAMS', 'EA',     8.50, 'all five quotes'),
  ('IPSHB41',          '1" - 4" IPS 4N1 HARD PLASTIC PIPE FLASHING LARGE BASE, 20 PC/CTN',             'PC',     7.00, 'quote 0051901988'),
  ('IPSPF13BK',        '1" - 3" IPS 3N1 GALVANIZED PIPE FLASH BLACK 20 PC/CTN',                         'EA',     9.00, 'all five quotes'),
  ('TOPTS750GB',       '8" TOP SHIELD GALV 750 VENT BLACK 16" X 20-5/16" X 5", NFA 50", GALVANIZED, 6 EA/CTN', 'EA', 19.00, 'all five quotes (orders PC, prices EA)'),
  ('TOP84719TS',       '12" X 4'' TOP SHIELD SHINGLE OVER UFILT RIDGE VENT UNFILTERED, WITH NAILS, 10 PC/CTN', 'PC', 7.50, 'quote 0051901988'),
  ('GAFRJVC4',         '4" - 13" X 13" GAF MASTERFLOW ROOF JACK W/ VENT CAP 6 PC/CTN',                  'PC',    80.50, 'quote 0051906137')
) AS s(item, d, u, p, src)
WHERE EXISTS (SELECT 1 FROM public.price_agreements WHERE id = '484ede71-87b2-462f-b1cb-e2dc57619fda')
  AND NOT EXISTS (
    SELECT 1 FROM public.price_agreement_items x
     WHERE x.agreement_id = '484ede71-87b2-462f-b1cb-e2dc57619fda' AND x.raw_item_number = s.item
  );

DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.price_agreements WHERE id = '484ede71-87b2-462f-b1cb-e2dc57619fda') THEN
    RAISE EXCEPTION '328 agreement row not created — SRS vendor or SRPEN branch missing';
  END IF;
  SELECT count(*) INTO n FROM public.price_agreement_items WHERE agreement_id = '484ede71-87b2-462f-b1cb-e2dc57619fda';
  IF n <> 27 THEN
    RAISE EXCEPTION '328 expected 27 SRPEN items, found %', n;
  END IF;
  RAISE NOTICE '328 ok — SRS Pensacola SRPEN book loaded with % items', n;
END $$;

SELECT public.request_matview_refresh('mv_invoice_audit_line', '328 SRS Pensacola SRPEN book', 'Chris Hussey');
