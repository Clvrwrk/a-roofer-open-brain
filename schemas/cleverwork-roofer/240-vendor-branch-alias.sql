-- 240 — vendor_branch_alias: resolve a vendor's messy branch label to OUR uuid, ONCE.
-- Additive + idempotent. Applied to prod 2026-08-19.
--
-- Every branch-identity bug found this week came from resolving a vendor's text label to a
-- branch at QUERY time:
--   ABC  by branch number  -> QXO uses the same numbers, so the display lookup bled (mig 238)
--   QXO  by a scraped city -> "WICHITA", which matches two real Wichita KS branches
--   SRS  resolved at INGEST to vendor_branches.id (FK on 90/90 invoices) -> zero bugs
--
-- That last row is the natural experiment: the one vendor that resolves to our uuid once,
-- up front, has never had an identity bug. This table generalises it — a label is resolved
-- once and recorded, so a new spelling is a DATA row rather than a code change, and an
-- ambiguous label is recorded AS ambiguous rather than silently guessed.
CREATE TABLE IF NOT EXISTS public.vendor_branch_alias (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         uuid NOT NULL REFERENCES public.vendors(id),
  alias_key         text NOT NULL,   -- upper / trimmed / alnum-only
  alias_raw         text,            -- what the source actually said
  vendor_branch_id  uuid REFERENCES public.vendor_branches(id),
  status            text NOT NULL DEFAULT 'resolved',
  candidates        jsonb,           -- populated when status = 'ambiguous'
  source            text,
  decided_by        text,
  decided_at        timestamptz DEFAULT now(),
  notes             text,
  CONSTRAINT vendor_branch_alias_key UNIQUE (vendor_id, alias_key),
  CONSTRAINT vendor_branch_alias_status_chk CHECK (status IN ('resolved','ambiguous','unknown')),
  -- a 'resolved' alias MUST point somewhere; this is what stops a guess becoming a fact
  CONSTRAINT vendor_branch_alias_resolved_chk CHECK (status <> 'resolved' OR vendor_branch_id IS NOT NULL)
);

COMMENT ON TABLE public.vendor_branch_alias IS
  'Vendor-side branch label -> vendor_branches.id, resolved ONCE at ingest. alias_key is upper/trimmed/alnum-only. status=ambiguous means two or more real candidates and a human must pick — never guess, the branch carries money. Added migration 240.';

-- QXO invoices carry only a scraped city label in branch_key and no FK at all:
--   DENTON  -> 270 Denton Branch, TX      single exact-city candidate                  RESOLVED
--   SALINA  -> 479 Salina Branch- Mw, KS  exact city+state; 1904 Salinas CA rejected
--                                          (different city, different state, out of boundary) RESOLVED
--   WICHITA -> AMBIGUOUS. 488 "Wichita Branch- Mw" (2822 N. Mead St) and 986 "Wichita
--              Branch" (2037 S. Southwest Blvd) are both real, both Wichita KS, both
--              covered. Not guessed on a $5,601.71 invoice (UY48909). Both map to the
--              Wichita, KS office, so the PRICING office is not in doubt — only which
--              physical branch gets the attribution.
INSERT INTO public.vendor_branch_alias (vendor_id, alias_key, alias_raw, vendor_branch_id, status, source, decided_by)
SELECT ven.id, 'DENTON', 'DENTON', vb.id, 'resolved',
       'migration-240 exact city match, single candidate', 'agent'
  FROM public.vendors ven
  JOIN public.vendor_branches vb ON vb.vendor_id = ven.id AND vb.branch_number = '270'
 WHERE ven.slug = 'qxo'
ON CONFLICT (vendor_id, alias_key) DO NOTHING;

INSERT INTO public.vendor_branch_alias (vendor_id, alias_key, alias_raw, vendor_branch_id, status, source, decided_by)
SELECT ven.id, 'SALINA', 'SALINA', vb.id, 'resolved',
       'migration-240 exact city+state match; Salinas CA rejected (different city/state, out_of_boundary)', 'agent'
  FROM public.vendors ven
  JOIN public.vendor_branches vb ON vb.vendor_id = ven.id AND vb.branch_number = '479'
 WHERE ven.slug = 'qxo'
ON CONFLICT (vendor_id, alias_key) DO NOTHING;

INSERT INTO public.vendor_branch_alias (vendor_id, alias_key, alias_raw, vendor_branch_id, status, candidates, source, decided_by, notes)
SELECT ven.id, 'WICHITA', 'WICHITA', NULL, 'ambiguous',
       jsonb_build_array(
         jsonb_build_object('branch_number','488','branch_name','Wichita Branch- Mw','address','2822 N. Mead Street','office','Wichita, KS'),
         jsonb_build_object('branch_number','986','branch_name','Wichita Branch','address','2037 S. Southwest Blvd.','office','Wichita, KS')),
       'migration-240 two real Wichita KS branches; not guessed', 'agent',
       'Needs a human pick. Both map to the Wichita, KS office so the pricing office is not in doubt; only branch attribution is. Affects invoice UY48909 ($5,601.71).'
  FROM public.vendors ven
 WHERE ven.slug = 'qxo'
ON CONFLICT (vendor_id, alias_key) DO NOTHING;

-- Apply resolved aliases to invoices with no FK yet. Re-runnable: only fills NULLs.
UPDATE public.vendor_invoices vi
   SET vendor_branch_id = a.vendor_branch_id
  FROM public.vendor_branch_alias a
 WHERE a.vendor_id = vi.vendor_id
   AND a.status = 'resolved'
   AND a.vendor_branch_id IS NOT NULL
   AND vi.vendor_branch_id IS NULL
   AND upper(regexp_replace(coalesce(vi.branch_key,''), '[^A-Za-z0-9]', '', 'g')) = a.alias_key;

-- Verified: UX97791 DENTON -> Richardson, TX; UZ11902 SALINA -> Wichita, KS;
-- UY48909 WICHITA still unresolved by design, pending a human pick.
-- All QXO lines still price as no-price because QXO has no agreement at any office (docs/98).
