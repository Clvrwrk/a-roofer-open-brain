-- cleverwork-roofer/40-atom-extensions.sql
-- Extend OB1's public.thoughts (the atom table) with property-first, era-aware,
-- model-agnostic, consent-bearing fields. Runs AFTER 10/20/30 so the FKs resolve.
-- Additive + idempotent: ADD COLUMN IF NOT EXISTS, drop-then-add CHECKs.

BEGIN;

-- Foreign keys to the property-first entities
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.property(id) ON DELETE SET NULL;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.client(id) ON DELETE SET NULL;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.job(id) ON DELETE SET NULL;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS regulatory_snapshot_id UUID REFERENCES public.regulatory_snapshot(id) ON DELETE SET NULL;

-- Trust + provenance + model-agnostic capture
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS trust_tier TEXT NOT NULL DEFAULT 'evidence';
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS model_card JSONB;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS tool_spec_hash TEXT;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS revalidation_timestamp TIMESTAMPTZ;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS confidence_at_recall NUMERIC(4,3);

-- Era-awareness
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS era_of_practice TEXT;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS original_capture_date DATE;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS original_practitioner JSONB;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS recontextualization_notes TEXT;

-- EEAT + debrief track + consent + lifecycle
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS eeat_signal JSONB;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS soft_or_hard TEXT;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS consent_flags JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS cold_archive_status TEXT NOT NULL DEFAULT 'live';
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS source_link_broken BOOLEAN NOT NULL DEFAULT false;

-- Enumerated constraints (drop-then-add for re-runnability)
ALTER TABLE public.thoughts DROP CONSTRAINT IF EXISTS thoughts_trust_tier_check;
ALTER TABLE public.thoughts ADD CONSTRAINT thoughts_trust_tier_check
  CHECK (trust_tier IN ('instruction','evidence','inference'));

ALTER TABLE public.thoughts DROP CONSTRAINT IF EXISTS thoughts_soft_or_hard_check;
ALTER TABLE public.thoughts ADD CONSTRAINT thoughts_soft_or_hard_check
  CHECK (soft_or_hard IS NULL OR soft_or_hard IN ('hard','soft'));

ALTER TABLE public.thoughts DROP CONSTRAINT IF EXISTS thoughts_cold_archive_status_check;
ALTER TABLE public.thoughts ADD CONSTRAINT thoughts_cold_archive_status_check
  CHECK (cold_archive_status IN ('live','archived','deprecated'));

-- Indexes for the new access paths
CREATE INDEX IF NOT EXISTS idx_thoughts_property ON public.thoughts (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_thoughts_job ON public.thoughts (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_thoughts_trust_tier ON public.thoughts (trust_tier);
CREATE INDEX IF NOT EXISTS idx_thoughts_era ON public.thoughts (era_of_practice) WHERE era_of_practice IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_thoughts_cold_archive ON public.thoughts (cold_archive_status);
-- GIN for consent filtering on the cross-client read path
CREATE INDEX IF NOT EXISTS idx_thoughts_consent_flags ON public.thoughts USING gin (consent_flags);
-- Partial index: publishable EEAT candidates
CREATE INDEX IF NOT EXISTS idx_thoughts_eeat_publishable
  ON public.thoughts USING gin (eeat_signal)
  WHERE eeat_signal IS NOT NULL;

-- Discoverability
COMMENT ON COLUMN public.thoughts.property_id IS 'FK to property when the atom is about a place. Property-first model.';
COMMENT ON COLUMN public.thoughts.trust_tier IS 'instruction | evidence | inference. Inferred defaults to evidence; only Quality Control promotes to instruction.';
COMMENT ON COLUMN public.thoughts.era_of_practice IS 'Regulatory/practice era the atom describes, e.g. IRC-2018. Required for 5-year reliability.';
COMMENT ON COLUMN public.thoughts.consent_flags IS 'JSON: {cross_client_shareable, trade_restriction[], publishable_external, expires_at}.';
COMMENT ON COLUMN public.thoughts.eeat_signal IS 'JSON: {type, value, publishable_with_consent, consent_recorded_at}. Powers the EEAT flywheel.';

NOTIFY pgrst, 'reload schema';

COMMIT;
