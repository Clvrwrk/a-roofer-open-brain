-- cleverwork-roofer/20-client-job-crew.sql
-- Client (the roofing company; 'self' in single-tenant), jobs, crews.
-- Jobs are foreign-keyed to the property. Idempotent.

BEGIN;

-- The owning company. In a single-client brain there is one row ('self'),
-- but the column exists so a future Cleverwork meta-brain can ingest by client.
CREATE TABLE IF NOT EXISTS public.client (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,                       -- e.g. "self" or "acme-roofing"
  name TEXT NOT NULL,
  trades TEXT[] NOT NULL DEFAULT ARRAY['roofing'],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug)
);

-- A roofing engagement at a property.
CREATE TABLE IF NOT EXISTS public.job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.client(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.property(id) ON DELETE SET NULL,
  external_ref TEXT,                         -- AccuLynx job id, etc.
  source_system TEXT,                        -- "acculynx" | "jobtread" | "startinfinity" | ...
  title TEXT,
  job_phase TEXT NOT NULL DEFAULT 'lead' CHECK (
    job_phase IN ('lead','estimate','won','in_progress','punch','closed','warranty','lost')
  ),
  trade TEXT NOT NULL DEFAULT 'roofing',
  scope_summary TEXT,
  contract_amount NUMERIC(14,2),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_property ON public.job (property_id);
CREATE INDEX IF NOT EXISTS idx_job_phase ON public.job (job_phase, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_external
  ON public.job (source_system, external_ref)
  WHERE external_ref IS NOT NULL;

-- People involved in a job — captured for relational equity (the debrief surfaces these).
CREATE TABLE IF NOT EXISTS public.crew (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.job(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  role TEXT,                                 -- "foreman" | "pm" | "estimator" | "sub" | "crew"
  tenure_years INT,
  is_subcontractor BOOLEAN NOT NULL DEFAULT false,
  consent_to_attribute BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crew_job ON public.crew (job_id);

DROP TRIGGER IF EXISTS trg_client_updated_at ON public.client;
CREATE TRIGGER trg_client_updated_at BEFORE UPDATE ON public.client
  FOR EACH ROW EXECUTE FUNCTION public.thoughts_set_updated_at();
DROP TRIGGER IF EXISTS trg_job_updated_at ON public.job;
CREATE TRIGGER trg_job_updated_at BEFORE UPDATE ON public.job
  FOR EACH ROW EXECUTE FUNCTION public.thoughts_set_updated_at();

ALTER TABLE public.client ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_service_role_all ON public.client;
CREATE POLICY client_service_role_all ON public.client
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS job_service_role_all ON public.job;
CREATE POLICY job_service_role_all ON public.job
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS crew_service_role_all ON public.crew;
CREATE POLICY crew_service_role_all ON public.crew
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crew   TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
