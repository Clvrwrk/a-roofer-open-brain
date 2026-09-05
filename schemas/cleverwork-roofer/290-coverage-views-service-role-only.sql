-- 290 — restrict the coverage/spend exposure views to service_role.
--
-- Found by the Cursor security review on PR #9 and CONFIRMED against prod:
-- the four views added by 286-289 inherited the public schema's default
-- grants, so `anon` could read them through PostgREST with the publishable
-- key. Measured before this migration, as role anon:
--
--   SELECT count(*), sum(spend) FROM public.v_office_vendor_spend;
--   -> 10 rows, $2,269,526.34
--
-- A view runs as its owner unless `security_invoker` is set, so RLS on the
-- underlying invoice tables does not save us here. That is aggregated
-- office x vendor invoice spend, plus agreement-ruling metadata, readable
-- outside the WorkOS-gated Command Center.
--
-- The Command Center is unaffected: `createServerSupabaseClient`
-- (app/command-center/src/lib/supabase.server.ts) authenticates with
-- SUPABASE_SERVICE_ROLE_KEY, and every reader of these views goes through
-- it server-side. No browser code queries them directly.
--
-- Precedent: `v_price_list_global` (schemas 70/121/128 family) already uses
-- exactly this service-role-only shape. The immediate siblings
-- v_office_vendor_branch and v_office_vendor_inheritance are ALSO anon-readable
-- today, but they predate this PR and are left alone rather than widening its
-- scope - flagged for a follow-up decision.
--
-- Additive and idempotent (hard rule 1): GRANT/REVOKE only, no data touched,
-- safe to re-run. Rollback is a single statement per view:
--   GRANT SELECT ON public.<view> TO anon, authenticated;
--
-- LEDGER HISTORY — this one is not like its siblings:
--   2026-08-22  executed DIRECTLY against prod. The lockdown took effect immediately, but
--               it left NO `supabase_migrations.schema_migrations` row, so prod's ledger was
--               silent about a live access-control change and a freshly provisioned
--               environment replaying migrations would never have applied it. A review on
--               2026-08-26 flagged that as a rollback-readiness gap. It was right.
--   2026-08-26  registered as `290_coverage_views_service_role_only`
--               (version 20260826193359) by re-running this idempotent statement through
--               the migration path. Verified BEFORE running that anon/authenticated already
--               held no privilege, so no state changed; verified AFTER that the row exists,
--               anon/authenticated still hold 0, and service_role holds SELECT on all four.
-- The lesson: a security fix applied out-of-band is only half-applied. It protects today's
-- database and no other. Ship it through the migration path so the next environment inherits it.

REVOKE ALL ON public.v_office_vendor_spend         FROM anon, authenticated;
REVOKE ALL ON public.v_unresolved_branch_spend     FROM anon, authenticated;
REVOKE ALL ON public.v_office_vendor_gap_exposure  FROM anon, authenticated;
REVOKE ALL ON public.v_agreement_unreachable       FROM anon, authenticated;

GRANT SELECT ON public.v_office_vendor_spend        TO service_role;
GRANT SELECT ON public.v_unresolved_branch_spend    TO service_role;
GRANT SELECT ON public.v_office_vendor_gap_exposure TO service_role;
GRANT SELECT ON public.v_agreement_unreachable      TO service_role;
