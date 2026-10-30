-- 253 — SRS branch-code aliases so incoming invoices resolve their branch (2026-08-21).
-- Additive + idempotent.
--
-- Migration 243 made branch resolution fail CLOSED: vendor_invoices_resolve_branch() maps
-- branch_key -> vendor_branch_id ONLY through vendor_branch_alias (vendor-scoped,
-- status='resolved'). There were ZERO SRS alias rows — the 28 SRS invoices already in the
-- table were resolved by the one-off backfills in migrations 240/242, not by the trigger.
-- So the next SRS invoice ingested would land with vendor_branch_id NULL -> no office ->
-- no price, silently. This seeds the codes SRS actually prints on its documents.
--
-- Vendor-scoped by construction (hard rule: never resolve a branch from a bare number or
-- label across vendors — ABC and QXO share 33 branch numbers, migrations 238-244).
--
-- Targets match how the existing SRS invoices already resolved, so the new rows join the
-- same branch as their 28 predecessors rather than forking a second Wichita/Melissa:
--   DJWIC -> SBP-WICHITA (Wichita, KS      -> Wichita, KS office)      25 invoices already
--   SSMEL -> SBP-MELISSA (Melissa, TX      -> Richardson, TX office)    1 invoice already
--   SSCOP -> SBP-COPPELL (Coppell, TX      -> Richardson, TX office)    NEW code, first seen
--            on invoice 0050708886-001. Note SRS also has RM-DALLAS in Coppell; SSCOP is
--            "SRS BUILDING PROD - COPPELL", which is the SBP banner, so SBP-COPPELL.
--   AMDEN -> SBP-DENVER  (Denver, CO       -> Denver (Greenwood Village), CO)  2 already
--   SHCOL -> SBP-COLORADOSPRINGS (Colorado Springs, CO -> Denver office)       2 already

INSERT INTO public.vendor_branch_alias
  (vendor_id, alias_key, alias_raw, vendor_branch_id, status, source, decided_by, notes)
SELECT v.id,
       s.code,
       s.code,
       vb.id,
       'resolved',
       'vendor_document',
       'Chris Hussey',
       '2026-08-21: SRS prints this code in the "Branch :" field of its invoice/credit PDFs and portal CSV.'
FROM public.vendors v
JOIN (VALUES
  ('DJWIC', 'SBP-WICHITA'),
  ('SSMEL', 'SBP-MELISSA'),
  ('SSCOP', 'SBP-COPPELL'),
  ('AMDEN', 'SBP-DENVER'),
  ('SHCOL', 'SBP-COLORADOSPRINGS')
) AS s(code, branch_number) ON true
JOIN public.vendor_branches vb
  ON vb.vendor_id = v.id AND vb.branch_number = s.branch_number
WHERE v.slug = 'srs'
  AND NOT EXISTS (
    SELECT 1 FROM public.vendor_branch_alias a
    WHERE a.vendor_id = v.id AND a.alias_key = s.code
  );

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM public.vendor_branch_alias a
  JOIN public.vendors v ON v.id = a.vendor_id
  WHERE v.slug = 'srs' AND a.status = 'resolved' AND a.vendor_branch_id IS NOT NULL
    AND a.alias_key IN ('DJWIC','SSMEL','SSCOP','AMDEN','SHCOL');
  IF n <> 5 THEN
    RAISE EXCEPTION '253 expected 5 resolved SRS branch aliases, found %', n;
  END IF;
  RAISE NOTICE '253 ok — 5 SRS branch codes resolve through the ingest trigger';
END $$;
