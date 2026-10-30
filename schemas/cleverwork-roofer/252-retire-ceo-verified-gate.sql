-- 252 — retire the ceo_verified gate (Chris, 2026-08-21). Additive + idempotent.
--
-- Chris: "please remove the ceo_verified=true requirement, that was an old gate that
-- needs to be deleted from all worksurfaces. once a price agreement is added it is
-- approved and active."
--
-- This finishes a decision already half-made: docs/82 §6 decision 3 (2026-08-05) ruled
-- ceo_verified a DISPLAY BADGE and never a pricing gate, and vendor-territories.ts has
-- honoured that since. But three surfaces still treated it as a gate:
--   1. the credit-memo evidence panel warned "the cited document is a QUOTE and has not
--      been accepted as a price agreement" whenever ceo_verified was not true;
--   2. abc-price-gaps raised an `unverified_agreement` gap reason with severity
--      "blocked" and the action "CEO-verify the referenced agreement";
--   3. review/promote.ts stamped every newly promoted agreement ceo_verified = false,
--      so a freshly added book started life failing 1 and 2.
-- Those are removed in the same commit as this migration.
--
-- Data side: an agreement that exists has been added deliberately, so it is approved and
-- active. 10 rows currently say otherwise (5 abc_price_agreements, 5 price_agreements)
-- and are the reason those warnings fire today.
--
-- NOT dropped: the ceo_verified / ceo_verified_by / ceo_verified_at columns stay. Rule 1
-- is additive-only, and the timestamps are real provenance about who accepted what and
-- when. The column simply stops being consulted as a gate.

UPDATE public.price_agreements
SET ceo_verified    = true,
    ceo_verified_by = COALESCE(ceo_verified_by, 'Chris Hussey'),
    ceo_verified_at = COALESCE(ceo_verified_at, now()),
    notes           = TRIM(BOTH ' · ' FROM COALESCE(notes, '') ||
                      ' · 2026-08-21 (Chris): ceo_verified gate retired — an agreement on file is approved and active.')
WHERE ceo_verified IS DISTINCT FROM true;

UPDATE public.abc_price_agreements
SET ceo_verified    = true
WHERE ceo_verified IS DISTINCT FROM true;

DO $$
DECLARE pa int; abc int;
BEGIN
  SELECT count(*) INTO pa  FROM public.price_agreements     WHERE ceo_verified IS DISTINCT FROM true;
  SELECT count(*) INTO abc FROM public.abc_price_agreements WHERE ceo_verified IS DISTINCT FROM true;
  IF pa <> 0 OR abc <> 0 THEN
    RAISE EXCEPTION '252 % price_agreements and % abc_price_agreements still unverified', pa, abc;
  END IF;
  RAISE NOTICE '252 ok — every agreement on file reads approved and active';
END $$;
