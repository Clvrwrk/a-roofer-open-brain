-- 312 — restrict the anon-readable owner-rights views and RLS-off tables in
-- public to service_role, and stop new public tables inheriting anon grants.
--
-- The public schema's default privileges for role postgres grant anon and
-- authenticated `arwdDxtm` on every new table and view. Two kinds of object
-- turn that into a leak, because nothing else stands between the publishable
-- key and the rows:
--   * a view owned by postgres without security_invoker checks the relations it
--     reads as postgres, so it bypasses the grants 300-311 removed and any RLS;
--   * a table with RLS off has no row filter at all.
-- Measured live 2026-09-29 before this migration (pg_class.relacl +
-- has_table_privilege): 90 such views and 39 such tables (129 objects), all
-- with anon/authenticated SELECT, INSERT, UPDATE, DELETE and TRUNCATE.
-- GET /rest/v1/<obj>?limit=1 with the publishable key: 114 returned a row,
-- 5 returned [] (grant present, table empty), 10 hit the anon statement
-- timeout (57014, grant present). This includes the eleven views docs/117 §5
-- named as re-exposing the matviews 311 locked.
--
-- Who reads them (verified 2026-09-29; full table in docs/117 §6):
--   * Command Center: only createServerSupabaseClient
--     (app/command-center/src/lib/supabase.server.ts, service role).
--   * scripts/, integrations/, supabase/functions/acculynx-sync, deployment/,
--     agents/ on all 42 origin branches: every reader uses
--     SUPABASE_SERVICE_ROLE_KEY or psql as postgres. 62 of the 129 objects
--     have no code reader at all.
--   * CRM (Clvrwrk/CRM_PWA, 120 refs): no code reader on any branch (four
--     objects are named in delivery docs only). CRM requests run as `member`,
--     which has no USAGE on schema public; no crm* function, policy, or
--     invoker view references any of the 129. Nothing here is a joint
--     decision under docs/110 §3.
--   * Database: all 15 pg_cron jobs run as postgres. No security_invoker view,
--     non-postgres view, RLS policy or realtime publication depends on them.
--     Fifteen invoker-rights functions read them (alex_no_price_triage,
--     credit_memo_claims_sync, credit_memo_reconcile*, invoice_audit_reset,
--     silo_assertions, vendor_payment_memo_apply, the two *_resolve_branch
--     triggers, vendor_desc_color_key via v_invoice_audit_line, ...); they are
--     reached only from postgres (cron) or service_role, which keep access.
--   * PostgREST edge logs, last 24h: 2,324 requests to these objects, all
--     service_role (Coolify host 178.105.220.14, agent host 178.156.203.23).
--     The only anon / publishable-key requests were our own verification
--     probes. No authenticated or member request.
--
-- Same shape as 300, 304, 309 and 311: REVOKE ALL from anon/authenticated,
-- explicit SELECT for service_role (its existing write grants are untouched),
-- keep ob_readonly SELECT. Then ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN
-- SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, so a new table,
-- view or matview created by postgres gets service_role + ob_readonly only and
-- must be granted to a client role on purpose. Nothing depends on the old
-- default: no anon/authenticated request reached any public relation in 24h
-- except our probes, `member` cannot use schema public, and Supabase-managed
-- schemas (auth, storage, realtime) use their own owners and defaults. Scope is
-- deliberately TABLES only: the postgres defaults for SEQUENCES (rwU) and
-- FUNCTIONS (X) to anon/authenticated are unchanged (docs/117 §8).
--
-- Out of scope (docs/117 §8): extension-owned spatial_ref_sys,
-- geography_columns, geometry_columns (supabase_admin); the seven
-- security_invoker views; RLS-on tables with permissive anon/authenticated
-- policies (agreement_version_review, call_priority_today,
-- price_list_pdf_staging for anon; abc_change_log, abc_invoice_lines_full,
-- invoice_line_audit for authenticated).
--
-- GRANT/REVOKE and default ACL only; no data touched. Additive and idempotent
-- (hard rule 1), safe to re-run.
--
-- Numbering: 311 is the highest in the prod ledger (20260929174626) and on
-- every origin branch (contrib/cleverwork/matviews-service-role-only).
--
-- Rollback (restores the exact prior ACLs: each object was
-- {postgres, anon, authenticated, service_role}=arwdDxtm + ob_readonly=r):
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES TO anon, authenticated;
--   GRANT ALL ON TABLE <the 129 objects listed below> TO anon, authenticated;

SET LOCAL lock_timeout = '10s';

-- 39 tables with RLS off.
REVOKE ALL ON TABLE
  public._backup_abc_regions_20260605,
  public._backup_abc_vendor_branches_20260605,
  public.abc_invoice_ar_import,
  public.abc_invoice_ar_line_import,
  public.abc_invoices_quarantine,
  public.abc_price_list_pdf_import,
  public.agreement_gap_queue,
  public.agreement_package_items,
  public.agreement_package_submissions,
  public.agreement_packages,
  public.credit_memo_receipts,
  public.crm_pipeline_leadstage_orphan_quarantine,
  public.crm_pipeline_orphan_quarantine,
  public.estimate_audit_edits,
  public.fixed_cost_register,
  public.frequently_ordered_import,
  public.frequently_ordered_office_map,
  public.invoice_line_reaudit,
  public.invoice_pipeline_status,
  public.invoice_register_export,
  public.item_roof_system_category,
  public.matview_refresh_request,
  public.monday_invoice_queue,
  public.oem_product_reference,
  public.office_vendor_agreement_status,
  public.price_agreement_item_candidates,
  public.price_agreement_proposals,
  public.price_agreement_requests,
  public.product_color_term,
  public.product_match_candidate,
  public.qb_bank_export_log,
  public.roof_system_category,
  public.service_warranty_audit_queue,
  public.vendor_branch_alias,
  public.vendor_payment_memo_lines,
  public.vendor_payment_memos,
  public.wcf_assumption_updates,
  public.wcf_assumptions,
  public.wip_office_margin
FROM anon, authenticated;

-- 90 views owned by postgres without security_invoker.
REVOKE ALL ON TABLE
  public.crm_pipeline_merged,
  public.fleet_baselines,
  public.fleet_data_gaps,
  public.fleet_driver_scorecard,
  public.fleet_fuel_monthly,
  public.marketing_dashboard,
  public.property_enrichment,
  public.property_profile,
  public.v_13wcf_receipts_week,
  public.v_13wcf_undated_pool,
  public.v_abc_2026_ap_register,
  public.v_abc_catalog_review_due,
  public.v_abc_invoice_lines_with_pdf,
  public.v_abc_price_review_due,
  public.v_abc_review_summary,
  public.v_acculynx_cron_outcomes,
  public.v_acculynx_duplicate_guids,
  public.v_acculynx_null_provenance,
  public.v_acculynx_orphan_subresources,
  public.v_acculynx_reconciliation,
  public.v_acculynx_stale_tail,
  public.v_agreement_version,
  public.v_agreement_version_delta,
  public.v_audit_2026,
  public.v_best_vendor_price,
  public.v_branch_item_api_price,
  public.v_branch_item_spend,
  public.v_branch_price_list,
  public.v_cash_position,
  public.v_communication_event_timeline,
  public.v_communication_preview_queue,
  public.v_credit_memo_audit,
  public.v_credit_memo_match,
  public.v_credit_memo_tbd,
  public.v_current_negotiated_pricing,
  public.v_database_saturation,
  public.v_estimate_audit_estimate,
  public.v_estimate_audit_job,
  public.v_estimate_audit_line,
  public.v_inv_processed_weekly,
  public.v_invoice_acculynx_match,
  public.v_invoice_audit_invoice,
  public.v_invoice_audit_invoice_vendor,
  public.v_invoice_audit_line,
  public.v_invoice_audit_line_cascade,
  public.v_invoice_line_audit_current,
  public.v_invoice_line_audit_eval,
  public.v_invoice_lines_complete,
  public.v_invoice_payment_reconciliation,
  public.v_invoice_pricing_office,
  public.v_item_api_price,
  public.v_item_uom_map,
  public.v_negotiable_items,
  public.v_negotiated_catalog,
  public.v_no_price_repeats,
  public.v_office_agreement_versions,
  public.v_office_ground_price,
  public.v_office_vendor_agreement_coverage,
  public.v_office_vendor_agreements,
  public.v_office_vendor_branch,
  public.v_office_vendor_inheritance,
  public.v_office_vendor_price_item,
  public.v_order_acculynx_match,
  public.v_order_audit_line,
  public.v_order_audit_order,
  public.v_pe_job_label_parse,
  public.v_price_agreement_audit,
  public.v_price_agreement_item_review,
  public.v_price_list_branch,
  public.v_price_list_branch_item,
  public.v_price_list_ingest_review,
  public.v_price_refresh_request_aging,
  public.v_price_seed_item,
  public.v_product_match_review,
  public.v_qb_export_pending,
  public.v_qbo_job_cost_lines,
  public.v_qbo_job_cost_unattributed,
  public.v_qbo_job_costs,
  public.v_recent_invoice_price,
  public.v_service_warranty_candidates,
  public.v_ship_to_pricing_office,
  public.v_top20_negotiation_dashboard,
  public.v_vendor_agreement_current,
  public.v_vendor_branch_abc_xref,
  public.v_vendor_invoice_acculynx_match,
  public.v_vendor_item_office_evidence,
  public.v_vendor_office_item_history,
  public.v_vendor_price_normalized,
  public.v_wip_office_margin,
  public.vw_ihm_impact_event
FROM anon, authenticated;

-- Explicit reader grants (no-ops today; make a replay explicit).
GRANT SELECT ON TABLE
  public._backup_abc_regions_20260605,
  public._backup_abc_vendor_branches_20260605,
  public.abc_invoice_ar_import,
  public.abc_invoice_ar_line_import,
  public.abc_invoices_quarantine,
  public.abc_price_list_pdf_import,
  public.agreement_gap_queue,
  public.agreement_package_items,
  public.agreement_package_submissions,
  public.agreement_packages,
  public.credit_memo_receipts,
  public.crm_pipeline_leadstage_orphan_quarantine,
  public.crm_pipeline_merged,
  public.crm_pipeline_orphan_quarantine,
  public.estimate_audit_edits,
  public.fixed_cost_register,
  public.fleet_baselines,
  public.fleet_data_gaps,
  public.fleet_driver_scorecard,
  public.fleet_fuel_monthly,
  public.frequently_ordered_import,
  public.frequently_ordered_office_map,
  public.invoice_line_reaudit,
  public.invoice_pipeline_status,
  public.invoice_register_export,
  public.item_roof_system_category,
  public.marketing_dashboard,
  public.matview_refresh_request,
  public.monday_invoice_queue,
  public.oem_product_reference,
  public.office_vendor_agreement_status,
  public.price_agreement_item_candidates,
  public.price_agreement_proposals,
  public.price_agreement_requests,
  public.product_color_term,
  public.product_match_candidate,
  public.property_enrichment,
  public.property_profile,
  public.qb_bank_export_log,
  public.roof_system_category,
  public.service_warranty_audit_queue,
  public.v_13wcf_receipts_week,
  public.v_13wcf_undated_pool,
  public.v_abc_2026_ap_register,
  public.v_abc_catalog_review_due,
  public.v_abc_invoice_lines_with_pdf,
  public.v_abc_price_review_due,
  public.v_abc_review_summary,
  public.v_acculynx_cron_outcomes,
  public.v_acculynx_duplicate_guids,
  public.v_acculynx_null_provenance,
  public.v_acculynx_orphan_subresources,
  public.v_acculynx_reconciliation,
  public.v_acculynx_stale_tail,
  public.v_agreement_version,
  public.v_agreement_version_delta,
  public.v_audit_2026,
  public.v_best_vendor_price,
  public.v_branch_item_api_price,
  public.v_branch_item_spend,
  public.v_branch_price_list,
  public.v_cash_position,
  public.v_communication_event_timeline,
  public.v_communication_preview_queue,
  public.v_credit_memo_audit,
  public.v_credit_memo_match,
  public.v_credit_memo_tbd,
  public.v_current_negotiated_pricing,
  public.v_database_saturation,
  public.v_estimate_audit_estimate,
  public.v_estimate_audit_job,
  public.v_estimate_audit_line,
  public.v_inv_processed_weekly,
  public.v_invoice_acculynx_match,
  public.v_invoice_audit_invoice,
  public.v_invoice_audit_invoice_vendor,
  public.v_invoice_audit_line,
  public.v_invoice_audit_line_cascade,
  public.v_invoice_line_audit_current,
  public.v_invoice_line_audit_eval,
  public.v_invoice_lines_complete,
  public.v_invoice_payment_reconciliation,
  public.v_invoice_pricing_office,
  public.v_item_api_price,
  public.v_item_uom_map,
  public.v_negotiable_items,
  public.v_negotiated_catalog,
  public.v_no_price_repeats,
  public.v_office_agreement_versions,
  public.v_office_ground_price,
  public.v_office_vendor_agreement_coverage,
  public.v_office_vendor_agreements,
  public.v_office_vendor_branch,
  public.v_office_vendor_inheritance,
  public.v_office_vendor_price_item,
  public.v_order_acculynx_match,
  public.v_order_audit_line,
  public.v_order_audit_order,
  public.v_pe_job_label_parse,
  public.v_price_agreement_audit,
  public.v_price_agreement_item_review,
  public.v_price_list_branch,
  public.v_price_list_branch_item,
  public.v_price_list_ingest_review,
  public.v_price_refresh_request_aging,
  public.v_price_seed_item,
  public.v_product_match_review,
  public.v_qb_export_pending,
  public.v_qbo_job_cost_lines,
  public.v_qbo_job_cost_unattributed,
  public.v_qbo_job_costs,
  public.v_recent_invoice_price,
  public.v_service_warranty_candidates,
  public.v_ship_to_pricing_office,
  public.v_top20_negotiation_dashboard,
  public.v_vendor_agreement_current,
  public.v_vendor_branch_abc_xref,
  public.v_vendor_invoice_acculynx_match,
  public.v_vendor_item_office_evidence,
  public.v_vendor_office_item_history,
  public.v_vendor_price_normalized,
  public.v_wip_office_margin,
  public.vendor_branch_alias,
  public.vendor_payment_memo_lines,
  public.vendor_payment_memos,
  public.vw_ihm_impact_event,
  public.wcf_assumption_updates,
  public.wcf_assumptions,
  public.wip_office_margin
TO service_role, ob_readonly;

-- New objects created by postgres in public stop inheriting client-role grants.
-- service_role and ob_readonly keep their defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
