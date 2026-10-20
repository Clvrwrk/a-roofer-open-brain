-- 330 — ABC Pensacola book: branch #1263 price list (Chris, 2026-10-20). Additive + idempotent.
--
-- SOURCE: price list from ABC Supply #1263, 40K E. Nine One Half Mile Rd, Pensacola FL
-- (manager Brian Williams, 850-475-0462), pasted by Chris 2026-10-20. PE ship-tos
-- 2036874-12 and 2036874-13 already carry branch access to 1263 (API placeholder agreement 18).
--
-- RULINGS (Chris, 2026-10-20):
--   * Shingle lines price EVERY active colour SKU of the standard ABC catalog family
--     (Heritage = Heritage 30 [AR + non-AR]; Titan XT; Tamko Hip & Ridge [AR + standard];
--     Timberline HDZ; Timberline Natural Shadow; Seal-A-Ridge). Premium / IR / Vintage /
--     Woodgate / RS / Designer variants are NOT priced.
--   * "Ice & Water $95.95" under GAF = WeatherWatch 11GAWW2.
--   * Four generics with no single obvious SKU load DESCRIPTION-ONLY (fuzzy arm: trigram
--     >= 0.45 + numeric-token guard): 26ga eave drip 2.5" face black 10', 5x5x10 flashing,
--     1-1/4" coil nails, 8D 2-3/8" framing nails. Ask Brian for item numbers; swap in later.
--     (Likely SKUs from PE history: 0150080011 ABC coil nail, 15PSBBC8RD 8D ring shank.)
--   * Effective 2026-10-20, evergreen.
--
-- SKU SOURCE: abc_product_catalog (status Active). Price UOM = the catalog's "costing" UOM
-- (docs/46); a SKU with no costing UOM takes its family's (SQ/BD/PC). Delivery lines use
-- ABC's billing item numbers: DELIVERYGRNDBR (ground drop $100), DELIVERYBR (rooftop $150).
-- Paint: the "ABC Roof Paint" family (12 oz touch-up / roof-accessory spray, all colours).
-- 6" painted roof jack: Dot 17DMRJ6BK/BR/WW only (not galvanized, not the 6/12 capped jacks).
-- Flag: Tamko perforated starter 04TKPSS105 at $101.30/BD vs SRS TAMPST $57/BD.
--
-- BRANCH KEY (the trap): v_office_agreement_versions joins abc_price_agreements.branch_number
-- to vendor_branches.branch_number RAW, and abc_price_agreements.branch_number is an FK to the
-- ABC API mirror ('1263'). The vendor_branches row was slug-keyed 'pensacola-FL-32534-1213',
-- so the book would never reach the Pensacola office. Re-key it (and the other two in-ring ABC
-- branches, 287 Pensacola and 153 Mobile) to the bare ABC number — mig 291 convention.
--
-- 309 item-number rows + 4 description rows = 313.
-- Item rows are selected by rule from abc_product_catalog (section 3); the generated explicit list
-- (~/srs-pensacola-build/abc-1263-skus.json via tools/gen330.py) was diffed equal after apply.

-- 1 · re-key the three in-ring ABC branches to bare ABC numbers (mig 239/291 convention)
UPDATE public.vendor_branches vb
   SET branch_number = s.num,
       notes = COALESCE(vb.notes || ' · ', '') || 'mig 330 (2026-10-20): re-keyed from ' || s.slug || ' to the bare ABC branch number so the office agreement join resolves it',
       updated_at = now()
  FROM (VALUES ('pensacola-FL-32534-1213','1263'), ('pensacola-FL-32501-1430','287'), ('mobile-AL-36617-1526','153')) AS s(slug, num),
       public.vendors v
 WHERE v.id = vb.vendor_id AND v.slug = 'abc-supply' AND vb.branch_number = s.slug;

INSERT INTO public.vendor_branch_alias (vendor_id, alias_key, alias_raw, vendor_branch_id, status, source, decided_by)
SELECT vb.vendor_id, public.vendor_branch_alias_key(s.spelling), s.spelling, vb.id,
       'resolved', 'migration-330 Pensacola-ring ABC branches re-keyed', 'agent'
  FROM public.vendor_branches vb
  JOIN public.vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'
  JOIN (VALUES ('1263','1263'), ('1263','01263'), ('287','287'), ('287','0287'), ('153','153'), ('153','0153')) AS s(num, spelling)
    ON vb.branch_number = s.num
ON CONFLICT (vendor_id, alias_key) DO NOTHING;

-- 2 · the agreement
INSERT INTO public.abc_price_agreements
  (branch_number, region_code, agreement_number, version_label, abc_account_number, sales_rep,
   effective_date, expiry_date, renewal_mode, ceo_verified, ceo_verified_at, ceo_verified_by,
   source_file, notes)
SELECT '1263', NULL, 'PE-PENSACOLA-1263', '2026-10-20 branch list', NULL, 'Brian Williams (branch manager)',
       DATE '2026-10-20', NULL, 'evergreen', true, now(), 'Chris Hussey',
       'ABC #1263 Pensacola price list (pasted by Chris 2026-10-20)',
       '2026-10-20 (Chris): Pensacola, FL office ABC book from branch #1263 (Brian Williams). Evergreen. Shingle lines priced across every colour of the standard family; four generics description-only pending item numbers from the branch. Mig 330.'
WHERE NOT EXISTS (SELECT 1 FROM public.abc_price_agreements WHERE agreement_number = 'PE-PENSACOLA-1263');

-- 3 · item-number rows, selected from abc_product_catalog by the rulings above (Active SKUs;
--     price UOM = catalog costing UOM, else the family's). Generated list for review:
--     ~/srs-pensacola-build/abc-1263-skus.json (309 rows incl. delivery) — verified equal after apply.
WITH rules(grp, price, fam_uom, fams, items) AS (VALUES
  ('Tamko Heritage',               99.00, 'SQ', ARRAY['Tamko Heritage 30 Algae Resistant Architectural Shingles','Tamko Heritage 30 Architectural Shingles'], NULL::text[]),
  ('Tamko Titan XT',              105.00, 'SQ', ARRAY['Tamko Titan XT Architectural Shingles'], NULL),
  ('Tamko Hip & Ridge',            83.00, 'BD', ARRAY['Tamko Hip & Ridge Algae Resistant Shingles','Tamko Hip & Ridge Shingles'], NULL),
  ('Tamko Perforated Starter',    101.30, 'BD', NULL, ARRAY['04TKPSS105']),
  ('GAF Timberline HDZ',          115.00, 'SQ', ARRAY['GAF Timberline High Definition HDZ Architectural Shingles'], NULL),
  ('GAF Timberline Natural Shadow',110.00,'SQ', ARRAY['GAF Timberline Natural Shadow Architectural Shingles'], NULL),
  ('GAF Seal-A-Ridge',             60.65, 'BD', ARRAY['GAF Seal-A-Ridge Hip & Ridge Shingles'], NULL),
  ('GAF Pro-Start',                61.35, 'BD', NULL, ARRAY['04GAPST']),
  ('GAF FeltBuster',              110.15, 'RL', NULL, ARRAY['05GAFBSR10']),
  ('GAF WeatherWatch',             95.95, 'RL', NULL, ARRAY['11GAWW2']),
  ('Mid-State Ice & Water 2 SQ',   80.70, 'RL', NULL, ARRAY['11MIMIRG2','11MIMIWG2']),
  ('Mid-State Quik-Felt 10 SQ',    62.45, 'RL', NULL, ARRAY['05MIMQF481']),
  ('Plastic Cap 3K',               38.50, 'PA', NULL, ARRAY['0150080122']),
  ('Multi Pipe Jack 1.5-3',         9.70, 'PC', NULL, ARRAY['3875311871']),
  ('Touch-Up Spray Paint',          7.30, 'CN', ARRAY['ABC Roof Paint'], NULL),
  ('Geocel Silicone',              10.75, 'TB', NULL, ARRAY['30MIC812CL','30MIC812WH']),
  ('6in Painted Roof Jack',        29.50, 'PC', NULL, ARRAY['17DMRJ6BK','17DMRJ6BR','17DMRJ6WW']),
  ('MFM Starter 7.2x33.5',         14.65, 'RL', NULL, ARRAY['11MIMFS733']),
  ('Mule-Hide 211 5 Gal',          55.25, 'DR', NULL, ARRAY['16MH2115']),
  ('Atlas TruRidge 4ft',           15.15, 'PC', NULL, ARRAY['17ATTRWN4'])
), skus AS (
  SELECT DISTINCT ON (c.item_number) c.item_number AS item, c.item_description AS d,
         COALESCE((SELECT u->>'code' FROM jsonb_array_elements(c.uoms) u WHERE u->>'description' = 'costing' LIMIT 1), r.fam_uom) AS u,
         r.price AS p
    FROM rules r
    JOIN public.abc_product_catalog c ON c.status = 'Active' AND (c.family_name = ANY (r.fams) OR c.item_number = ANY (r.items))
  UNION ALL
  SELECT * FROM (VALUES ('DELIVERYGRNDBR', 'Ground Drop Delivery Charge', 'EA', 100.00),
                        ('DELIVERYBR', 'Delivery Charge (rooftop load)', 'EA', 150.00)) AS dl(item, d, u, p)
)
INSERT INTO public.abc_price_list_items
  (agreement_id, item_number, description, description_normalized, unit, unit_price,
   approval_status, approved_by, approved_at, product_match_type, color_key, num_tokens)
SELECT a.id, s.item, s.d, lower(s.d), s.u, s.p,
       'approved', 'Chris Hussey', now(), 'manufacturer_sku',
       public.vendor_desc_color_key(s.d), public.desc_num_tokens(lower(s.d))
  FROM public.abc_price_agreements a
  CROSS JOIN skus s
 WHERE a.agreement_number = 'PE-PENSACOLA-1263'
   AND NOT EXISTS (SELECT 1 FROM public.abc_price_list_items x WHERE x.agreement_id = a.id AND x.item_number = s.item);

-- 4 · description-only rows (fuzzy arm)
INSERT INTO public.abc_price_list_items
  (agreement_id, item_number, description, description_normalized, unit, unit_price,
   approval_status, approved_by, approved_at, color_key, num_tokens)
SELECT a.id, NULL, s.d, lower(s.d), s.u, s.p,
       'approved', 'Chris Hussey', now(),
       public.vendor_desc_color_key(s.d), public.desc_num_tokens(lower(s.d))
  FROM public.abc_price_agreements a
  CROSS JOIN (VALUES
    ('Drip Edge Eave 26 Ga 2.5" Face Black 10''', 'PC', 15.30, 'Generic (description)'),
    ('Angle Flashing 5" X 5" X 10''', 'PC', 15.25, 'Generic (description)'),
    ('Coil Nail 1-1/4" EG', 'BX', 48.15, 'Generic (description)'),
    ('8D Framing Nail 2-3/8" X .113', 'BX', 77.70, 'Generic (description)')
  ) AS s(d, u, p, grp)
 WHERE a.agreement_number = 'PE-PENSACOLA-1263'
   AND NOT EXISTS (SELECT 1 FROM public.abc_price_list_items x WHERE x.agreement_id = a.id AND x.item_number IS NULL AND x.description = s.d);

-- 5 · posture: Pensacola x ABC is now active
INSERT INTO public.office_vendor_agreement_status (office_id, vendor_id, status, note, decided_by)
SELECT o.id, ven.id, 'active', 'ABC book from branch #1263 (Brian Williams) 2026-10-20, mig 330. Priced for every ABC branch assigned to Pensacola.', 'Chris Hussey'
  FROM public.office o, public.vendors ven
 WHERE o.id = '4a1d6c2e-0f3b-4e8a-9c27-5e1b8d3f6a90' AND ven.slug = 'abc-supply'
ON CONFLICT (office_id, vendor_id) DO UPDATE
   SET status = EXCLUDED.status, note = EXCLUDED.note, decided_by = EXCLUDED.decided_by, updated_at = now();

DO $$
DECLARE n int; k int;
BEGIN
  SELECT count(*) INTO k FROM public.vendor_branches vb JOIN public.vendors v ON v.id = vb.vendor_id AND v.slug = 'abc-supply'
   WHERE vb.branch_number IN ('1263','287','153') AND vb.pricing_territory_office_id = '4a1d6c2e-0f3b-4e8a-9c27-5e1b8d3f6a90';
  IF k <> 3 THEN RAISE EXCEPTION '330 expected 3 re-keyed Pensacola ABC branches, found %', k; END IF;
  SELECT count(*) INTO n FROM public.abc_price_list_items i JOIN public.abc_price_agreements a ON a.id = i.agreement_id
   WHERE a.agreement_number = 'PE-PENSACOLA-1263';
  IF n <> 313 THEN RAISE EXCEPTION '330 expected 313 items, found %', n; END IF;
  RAISE NOTICE '330 ok — ABC Pensacola book loaded with % items', n;
END $$;
