-- 209 — Order Audit + Estimate Audit cutover to office-inherited pricing
-- (docs/84 W1a/W1b). Applied to prod 2026-08-05.
--
-- Both order-audit views still priced via the pre-201 ship-to model
-- (abc_price_agreement_branch_matches only), so office-inheriting branches read
-- uncovered and $-At-Risk / Flagged / No-Agreement were misstated — the same
-- disease invoices had before migration 201. v_estimate_audit_job's
-- negotiated_pricing flag was EXISTS(branch matches by branch_code).
--
-- New model (docs/81 §4): ship_to → home branch (ABC-siloed) → office →
-- in-force agreement versions (newest per chain, effective <= today, evergreen),
-- lowest price wins; legacy ship-to kept as a fallback arm so no previously
-- priced line regresses. Vendor silo (mig 208) enforced on every branch join.

-- Ship-to → pricing office (ABC-siloed; also the hardening v_invoice_pricing_office needs)
CREATE OR REPLACE VIEW public.v_ship_to_pricing_office AS
SELECT DISTINCT ON (sba.ship_to_number)
       sba.ship_to_number,
       vb.pricing_territory_office_id AS office_id
FROM public.abc_ship_to_branch_access sba
JOIN public.vendor_branches vb ON vb.branch_number = sba.branch_number AND vb.pricing_status = 'covered'
JOIN public.vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'
WHERE sba.home_branch = true AND vb.pricing_territory_office_id IS NOT NULL
ORDER BY sba.ship_to_number;

CREATE OR REPLACE VIEW public.v_invoice_pricing_office AS
SELECT DISTINCT ON (i.invoice_number)
       i.invoice_number,
       vb.pricing_territory_office_id AS office_id
FROM public.abc_invoices i
JOIN public.abc_ship_to_branch_access sba ON sba.ship_to_number = i.ship_to_number AND sba.home_branch = true
JOIN public.vendor_branches vb ON vb.branch_number = sba.branch_number AND vb.pricing_status = 'covered'
JOIN public.vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'
WHERE vb.pricing_territory_office_id IS NOT NULL
ORDER BY i.invoice_number;
-- (REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_pricing_office — run separately.)

-- v_order_audit_line / v_order_audit_order: identical bodies to schema 121 except
-- (a) neg = office-first (pri 1, lowest price wins) + legacy ship-to fallback (pri 2),
-- (b) the order view's vendor_branches join is ABC-siloed.
-- Full applied text lives in Supabase migration history as
-- order_estimate_office_pricing_209 (2026-08-05).

-- v_estimate_audit_job.negotiated_pricing: EXISTS(ship-to branch matches) →
-- EXISTS(ABC branch → office → in-force agreement via v_office_vendor_agreements),
-- applied via viewdef substitution in the same migration.
