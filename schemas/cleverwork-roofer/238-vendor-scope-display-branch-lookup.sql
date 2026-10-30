-- 238 — vendor-scope the DISPLAY branch/office lookup. Additive; no pricing logic changes.
-- Applied to prod 2026-08-19.
--
-- WHAT WAS ALREADY SAFE (verified, not assumed):
--   v_invoice_pricing_office      JOIN vendors ... WHERE slug = 'abc-supply'  ✓ vendor-scoped
--   v_office_agreement_versions   JOIN vendors ... WHERE slug = 'abc-supply'  ✓ vendor-scoped
--   both also require vendor_branches.pricing_status = 'covered'
--   the vendor_invoices (SRS/QXO) arm: pa.vendor_id = vi.vendor_id            ✓ vendor-scoped
--                                      vb2.pricing_territory_office_id = vb.…  ✓ office-scoped
--   So NO PRICE has ever crossed a vendor or an office boundary.
--
-- WHAT WAS NOT SAFE — the display lookup:
--   v_invoice_audit_invoice resolved branch_name + office with
--     SELECT … FROM vendor_branches v WHERE ltrim(v.branch_number,'0') = ltrim(rb.no,'0')
--     ORDER BY (v.pricing_territory_office_id IS NOT NULL) DESC LIMIT 1
--   with NO vendor filter. ABC and QXO share 33 branch numbers (QXO carries ABC's
--   numbering), so this could return QXO's row for an ABC invoice — exactly the trap
--   migration 208 exists to prevent.
--
--   Live effect before this fix: 4 ABC invoices resolved a QXO branch row, and 2 of those
--   displayed a WRONG PE OFFICE:
--     2009375632-001  branch 472 Lenexa, KS   shown under Richardson, TX (QXO "West Ft. Worth")
--     2012882317-001  branch 184 Conley, GA   shown under Denver, CO      (QXO "Denver Branch")
--     2013245858-001  branch 516 Doraville GA  wrong vendor row, office fell through to the
--     2013275562-001  branch 516 Doraville GA  city/state fallback, so office was unaffected
--
--   The bleed did not reach pricing on those rows only because their ABC branches are not
--   'covered', so mv_invoice_pricing_office had no row for them at all — they were showing
--   another vendor's office next to no-price lines. Luck, not design: today zero colliding
--   numbers carry an office on BOTH vendors, but the moment one does, the ORDER BY above
--   is a coin flip.
--
-- I introduced a second copy of this same unscoped lateral in migration 236b
-- (v_credit_memo_match), which put credit memo 2009375632-001 and its $422.14 under
-- Richardson, TX. Both copies are fixed here, and the lookup is now a named function so
-- the next copy cannot silently drop the vendor filter.
--
-- Verified after apply:
--   • no ABC invoice resolves a non-ABC branch row (0, was 4)
--   • v_invoice_audit_invoice row count unchanged at 1,122
--   • sum(at_risk) unchanged at $4,676.63 — pricing is untouched
--   • the 2 mis-officed invoices now read "Lenexa, KS area" / "Conley, GA area", the honest
--     city/state fallback for an ABC branch with no PE pricing office assigned

CREATE OR REPLACE FUNCTION public.abc_display_branch(p_branch_no text)
RETURNS TABLE (branch_name text, pricing_territory_office_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT v.branch_name, v.pricing_territory_office_id
    FROM public.vendor_branches v
    JOIN public.vendors ven ON ven.id = v.vendor_id AND ven.slug = 'abc-supply'
   WHERE p_branch_no IS NOT NULL
     AND ltrim(v.branch_number, '0') = ltrim(p_branch_no, '0')
   ORDER BY (v.pricing_territory_office_id IS NOT NULL) DESC, v.branch_number
   LIMIT 1
$$;

COMMENT ON FUNCTION public.abc_display_branch(text) IS
  'Vendor-scoped display lookup for an ABC branch number (migration 238). ABC and QXO share branch numbers, so every bare-number lookup MUST be vendor-scoped or the wrong vendor''s office/branch name is displayed. Use this instead of hand-rolling the lateral.';

-- Both consumers then swap their unscoped lateral for:
--   LEFT JOIN LATERAL public.abc_display_branch(<branch number>) vb ON true
-- in public.v_invoice_audit_invoice and public.v_credit_memo_match. Those two views are
-- re-created in full by migrations 233 and 236 respectively; this file records the
-- contract, and both were re-applied against prod with the lateral replaced.
--
-- Open item this surfaced (NOT fixed here): ABC branches 472, 184 and 516 have no
-- pricing_territory_office_id, so their invoices price as no-price and display a
-- "<city>, <state> area" pseudo-office. That is a vendor_branches coverage gap, not a
-- code bug — assign the office (or confirm out_of_boundary is correct) to close it.
