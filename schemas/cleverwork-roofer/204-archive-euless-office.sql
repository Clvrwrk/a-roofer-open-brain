-- 204 — archive the Euless, TX office (docs/82 R5). Applied to prod 2026-08-05.
-- Chris 2026-08-05: the Euless office is closed — Richardson is the sole Texas
-- office. Archive, never delete (hard rule 1): the office row, its drive-time
-- boundary, and its branch_office_candidate rings stay in place as history;
-- is_active = false removes it from the territory map (vendor-territories.ts
-- filters on is_active) and from all pricing-inheritance paths below.
--
-- Repoint: the two vendor branches whose pricing territory was Euless (both
-- Wichita Falls, TX) inherit from Richardson instead.
--   * abc-supply 'wichita-falls-TX-76302-2723'  be8755e7-ba76-4315-ae25-a1847257f3e5
--   * qxo '249' (Wichita Falls)                 8c56f6dd-476c-49b6-9d0c-fd7db7ca2a11
-- Euless office:     6ff737d3-a3dd-4cba-a120-89091cac8cf2
-- Richardson office: bd3016cc-4b21-4fd0-be65-31aa18b9fdbd

UPDATE public.office
SET is_active = false,
    notes = trim(both ' · ' from COALESCE(notes, '')
            || ' · Archived 2026-08-05: office closed — Richardson is the sole TX office (docs/82 R5). Boundary and candidate rings retained as history.'),
    updated_at = now()
WHERE id = '6ff737d3-a3dd-4cba-a120-89091cac8cf2'
  AND is_active IS DISTINCT FROM false;

UPDATE public.vendor_branches
SET pricing_territory_office_id = 'bd3016cc-4b21-4fd0-be65-31aa18b9fdbd'
WHERE pricing_territory_office_id = '6ff737d3-a3dd-4cba-a120-89091cac8cf2';

-- Drive-time rings: 42 branches carried suggested_office_id = Euless. Re-suggest each
-- to its best ACTIVE candidate (11 → Richardson; 31 have no active office within the
-- window and correctly become unsuggested). Candidate rows are kept as history; only
-- the operational suggestion pointers move.
UPDATE public.vendor_branches vb
SET suggested_office_id = (
  SELECT c.office_id
  FROM public.branch_office_candidate c
  JOIN public.office o ON o.id = c.office_id AND o.is_active
  WHERE c.vendor_branch_id = vb.id
  ORDER BY c.drive_minutes NULLS LAST, c.straight_km NULLS LAST, o.name
  LIMIT 1)
WHERE vb.suggested_office_id = '6ff737d3-a3dd-4cba-a120-89091cac8cf2';

-- Keep the is_suggested display flags consistent with the repointed suggestions.
WITH affected AS (
  SELECT DISTINCT vendor_branch_id FROM public.branch_office_candidate
  WHERE office_id = '6ff737d3-a3dd-4cba-a120-89091cac8cf2'
)
UPDATE public.branch_office_candidate c
SET is_suggested = (c.office_id IS NOT DISTINCT FROM vb.suggested_office_id)
FROM public.vendor_branches vb
WHERE vb.id = c.vendor_branch_id
  AND c.vendor_branch_id IN (SELECT vendor_branch_id FROM affected)
  AND c.is_suggested IS DISTINCT FROM (c.office_id IS NOT DISTINCT FROM vb.suggested_office_id);

-- Pricing matviews read office/branch mappings — refresh so the audit engine
-- resolves the two Wichita Falls branches through Richardson immediately.
-- (Run each statement outside a transaction: REFRESH ... CONCURRENTLY cannot
-- execute inside a transaction block.)
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_office_agreement_versions;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_pricing_office;
