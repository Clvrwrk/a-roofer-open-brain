-- 311 — restrict the pre-existing materialised views in public to service_role.
--
-- Materialised views have no row-level security. Every matview created before
-- 310 kept the public schema's default grants (relacl `arwdDxtm` for anon and
-- authenticated), and 288 went further with an explicit
-- `grant select ... to anon, authenticated` on mv_order_acculynx_match. So
-- PostgREST served them to anyone holding the publishable key. Measured
-- 2026-09-29 before this migration, GET /rest/v1/<mv>?limit=1 with the
-- publishable key AND with the legacy anon JWT:
--
--   mv_invoice_audit_line          200, rows (invoice lines, negotiated prices)
--   mv_invoice_pricing_office      200, rows
--   mv_office_agreement_versions   200, rows
--   mv_vendor_office_item_history  200, rows
--   mv_order_acculynx_match        200, rows (orders, client names)
--   mv_overhead_account_month      200, rows (overhead actuals by account)
--   product_vendor_pricing         200, rows
--   product_vendor_branch_pricing  200, rows
--   mv_invoice_audit_summary       500 / 55000 (not populated; grant present)
--
-- mv_hail_heatzone_coverage (310) was created service_role + ob_readonly only
-- and already returns 401 / 42501; it is not touched here.
--
-- Who reads them (verified 2026-09-29 against code and the live project):
--   * Command Center: every reader (invoice-audit, credit-memo, fixed-costs,
--     order-audit, price-agreement-management, credit-memos/sent, the
--     credit-memos, invoice-audit and promote/assign API routes) uses
--     createServerSupabaseClient (app/command-center/src/lib/supabase.server.ts,
--     SUPABASE_SERVICE_ROLE_KEY). No browser client, no anon key in app code.
--   * scripts/, integrations/, agents/: no file on any origin branch names a
--     matview. The two callers of rpc/alex_no_price_triage (an invoker-rights
--     function that reads mv_invoice_pricing_office / mv_office_agreement_versions)
--     are scripts/alex-no-price-triage.mjs and
--     integrations/bridges/ingest-vendor-invoice-csv.mjs, both service role.
--   * CRM (Clvrwrk/CRM_PWA, 120 refs): no match on any branch.
--   * Database: refresh jobs (pvp_refresh_nightly, refresh-office-pricing-matviews,
--     refresh-order-acculynx-match, refresh-overhead-matview) run as postgres,
--     the owner; REFRESH needs ownership, not grants. service_pending_matview_
--     refreshes is SECURITY DEFINER owned by postgres. credit_memo_claims_sync is
--     invoker-rights but only reached from the postgres cron job.
--   * PostgREST edge logs, last 24h: 365 requests to these matviews plus 1 to
--     rpc/alex_no_price_triage, every one apikey role AND authorization role =
--     service_role, from the Coolify host and the Hetzner agent host. No anon
--     or authenticated request.
--
-- Not closed by this migration (docs/115 §7): postgres-owned views without
-- security_invoker that read these matviews (v_invoice_audit_line,
-- v_inv_processed_weekly, v_no_price_repeats, ...) are still anon-readable
-- and re-expose the same data. They are part of the wider set of owner-rights
-- views that still carry the default grants; that is a separate migration.
--
-- Same shape as 300, 304 and 309: REVOKE ALL from anon/authenticated, explicit
-- SELECT for service_role, keep ob_readonly SELECT. Additive and idempotent
-- (hard rule 1): GRANT/REVOKE only, no data touched, safe to re-run.
--
-- Numbering: 305-308 belong to PR #18, 309 and 310 are on main; 311 was free
-- in the prod ledger and on every origin branch.
--
-- Rollback (restores the exact prior ACL on each matview):
--   GRANT ALL ON public.mv_invoice_audit_line          TO anon, authenticated;
--   GRANT ALL ON public.mv_invoice_audit_summary       TO anon, authenticated;
--   GRANT ALL ON public.mv_invoice_pricing_office      TO anon, authenticated;
--   GRANT ALL ON public.mv_office_agreement_versions   TO anon, authenticated;
--   GRANT ALL ON public.mv_vendor_office_item_history  TO anon, authenticated;
--   GRANT ALL ON public.mv_order_acculynx_match        TO anon, authenticated;
--   GRANT ALL ON public.mv_overhead_account_month      TO anon, authenticated;
--   GRANT ALL ON public.product_vendor_pricing         TO anon, authenticated;
--   GRANT ALL ON public.product_vendor_branch_pricing  TO anon, authenticated;

SET LOCAL lock_timeout = '10s';

REVOKE ALL ON public.mv_invoice_audit_line          FROM anon, authenticated;
REVOKE ALL ON public.mv_invoice_audit_summary       FROM anon, authenticated;
REVOKE ALL ON public.mv_invoice_pricing_office      FROM anon, authenticated;
REVOKE ALL ON public.mv_office_agreement_versions   FROM anon, authenticated;
REVOKE ALL ON public.mv_vendor_office_item_history  FROM anon, authenticated;
REVOKE ALL ON public.mv_order_acculynx_match        FROM anon, authenticated;
REVOKE ALL ON public.mv_overhead_account_month      FROM anon, authenticated;
REVOKE ALL ON public.product_vendor_pricing         FROM anon, authenticated;
REVOKE ALL ON public.product_vendor_branch_pricing  FROM anon, authenticated;

GRANT SELECT ON public.mv_invoice_audit_line          TO service_role;
GRANT SELECT ON public.mv_invoice_audit_summary       TO service_role;
GRANT SELECT ON public.mv_invoice_pricing_office      TO service_role;
GRANT SELECT ON public.mv_office_agreement_versions   TO service_role;
GRANT SELECT ON public.mv_vendor_office_item_history  TO service_role;
GRANT SELECT ON public.mv_order_acculynx_match        TO service_role;
GRANT SELECT ON public.mv_overhead_account_month      TO service_role;
GRANT SELECT ON public.product_vendor_pricing         TO service_role;
GRANT SELECT ON public.product_vendor_branch_pricing  TO service_role;

-- Keep the analytics reader (no-ops today; make a replay explicit).
GRANT SELECT ON public.mv_invoice_audit_line          TO ob_readonly;
GRANT SELECT ON public.mv_invoice_audit_summary       TO ob_readonly;
GRANT SELECT ON public.mv_invoice_pricing_office      TO ob_readonly;
GRANT SELECT ON public.mv_office_agreement_versions   TO ob_readonly;
GRANT SELECT ON public.mv_vendor_office_item_history  TO ob_readonly;
GRANT SELECT ON public.mv_order_acculynx_match        TO ob_readonly;
GRANT SELECT ON public.mv_overhead_account_month      TO ob_readonly;
GRANT SELECT ON public.product_vendor_pricing         TO ob_readonly;
GRANT SELECT ON public.product_vendor_branch_pricing  TO ob_readonly;
