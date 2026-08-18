-- 230 — invoice pricing office = servicing branch (PEC-209 / PEC-210).
-- Applied to prod 2026-08-18.
--
-- v_invoice_pricing_office resolved the PE office through the ship-to's HOME
-- branch (abc_ship_to_branch_access.home_branch = true), so any invoice
-- serviced by a different branch inherited the wrong office's price agreement.
-- Live impact at fix time: 49 invoices / ~$119.6K mis-officed — including both
-- of Lucinda's reports (2009034778-001 and 2009557754-001: serviced by ABC
-- branch 113 Wichita KS, priced as Richardson TX).
--
-- New derivation: the invoice's own servicing branch (branch_number_extracted,
-- populated for 1086/1087 invoices), vendor-scoped to abc-supply. Fail closed
-- per the silo doctrine: a branch that is unknown, not pricing-covered, or has
-- no office assignment drops the invoice from the view entirely (31 invoices →
-- Alex No-Price triage, mig 229). The one row with an empty invoice_number is
-- excluded explicitly rather than carried.
--
-- Also: agent_intake_notices.status CHECK gains 'ack_in_thread' — the Maya
-- listener (≥ 2026-08-10) records that status and has been failing with 23514.
--
-- mv_invoice_pricing_office (the live call path: credit-memos/add-line.ts and
-- credit_memo_claims_sync) is refreshed in the same migration.

CREATE OR REPLACE VIEW public.v_invoice_pricing_office AS
SELECT DISTINCT ON (i.invoice_number)
  i.invoice_number,
  vb.pricing_territory_office_id AS office_id
FROM public.abc_invoices i
JOIN public.vendor_branches vb
  ON vb.branch_number = i.branch_number_extracted
 AND vb.pricing_status = 'covered'
JOIN public.vendors ven
  ON ven.id = vb.vendor_id
 AND ven.slug = 'abc-supply'
WHERE vb.pricing_territory_office_id IS NOT NULL
  AND i.invoice_number <> ''
ORDER BY i.invoice_number;

-- Constraint widening (not a data change): same pattern as 227's overload swap.
ALTER TABLE public.agent_intake_notices
  DROP CONSTRAINT IF EXISTS agent_intake_notices_status_check;
ALTER TABLE public.agent_intake_notices
  ADD CONSTRAINT agent_intake_notices_status_check
  CHECK (status IN ('sent','skipped_external','skipped_no_sender','failed','dry_run','ack_in_thread'));

REFRESH MATERIALIZED VIEW public.mv_invoice_pricing_office;
