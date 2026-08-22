-- 267 — backdate the SRS Colorado price list so it governs current invoices.
--
-- DIRECTED BY CHRIS 2026-08-22, overriding the hold recorded in PEC-237.
--
-- v_invoice_audit_line gates on pa.effective_date <= vi.invoice_date. The
-- Colorado list was stamped 2026-08-14 while every Colorado SRS invoice on file
-- runs 2026-06-18 .. 2026-07-16, so the whole list — including the three
-- bindings approved in migration 266 — could not reach a single invoice.
--
-- Moved to 2026-06-01: the first day of the month containing the earliest SRS
-- invoice anywhere in the brain (2026-06-18), with margin. A deliberate round
-- date rather than the exact earliest invoice, so one late-arriving June
-- invoice does not silently fall outside the window.
--
-- SCOPE: this is the ONLY SRS agreement that needed moving.
--   Melissa TX Level 4   eff 2026-02-16, TX invoices from 2026-07-23  — covers
--   Wichita KS quote     eff 2026-06-23, KS invoices from 2026-07-07  — covers
--   Englewood CO quote   eff 2026-05-28, CO invoices from 2026-06-18  — covers
-- Verified: 0 of 289 SRS lines in any office lack an in-date agreement. The
-- Colorado problem was never "no agreement in date" — the Englewood quote was
-- in date all along. It was that the only book CONTAINING these items sat in
-- the future.
--
-- SIMULATED BEFORE APPLYING, then confirmed after. Six Colorado lines move
-- unpriced -> priced, all onto the August list. NO line is taken away from the
-- Englewood quote, so the audit's lowest-price tie-break does not re-home any
-- existing match — the risk that motivated simulating this first did not
-- materialise.
--
--   MALVIARIRSBOK3  0049707508-001  2026-06-18  $202.00 vs $135.00  +$2,814.00
--   MALHRARSB       0049707508-001  2026-06-18  $134.00 vs  $84.50    +$247.50
--   MALVIARIRSBOK3  0050095528-001  2026-07-09  RETURN line, excluded
--   TOPTS381900 / METFSP448BR / IKOCAECN        priced at par, $0 variance
--
-- Net new claimable: $3,061.50 on 2 lines, both on invoice 0049707508-001.
-- Colorado priced lines 6 -> 17.
--
-- The 2026-07-09 Vista line is a CUSTOMER MATERIAL RETURN (negative
-- extended_price). It prices, and it must never be claimed: returns invert the
-- variance sign, so any claim query over this data filters extended_price > 0.
--
-- ROLLBACK: update price_agreements set effective_date = '2026-08-14'
--           where id = '9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34';
--
-- One date field; the prior value is preserved in notes. Rule 1: no drops.

begin;

update public.price_agreements set
  effective_date = date '2026-06-01',
  notes = concat_ws(' · ', notes,
    '2026-08-22 (Chris): effective_date backdated 2026-08-14 -> 2026-06-01 so this price book governs the June-July Colorado invoices already on file. Directed by Chris over the hold in PEC-237, which asked SRS to confirm whether the 14 August list re-issues pricing that was already standing. Supporting signal: the Englewood quote (2026-05-28) prices Malarkey Vista AR at $135.00/SQ, identical to this list, so $135 was standing well before 14 August. Unblocks $3,061.50 of claimable variance on 2 lines. ORIGINAL effective_date was 2026-08-14 - restore that value to revert.'),
  updated_at = now()
where id = '9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34'
  and effective_date = date '2026-08-14';

commit;
