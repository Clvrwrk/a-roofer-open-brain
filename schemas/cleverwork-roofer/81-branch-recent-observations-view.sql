-- 81: Per-branch recent price-observation counts for the vendor territory map.
--
-- Replaces the app-side full pull of abc_price_observation_lines (444k rows,
-- ~445 sequential PostgREST pages, ~79s of page TTFB) with a server-side
-- aggregate the command center reads in one call (~9ms).
--
-- abc_price_observations.line_count matches the joined per-observation line
-- count exactly (verified 444,851 = 444,851 on 2026-06-10), so no join needed.
--
-- ADDITIVE + IDEMPOTENT per CONVENTIONS §1 / Hard-rule-1. Service-role-only
-- read posture per CONVENTIONS §4.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_abc_price_obs_lines_observation_id
  ON public.abc_price_observation_lines (observation_id);

CREATE INDEX IF NOT EXISTS idx_abc_price_obs_observed_at
  ON public.abc_price_observations (observed_at);

CREATE OR REPLACE VIEW public.v_branch_recent_price_observations AS
SELECT
  o.branch_number,
  sum(o.line_count)::bigint AS recent_line_count,
  max(o.observed_at)        AS last_observed_at
FROM public.abc_price_observations o
WHERE o.observed_at >= now() - interval '90 days'
  AND o.branch_number IS NOT NULL
GROUP BY o.branch_number;

COMMENT ON VIEW public.v_branch_recent_price_observations IS
  'Per-branch ABC price-observation line counts in the last 90 days. Read path for the vendor territory map invoice-history evidence tier.';

GRANT SELECT ON public.v_branch_recent_price_observations TO service_role;
REVOKE ALL ON public.v_branch_recent_price_observations FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
