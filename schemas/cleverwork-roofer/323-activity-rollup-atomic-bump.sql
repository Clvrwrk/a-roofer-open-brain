-- 323-activity-rollup-atomic-bump.sql
-- One atomic round trip per Command Center request for the hourly activity rollup
-- (docs/122, 2026-10-02 DB-load investigation).
--
-- Before: lib/activity-rollups.server.ts did SELECT id,request_count → UPDATE
-- request_count+1 (or INSERT) — two PostgREST calls on every page and API hit.
-- Under a page sweep (~40 hits per route in one hour on 2026-10-02 19:00 UTC) the
-- updates queued on the same (route, actor_type, hour_bucket) row lock and averaged
-- 4.3 s per call, and concurrent read-modify-writes lost increments.
--
-- After: a single INSERT … ON CONFLICT DO UPDATE request_count = request_count + 1.
-- No lost updates, half the calls, and the row lock is held for one statement.
-- SECURITY INVOKER: the caller is service_role (BYPASSRLS), same as the old path.
-- Additive and idempotent.

CREATE OR REPLACE FUNCTION public.bump_command_center_activity(
  p_route text,
  p_actor_type text,
  p_hour_bucket timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.command_center_activity_rollups AS r (route, actor_type, hour_bucket, request_count)
  VALUES (p_route, p_actor_type, p_hour_bucket, 1)
  ON CONFLICT (route, actor_type, hour_bucket)
  DO UPDATE SET request_count = r.request_count + 1,
                updated_at = now();
$$;

COMMENT ON FUNCTION public.bump_command_center_activity(text, text, timestamptz) IS
  'Atomic hourly route counter for command_center_activity_rollups (mig 323, docs/122). Service role only.';

REVOKE ALL ON FUNCTION public.bump_command_center_activity(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_command_center_activity(text, text, timestamptz) TO service_role;
