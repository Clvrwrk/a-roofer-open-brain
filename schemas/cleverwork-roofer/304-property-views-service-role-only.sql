-- 304 — restrict the four owner-rights views over public.properties to service_role.
--
-- Follow-up to 303 (docs/115 §5). 303 took public.properties away from anon and
-- authenticated, but four views that read it are owned by postgres, have no
-- `security_invoker`, and still carried the public schema's default grants
-- (relacl `arwdDxtm` for anon and authenticated). A view runs as its owner, so
-- they bypassed both RLS and 303. Measured 2026-09-29 as role anon:
--
--   vw_tracked_property          155,242 rows
--   replacement_quote_ready        6,862 rows  (property addresses; confirmed over
--                                               live PostgREST with the publishable key)
--   warranty_claim_ready               8 rows
--   job_property_client_summary        3 rows
--
-- Who reads them (verified 2026-09-29, not from migration files):
--   * Command Center, scripts/, integrations/, agents: no reader at all. None of the
--     four names appears in any file on any branch of this repo. The app's only
--     Supabase client is `createServerSupabaseClient`
--     (app/command-center/src/lib/supabase.server.ts, SUPABASE_SERVICE_ROLE_KEY).
--   * CRM (docs/110, docs/111): no reader. None of the four names appears on any
--     branch of Clvrwrk/CRM_PWA; its staff requests run as `member`, which holds
--     nothing on these views.
--   * Database: no function body names them and no pg_cron job touches them.
--   * PostgREST edge logs, last 24h: one request, the 303 session's own curl probe.
--   * Dependent views: vw_tracked_property feeds vw_call_list,
--     vw_hail_heatzone_coverage and vw_zip_impact_coverage (the CC reads
--     vw_hail_heatzone_coverage through the service-role client, in
--     app/command-center/src/lib/live-work.ts). Those views are also owned by
--     postgres, and a view checks its underlying relations as its owner, so this
--     REVOKE does not affect them.
--
-- NOT fixed here (flagged, see docs/115 §5): those dependent views, plus
-- vw_call_priority and vw_property_enhancement_request downstream of them, are
-- themselves owner-rights views that anon/authenticated can still SELECT. They
-- re-expose vw_tracked_property data, so this migration narrows the leak but does
-- not close it. They need the same treatment once their readers are checked.
--
-- Same shape as 300: REVOKE ALL from anon/authenticated, explicit SELECT for
-- service_role, keep ob_readonly SELECT. Additive and idempotent (hard rule 1):
-- GRANT/REVOKE only, no data touched, safe to re-run.
--
-- Rollback (restores the exact prior ACL on each view):
--   GRANT ALL ON public.vw_tracked_property         TO anon, authenticated;
--   GRANT ALL ON public.replacement_quote_ready     TO anon, authenticated;
--   GRANT ALL ON public.warranty_claim_ready        TO anon, authenticated;
--   GRANT ALL ON public.job_property_client_summary TO anon, authenticated;

REVOKE ALL ON public.vw_tracked_property         FROM anon, authenticated;
REVOKE ALL ON public.replacement_quote_ready     FROM anon, authenticated;
REVOKE ALL ON public.warranty_claim_ready        FROM anon, authenticated;
REVOKE ALL ON public.job_property_client_summary FROM anon, authenticated;

GRANT SELECT ON public.vw_tracked_property         TO service_role;
GRANT SELECT ON public.replacement_quote_ready     TO service_role;
GRANT SELECT ON public.warranty_claim_ready        TO service_role;
GRANT SELECT ON public.job_property_client_summary TO service_role;

-- Keep the analytics reader (no-ops today; make a replay explicit).
GRANT SELECT ON public.vw_tracked_property         TO ob_readonly;
GRANT SELECT ON public.replacement_quote_ready     TO ob_readonly;
GRANT SELECT ON public.warranty_claim_ready        TO ob_readonly;
GRANT SELECT ON public.job_property_client_summary TO ob_readonly;
