-- 329 — Euless, TX: finish the archive (Chris, 2026-10-20). Additive + idempotent.
--
-- Chris: "The Euless, TX office is closed and can be archived and removed from the
-- Territory Map and any invoices related can pass through the Richardson, TX office."
--
-- STATE BEFORE (verified live 2026-10-20): office.is_active = false since 2026-08-05
-- (docs/82 R5, mig 245); 0 branches assigned, 0 suggested; 0 invoices resolve to Euless in
-- mv_invoice_pricing_office — every former Euless-ring branch already prices through
-- Richardson. What still leaked:
--   1. territory_snapshot() returned every office WITH a boundary, archived or not, and
--      every candidate row — so the RPC (and the offline snapshot JSON regenerated from
--      it) still drew the Euless ring. Now: active offices only, active candidates only.
--   2. frequently_ordered_office_map 'Wichita Falls TX' still pointed at Euless as a
--      primary. Re-pointed to Richardson as an alternate (Fort Worth stays Richardson's
--      primary, so Richardson does not get two primaries).
-- branch_office_candidate rows and the boundary polygon stay as history (hard rule 1).

CREATE OR REPLACE FUNCTION public.territory_snapshot()
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  SELECT json_build_object(
    'generated_at', now(),
    'counts', (SELECT json_object_agg(pricing_status, n) FROM (SELECT pricing_status, count(*) n FROM public.vendor_branches GROUP BY 1) t),
    'offices', (SELECT json_agg(json_build_object(
         'id',o.id,'name',o.name,'lat',o.latitude,'lng',o.longitude,'region',r.region_code,
         'drive_time_minutes',o.drive_time_minutes,'boundary',ST_AsGeoJSON(o.boundary,5)::json) ORDER BY o.name)
       FROM public.office o LEFT JOIN public.regions r ON r.id=o.region_id
       WHERE o.boundary IS NOT NULL AND o.is_active),
    'branches', (SELECT json_agg(json_build_object(
         'id',vb.id,'vendor',ven.name,'name',coalesce(nullif(vb.branch_name,''),vb.city),
         'city',vb.city,'state',vb.state,'lat',round(vb.latitude,5),'lng',round(vb.longitude,5),
         'status',vb.pricing_status,'assigned',vb.pricing_territory_office_id,'suggested',vb.suggested_office_id,
         'approved',public.branch_pricing_ok(vb.id),
         'cands',(SELECT json_agg(json_build_object('o',c.office_id,'km',c.straight_km) ORDER BY c.straight_km)
                   FROM public.branch_office_candidate c
                   JOIN public.office co ON co.id = c.office_id AND co.is_active
                  WHERE c.vendor_branch_id=vb.id)))
       FROM public.vendor_branches vb JOIN public.vendors ven ON ven.id=vb.vendor_id
       WHERE vb.geocode_status='ok')
  );
$function$;

UPDATE public.frequently_ordered_office_map f
   SET office_id  = o.id,
       is_primary = false,
       note       = 'Richardson, TX office (alternate) — re-pointed from Euless, TX 2026-10-20 (Chris; Euless closed, mig 329)'
  FROM public.office o
 WHERE f.source_label = 'Wichita Falls TX'
   AND o.name = 'Richardson, TX'
   AND f.office_id IS DISTINCT FROM o.id;

UPDATE public.office
   SET notes = TRIM(BOTH ' · ' FROM COALESCE(notes,'') ||
               ' · 2026-10-20 (Chris): confirmed closed and archived; removed from the territory map (territory_snapshot active-only, mig 329). Any Euless-area invoices price through Richardson, TX.'),
       updated_at = now()
 WHERE name = 'Euless, TX'
   AND COALESCE(notes,'') NOT LIKE '%mig 329%';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.office WHERE name = 'Euless, TX' AND is_active) THEN
    RAISE EXCEPTION '329 Euless is still active';
  END IF;
  IF position('Euless' in public.territory_snapshot()::text) > 0 THEN
    RAISE EXCEPTION '329 territory_snapshot still emits Euless';
  END IF;
  IF EXISTS (SELECT 1 FROM public.frequently_ordered_office_map f JOIN public.office o ON o.id = f.office_id
              WHERE NOT o.is_active) THEN
    RAISE EXCEPTION '329 frequently_ordered_office_map still points at an inactive office';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vendor_branches vb JOIN public.office o ON o.id = vb.pricing_territory_office_id
              WHERE NOT o.is_active) THEN
    RAISE EXCEPTION '329 a branch is still assigned to an inactive office';
  END IF;
  RAISE NOTICE '329 ok — Euless fully archived; Richardson carries its area';
END $$;
