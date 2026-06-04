-- cleverwork-roofer/70-vendor-territory-pricing.sql
-- Vendor pricing territories: PE offices project a drive-time boundary; vendor
-- branches inside inherit that office's regional negotiated price; branches in
-- two boundaries wait for a human decision; branches outside need their own
-- negotiated agreement before purchase. The pricing-approved gate
-- (branch_pricing_ok) protects job margin at invoice-paid time.
--
-- Builds on the live multi-vendor schema (vendors, vendor_branches, regions,
-- price_agreements) and PostGIS. ADDITIVE + IDEMPOTENT per CONVENTIONS §1/Hard-rule-1:
-- CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE. No drops.
-- Service-role-only posture (CONVENTIONS §4): RLS enabled, no anon/authenticated
-- policies, EXECUTE/SELECT granted to service_role; revoked from anon/authenticated.

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── Shared updated_at trigger ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cw_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ── PE offices ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.office (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  office_type          text NOT NULL DEFAULT 'brick_mortar'
                         CHECK (office_type IN ('brick_mortar','satellite')),
  region_id            uuid REFERENCES public.regions(id),
  address              text,
  city                 text,
  state                text,
  postal_code          text,
  latitude             numeric,
  longitude            numeric,
  geom                 geometry(Point,4326) GENERATED ALWAYS AS (
                         CASE WHEN longitude IS NOT NULL AND latitude IS NOT NULL
                           THEN ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)
                         END) STORED,
  geocode_status       text NOT NULL DEFAULT 'pending'
                         CHECK (geocode_status IN ('pending','ok','failed','manual')),
  drive_time_minutes   integer NOT NULL DEFAULT 120,
  boundary             geometry(Polygon,4326),       -- cached drive-time isochrone
  boundary_method      text,                          -- 'google_routes_bearing_v1' | 'radius_fallback'
  boundary_computed_at timestamptz,
  is_active            boolean NOT NULL DEFAULT true,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.office IS
  'Pro Exteriors physical offices. Each projects a drive_time_minutes isochrone (boundary). An office''s negotiated price = the active price_agreement for its region_id.';

-- ── Geo + territory columns on vendor_branches (additive) ─────────────────────
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS latitude  numeric;
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS geom geometry(Point,4326)
  GENERATED ALWAYS AS (
    CASE WHEN longitude IS NOT NULL AND latitude IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)
    END) STORED;
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS geocode_precision text;
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS pricing_territory_office_id uuid;
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS suggested_office_id uuid;
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS pricing_status text NOT NULL DEFAULT 'unclassified';
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS pricing_status_computed_at timestamptz;
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS territory_decided_by text;
ALTER TABLE public.vendor_branches ADD COLUMN IF NOT EXISTS territory_decided_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_branches_pricing_territory_office_fk') THEN
    ALTER TABLE public.vendor_branches
      ADD CONSTRAINT vendor_branches_pricing_territory_office_fk
      FOREIGN KEY (pricing_territory_office_id) REFERENCES public.office(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_branches_suggested_office_fk') THEN
    ALTER TABLE public.vendor_branches
      ADD CONSTRAINT vendor_branches_suggested_office_fk
      FOREIGN KEY (suggested_office_id) REFERENCES public.office(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_branches_pricing_status_chk') THEN
    ALTER TABLE public.vendor_branches
      ADD CONSTRAINT vendor_branches_pricing_status_chk
      CHECK (pricing_status IN ('unclassified','covered','overlap_pending','out_of_boundary'));
  END IF;
END $$;

-- ── Overlap candidates / decision basis ───────────────────────────────────────
-- One row per (branch, office) whose boundary contains the branch. >1 row = overlap.
CREATE TABLE IF NOT EXISTS public.branch_office_candidate (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_branch_id uuid NOT NULL REFERENCES public.vendor_branches(id) ON DELETE CASCADE,
  office_id        uuid NOT NULL REFERENCES public.office(id) ON DELETE CASCADE,
  contains         boolean NOT NULL DEFAULT true,   -- branch inside this office boundary
  drive_minutes    numeric,                          -- office -> branch drive time (for nearest suggestion)
  straight_km      numeric,
  is_suggested     boolean NOT NULL DEFAULT false,   -- nearest office, the suggested default on overlap
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_branch_id, office_id)
);

COMMENT ON TABLE public.branch_office_candidate IS
  'Every office whose drive-time boundary contains a given vendor branch. Multiple rows for one branch = overlap requiring a human pick (suggested = nearest by drive time).';

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS office_geom_gist      ON public.office USING gist (geom);
CREATE INDEX IF NOT EXISTS office_boundary_gist  ON public.office USING gist (boundary);
CREATE INDEX IF NOT EXISTS office_region_idx     ON public.office (region_id);
CREATE INDEX IF NOT EXISTS vendor_branches_geom_gist ON public.vendor_branches USING gist (geom);
CREATE INDEX IF NOT EXISTS vendor_branches_pricing_status_idx ON public.vendor_branches (pricing_status);
CREATE INDEX IF NOT EXISTS vendor_branches_terr_office_idx ON public.vendor_branches (pricing_territory_office_id);
CREATE INDEX IF NOT EXISTS boc_branch_idx ON public.branch_office_candidate (vendor_branch_id);
CREATE INDEX IF NOT EXISTS boc_office_idx ON public.branch_office_candidate (office_id);

-- ── updated_at triggers ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS office_set_updated_at ON public.office;
CREATE TRIGGER office_set_updated_at BEFORE UPDATE ON public.office
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

-- ── Pricing-approved gate ─────────────────────────────────────────────────────
-- TRUE when the branch is covered by an approved (active + CEO-verified, in-date)
-- price agreement: either its assigned office's REGIONAL agreement, or a
-- BRANCH-level agreement (the out-of-boundary negotiated case).
CREATE OR REPLACE FUNCTION public.branch_pricing_ok(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  WITH b AS (
    SELECT vb.id,
           vb.pricing_territory_office_id,
           o.region_id AS office_region_id
    FROM public.vendor_branches vb
    LEFT JOIN public.office o ON o.id = vb.pricing_territory_office_id
    WHERE vb.id = p_branch_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.price_agreements pa, b
    WHERE pa.is_active IS TRUE
      AND pa.ceo_verified IS TRUE
      AND (pa.effective_date IS NULL OR pa.effective_date <= current_date)
      AND (pa.expiry_date    IS NULL OR pa.expiry_date    >= current_date)
      AND (
            (b.office_region_id IS NOT NULL AND pa.region_id = b.office_region_id)
         OR (pa.vendor_branch_id = b.id)
          )
  );
$$;

COMMENT ON FUNCTION public.branch_pricing_ok(uuid) IS
  'Pricing-approved gate. TRUE only if the branch has an approved (active+ceo_verified, in-date) regional OR branch-level price agreement. Invoice-paid must block when FALSE.';

-- ── Dashboard read view ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_branch_territory AS
SELECT
  vb.id              AS vendor_branch_id,
  vb.vendor_id,
  ven.name           AS vendor_name,
  vb.branch_number,
  vb.branch_name,
  vb.city, vb.state,
  vb.latitude, vb.longitude,
  vb.geocode_status,
  vb.pricing_status,
  vb.pricing_territory_office_id,
  o.name             AS assigned_office_name,
  vb.suggested_office_id,
  so.name            AS suggested_office_name,
  vb.territory_decided_by,
  vb.territory_decided_at,
  public.branch_pricing_ok(vb.id) AS pricing_approved,
  (SELECT count(*) FROM public.branch_office_candidate c WHERE c.vendor_branch_id = vb.id) AS candidate_office_count
FROM public.vendor_branches vb
JOIN public.vendors ven ON ven.id = vb.vendor_id
LEFT JOIN public.office o  ON o.id  = vb.pricing_territory_office_id
LEFT JOIN public.office so ON so.id = vb.suggested_office_id;

COMMENT ON VIEW public.v_branch_territory IS
  'Per-branch territory + pricing-gate status for the Territories map and the invoice gate.';

-- ── RLS + least-privilege grants (CONVENTIONS §4) ─────────────────────────────
ALTER TABLE public.office ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_office_candidate ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.office, public.branch_office_candidate FROM anon, authenticated;
GRANT  ALL ON TABLE public.office, public.branch_office_candidate TO service_role;
GRANT  SELECT ON public.v_branch_territory TO service_role;
REVOKE ALL ON public.v_branch_territory FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.branch_pricing_ok(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.branch_pricing_ok(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
