-- 269 — join the dollars (267) to the recorded rulings in office_vendor_agreement_status
--       (245). One decision surface.
-- Applied to prod 2026-08-20.
--
-- 245 and this set's spend view (the file now numbered 267) landed within two minutes of
-- each other from parallel sessions and answer DIFFERENT halves of the same question:
--   245 says WHY a pair has no agreement  (no_book | pending | not_pursued | unrecorded)
--   267 says HOW MUCH that pair costs     (invoice_count, spend)
-- Neither alone supports a decision. Ranked by dollars alone, Wichita x QXO ($5,697.47)
-- looks like work to chase — but QXO carries a recorded `no_book` ruling at every office
-- (office_vendor_agreement_status, 2026-08-20): those lines price
-- as no-price BY DESIGN. Ranked by ruling alone, every `unrecorded` pair looks equal, and
-- three of them have never seen an invoice.
--
-- Read together the real queue is short:
--
--   office x vendor        ruling      spend        action
--   Denver x SRS           unrecorded  $17,437.63   TRIAGE — biggest exposure, no ruling
--   Atlanta x ABC          pending     $5,226.90    in flight, already being pursued
--   Wichita x QXO          no_book     $5,697.47    accepted by design — do NOT chase
--   Richardson x QXO       no_book     -$3,723.59   accepted by design (net credit)
--   Atlanta x SRS          unrecorded  $0.00        no spend — ruling can wait
--   Kansas City x SRS      unrecorded  $0.00        no spend — ruling can wait
--
-- So exactly ONE pair needs a human decision it does not have: Denver x SRS.
--
-- `needs_ruling` is deliberately narrow: unrecorded AND money actually moved. A pair with a
-- ruling is settled even when it carries spend, and a pair with no spend is not urgent even
-- when unruled. This is the column to alert on; `spend` alone would cry wolf about QXO
-- every week.
--
-- Additive and idempotent: CREATE OR REPLACE VIEW only.

CREATE OR REPLACE VIEW public.v_office_vendor_gap_exposure AS
SELECT c.office_id,
       c.office            AS office_name,
       c.vendor_id,
       c.vendor            AS vendor_slug,
       c.covered_branches,
       c.live_agreements,
       c.status            AS agreement_status,
       c.note              AS ruling_note,
       c.decided_by,
       COALESCE(s.invoice_count, 0)   AS invoice_count,
       COALESCE(s.spend, 0)::numeric(14,2) AS spend,
       -- The alertable column: money moved AND nobody has ruled on it.
       (c.live_agreements = 0
        AND c.status = 'unrecorded'
        AND COALESCE(s.invoice_count, 0) > 0) AS needs_ruling
  FROM public.v_office_vendor_agreement_coverage c
  LEFT JOIN public.v_office_vendor_spend s
         ON s.office_id = c.office_id
        AND s.vendor_id = c.vendor_id
 WHERE c.office_active;

COMMENT ON VIEW public.v_office_vendor_gap_exposure IS
  'Coverage gaps with BOTH the ruling (mig 245) and the dollars (mig 267). Filter on '
  'needs_ruling to get only pairs where spend has occurred and no human has decided — '
  'never rank on spend alone, or accepted no_book vendors (QXO) resurface as false work.';
