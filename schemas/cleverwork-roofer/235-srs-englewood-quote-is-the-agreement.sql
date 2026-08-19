-- 235 — SRS Englewood / S Denver quote 0049345641 is the governing price agreement
-- (Chris, 2026-08-19). Additive + idempotent. Metadata flag only; no pricing data touched.
--
-- Same mechanism as migration 234, deliberately NOT a hardcoded "SRS quotes are fine"
-- rule. Chris's framing: "we are working to get vendor to sign off on the price
-- agreements we build" — until a countersigned agreement exists, the branch quote is the
-- operative price book, and each document is accepted individually on its own record.
--
-- ceo_verified is a DISPLAY BADGE, never a pricing gate (docs/82 §6 decision 3), so this
-- changes no price resolution anywhere. It changes what the evidence panel on
-- /accounting/credit-memos/<invoice> is entitled to say about the document. The record
-- still reads "quote" in version_label and source_file — the panel shows that a quote was
-- ACCEPTED, it does not hide what the document is.
--
-- Claims resting on this quote: 0049707508-001 (received, $793.05) and 0050095528-001
-- (cancelled) — both already settled, so nothing pending changes verdict today.

UPDATE public.price_agreements
SET ceo_verified    = true,
    ceo_verified_by = 'Chris Hussey',
    ceo_verified_at = COALESCE(ceo_verified_at, now()),
    notes           = TRIM(BOTH ' · ' FROM COALESCE(notes, '') ||
                      ' · 2026-08-19 (Chris): accepted as the governing price agreement for the Denver (Greenwood Village), CO office. SRS prices Pro Exteriors off the branch quote pending a countersigned agreement.')
WHERE id = '7246ed93-a1cc-44e5-b338-1a05f204c3e4'
  AND ceo_verified IS DISTINCT FROM true;
