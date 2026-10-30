-- 213 — claim lines carry their agreement + office context. Applied 2026-08-05.
--
-- Chris QA: CM request lines rendered "the null office agreement (eff. ?)".
-- credit_memo_claims_sync now stamps every claim row with the live engine's
-- office (mv_invoice_pricing_office -> office.name) and the matched agreement
-- (v_invoice_audit_line.negotiated_agreement_id -> abc_price_agreements number,
-- effective, expiry) on both its UPDATE and INSERT arms; the one-time
-- sync_all() backfilled existing claims (143/144 with agreement number,
-- 144/144 with office). The add-line endpoint carries the same context.
-- Full function body lives in Supabase migration history as
-- claims_sync_agreement_context_213b (2026-08-05); it supersedes migration
-- 212's definition of credit_memo_claims_sync only in these added columns.
SELECT 1; -- marker file; see migration history for the applied function body

-- 213b (2026-08-05, same day): the reviewed-claims audit-stamp backfill initially
-- INNER-joined v_invoice_line_audit_current, silently skipping claim lines with
-- no audit history at all. Corrected pass (LEFT JOIN, COALESCE 'pending') stamped
-- 41 further lines ('backfill 2026-08-05b') — e.g. all 6 on 2012329979-001, which
-- then read 0/17 to audit. The live review-line path inserts unconditionally and
-- was never affected.
