-- 242 — Chris's decision: QXO "WICHITA" is branch 986 "Wichita Branch" (2037 S. Southwest
-- Blvd), not 488 "Wichita Branch- Mw". Additive + idempotent. Applied to prod 2026-08-19.
--
-- Recorded as a HUMAN decision (decided_by = 'Chris Hussey'), not an inference. The
-- candidates array stays on the row so the audit trail shows what the alternative was.
UPDATE public.vendor_branch_alias a
   SET vendor_branch_id = vb.id,
       status           = 'resolved',
       source           = 'Chris decision 2026-08-19',
       decided_by       = 'Chris Hussey',
       decided_at       = now(),
       notes            = TRIM(BOTH ' · ' FROM COALESCE(a.notes,'') ||
                          ' · Resolved 2026-08-19 by Chris: 986, not 488. Candidates retained above for audit.')
  FROM public.vendors ven, public.vendor_branches vb
 WHERE a.vendor_id = ven.id AND ven.slug = 'qxo'
   AND a.alias_key = 'WICHITA'
   AND vb.vendor_id = ven.id AND vb.branch_number = '986'
   AND a.status = 'ambiguous';

UPDATE public.vendor_invoices vi
   SET vendor_branch_id = a.vendor_branch_id
  FROM public.vendor_branch_alias a
 WHERE a.vendor_id = vi.vendor_id
   AND a.status = 'resolved' AND a.vendor_branch_id IS NOT NULL
   AND vi.vendor_branch_id IS NULL
   AND upper(regexp_replace(coalesce(vi.branch_key,''), '[^A-Za-z0-9]', '', 'g')) = a.alias_key;

-- Verified: UY48909 ($5,601.71) -> 986 Wichita Branch -> Wichita, KS office.
-- All 3 QXO invoices now resolve a branch and an office. Lines still price as no-price
-- because QXO has no agreement at any office (docs/98) — a separate, open problem.
