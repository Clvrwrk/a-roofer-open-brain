-- 249 — Chris's ruling (2026-08-21): Wichita Falls and Austin, TX branches are OUT OF
-- BOUNDARY. Additive + idempotent; reversible by restoring pricing_territory_office_id.
-- Applied to prod 2026-08-21.
--
-- Wichita Falls (ABC "wichita-falls-TX-76302-2723", QXO 249): auto-assigned to Richardson
-- THROUGH the now-closed Euless isochrone (migration 245), with no human territory
-- decision. 0 invoices, 0 agreements — nothing detaches.
--
-- Austin (ABC 39, ABC 465): assigned to Richardson by Chris on 2026-06-10 as deliberate
-- overrides; that decision is now reversed. Each carries exactly 1 invoice, both already
-- priced as no-price shop supplies (2007231503-001 "S.S.TOOLS" $645.16 and 2008557080-001
-- "TRUCK 102" $73.07 — 1 line each, 0 flagged, $0 at risk), so no dollar figure moves.
--
-- Verified after apply: no covered branch sits outside an active 2-hour isochrone —
-- office_for_point() and pricing_status now agree everywhere (0 exceptions).
UPDATE public.vendor_branches vb
   SET pricing_status               = 'out_of_boundary',
       pricing_territory_office_id  = NULL,
       suggested_office_id          = NULL,
       pricing_status_computed_at   = now(),
       territory_decided_by         = 'Chris Hussey',
       territory_decided_at         = now(),
       updated_at                   = now(),
       notes = TRIM(BOTH ' | ' FROM COALESCE(vb.notes,'') ||
               ' | 2026-08-21 (Chris): dropped OUT OF BOUNDARY. Not served from an active PE office.')
  FROM public.vendors ven
 WHERE ven.id = vb.vendor_id
   AND vb.pricing_status <> 'out_of_boundary'
   AND (
        (ven.slug = 'abc-supply' AND vb.branch_number IN ('39','465','wichita-falls-TX-76302-2723'))
     OR (ven.slug = 'qxo'        AND vb.branch_number = '249')
   );

REFRESH MATERIALIZED VIEW public.mv_invoice_pricing_office;
REFRESH MATERIALIZED VIEW public.mv_office_agreement_versions;
