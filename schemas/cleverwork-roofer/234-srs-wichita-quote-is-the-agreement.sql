-- 234 — SRS Wichita quote 0049828559 is the governing price agreement (Chris, 2026-08-19).
-- Additive + idempotent. Flips a metadata flag only; no pricing data is touched.
--
-- Ruling: for SRS, this quote IS the price agreement. SRS Wichita prices Pro Exteriors off
-- the branch quote rather than a numbered agreement document, so the quote is the price
-- book, and claims resting on it are sound.
--
-- Recorded via ceo_verified — the existing "a human confirmed this document" flag, which
-- docs/82 §6 decision 3 establishes as a DISPLAY BADGE, never a pricing gate. Setting it
-- therefore changes no price resolution anywhere; it changes what the evidence panel on
-- /accounting/credit-memos/<invoice> is entitled to say about the document.
--
-- The record still says "quote" in version_label and source_file. That is deliberate: the
-- panel shows that a quote was ACCEPTED by a human, rather than hiding what it is.
--
-- Scope is this one document, not "SRS quotes in general". The other live SRS quote
-- (0049345641, S Denver / Englewood CO, id 7246ed93-a1cc-44e5-b338-1a05f204c3e4) is NOT
-- elevated here — the two claims resting on it are already received/cancelled, so nothing
-- pending depends on it. Extend deliberately, one document at a time.
--
-- NOTE this does NOT revive the ABC claim on invoice 2009557754-001. That claim was priced
-- off this SRS document against an ABC invoice, which is a vendor-silo violation (migration
-- 208) independent of the quote-vs-agreement question. docs/93's withdrawal stands.

UPDATE public.price_agreements
SET ceo_verified    = true,
    ceo_verified_by = 'Chris Hussey',
    ceo_verified_at = COALESCE(ceo_verified_at, now()),
    notes           = TRIM(BOTH ' · ' FROM COALESCE(notes, '') ||
                      ' · 2026-08-19 (Chris): for SRS this quote IS the price agreement — SRS Wichita prices off the branch quote. Accepted as the governing price book for the Wichita, KS office.')
WHERE id = '3e7b261b-533d-4df5-aa3f-94bef11f9868'
  AND ceo_verified IS DISTINCT FROM true;
