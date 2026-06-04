-- cleverwork-roofer/50-consent-access-log.sql
-- The cross-client property read path (the moat) + its audit log.
-- Consent is enforced HERE, in code — not in policy docs. Idempotent.

BEGIN;

-- Every cross-client property atom read is logged. Maintenance audits this monthly
-- for scraping-shaped patterns.
CREATE TABLE IF NOT EXISTS public.atom_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thought_id UUID REFERENCES public.thoughts(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.property(id) ON DELETE SET NULL,
  requesting_client_id UUID REFERENCES public.client(id) ON DELETE SET NULL,
  requesting_agent TEXT,                     -- e.g. "historian"
  requesting_trade TEXT,
  query TEXT,
  access_granted BOOLEAN NOT NULL,
  denied_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_access_log_property ON public.atom_access_log (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_requester ON public.atom_access_log (requesting_client_id, created_at DESC);

-- Consent-gated, anonymized cross-client property history.
-- Returns shareable atoms about a property that were NOT authored by the
-- requesting client, dropping any atom whose trade_restriction includes the
-- requester's trade. Source client is anonymized. Every returned row is logged.
CREATE OR REPLACE FUNCTION public.property_history_for(
  p_property_id UUID,
  p_requesting_client_id UUID,
  p_requesting_trade TEXT,
  p_requesting_agent TEXT DEFAULT 'historian',
  p_query TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  thought_id UUID,
  content TEXT,
  era_of_practice TEXT,
  original_capture_date DATE,
  anonymized_source TEXT,
  trust_tier TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  r RECORD;
BEGIN
  IF p_property_id IS NULL OR p_requesting_client_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT
      t.id,
      t.content,
      t.era_of_practice,
      t.original_capture_date,
      t.trust_tier,
      t.client_id,
      t.created_at
    FROM public.thoughts t
    WHERE t.property_id = p_property_id
      AND t.client_id IS DISTINCT FROM p_requesting_client_id          -- not your own atoms
      AND t.cold_archive_status <> 'deprecated'
      AND COALESCE((t.consent_flags->>'cross_client_shareable')::boolean, false) = true
      -- requester's trade must NOT be in the atom's trade_restriction list
      AND NOT COALESCE(
            t.consent_flags->'trade_restriction' @> to_jsonb(ARRAY[p_requesting_trade]),
            false)
      -- consent not expired
      AND (
            t.consent_flags->>'expires_at' IS NULL
            OR (t.consent_flags->>'expires_at')::timestamptz > now()
          )
    ORDER BY t.original_capture_date DESC NULLS LAST, t.created_at DESC
    LIMIT v_limit
  LOOP
    -- log the grant
    INSERT INTO public.atom_access_log
      (thought_id, property_id, requesting_client_id, requesting_agent, requesting_trade, query, access_granted)
    VALUES
      (r.id, p_property_id, p_requesting_client_id, p_requesting_agent, p_requesting_trade, p_query, true);

    thought_id := r.id;
    content := r.content;
    era_of_practice := r.era_of_practice;
    original_capture_date := r.original_capture_date;
    anonymized_source := 'prior contractor (different trade)';
    trust_tier := r.trust_tier;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- RLS + least privilege
ALTER TABLE public.atom_access_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS access_log_service_role_all ON public.atom_access_log;
CREATE POLICY access_log_service_role_all ON public.atom_access_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atom_access_log TO service_role;

-- Service-role only (the internal MCP container is the sole caller; never expose to authenticated/anon)
REVOKE EXECUTE ON FUNCTION public.property_history_for(UUID, UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.property_history_for(UUID, UUID, TEXT, TEXT, TEXT, INT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.property_history_for(UUID, UUID, TEXT, TEXT, TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.property_history_for(UUID, UUID, TEXT, TEXT, TEXT, INT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
