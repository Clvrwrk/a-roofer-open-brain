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

REVOKE ALL ON public.v_office_vendor_spend         FROM anon, authenticated;
REVOKE ALL ON public.v_unresolved_branch_spend     FROM anon, authenticated;
REVOKE ALL ON public.v_office_vendor_gap_exposure  FROM anon, authenticated;
REVOKE ALL ON public.v_agreement_unreachable       FROM anon, authenticated;

GRANT SELECT ON public.v_office_vendor_spend        TO service_role;
GRANT SELECT ON public.v_unresolved_branch_spend    TO service_role;
GRANT SELECT ON public.v_office_vendor_gap_exposure TO service_role;
GRANT SELECT ON public.v_agreement_unreachable      TO service_role;
