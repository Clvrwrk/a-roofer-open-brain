-- 102-price-agreement-audit-view.sql
-- Agreement-lifecycle audit: every negotiated price agreement with status
-- (active / expiring ≤30d / expired / empty), coverage (items, branches), and
-- renewal urgency. Read-only. Powers the rebuilt Price Agreement Audit dashboard
-- (/abc-price-agreement-gaps). Distinct from Invoice Audit (line variance) — this
-- audits the AGREEMENTS themselves.
--
-- DATA NOTE (2026-06-18): all 5 item-bearing agreements are EXPIRED; the 94
-- "ok"/API agreements are near-empty shells → renewals are the priority action.
CREATE OR REPLACE VIEW public.v_price_agreement_audit AS
SELECT
  pa.id AS agreement_id,
  pa.agreement_number,
  pa.version_label,
  pa.region_code,
  pa.branch_number,
  pa.abc_account_number,
  pa.sales_rep,
  pa.effective_date,
  pa.expiry_date,
  pa.staleness_status,
  pa.ceo_verified,
  pa.ceo_verified_at,
  (SELECT count(*) FROM public.abc_price_list_items pli WHERE pli.agreement_id = pa.id) AS item_count,
  (SELECT count(DISTINCT m.branch_number) FROM public.abc_price_agreement_branch_matches m WHERE m.abc_price_agreement_id = pa.id) AS branch_count,
  CASE
    WHEN pa.expiry_date IS NULL THEN 'no_expiry'
    WHEN pa.expiry_date < current_date THEN 'expired'
    WHEN pa.expiry_date <= current_date + 30 THEN 'expiring'
    ELSE 'active'
  END AS lifecycle,
  CASE WHEN pa.expiry_date IS NOT NULL THEN (pa.expiry_date - current_date) END AS days_to_expiry
FROM public.abc_price_agreements pa;
