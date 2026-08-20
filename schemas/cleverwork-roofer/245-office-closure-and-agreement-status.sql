-- 245 — record three business decisions (Chris, 2026-08-20). Additive + idempotent.
--   1. Euless, TX is PERMANENTLY CLOSED. Richardson, TX is the only DFW office.
--   2. Atlanta x ABC agreement is PENDING.
--   3. QXO knowingly operates with no negotiated book across 59 covered branches.

-- ── 1. Euless closure ────────────────────────────────────────────────────────
-- Safe to close: 0 branches assigned, 0 suggested, 0 agreements. 51 branches sit inside its
-- isochrone but 49 are also inside Richardson's, and the 2 that are Euless-only (Wichita
-- Falls, TX — ABC + QXO) are ALREADY explicitly assigned to Richardson and covered.
-- No branch changes office and no price changes as a result of this.
UPDATE public.office
   SET is_active  = false,
       updated_at = now(),
       notes      = TRIM(BOTH ' · ' FROM COALESCE(notes,'') ||
                    ' · CLOSED PERMANENTLY 2026-08-20 (Chris). Richardson, TX is the only DFW office. Boundary retained for history; office_for_point() excludes inactive offices from any future assignment.')
 WHERE name ILIKE 'Euless%' AND is_active IS DISTINCT FROM false;

-- Nothing gated on office.is_active before this, so containment must now be asked through a
-- helper that knows about closure. The isochrone is kept so history still resolves.
CREATE OR REPLACE FUNCTION public.office_for_point(p_longitude numeric, p_latitude numeric)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT o.id
    FROM public.office o
   WHERE o.is_active
     AND o.boundary IS NOT NULL
     AND p_longitude IS NOT NULL AND p_latitude IS NOT NULL
     AND ST_Contains(o.boundary, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326))
   ORDER BY o.name
   LIMIT 1
$$;
COMMENT ON FUNCTION public.office_for_point(numeric, numeric) IS
  'PE office whose 2-hour isochrone contains the point, ACTIVE offices only (migration 245). Use this for every branch->office assignment; a closed office keeps its boundary for history and must never win an assignment.';

-- CONSEQUENCE, flagged not decided: the two Wichita Falls branches (ABC + QXO 249) were
-- auto-assigned to Richardson THROUGH the Euless isochrone and have no human territory
-- decision. With Euless closed they sit inside no active boundary. Their assignment is left
-- as-is (no coverage change today) but is annotated, because an automated re-sweep would
-- silently drop them to out_of_boundary. Needs a keep-or-drop ruling from Chris.
-- (The two Austin, TX branches are also outside every boundary, but they carry
--  territory_decided_by = 'Chris Hussey' from 2026-06-10 — deliberate overrides, unrelated.)
UPDATE public.vendor_branches vb
   SET notes = TRIM(BOTH ' | ' FROM COALESCE(vb.notes,'') ||
       ' | 2026-08-20: assigned to Richardson, TX automatically via the EULESS isochrone, which is now CLOSED (migration 245). This branch is inside no active 2-hour boundary. Assignment left AS-IS — no coverage change today — but it has no human territory decision, so an automated re-sweep would drop it to out_of_boundary. Needs a keep-or-drop ruling.'),
       updated_at = now()
 WHERE vb.pricing_status = 'covered'
   AND vb.territory_decided_by IS NULL
   AND vb.geom IS NOT NULL
   AND public.office_for_point(vb.longitude, vb.latitude) IS NULL
   AND vb.notes IS DISTINCT FROM NULL
   AND vb.notes NOT LIKE '%EULESS isochrone, which is now CLOSED%';

-- ── 2/3. office x vendor agreement posture ───────────────────────────────────
-- docs/98 produced this matrix as a one-off query. A table makes "pending" a first-class
-- state with an owner and a date, instead of a fact that lives only in a report.
CREATE TABLE IF NOT EXISTS public.office_vendor_agreement_status (
  office_id   uuid NOT NULL REFERENCES public.office(id),
  vendor_id   uuid NOT NULL REFERENCES public.vendors(id),
  status      text NOT NULL,
  note        text,
  target_date date,
  decided_by  text,
  decided_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (office_id, vendor_id),
  CONSTRAINT office_vendor_agreement_status_chk
    CHECK (status IN ('active','pending','no_book','not_pursued'))
);
COMMENT ON TABLE public.office_vendor_agreement_status IS
  'Per (PE office, vendor) negotiated-agreement posture. active = in-force book exists; pending = being negotiated; no_book = knowingly buying without one; not_pursued = deliberate. Added migration 245.';

INSERT INTO public.office_vendor_agreement_status (office_id, vendor_id, status, note, decided_by)
SELECT o.id, ven.id, 'pending',
       'Agreement being pursued. 19 covered ABC branches; $5,226.90 of ABC spend already invoiced against this office and un-auditable until a book exists.',
       'Chris Hussey'
  FROM public.office o, public.vendors ven
 WHERE o.name ILIKE 'Atlanta%' AND ven.slug = 'abc-supply'
ON CONFLICT (office_id, vendor_id) DO UPDATE
   SET status = EXCLUDED.status, note = EXCLUDED.note,
       decided_by = EXCLUDED.decided_by, updated_at = now();

INSERT INTO public.office_vendor_agreement_status (office_id, vendor_id, status, note, decided_by)
SELECT o.id, ven.id, 'no_book',
       'QXO: 59 covered branches across all offices with no negotiated book. Known and accepted state as at 2026-08-20 — QXO lines price as no-price by design, not by defect.',
       'Chris Hussey'
  FROM public.office o, public.vendors ven
 WHERE ven.slug = 'qxo' AND o.is_active
ON CONFLICT (office_id, vendor_id) DO UPDATE
   SET status = EXCLUDED.status, note = EXCLUDED.note,
       decided_by = EXCLUDED.decided_by, updated_at = now();

-- the standing version of the docs/98 audit
CREATE OR REPLACE VIEW public.v_office_vendor_agreement_coverage AS
SELECT o.id AS office_id, o.name AS office, o.is_active AS office_active,
       ven.id AS vendor_id, ven.slug AS vendor,
       (SELECT count(*) FROM public.vendor_branches vb
         WHERE vb.pricing_territory_office_id = o.id AND vb.vendor_id = ven.id
           AND vb.pricing_status = 'covered') AS covered_branches,
       CASE WHEN ven.slug = 'abc-supply'
            THEN (SELECT count(DISTINCT oav.agreement_id) FROM public.mv_office_agreement_versions oav
                   WHERE oav.office_id = o.id)
            ELSE (SELECT count(DISTINCT pa.id) FROM public.price_agreements pa
                    JOIN public.vendor_branches vb2 ON vb2.id = pa.vendor_branch_id
                   WHERE pa.vendor_id = ven.id AND pa.is_active IS NOT FALSE
                     AND vb2.pricing_territory_office_id = o.id)
       END AS live_agreements,
       COALESCE(s.status, 'unrecorded') AS status,
       s.note, s.target_date, s.decided_by, s.decided_at
  FROM public.office o
 CROSS JOIN public.vendors ven
  LEFT JOIN public.office_vendor_agreement_status s
         ON s.office_id = o.id AND s.vendor_id = ven.id
 WHERE EXISTS (SELECT 1 FROM public.vendor_branches vb
                WHERE vb.vendor_id = ven.id AND vb.pricing_territory_office_id = o.id);

COMMENT ON VIEW public.v_office_vendor_agreement_coverage IS
  'Standing version of the docs/98 audit: covered branches vs live agreements vs recorded posture, per (office, vendor). status=unrecorded means nobody has ruled on that pair yet.';

-- Post-apply state: Euless is_active=false / 0 branches. Atlanta x ABC = pending.
-- QXO x 5 active offices = no_book (12+14+13+15+5 = 59 branches). 8 pairs remain
-- 'unrecorded', of which TWO still have no book and no ruling: Atlanta x SRS (11 branches)
-- and Kansas City x SRS (3 branches).
