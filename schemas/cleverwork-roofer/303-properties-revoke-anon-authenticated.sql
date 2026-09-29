-- 303 — take public.properties away from anon and authenticated.
--
-- Measured 2026-09-29 (information_schema.role_table_grants, has_table_privilege):
-- anon and authenticated each held SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES and TRIGGER on public.properties (relacl `arwdDxtm`) — the public
-- schema's Supabase default grants, never narrowed. RLS is enabled with one policy
-- (`crm_property_reader_projection`, SELECT, role crm_property_reader), so row-level
-- DML by anon/authenticated was already refused, but:
--   * TRUNCATE is not governed by RLS. Anyone holding the publishable key could
--     empty the property spine (6,861 rows, incl. the 6,854 commercial parcels
--     loaded by 302) with a single statement if a TRUNCATE path were ever exposed.
--   * REFERENCES/TRIGGER let those roles hang objects off the table.
--   * The remaining grants were one mis-written policy away from a full leak.
--
-- Who actually needs this table (verified against prod, not migration files):
--   * Command Center: `createServerSupabaseClient` (app/command-center/src/lib/
--     supabase.server.ts) uses SUPABASE_SERVICE_ROLE_KEY; it is the only Supabase
--     client in the app, and no CC code queries `properties` from the browser.
--     service_role keeps its full grant.
--   * CRM (docs/110, docs/111): every path runs WITHOUT anon/authenticated's
--     table grants —
--       - crm.create_effort (the only writer), crm.find_intake_matches and
--         crm.read_effort are SECURITY DEFINER owned by postgres (the table owner);
--         the INSERT and the address-match SELECT run as postgres.
--       - crm.property_card is SECURITY DEFINER owned by crm_property_reader and
--         reads through that role's column grant (id, address_full, city, state,
--         state_abbrev, zip, country) + the crm_property_reader_projection policy.
--         Both are left untouched.
--       - CRM staff requests arrive as role `member`, and crm_gateway.api_pre_request
--         only admits POST /rpc/* on the `crm` profile. `member` holds no privilege
--         on public.properties.
--     So no CRM contract depends on anon/authenticated holding anything here.
--   * ob_readonly keeps SELECT (analytics reader).
--
-- NOT fixed here (flagged, see docs/115 §4): four owner-rights views over this
-- table — replacement_quote_ready, vw_tracked_property, job_property_client_summary,
-- warranty_claim_ready — are still granted to anon/authenticated and run as postgres,
-- so they bypass RLS. Revoking the base table does not close them.
--
-- Additive and idempotent (hard rule 1): REVOKE only, no data touched, safe to re-run.
-- Joint-review object (docs/110 §3): the CRM team must confirm before the next CRM release.
--
-- Rollback (restores the exact prior ACL):
--   GRANT ALL ON public.properties TO anon, authenticated;

REVOKE ALL ON public.properties FROM anon, authenticated;

-- Keep what the documented contracts need (no-ops today; make a replay explicit).
GRANT ALL ON public.properties TO service_role;
GRANT SELECT ON public.properties TO ob_readonly;
GRANT SELECT (id, address_full, city, state, state_abbrev, zip, country)
  ON public.properties TO crm_property_reader;
