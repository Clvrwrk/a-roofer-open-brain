-- 248 — recover the missing agreement citation on the SRS re-audit discrepancy rows.
-- Additive + idempotent: one nullable column, an UPDATE of 11 rows that fills only NULLs.
--
-- Defect: run `srs_2026-08-05` recorded office + agreement on its `valid`, `uom_review`
-- and `engine_resolved` rows and dropped both on its `discrepancy` rows — the only rows
-- that become money. 11 lines / $2,879.55 of claims carried no citation, so the
-- credit-memo evidence panel had to re-derive the agreement live for every SRS claim.
-- ABC's 128 discrepancy rows all carry it; this is SRS-only.
--
-- There is no committed writer to repair: the SRS run was ad-hoc SQL executed on
-- 2026-08-05 and never landed in the repo (scripts/invoice-audit-v2/wave-b-reaudit.sql
-- is ABC-only — it joins abc_invoices / abc_price_agreements). Recurrence is therefore
-- handled by detection (Layer 2 daily sweep, docs/92), not by a writer fix.
--
-- Deliberately NOT a CHECK constraint. The instinct was to make a citation-less
-- discrepancy row impossible — the quarantine/fail-closed pattern used elsewhere. It is
-- the wrong tool here: the live "add line to claim" path
-- (api/credit-memos/add-line.ts) inserts discrepancy rows with
-- `agreement_id: line.negotiated_agreement_id ?? null`, and 65 priced lines in prod
-- genuinely have no agreement id today. A CHECK would fail the human's click rather
-- than the bad data. Fail closed against data you control; detect on data you do not.

-- ── 1 · label how a citation was obtained ──────────────────────────────────────
-- Trust-tier discipline (hard rule 4): a re-derived citation must never be presented
-- as what the auditor actually cited. NULL = recorded by the run itself.
ALTER TABLE public.invoice_line_reaudit
  ADD COLUMN IF NOT EXISTS provenance text;

COMMENT ON COLUMN public.invoice_line_reaudit.provenance IS
  'How the agreement citation was obtained. NULL = recorded by the re-audit run itself. '
  '''rederived'' = reconstructed after the fact from the office-constrained in-force '
  'agreement set; display it as re-derived, never as the auditor''s own citation.';

-- ── 2 · backfill the 11 SRS discrepancy rows ───────────────────────────────────
-- Each resolves to exactly ONE in-force SRS agreement for the invoice's own office
-- whose item price equals the office_price already stored on the row — verified 11/11
-- unambiguous before writing, no row matching two agreements. Office silo enforced by
-- joining the agreement's branch to the invoice branch's pricing_territory_office_id.
UPDATE invoice_line_reaudit r
SET office_id           = m.office_id,
    office_name         = m.office_name,
    agreement_id        = m.agreement_id,
    agreement_number    = m.agreement_number,
    agreement_effective = m.effective_date,
    agreement_expiry    = m.expiry_date,
    provenance          = 'rederived'
FROM (
  SELECT DISTINCT ON (r2.id)
         r2.id,
         vb.pricing_territory_office_id AS office_id,
         o.name          AS office_name,
         pa.id::text     AS agreement_id,
         pa.agreement_number,
         pa.effective_date,
         pa.expiry_date
  FROM invoice_line_reaudit r2
  JOIN vendor_invoices vi ON vi.invoice_number = r2.invoice_number
  JOIN vendor_branches vb ON vb.id = vi.vendor_branch_id
  JOIN office o           ON o.id = vb.pricing_territory_office_id
  JOIN price_agreements pa ON pa.vendor_id = vi.vendor_id AND pa.is_active IS NOT FALSE
                          AND (pa.effective_date IS NULL OR pa.effective_date <= vi.invoice_date)
  JOIN vendor_branches vb2 ON vb2.id = pa.vendor_branch_id
                          AND vb2.pricing_territory_office_id = vb.pricing_territory_office_id
  JOIN price_agreement_items pai ON pai.agreement_id = pa.id
                          AND (pai.raw_item_number = r2.item_number
                               OR pai.raw_description_normalized = lower(r2.item_description))
                          AND pai.negotiated_price = r2.office_price   -- must explain the stored price
  WHERE r2.run_label = 'srs_2026-08-05'
    AND r2.classification = 'discrepancy'
    AND r2.agreement_id IS NULL          -- idempotent: a second run matches nothing
  ORDER BY r2.id, pa.effective_date DESC
) m
WHERE r.id = m.id;

-- ── 3 · assert ─────────────────────────────────────────────────────────────────
DO $$
DECLARE uncited int;
BEGIN
  SELECT count(*) INTO uncited
  FROM invoice_line_reaudit
  WHERE run_label = 'srs_2026-08-05' AND classification = 'discrepancy'
    AND (agreement_id IS NULL OR office_id IS NULL);
  IF uncited <> 0 THEN
    RAISE EXCEPTION '248 % SRS discrepancy row(s) still uncited', uncited;
  END IF;
  RAISE NOTICE '248 ok — all SRS discrepancy rows carry office + agreement, labelled rederived';
END $$;
