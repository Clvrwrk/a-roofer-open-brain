-- 243 — ABC side of the alias mechanism + INGEST-TIME branch resolution.
-- Additive + idempotent. Applied to prod 2026-08-19. Nothing reads the new column until 244.
--
-- The design decision behind this (Chris asked whether to mint a PE UUID per branch):
-- we already have one — vendor_branches.id. A second PE-side uuid would be pure
-- indirection. The defect was never a missing identifier, it was resolving vendor TEXT at
-- QUERY time. Our own data was the experiment: SRS resolves to the uuid at ingest (FK on
-- 90/90 invoices) and has had zero identity bugs; ABC resolved by branch number at read
-- time and bled into QXO's rows (migration 238); QXO had no resolution at all. This
-- migration gives ABC what SRS always had.

-- 1. the FK ABC never had
ALTER TABLE public.abc_invoices
  ADD COLUMN IF NOT EXISTS vendor_branch_id uuid REFERENCES public.vendor_branches(id);
CREATE INDEX IF NOT EXISTS abc_invoices_vendor_branch_idx ON public.abc_invoices (vendor_branch_id);

COMMENT ON COLUMN public.abc_invoices.vendor_branch_id IS
  'Resolved at ingest from raw->branch->>number via vendor_branch_alias (migration 243). Prefer this over branch_number_extracted for any join: the text form collides across vendors (ABC/QXO share numbers).';

-- 2. one canonical normalisation, shared by every reader and writer of the alias table
CREATE OR REPLACE FUNCTION public.vendor_branch_alias_key(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(p_label, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;
COMMENT ON FUNCTION public.vendor_branch_alias_key(text) IS
  'Canonical alias key: upper, alnum-only. Use for every vendor_branch_alias read and write.';

-- 3. seed ABC aliases from the branch master, in BOTH spellings the sources use: the API
--    sends "36" while the branch master and the printed invoice use "036".
INSERT INTO public.vendor_branch_alias (vendor_id, alias_key, alias_raw, vendor_branch_id, status, source, decided_by)
SELECT vb.vendor_id, public.vendor_branch_alias_key(vb.branch_number), vb.branch_number, vb.id,
       'resolved', 'migration-243 seed from vendor_branches.branch_number', 'agent'
  FROM public.vendor_branches vb
  JOIN public.vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'
 WHERE public.vendor_branch_alias_key(vb.branch_number) IS NOT NULL
ON CONFLICT (vendor_id, alias_key) DO NOTHING;

INSERT INTO public.vendor_branch_alias (vendor_id, alias_key, alias_raw, vendor_branch_id, status, source, decided_by)
SELECT vb.vendor_id, public.vendor_branch_alias_key(lpad(ltrim(vb.branch_number,'0'), 3, '0')),
       lpad(ltrim(vb.branch_number,'0'), 3, '0'), vb.id,
       'resolved', 'migration-243 zero-padded spelling of the same branch', 'agent'
  FROM public.vendor_branches vb
  JOIN public.vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'
 WHERE vb.branch_number ~ '^[0-9]+$'
ON CONFLICT (vendor_id, alias_key) DO NOTHING;

-- 4. backfill existing invoices — 1,089 of 1,089 resolve
UPDATE public.abc_invoices i
   SET vendor_branch_id = a.vendor_branch_id
  FROM public.vendor_branch_alias a
  JOIN public.vendors ven ON ven.id = a.vendor_id AND ven.slug = 'abc-supply'
 WHERE i.vendor_branch_id IS NULL
   AND a.status = 'resolved' AND a.vendor_branch_id IS NOT NULL
   AND a.alias_key = public.vendor_branch_alias_key(i.branch_number_extracted);

-- 5. INGEST-TIME resolution.
-- NOTE: branch_number_extracted is a STORED generated column, which is NOT populated while
-- a BEFORE trigger runs — read raw->'branch'->>'number' directly or you will always see NULL.
CREATE OR REPLACE FUNCTION public.abc_invoices_resolve_branch()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_key text;
BEGIN
  IF NEW.vendor_branch_id IS NULL THEN
    v_key := public.vendor_branch_alias_key(NULLIF(NEW.raw -> 'branch' ->> 'number', ''));
    IF v_key IS NOT NULL THEN
      SELECT a.vendor_branch_id INTO NEW.vendor_branch_id
        FROM public.vendor_branch_alias a
        JOIN public.vendors ven ON ven.id = a.vendor_id AND ven.slug = 'abc-supply'
       WHERE a.alias_key = v_key AND a.status = 'resolved'
       LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS abc_invoices_resolve_branch_trg ON public.abc_invoices;
CREATE TRIGGER abc_invoices_resolve_branch_trg
  BEFORE INSERT OR UPDATE OF raw, vendor_branch_id ON public.abc_invoices
  FOR EACH ROW EXECUTE FUNCTION public.abc_invoices_resolve_branch();

-- 6. the same for SRS/QXO, keyed on branch_key — so the next scraped PDF resolves itself
CREATE OR REPLACE FUNCTION public.vendor_invoices_resolve_branch()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_key text;
BEGIN
  IF NEW.vendor_branch_id IS NULL AND NEW.vendor_id IS NOT NULL THEN
    v_key := public.vendor_branch_alias_key(NEW.branch_key);
    IF v_key IS NOT NULL THEN
      SELECT a.vendor_branch_id INTO NEW.vendor_branch_id
        FROM public.vendor_branch_alias a
       WHERE a.vendor_id = NEW.vendor_id AND a.alias_key = v_key AND a.status = 'resolved'
       LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vendor_invoices_resolve_branch_trg ON public.vendor_invoices;
CREATE TRIGGER vendor_invoices_resolve_branch_trg
  BEFORE INSERT OR UPDATE OF branch_key, vendor_branch_id ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.vendor_invoices_resolve_branch();

-- An unknown label now leaves vendor_branch_id NULL -> no office -> no price. That is the
-- correct fail-closed behaviour, and it is visible, rather than silently borrowing whichever
-- vendor's branch row happened to share the number.
