-- cleverwork-roofer/30-insurance-warranty.sql
-- Roofer-first domain: storm/insurance claims and manufacturer warranties.
-- Insurance work is a primary revenue motion for roofers; model it explicitly. Idempotent.

BEGIN;

-- An insurance claim tied to a job/property (storm, hail, wind).
CREATE TABLE IF NOT EXISTS public.insurance_claim (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.job(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.property(id) ON DELETE SET NULL,
  carrier TEXT,                              -- e.g. "State Farm"
  claim_number TEXT,
  adjuster_name TEXT,
  adjuster_contact TEXT,
  date_of_loss DATE,
  peril TEXT,                                -- "hail" | "wind" | "hurricane" | ...
  claim_status TEXT NOT NULL DEFAULT 'filed' CHECK (
    claim_status IN ('filed','inspection_scheduled','approved','partial','denied','supplement_pending','supplement_approved','paid','closed')
  ),
  estimate_platform TEXT,                    -- "xactimate" | "symbility" | ...
  rcv_amount NUMERIC(14,2),                  -- replacement cost value
  acv_amount NUMERIC(14,2),                  -- actual cash value
  deductible NUMERIC(14,2),
  depreciation_recoverable NUMERIC(14,2),
  supplement_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claim_job ON public.insurance_claim (job_id);
CREATE INDEX IF NOT EXISTS idx_claim_property ON public.insurance_claim (property_id);
CREATE INDEX IF NOT EXISTS idx_claim_status ON public.insurance_claim (claim_status, updated_at DESC);

-- Manufacturer warranty registered for work on a property (GAF, Owens Corning, CertainTeed).
CREATE TABLE IF NOT EXISTS public.manufacturer_warranty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.property(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.job(id) ON DELETE SET NULL,
  manufacturer TEXT NOT NULL,                -- "GAF" | "Owens Corning" | "CertainTeed"
  product_line TEXT,                         -- "Timberline HDZ", etc.
  warranty_type TEXT,                        -- "system" | "shingle-only" | "golden-pledge"
  certification_used TEXT,                   -- "Master Elite", "Platinum Preferred"
  coverage_years INT,
  transferable BOOLEAN,
  registration_number TEXT,
  registered_at DATE,
  expires_at DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranty_property ON public.manufacturer_warranty (property_id);
CREATE INDEX IF NOT EXISTS idx_warranty_job ON public.manufacturer_warranty (job_id);

DROP TRIGGER IF EXISTS trg_claim_updated_at ON public.insurance_claim;
CREATE TRIGGER trg_claim_updated_at BEFORE UPDATE ON public.insurance_claim
  FOR EACH ROW EXECUTE FUNCTION public.thoughts_set_updated_at();
DROP TRIGGER IF EXISTS trg_warranty_updated_at ON public.manufacturer_warranty;
CREATE TRIGGER trg_warranty_updated_at BEFORE UPDATE ON public.manufacturer_warranty
  FOR EACH ROW EXECUTE FUNCTION public.thoughts_set_updated_at();

ALTER TABLE public.insurance_claim        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_warranty  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claim_service_role_all ON public.insurance_claim;
CREATE POLICY claim_service_role_all ON public.insurance_claim
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS warranty_service_role_all ON public.manufacturer_warranty;
CREATE POLICY warranty_service_role_all ON public.manufacturer_warranty
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.insurance_claim       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.manufacturer_warranty TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
