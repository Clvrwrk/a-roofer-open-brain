-- 205 — all-vendor office agreement coverage (vendor-regions map v2 cutover).
-- Applied to prod 2026-08-05.
--
-- The territory map ran the pre-v2 model (ceo_verified hard gate + expiry
-- disqualifies + ship-to-only keys) so virtually every branch read as PROBLEM.
-- Decisions (Chris 2026-08-05): status derives from in-force agreements like the
-- audit engine (ceo_verified is display-only); expired-but-evergreen = Needs
-- Attention; no agreement at all = Problem (including QXO); office-inheritance
-- must cover ALL vendors, not just ABC.
--
-- This view is the all-vendor sibling of v_office_agreement_versions (ABC-only,
-- migration 201, unchanged — the audit engine keeps reading it; the engine gains
-- its generic arm when Phase 5 ingests SRS/QXO invoices into the invoice tables).
-- Two arms:
--   abc:     abc_price_agreements keyed by branch number -> covered branch office
--   generic: price_agreements keyed by vendor_branch_id -> that branch's office
--            (carries the 3 SRS agreements: Melissa TX L4 -> Richardson,
--             Wichita 0049828559 -> Wichita KS, Englewood 0049345641 -> Denver)
-- agreement_key is text (int ids in abc, uuids in generic).
--
-- Data fix in the same wave: the two 2026-08-04 SRS rows without agreement
-- numbers were duplicates of the numbered 2026-08-05 set — archived
-- (is_active=false + note), never deleted (hard rule 1).

CREATE OR REPLACE VIEW public.v_office_vendor_agreements AS
SELECT DISTINCT
       vb.pricing_territory_office_id AS office_id,
       vb.vendor_id,
       'abc'::text AS source,
       a.id::text AS agreement_key,
       COALESCE(a.agreement_number, 'PA-' || a.id) AS agreement_number,
       a.effective_date,
       a.expiry_date,
       (SELECT count(*)::int FROM public.abc_price_list_items i WHERE i.agreement_id = a.id) AS item_count
FROM public.abc_price_agreements a
LEFT JOIN public.abc_price_agreement_branch_matches m ON m.abc_price_agreement_id = a.id
JOIN public.vendor_branches vb
  ON vb.pricing_status = 'covered'
 AND vb.pricing_territory_office_id IS NOT NULL
 AND NULLIF(regexp_replace(COALESCE(vb.branch_number, ''), '^0+', ''), '')
     = NULLIF(regexp_replace(COALESCE(a.branch_number, m.branch_number), '^0+', ''), '')
WHERE COALESCE(a.agreement_number, '') !~* '^API-'
  AND EXISTS (SELECT 1 FROM public.abc_price_list_items i WHERE i.agreement_id = a.id)
UNION ALL
SELECT DISTINCT
       vb.pricing_territory_office_id,
       pa.vendor_id,
       'generic',
       pa.id::text,
       COALESCE(pa.agreement_number, 'PA-' || left(pa.id::text, 8)),
       pa.effective_date,
       pa.expiry_date,
       (SELECT count(*)::int FROM public.price_agreement_items i WHERE i.agreement_id = pa.id)
FROM public.price_agreements pa
JOIN public.vendor_branches vb ON vb.id = pa.vendor_branch_id
WHERE pa.is_active IS NOT FALSE
  AND vb.pricing_territory_office_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.price_agreement_items i WHERE i.agreement_id = pa.id);
