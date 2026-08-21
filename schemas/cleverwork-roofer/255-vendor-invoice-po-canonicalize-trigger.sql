-- 255 — keep po_number canonical on the way IN (2026-08-21). Additive + idempotent.
--
-- Migration 254 cleaned the drift that had accumulated ("co-356", "CO357", "KS 147",
-- "KS189", "TX-455-2"). Without this, the next ingested document reintroduces it, because
-- the vendor types the job code by hand every time. Same shape as migration 243's branch
-- resolution: normalize at write time so every writer benefits and no reader has to know.
--
-- Fails OPEN, unlike the branch trigger: an unrecognised PO is LEFT EXACTLY AS PRINTED.
-- A PO that matches no job is real information ("this delivery is not tied to a job yet"),
-- and blanking it would destroy the only clue to which job it belongs to. Only a PO whose
-- token resolves to a real AccuLynx job is rewritten.
--
-- The printed value always lands in raw.po_number_as_printed first (COALESCE, so an
-- existing original is never clobbered).

CREATE OR REPLACE FUNCTION public.vendor_invoice_po_token(p_po text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(upper(regexp_replace(
           substring(btrim(COALESCE(p_po, '')), '^\s*([A-Za-z]{2}\s*-?\s*[0-9]+)'),
           '[^A-Za-z0-9]', '', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.vendor_invoices_canonicalize_po()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_tok text; v_job text;
BEGIN
  v_tok := public.vendor_invoice_po_token(NEW.po_number);
  IF v_tok IS NULL THEN RETURN NEW; END IF;

  SELECT TRIM(BOTH FROM split_part(aj.job_name, ':', 1)) INTO v_job
  FROM public.acculynx_jobs aj
  WHERE aj.job_name ~* '^(ks|kc|mc|tx|co|ok|nc)\s*-'
    AND aj.job_name !~* '^(ks|kc|mc|tx|co|ok|nc)\s*-\s*temp\s*-'
    AND upper(regexp_replace(
          substring(TRIM(BOTH FROM split_part(aj.job_name, ':', 1)), '^\s*([A-Za-z]{2}\s*-\s*[0-9]+)'),
          '[^A-Za-z0-9]', '', 'g')) = v_tok
  LIMIT 1;

  -- No job for this token: leave the printed PO untouched (fail open).
  IF v_job IS NULL OR v_job = COALESCE(NEW.po_number, '') THEN RETURN NEW; END IF;

  NEW.raw := COALESCE(NEW.raw, '{}'::jsonb)
             || jsonb_build_object('po_number_as_printed',
                  COALESCE(NEW.raw->>'po_number_as_printed', NEW.po_number))
             || jsonb_build_object('po_number_source', 'acculynx_job_number (trigger, migration 255)');
  NEW.po_number := v_job;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vendor_invoices_canonicalize_po_trg ON public.vendor_invoices;
CREATE TRIGGER vendor_invoices_canonicalize_po_trg
  BEFORE INSERT OR UPDATE OF po_number ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.vendor_invoices_canonicalize_po();

DO $$
BEGIN
  -- the tokenizer must agree with v_vendor_invoice_acculynx_match on the real examples
  IF public.vendor_invoice_po_token('TX-455-2') <> 'TX455' THEN RAISE EXCEPTION '255 token TX-455-2'; END IF;
  IF public.vendor_invoice_po_token('KS 147')   <> 'KS147' THEN RAISE EXCEPTION '255 token KS 147'; END IF;
  IF public.vendor_invoice_po_token('co-356')   <> 'CO356' THEN RAISE EXCEPTION '255 token co-356'; END IF;
  IF public.vendor_invoice_po_token('KS189')    <> 'KS189' THEN RAISE EXCEPTION '255 token KS189'; END IF;
  IF public.vendor_invoice_po_token('216 SOUTH MADISO') IS NOT NULL THEN RAISE EXCEPTION '255 address must not tokenize'; END IF;
  RAISE NOTICE '255 ok — po_number canonicalizes on write; unrecognised POs left as printed';
END $$;
