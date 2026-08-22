-- 265 — OEM product reference: manufacturer fact, cited and dated.
--
-- WHY
-- ---
-- PEC-226 kept stalling on one question the invoice data cannot answer:
-- is the sheet's short description the SAME PRODUCT as the invoice's long one?
--
--   sheet:   IKO CAMBRIDGE AR
--   invoice: IKO CAMBRIDGE WEATHERWOOD | CLASS 3 IMPACT RESISTANT, 56 BD/PAL
--
-- Read cold that looks like AR (algae resistant) versus an impact-resistant
-- variant — two products. The manufacturer says otherwise: Class 3 impact
-- resistance and algae resistance are BOTH standard to the entire Cambridge
-- line, and no separate Cambridge IR SKU exists. One product. The invoice is
-- simply spelling out attributes the sheet leaves implicit.
--
-- The mirror case proves the field is load-bearing rather than decorative:
--   sheet:   TAMKO HIP AND RIDGE IR      -> proposed TAMHRARRBK
-- TAMKO ships Hip & Ridge and Hip & Ridge IR as DISTINCT products, IR being
-- UL 2218 Class 4, and TAMHRARRBK's own invoice reads "LINE 2, CLASS 3".
-- Different products. Same shape of question, opposite answer.
--
-- So the discriminator is not "does the description mention impact resistance"
-- but "is that rating STANDARD TO THE LINE, or does it name a separate SKU?"
-- That fact lives with the manufacturer, not in our invoices — hence this
-- table. Every row cites a manufacturer URL and the date it was read.
--
-- TRUST (hard rule 4)
-- -------------------
-- Scraped OEM pages land as `evidence`. A row becomes `instruction` only when
-- a human confirms it, recorded in confirmed_by / confirmed_at. A manufacturer
-- page can change under us; retrieved_at is what makes that detectable.
--
-- ERA (hard rule 8)
-- -----------------
-- era_of_practice carries the catalog year the fact was read from. Product
-- lines get discontinued and impact ratings get revised; a 2031 retrieval must
-- be able to tell itself apart from this one.
--
-- Additive and idempotent. Rule 1: no drops.

begin;

create table if not exists public.oem_product_reference (
  id                       uuid primary key default gen_random_uuid(),
  manufacturer             text not null,
  product_line             text not null,
  product_category         text not null default 'shingle',

  impact_class             text,
  impact_is_line_standard  boolean,
  separate_ir_sku          boolean,
  ir_sibling_line          text,
  algae_resistant_standard boolean,

  bundles_per_square       numeric,
  lineal_coverage_per_bundle text,
  colors                   text[],

  source_url               text not null,
  retrieved_at             timestamptz not null default now(),
  era_of_practice          text not null,

  trust_tier               text not null default 'evidence',
  confirmed_by             text,
  confirmed_at             timestamptz,

  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oem_trust_tier_chk') then
    alter table public.oem_product_reference
      add constraint oem_trust_tier_chk check (trust_tier in ('evidence','instruction'));
  end if;
  -- instruction grade requires a named human. Rule 4 is enforced here, not
  -- left to whoever writes the next INSERT.
  if not exists (select 1 from pg_constraint where conname = 'oem_instruction_needs_human_chk') then
    alter table public.oem_product_reference
      add constraint oem_instruction_needs_human_chk check (
        trust_tier <> 'instruction'
        or (confirmed_by is not null and confirmed_at is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'oem_category_chk') then
    alter table public.oem_product_reference
      add constraint oem_category_chk check (product_category in (
        'shingle','hip_and_ridge','starter','vent','underlayment','flashing','accessory'));
  end if;
end $$;

create unique index if not exists oem_product_reference_uniq
  on public.oem_product_reference (manufacturer, product_line);
create index if not exists oem_product_reference_mfr_idx
  on public.oem_product_reference (manufacturer);

comment on table public.oem_product_reference is
  'Manufacturer-stated product facts, used to decide whether a price-sheet description and an invoice description name the SAME product. Sourced from the OEM''s own site; every row carries source_url, retrieved_at and era_of_practice. Trust tier is `evidence` until a human confirms it (hard rule 4). This table never prices anything - it answers identity, and identity is what PEC-226 gets wrong when it guesses.';
comment on column public.oem_product_reference.impact_is_line_standard is
  'TRUE when the impact class applies to the WHOLE line, so an invoice spelling out "CLASS 3 IMPACT RESISTANT" is describing the same product as a sheet row that omits it. FALSE when the rating names a separate SKU, so the wording IS the product difference. This single column is the one that resolves IKO Cambridge (true) versus TAMKO Hip & Ridge (false).';
comment on column public.oem_product_reference.separate_ir_sku is
  'TRUE when the manufacturer ships a distinct impact-resistant version of this line under its own name (see ir_sibling_line). A sheet row saying IR must never bind to the non-IR item number when this is true.';
comment on column public.oem_product_reference.era_of_practice is
  'Catalog year this fact was read from the manufacturer. Product lines are discontinued and ratings revised; a later retrieval must be distinguishable from this one (hard rule 8).';
comment on column public.oem_product_reference.trust_tier is
  'evidence = scraped from the OEM site and not yet confirmed. instruction = a human confirmed it, and confirmed_by/confirmed_at say who and when. Only Quality Control or a human promotes.';

commit;


-- ---------------------------------------------------------------------------
-- Seed. Retrieved 2026-08-22 from each manufacturer's own site.
-- 47 rows across 8 manufacturers. Applied to prod as 265b_oem_product_reference_seed.
--
-- Where the OEM page does not state an impact class it is left NULL and the
-- note says so. A guess recorded as fact is worse than a gap: this table
-- exists precisely to stop PEC-226 guessing.
--
-- trust_tier: rows Chris ruled on in the 2026-08-22 PEC-226 review are
-- 'instruction'. Everything else stays 'evidence' until confirmed.
-- ---------------------------------------------------------------------------

begin;

insert into public.oem_product_reference (
  manufacturer, product_line, product_category, impact_class, impact_is_line_standard,
  separate_ir_sku, ir_sibling_line, algae_resistant_standard, bundles_per_square,
  lineal_coverage_per_bundle, colors, source_url, era_of_practice, trust_tier,
  confirmed_by, confirmed_at, notes
) values
('Atlas','Briarwood Pro','shingle',null,null,null,null,null,null,null,null,'https://www.atlasroofing.com/products/roof-shingles/briarwood-pro-shingles','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('Atlas','Castlebrook','shingle',null,null,null,null,null,null,null,null,'https://www.atlasroofing.com/products/roof-shingles/castlebrook-shingles','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('Atlas','Pinnacle Impact','shingle','Class 3',true,false,null,true,null,null,null,'https://www.atlasroofing.com/products/roof-shingles/pinnacle-impact-shingles','2026','evidence',null,null,'Named "Impact" but rated Class 3 - a good reminder that the product name is not the rating.'),
('Atlas','Pinnacle Pristine','shingle',null,null,null,null,true,null,null,null,'https://www.atlasroofing.com/products/roof-shingles/pinnacle-pristine-shingles','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('Atlas','Pinnacle Sun','shingle',null,null,null,null,true,null,null,null,'https://www.atlasroofing.com/products/roof-shingles/pinnacle-sun-shingles','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('Atlas','ProLam','shingle',null,null,null,null,null,null,null,null,'https://www.atlasroofing.com/products/roof-shingles/prolam-shingles','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('Atlas','StormMaster Shake','shingle','Class 4',true,false,null,true,null,null,null,'https://www.atlasroofing.com/products/roof-shingles/stormmaster-shake-shingles','2026','evidence',null,null,null),
('CertainTeed','Landmark','shingle',null,null,true,'Landmark ClimateFlex / NorthGate ClimateFlex',true,null,null,null,'https://www.certainteed.com/products/residential-roofing-products/landmark','2026','evidence',null,null,'Impact class NOT confirmed from the OEM page. The load-bearing fact is that ClimateFlex is the separate Class 4 line, so a Landmark sheet row must not absorb a ClimateFlex item number.'),
('CertainTeed','Landmark ClimateFlex','shingle',null,null,false,null,true,null,null,null,'https://www.certainteed.com/products/residential-roofing-products/landmark-climateflex','2026','evidence',null,null,'CertainTeed''s impact-resistant Landmark. Class not read directly off the OEM page yet.'),
('CertainTeed','Landmark PRO','shingle',null,null,true,'Landmark ClimateFlex',true,null,null,null,'https://www.certainteed.com/products/residential-roofing-products/landmark-pro','2026','evidence',null,null,'Impact class not confirmed from the OEM page; secondary sources say Class 3. Confirm before relying on it.'),
('CertainTeed','NorthGate ClimateFlex','shingle',null,null,false,null,null,null,null,null,'https://www.certainteed.com/products/residential-roofing-products/northgate-climateflex','2026','evidence',null,null,'Positioned as the Class 4 option opposite Landmark PRO. Class not read directly off the OEM page yet.'),
('CertainTeed','Presidential Shake','shingle',null,null,true,'Presidential Shake IR',null,null,null,null,'https://www.certainteed.com/products/residential-roofing-products/presidential-shake','2026','evidence',null,null,'CertainTeed lists Presidential Shake and Presidential Shake IR as separate catalog products - a named IR sibling, same pattern as TAMKO Hip & Ridge.'),
('CertainTeed','Presidential Shake IR','shingle',null,null,false,null,null,null,null,null,'https://www.certainteed.com/products/residential-roofing-products/presidential-shake-ir','2026','evidence',null,null,'The distinct impact-resistant Presidential. Never bind an IR sheet row to the plain Presidential item number, or the reverse.'),
('GAF','Camelot II','shingle',null,null,null,null,null,null,null,null,'https://www.gaf.com/en-us/roofing-materials/residential-roofing-materials/shingles/camelot-ii','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('GAF','Royal Sovereign','shingle',null,null,null,null,null,null,null,null,'https://www.gaf.com/en-us/roofing-materials/residential-roofing-materials/shingles/royal-sovereign','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('GAF','Slateline','shingle',null,null,null,null,null,null,null,null,'https://www.gaf.com/en-us/roofing-materials/residential-roofing-materials/shingles/slateline','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('GAF','Timberline AS II','shingle','Class 4',true,false,null,true,null,null,null,'https://www.gaf.com/en-us/roofing-materials/residential-roofing-materials/shingles/timberline-as-ii','2026','evidence',null,null,'GAF caveat worth carrying: only packages bearing the UL 2218 Class 4 PRI Validation statement are rated Class 4.'),
('GAF','Timberline HDZ','shingle','Class 3',true,true,'Timberline AS II',true,null,null,null,'https://www.gaf.com/en-us/plan-design/impact-resistant-roof','2026','evidence',null,null,'GAF states HDZ is Class 3 and positions AS II as the Class 4 option, so HDZ has a distinct IR sibling.'),
('GAF','Timberline NS','shingle',null,null,null,null,true,null,null,null,'https://www.gaf.com/en-us/roofing-materials/residential-roofing-materials/shingles/timberline-ns','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('GAF','Timberline UHDZ','shingle','Class 4',true,false,null,true,null,null,null,'https://www.gaf.com/en-us/roofing-materials/residential-roofing-materials/shingles/timberline-uhdz-with-ultramat','2026','evidence',null,null,'Class 4 rating is recent; a pre-2025 invoice for UHDZ may predate it. Era-sensitive.'),
('GAF','Woodland','shingle',null,null,null,null,null,null,null,null,'https://www.gaf.com/en-us/roofing-materials/residential-roofing-materials/shingles/woodland','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('IKO','Armourshake','shingle','Class 3',true,false,null,true,null,null,null,'https://www.iko.com/na/compare-shingle-lines/','2026','evidence',null,null,null),
('IKO','Cambridge','shingle','Class 3',true,false,null,true,null,null,array['Dual Black','Weatherwood','Beachwood','Charcoal Grey','Dove White','Driftwood','Dual Grey','Dual Brown','Earthtone Cedar','Harvard Slate'],'https://www.iko.com/na/product/cambridge/','2026','instruction','Chris Hussey',now(),'PEC-226 decisive row. Class 3 impact resistance and algae resistance are BOTH standard to the whole Cambridge line, and IKO ships no separate Cambridge IR SKU. Therefore a sheet row reading "IKO CAMBRIDGE AR" and an invoice reading "IKO CAMBRIDGE <colour> | CLASS 3 IMPACT RESISTANT" are the SAME product - the invoice is spelling out attributes the sheet leaves implicit.'),
('IKO','Cambridge Cool Colors Plus','shingle',null,null,null,null,true,null,null,null,'https://www.iko.com/na/compare-shingle-lines/','2026','evidence',null,null,'Impact class not stated on the comparison page. Do not assume it inherits Cambridge''s Class 3.'),
('IKO','Crowne Slate','shingle',null,null,null,null,true,null,null,null,'https://www.iko.com/na/compare-shingle-lines/','2026','evidence',null,null,'Impact class not stated.'),
('IKO','Dynasty','shingle','Class 3',true,false,null,true,null,null,null,'https://www.iko.com/na/compare-shingle-lines/','2026','evidence',null,null,null),
('IKO','Dynasty Cool Colors Plus','shingle','Class 3',true,false,null,true,null,null,null,'https://www.iko.com/na/compare-shingle-lines/','2026','evidence',null,null,null),
('IKO','Hip & Ridge 12','hip_and_ridge','Class 3',true,false,null,null,null,null,null,'https://www.iko.com/na/product/hip-and-ridge-cap-shingles/','2026','evidence',null,null,null),
('IKO','Marathon Plus AR','shingle',null,null,null,null,true,null,null,null,'https://www.iko.com/na/compare-shingle-lines/','2026','evidence',null,null,'Impact class not stated. "AR" here is algae resistant and is part of the product name itself.'),
('IKO','Nordic','shingle','Class 4',true,false,null,true,null,null,null,'https://www.iko.com/na/compare-shingle-lines/','2026','evidence',null,null,'IKO''s highest impact rating. This is the line an IKO "IR" sheet row most likely means, NOT Cambridge.'),
('IKO','Royal Estate','shingle',null,null,null,null,true,null,null,null,'https://www.iko.com/na/compare-shingle-lines/','2026','evidence',null,null,'Impact class not stated.'),
('Lomanco','Bath PRO BRV34','vent',null,null,null,null,null,null,null,null,'https://www.lomanco.com/vents/kitchen-bath/','2026','instruction','Chris Hussey',now(),'PEC-226 row. Galvanized steel bath roof jack for 3" or 4" duct, black epoxy finish, built-in pest screen. Sold by one distributor as UOM "PC" and by another in the "EA" sell unit for the SAME MPN - external corroboration that PC and EA are one selling unit for this part, which is what put the candidate in the UOM-mismatch tier.'),
('Lomanco','Omni Pro PRO4SWN','vent',null,null,null,null,null,null,null,null,'https://www.lomanco.com/vents/ridge-vents/','2026','instruction','Chris Hussey',now(),'PEC-226 row. Shingle-over ridge vent, 4 ft length, screen attached, nails included, 10 PC per carton - matching the invoice line "TOP SHIELD PRO4SWN OMNIRIDGE VENT W/NAIL | & SCREEN, 10 PC/CTN, 15 CTN/PAL, LOMANCO | 12" X 4''". TOP SHIELD is SRS private-label branding over the Lomanco part.'),
('Malarkey','Highlander','shingle','Class 3',true,false,null,null,null,null,null,'https://www.malarkeyroofing.com/products/shingles-overview/vista-shingles/','2026','evidence',null,null,'From Malarkey''s own good/better/best comparison table on the Vista page.'),
('Malarkey','Legacy Scotchgard','shingle','Class 4',true,false,null,null,null,null,null,'https://www.malarkeyroofing.com/products/shingles-overview/vista-shingles/','2026','evidence',null,null,'From Malarkey''s own good/better/best comparison table on the Vista page.'),
('Malarkey','RidgeFlex','hip_and_ridge',null,null,null,null,false,null,'30 ft 11 in per bundle',null,'https://www.malarkeyroofing.com/products/accessories/ridge-flex/','2026','instruction','Chris Hussey',now(),'PEC-226 row. Lineal coverage 30 ft 11 in per bundle is what the sheet''s "12" X 31 LF/BD" is rounding. Scotchgard (SG) variant confirmed. 12 in width.'),
('Malarkey','Vista','shingle','Class 4',true,false,null,null,3,null,null,'https://www.malarkeyroofing.com/products/shingles-overview/vista-shingles/','2026','instruction','Chris Hussey',now(),'PEC-226 decisive row. Vista carries a UL 2218 Class 4 rating across the whole line (SKU 251, 3 bundles/SQ). The "IR" inside item code MALVIARIRSBOK3 therefore restates a standard attribute and does NOT name a variant - the sheet row "MALARKEY VISTA AR 3 BD/SQ" and that item are the same product.'),
('Owens Corning','Oakridge','shingle',null,null,null,null,true,null,null,null,'https://www.owenscorning.com/en-us/roofing/shingles/oakridge','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('Owens Corning','TruDefinition Duration','shingle',null,null,true,'Duration STORM / Duration FLEX',true,null,null,null,'https://www.owenscorning.com/en-us/roofing/duration-series-shingles','2026','evidence',null,null,'Impact class NOT confirmed from the OEM page - do not assume. What IS clear is that Duration has separate impact-resistant siblings (STORM and FLEX), so a Duration sheet row must never absorb a STORM or FLEX item number.'),
('Owens Corning','TruDefinition Duration FLEX','shingle','Class 4',true,false,null,true,null,null,null,'https://www.owenscorning.com/en-us/roofing/duration-series-shingles','2026','evidence',null,null,'SBS polymer-modified, UL 2218 Class 4. A second, distinct IR sibling of Duration.'),
('Owens Corning','TruDefinition Duration STORM','shingle','Class 4',true,false,null,true,null,null,null,'https://www.owenscorning.com/en-us/roofing/shingles/trudefinition-duration-storm','2026','evidence',null,null,'The impact-resistant sibling of the Duration line.'),
('TAMKO','Elite Glass Seal','shingle',null,null,null,null,null,null,null,null,'https://www.tamko.com/all-shingles','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('TAMKO','Heritage','shingle',null,null,null,null,null,null,null,null,'https://www.tamko.com/all-shingles','2026','evidence',null,null,'Impact class not stated on the line listing.'),
('TAMKO','Heritage Hip & Ridge','hip_and_ridge','Class 3',true,true,'Heritage Hip & Ridge IR',null,null,'33 lin ft/bundle',null,'https://www.tamko.com/docs/default-source/specs-techs/tamko-heritage-series-csi-format-guide-specification.docx','2026','instruction','Chris Hussey',now(),'PEC-226 decisive row, and the MIRROR of IKO Cambridge. TAMKO ships Hip & Ridge and Hip & Ridge IR as DISTINCT products. Item TAMHRARRBK''s own invoice text reads "LINE 2, CLASS 3", so it is the non-IR product and a sheet row saying IR must NOT bind to it.'),
('TAMKO','Heritage Hip & Ridge IR','hip_and_ridge','Class 4',true,false,null,null,null,'33 lin ft/bundle',null,'https://www.tamko.com/docs/default-source/specs-techs/tamko-heritage-series-csi-format-guide-specification.docx','2026','instruction','Chris Hussey',now(),'The separate impact-resistant sibling. 12-1/4" x 12", qualifies for UL 2218 Class 4. Denver quote 0049345641 prices this as TAM31005146 at $82.00/BD, versus TAMHRARWW (Class 3) at $65.50/BD.'),
('TAMKO','StormFighter FLEX','shingle','Class 4',true,false,null,null,null,null,null,'https://www.tamko.com/all-shingles','2026','evidence',null,null,null),
('TAMKO','Titan XT','shingle','Class 3',true,false,null,null,null,null,null,'https://www.tamko.com/all-shingles','2026','evidence',null,null,null)

on conflict (manufacturer, product_line) do update set
  impact_class = excluded.impact_class,
  impact_is_line_standard = excluded.impact_is_line_standard,
  separate_ir_sku = excluded.separate_ir_sku,
  ir_sibling_line = excluded.ir_sibling_line,
  algae_resistant_standard = excluded.algae_resistant_standard,
  bundles_per_square = excluded.bundles_per_square,
  lineal_coverage_per_bundle = excluded.lineal_coverage_per_bundle,
  colors = excluded.colors,
  source_url = excluded.source_url,
  retrieved_at = now(),
  era_of_practice = excluded.era_of_practice,
  notes = excluded.notes,
  updated_at = now();

commit;
