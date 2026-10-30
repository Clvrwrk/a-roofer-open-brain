-- 272 — materialise the audit line so the Invoice Audit surfaces render at all.
--
-- Chris, 2026-08-24: "Ensure invoice audit page renders — if it's slow we need to
-- find an alternative solution then just failing to render." (PEC-241, PEC-243)
--
-- ── What was broken ───────────────────────────────────────────────────────
--
-- `authenticator` carries statement_timeout = 8s. service_role sets no override
-- and inherits it. `v_invoice_audit_line` costs 8.8s. Every read through
-- PostgREST died, and the failure was silent in two different ways:
--
--   /accounting/invoice-audit          HTTP 200, {"offices":[],"categories":[]},
--                                      a small "Supabase pending" badge
--   /api/invoice-audit/invoice?...     HTTP 500 "detail_failed" -> the expand
--                                      row shows a network error
--
-- Confirmed pre-existing: a probe view reconstructing the pre-session ABC arm
-- scans in 8.60s against the current 8.84s, so migrations 268-271 account for
-- 2.8% of it. The view has been over the ceiling for some time.
--
-- ── Why materialise rather than tune ──────────────────────────────────────
--
-- The cost is structural, not a missing index. `v_invoice_audit_line` resolves
-- the governing price with a correlated `LEFT JOIN LATERAL ... ORDER BY ...
-- LIMIT 1` per invoice line, so the work is O(lines) no matter what is asked
-- for. Two consequences:
--
--   1. PostgREST paginates in 1,000-row pages and Postgres cannot reuse work
--      between pages, so a full read costs ~7x the whole-view scan.
--   2. Even `.eq('invoice_number', ...)` does not save it — measured 8.4s and a
--      500 for a single invoice. The equality is not pushed into the LATERAL.
--
-- Nothing about the audit is real-time. Its inputs move on a daily mirror
-- (ABC 07:30 UTC, QBO 01:00 UTC) and price agreements change by hand. The view
-- carries only derived pricing - line identity, quantities, the governing price
-- and its variance. It carries NO audit state: audited/pending/reset live in
-- `invoice_line_audit`, read separately, so materialising cannot make a human
-- action look un-applied.
--
-- ── What this installs ────────────────────────────────────────────────────
--
-- `mv_invoice_audit_line`, refreshed CONCURRENTLY on the existing 15-minute
-- `refresh-office-pricing-matviews` cron - the same cadence that already governs
-- mv_office_agreement_versions and mv_invoice_pricing_office, both of which this
-- view reads. Refreshing them together keeps the three consistent rather than
-- letting the audit line lag its own inputs.
--
-- The view stays. It is the definition of record, silo_assertions() reads it
-- (as postgres via pg_cron, with no 8s ceiling), and a stale matview must always
-- be checkable against the live derivation.

begin;

create materialized view if not exists public.mv_invoice_audit_line as
  select * from public.v_invoice_audit_line;

-- Required for REFRESH ... CONCURRENTLY. line_id is unique across both arms of
-- the union (6,982 rows, 6,982 distinct) - ABC lines and vendor lines are
-- separate uuid keyspaces.
create unique index if not exists mv_invoice_audit_line_pk
  on public.mv_invoice_audit_line (line_id);

-- The access paths the app actually uses: whole-table scan for the summary,
-- by-invoice for the expand, by-line for the credit-memo lookup.
create index if not exists mv_invoice_audit_line_invoice_idx
  on public.mv_invoice_audit_line (invoice_number);
create index if not exists mv_invoice_audit_line_claim_idx
  on public.mv_invoice_audit_line (invoice_number)
  where negotiated_price is not null;

comment on materialized view public.mv_invoice_audit_line is
  'Materialised v_invoice_audit_line. Read this from any PostgREST client - the underlying view costs ~8.8s, over the 8s statement_timeout that service_role inherits from authenticator, so every direct read of it fails (PEC-241/PEC-243). Refreshed CONCURRENTLY every 15 minutes alongside mv_office_agreement_versions and mv_invoice_pricing_office, which it reads. Carries derived pricing only - audit state lives in invoice_line_audit and is never stale.';

-- Refresh alongside the matviews this one depends on, in dependency order, so
-- the audit line is never derived from inputs newer than itself.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'refresh-office-pricing-matviews'),
  command := $cron$
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_office_agreement_versions;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_pricing_office;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_vendor_office_item_history;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_audit_line;
    SELECT public.credit_memo_claims_sync_all();
    SELECT public.credit_memo_reconcile();
  $cron$
);

grant select on public.mv_invoice_audit_line to anon, authenticated, service_role;

commit;

-- Verification:
--   select count(*) from mv_invoice_audit_line;                       -- 6,982, instant
--   explain analyze select * from mv_invoice_audit_line
--    where invoice_number = '2013325104-001';                          -- index scan, ms
--   select command from cron.job where jobname='refresh-office-pricing-matviews';
--   GET /accounting/invoice-audit                                      -- renders with data
--   GET /api/invoice-audit/invoice?invoiceNumber=...                   -- 200
