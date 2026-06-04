-- cleverwork-roofer/10-property-jurisdiction.sql
-- The property-first core: jurisdiction → regulatory_snapshot timeline → property.
-- Property is the primary entity of a roofer's brain. Idempotent.

BEGIN;

-- A permitting authority / code regime (city, county, AHJ).
CREATE TABLE IF NOT EXISTS public.jurisdiction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                       -- e.g. "City of Austin, TX"
  ahj TEXT,                                 -- authority having jurisdiction / dept
  state TEXT,
  county TEXT,
  wind_zone TEXT,                           -- e.g. "Vult 115 mph"
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

-- Timeline of the building code / regulation in effect for a jurisdiction.
-- Atoms point at the snapshot active when the underlying fact was true (era-awareness).
CREATE TABLE IF NOT EXISTS public.regulatory_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id UUID NOT NULL REFERENCES public.jurisdiction(id) ON DELETE CASCADE,
  code_family TEXT NOT NULL,                -- e.g. "IRC", "IBC", "OSHA"
  code_version TEXT NOT NULL,               -- e.g. "2021", "2024-silica-rule"
  effective_from DATE NOT NULL,
  effective_to DATE,                        -- NULL = currently in effect
  amendments TEXT,                          -- local amendment summary
  source_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction_id, code_family, code_version, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_regsnapshot_jurisdiction
  ON public.regulatory_snapshot (jurisdiction_id, effective_from DESC);

-- The PROPERTY — primary key of the brain. Clients/jobs/atoms are foreign keys.
CREATE TABLE IF NOT EXISTS public.property (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id TEXT,                           -- assessor parcel number
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  jurisdiction_id UUID REFERENCES public.jurisdiction(id) ON DELETE SET NULL,
  year_built INT,
  structure_type TEXT,                      -- e.g. "single-family", "multifamily", "commercial"
  roof_type TEXT,                           -- e.g. "asphalt-shingle", "metal", "TPO", "tile"
  soil_profile TEXT,
  climate_zone TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One address (or parcel) resolves to one property row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_parcel
  ON public.property (parcel_id) WHERE parcel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_address
  ON public.property (lower(address_line1), lower(coalesce(city,'')), coalesce(postal_code,''));
CREATE INDEX IF NOT EXISTS idx_property_jurisdiction
  ON public.property (jurisdiction_id);

-- Per-jurisdiction inspector preferences, captured by Capture from debrief atoms.
CREATE TABLE IF NOT EXISTS public.inspector_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id UUID NOT NULL REFERENCES public.jurisdiction(id) ON DELETE CASCADE,
  inspector_name TEXT,
  preference TEXT NOT NULL,                 -- e.g. "wants drip edge photos before close"
  source_thought_id UUID REFERENCES public.thoughts(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inspector_notes_jurisdiction
  ON public.inspector_notes (jurisdiction_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_jurisdiction_updated_at ON public.jurisdiction;
CREATE TRIGGER trg_jurisdiction_updated_at BEFORE UPDATE ON public.jurisdiction
  FOR EACH ROW EXECUTE FUNCTION public.thoughts_set_updated_at();
DROP TRIGGER IF EXISTS trg_property_updated_at ON public.property;
CREATE TRIGGER trg_property_updated_at BEFORE UPDATE ON public.property
  FOR EACH ROW EXECUTE FUNCTION public.thoughts_set_updated_at();

-- RLS: service_role only (the internal MCP container is the sole caller)
ALTER TABLE public.jurisdiction        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspector_notes     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jurisdiction_service_role_all ON public.jurisdiction;
CREATE POLICY jurisdiction_service_role_all ON public.jurisdiction
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS regsnapshot_service_role_all ON public.regulatory_snapshot;
CREATE POLICY regsnapshot_service_role_all ON public.regulatory_snapshot
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS property_service_role_all ON public.property;
CREATE POLICY property_service_role_all ON public.property
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS inspector_notes_service_role_all ON public.inspector_notes;
CREATE POLICY inspector_notes_service_role_all ON public.inspector_notes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jurisdiction        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.regulatory_snapshot TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.property            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inspector_notes     TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
