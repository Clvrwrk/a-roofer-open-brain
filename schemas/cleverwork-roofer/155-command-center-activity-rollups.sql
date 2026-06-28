-- 155 — Command Center activity rollups (no PII)
-- DevTeam Session Analyst reads via /api/dev/activity-summary

CREATE TABLE IF NOT EXISTS public.command_center_activity_rollups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'agent', 'service_agent', 'local_operator', 'unknown')),
  hour_bucket timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route, actor_type, hour_bucket)
);

CREATE INDEX IF NOT EXISTS idx_cc_activity_rollups_hour
  ON public.command_center_activity_rollups (hour_bucket DESC);

CREATE INDEX IF NOT EXISTS idx_cc_activity_rollups_route
  ON public.command_center_activity_rollups (route);

COMMENT ON TABLE public.command_center_activity_rollups IS
  'Hourly route counts by actor type for UX/session analysis. No user ids or PII.';

-- Service role upsert from Command Center server; no anon/authenticated direct access.
ALTER TABLE public.command_center_activity_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_activity_rollups_service_all ON public.command_center_activity_rollups
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Grants for service role only (PostgREST uses service role from app server)
GRANT SELECT, INSERT, UPDATE ON public.command_center_activity_rollups TO service_role;
