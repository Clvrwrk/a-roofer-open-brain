-- 266 — PEC-226: apply the 24 held candidates. 21 approved, 3 rejected.
--
-- Reviewer: Chris Hussey, 2026-08-22. Every ruling cites oem_product_reference
-- (migration 265) rather than an inference from the invoice text alone.
--
-- THE DISCRIMINATOR
-- -----------------
-- Two candidates looked identical in shape and resolved opposite ways:
--
--   IKO CAMBRIDGE AR   -> IKOCAWWN   "…| CLASS 3 IMPACT RESISTANT"   SAME product
--   TAMKO HIP AND RIDGE IR -> TAMHRARRBK "…| LINE 2, CLASS 3"        DIFFERENT product
--
-- IKO ships Class 3 and algae resistance as STANDARD across the whole Cambridge
-- line with no separate IR SKU, so the invoice is spelling out attributes the
-- sheet leaves implicit. TAMKO ships Hip & Ridge and Hip & Ridge IR as distinct
-- products (IR = Class 4), so the wording IS the product difference.
--
-- The question is never "does the description mention impact resistance" but
-- "is that rating standard to the line, or does it name a separate SKU?"
--
-- REJECTED (3)
--   TAMKO HIP AND RIDGE IR  x2  - IR is TAMKO's separate Class 4 product
--   STEP FLASHING 8" X 8"   x1  - METFSP448BR is 4x4x8; 448 is the dimension
--
-- Additive. Rule 1: no drops.

begin;

-- ── 1 · Record the rulings on the queue ───────────────────────────────────
update public.price_agreement_item_candidates set
  review_status = 'rejected', reviewed_by = 'Chris Hussey', reviewed_at = now(),
  review_note = 'REJECTED. TAMKO ships Hip & Ridge and Hip & Ridge IR as distinct products, IR being UL 2218 Class 4 (oem_product_reference). TAMHRARRBK''s own invoice text reads "LINE 2, CLASS 3", so it is the NON-IR item. An IR sheet row must not bind to it. The Denver quote prices the real IR item separately as TAM31005146 at $82.00/BD.'
where match_tier <> 'token_overlap' and review_status = 'pending'
  and proposed_item_number = 'TAMHRARRBK' and sheet_description ilike '%IR%';

update public.price_agreement_item_candidates set
  review_status = 'rejected', reviewed_by = 'Chris Hussey', reviewed_at = now(),
  review_note = 'REJECTED. Wrong size. METFSP448BR is 4"x4"x8" - the "448" in the item code is the dimension, and the invoice reads "PRE-BENT | 4"X 4"X 8" 100/BD 28GA". The 8"x8" sheet row is a different SKU and stays unbound.'
where match_tier <> 'token_overlap' and review_status = 'pending'
  and proposed_item_number = 'METFSP448BR' and sheet_description ilike '%8" X 8"%';

update public.price_agreement_item_candidates set
  review_status = 'approved', reviewed_by = 'Chris Hussey', reviewed_at = now(),
  review_note = case
    when proposed_item_number like 'IKOCA%' then
      'APPROVED. IKO states Class 3 impact resistance and algae resistance are BOTH standard to the entire Cambridge line, with no separate Cambridge IR SKU (iko.com/na/product/cambridge). The invoice is spelling out attributes the sheet leaves implicit - same product. All six colours are listed Cambridge colours.'
    when proposed_item_number = 'MALVIARIRSBOK3' then
      'APPROVED. Malarkey Vista carries UL 2218 Class 4 across the whole line (3 bundles/SQ). The "IR" inside the item code restates a standard attribute rather than naming a variant, so this is the same product as the sheet''s "MALARKEY VISTA AR".'
    when proposed_item_number = 'MALHRARSB' then
      'APPROVED. Malarkey RidgeFlex lineal coverage is 30 ft 11 in per bundle, which is what the sheet''s "31 LF/BD" rounds to; 12 in width and the Scotchgard (SG) variant both confirmed.'
    when proposed_item_number = 'TAMHRARRBK' then
      'APPROVED as the NON-IR product. Invoice reads "LINE 2, CLASS 3", matching the Denver quote''s Class 3 TAMHRARWW at $65.50/BD rather than the Class 4 IR item.'
    when proposed_item_number = 'METFSP448BR' then
      'APPROVED. Item code "448" is the 4"x4"x8" dimension and the invoice confirms it; invoiced $85.00/BD equals the sheet price exactly.'
    when proposed_item_number = 'TOPTSPRO4SWN' then
      'APPROVED. TOP SHIELD is SRS private-label branding over Lomanco Omni Pro PRO4SWN - 4 ft, screen attached, nails included, 10 PC/carton, matching the invoice line for line. The PC/EA gap is a unit-name difference, not a product difference.'
    when proposed_item_number = 'TOPTSBRV34' then
      'APPROVED. Lomanco Bath PRO BRV34, galvanized steel, 3"-4" duct. The same MPN is sold by one distributor as UOM "PC" and another in the "EA" sell unit, so PC and EA are one selling unit here.'
    else review_note end
where match_tier <> 'token_overlap' and review_status = 'pending';

-- ── 2 · Bind the single-target sheet rows ─────────────────────────────────
update public.price_agreement_items pai set
  raw_item_number = v.item_no,
  raw_description_normalized = coalesce(pai.raw_description_normalized, lower(pai.raw_description)),
  match_type = v.mtype, match_confidence = 100, needs_review = false,
  approval_status = 'approved', approved_by = 'Chris Hussey', approved_at = now(),
  order_uom = coalesce(v.ord_uom, pai.order_uom),
  uom_conversion_factor = coalesce(v.conv, pai.uom_conversion_factor),
  notes = concat_ws(' | ', pai.notes, v.note), updated_at = now()
from (values
  ('df0bb65a-4e01-4f43-9d85-422eb46bfcd9'::uuid,'MALARKEY VISTA AR 3 BD/SQ','MALVIARIRSBOK3','color_variant','BD',3::numeric,
   'PEC-226 2026-08-22: Malarkey Vista is UL 2218 Class 4 line-wide, so the IR in the item code is not a variant. Sheet price is per BUNDLE and the invoice prices per SQUARE; Malarkey states 3 BD/SQ, recorded as uom_conversion_factor. Compare in SQ per docs/46.'),
  ('9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34'::uuid,'MALARKEY VISTA AR 3 BD/SQ','MALVIARIRSBOK3','color_variant',null,null,
   'PEC-226 2026-08-22: bound on OEM evidence that Vista is Class 4 line-wide. Denver invoice 0049707508-001 priced this at $202.00/SQ against a $135.00/SQ sheet.'),
  ('df0bb65a-4e01-4f43-9d85-422eb46bfcd9'::uuid,'MALARKEY RIDGEFLEX SG 12 X 31 LF/BD','MALHRARSB','color_variant',null,null,
   'PEC-226 2026-08-22: Malarkey RidgeFlex, 30 ft 11 in lineal coverage per bundle = the sheet''s 31 LF/BD.'),
  ('9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34'::uuid,'MALARKEY RIDGEFLEX SG 12" X 31 LF/BD','MALHRARSB','color_variant',null,null,
   'PEC-226 2026-08-22: Malarkey RidgeFlex, 30 ft 11 in lineal coverage per bundle = the sheet''s 31 LF/BD.'),
  ('df0bb65a-4e01-4f43-9d85-422eb46bfcd9'::uuid,'TAMKO HIP AND RIDGE','TAMHRARRBK','color_variant',null,null,
   'PEC-226 2026-08-22: the NON-IR TAMKO hip & ridge. Invoice reads LINE 2, CLASS 3. The IR sheet row was rejected - TAMKO IR is a separate Class 4 product.'),
  ('9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34'::uuid,'TAMKO HIP AND RIDGE 33 LF/BD','TAMHRARRBK','color_variant',null,null,
   'PEC-226 2026-08-22: the NON-IR TAMKO hip & ridge. Invoice reads LINE 2, CLASS 3.'),
  ('9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34'::uuid,'METAL FLASHINGS STEP FLASHING 4" X 4" X 8"','METFSP448BR','manual',null,null,
   'PEC-226 2026-08-22: item code 448 = the 4x4x8 dimension; invoiced $85.00/BD equals the sheet exactly. The 8"x8" sheet row was rejected as a different size.'),
  ('9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34'::uuid,'TOP SHIELD PRO4SWN OMNIRIDGE VENT W/NAIL','TOPTSPRO4SWN','exact','EA',1::numeric,
   'PEC-226 2026-08-22: Lomanco Omni Pro PRO4SWN under SRS private label. Sheet prices per PC, invoice per EA; the same part is sold under both unit names, so the conversion factor is 1.'),
  ('df0bb65a-4e01-4f43-9d85-422eb46bfcd9'::uuid,'TOP SHIELD STEEL BRV34 BATH PRO VENT','TOPTSBRV34','exact','EA',1::numeric,
   'PEC-226 2026-08-22: Lomanco Bath PRO BRV34 under SRS private label. PC and EA are one selling unit for this MPN, so the conversion factor is 1.')
) as v(agreement_id, descr, item_no, mtype, ord_uom, conv, note)
where pai.agreement_id = v.agreement_id
  and pai.raw_description = v.descr
  and pai.raw_item_number is null;

commit;

-- ---------------------------------------------------------------------------
-- 266b — split "IKO CAMBRIDGE AR" into its six colour SKUs.
--
-- raw_item_number holds ONE value, so a sheet row covering a colour family
-- needs one row per colour. The PARENT row is bound to the colour that office
-- actually buys (Melissa -> Dual Brown, the only colour with Texas evidence;
-- Colorado -> Earthtone Cedar, the only colour with Colorado evidence) rather
-- than left NULL. A NULL parent would stay eligible for the candidate
-- generator and re-queue these same six proposals on every refresh.
-- ---------------------------------------------------------------------------

begin;

update public.price_agreement_items pai set
  raw_item_number = v.item_no,
  raw_description_normalized = coalesce(pai.raw_description_normalized, lower(pai.raw_description)),
  match_type = 'color_variant', match_confidence = 100, needs_review = false,
  approval_status = 'approved', approved_by = 'Chris Hussey', approved_at = now(),
  notes = concat_ws(' | ', pai.notes,
    'PEC-226 2026-08-22: colour-family parent. IKO states Class 3 impact resistance and algae resistance are both standard to the whole Cambridge line with no separate IR SKU (oem_product_reference), so this sheet row and the CLASS 3 IMPACT RESISTANT invoice lines are the same product. Bound to the colour this office actually purchases; the other five colours are sibling rows created in the same migration.'),
  updated_at = now()
from (values
  ('df0bb65a-4e01-4f43-9d85-422eb46bfcd9'::uuid,'IKO CAMBRIDGE AR','IKOCADBRN'),
  ('9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34'::uuid,'IKO CAMBRIDGE AR 3 BD/SQ','IKOCAECN')
) as v(agreement_id, descr, item_no)
where pai.agreement_id = v.agreement_id
  and pai.raw_description = v.descr
  and pai.raw_item_number is null;

insert into public.price_agreement_items (
  agreement_id, raw_item_number, raw_description, raw_description_normalized,
  negotiated_price, price_uom, match_type, match_confidence, needs_review,
  approval_status, approved_by, approved_at, notes
)
select p.agreement_id, c.item_no,
       p.raw_description || ' - ' || c.colour,
       lower(p.raw_description || ' - ' || c.colour),
       p.negotiated_price, p.price_uom,
       'color_variant', 100, false,
       'approved', 'Chris Hussey', now(),
       'PEC-226 2026-08-22: colour sibling of the sheet row "' || p.raw_description ||
       '", which names the Cambridge line without naming a colour. IKO ships Class 3 impact '
       'resistance and algae resistance as standard across the whole line with no separate IR '
       'SKU (oem_product_reference), so the invoice wording "CLASS 3 IMPACT RESISTANT" describes '
       'this same product. Price and UOM inherited from the parent row.'
from (
  select id, agreement_id, raw_description, negotiated_price, price_uom, raw_item_number
  from public.price_agreement_items
  where (agreement_id = 'df0bb65a-4e01-4f43-9d85-422eb46bfcd9' and raw_description = 'IKO CAMBRIDGE AR')
     or (agreement_id = '9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34' and raw_description = 'IKO CAMBRIDGE AR 3 BD/SQ')
) p
cross join (values
  ('IKOCAWWN','WEATHERWOOD'), ('IKOCADBKN','DUAL BLACK'), ('IKOCACHGN','CHARCOAL GRAY'),
  ('IKOCADBRN','DUAL BROWN'), ('IKOCAECN','EARTHTONE CEDAR'), ('IKOCADGN','DUAL GRAY')
) as c(item_no, colour)
where c.item_no <> p.raw_item_number
  and not exists (
    select 1 from public.price_agreement_items x
    where x.agreement_id = p.agreement_id and x.raw_item_number = c.item_no
  );

commit;

-- Post-apply, in order:
--   select public.refresh_color_keys();
--   select * from public.refresh_price_agreement_item_candidates('df0bb65a-4e01-4f43-9d85-422eb46bfcd9');
--   select * from public.refresh_price_agreement_item_candidates('9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34');
--   select public.stamp_candidate_office_evidence();
