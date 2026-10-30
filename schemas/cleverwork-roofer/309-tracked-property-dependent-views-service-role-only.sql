-- 309 — restrict the views built on vw_tracked_property to service_role.
--
-- Follow-up to 304 (docs/115 §5a). 304 took the four owner-rights views over
-- public.properties away from anon and authenticated, but five more views sit on
-- top of vw_tracked_property. All five are owned by postgres, have no
-- `security_invoker`, and still carried the public schema's default grants
-- (relacl `arwdDxtm` for anon and authenticated). A view checks the relations it
-- reads as its owner, so they re-exposed vw_tracked_property data to anyone
-- holding the publishable key after 304:
--
--   vw_zip_impact_coverage           <- vw_tracked_property
--   vw_hail_heatzone_coverage        <- vw_tracked_property, vw_zip_impact_coverage
--   vw_call_list                     <- vw_tracked_property, vw_zip_impact_coverage
--   vw_call_priority                 <- vw_call_list
--   vw_property_enhancement_request  <- vw_zip_impact_coverage
--
-- Measured 2026-09-29 after 304: as role anon, the first three returned rows
-- inside the 8s statement_timeout; all five granted anon/authenticated SELECT.
-- Nothing else depends on these five (recursive pg_depend walk).
--
-- Who reads them (verified 2026-09-29, not from migration files):
--   * Command Center: only vw_hail_heatzone_coverage, in loadMarketingSurface
--     (app/command-center/src/lib/live-work.ts), with the client from
--     createServerSupabaseClient (app/command-center/src/lib/supabase.server.ts,
--     SUPABASE_SERVICE_ROLE_KEY). No other file on any branch of this repo names
--     any of the five outside docs and SQL.
--   * CRM (docs/110, docs/111): no reader on any branch of Clvrwrk/CRM_PWA.
--   * Database: no function body names them and no pg_cron job touches them.
--   * PostgREST edge logs, last 24h: 93 requests, all to vw_hail_heatzone_coverage,
--     every one with apikey role AND authorization role = service_role, from the
--     Hetzner hosts, supabase-js on node. No anon or authenticated request.
--
-- Same shape as 300 and 304: REVOKE ALL from anon/authenticated, explicit SELECT
-- for service_role, keep ob_readonly SELECT. Additive and idempotent (hard rule 1):
-- GRANT/REVOKE only, no data touched, safe to re-run.
--
-- Numbering: 305-308 are taken by the property-spine work (PR #18,
-- claude/supabase-property-layer-cake-49a113), so this is 309.
--
-- Rollback (restores the exact prior ACL on each view):
--   GRANT ALL ON public.vw_zip_impact_coverage          TO anon, authenticated;
--   GRANT ALL ON public.vw_hail_heatzone_coverage       TO anon, authenticated;
--   GRANT ALL ON public.vw_call_list                    TO anon, authenticated;
--   GRANT ALL ON public.vw_call_priority                TO anon, authenticated;
--   GRANT ALL ON public.vw_property_enhancement_request TO anon, authenticated;

REVOKE ALL ON public.vw_zip_impact_coverage          FROM anon, authenticated;
REVOKE ALL ON public.vw_hail_heatzone_coverage       FROM anon, authenticated;
REVOKE ALL ON public.vw_call_list                    FROM anon, authenticated;
REVOKE ALL ON public.vw_call_priority                FROM anon, authenticated;
REVOKE ALL ON public.vw_property_enhancement_request FROM anon, authenticated;

GRANT SELECT ON public.vw_zip_impact_coverage          TO service_role;
GRANT SELECT ON public.vw_hail_heatzone_coverage       TO service_role;
GRANT SELECT ON public.vw_call_list                    TO service_role;
GRANT SELECT ON public.vw_call_priority                TO service_role;
GRANT SELECT ON public.vw_property_enhancement_request TO service_role;

-- Keep the analytics reader (no-ops today; make a replay explicit).
GRANT SELECT ON public.vw_zip_impact_coverage          TO ob_readonly;
GRANT SELECT ON public.vw_hail_heatzone_coverage       TO ob_readonly;
GRANT SELECT ON public.vw_call_list                    TO ob_readonly;
GRANT SELECT ON public.vw_call_priority                TO ob_readonly;
GRANT SELECT ON public.vw_property_enhancement_request TO ob_readonly;
