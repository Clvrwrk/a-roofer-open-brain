-- cleverwork-roofer/89-jurisdiction-snapshot.sql
-- Jurisdiction + regulatory_snapshot, extracted from 10-property-jurisdiction.sql
-- for brains where the full OB1 property core was not applied (live Pro Exteriors
-- brain uses public.properties + public.acculynx_jobs instead — see 90/91 headers).
-- The kb research loop (91) requires these two tables for era-aware findings.
-- ADDITIVE + IDEMPOTENT.

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

DROP TRIGGER IF EXISTS jurisdiction_set_updated_at ON public.jurisdiction;
CREATE TRIGGER jurisdiction_set_updated_at BEFORE UPDATE ON public.jurisdiction
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['jurisdiction','regulatory_snapshot']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
