-- 273 — point the audit readers at mv_invoice_audit_line.
--
-- Chris, 2026-08-24 (PEC-241, PEC-243). Companion to migration 272.
--
-- Creating the matview is not enough on its own: two views still derive from
-- the live `v_invoice_audit_line`, and both are read through PostgREST under the
-- 8s ceiling.
--
--   v_invoice_audit_line_cascade   the benchmark cascade behind the expand row.
--                                  Measured 8.59s for a SINGLE invoice — the
--                                  planner materialises all 6,982 rows of the
--                                  audit line and joins 15 detail rows against
--                                  it. This is the query behind the network
--                                  failure Chris reported on expand.
--   v_no_price_repeats             the repeat-offender list.
--
-- Both are pure derivations of the same rows, so reading the matview changes
-- nothing but the cost. `v_invoice_audit_line` itself is untouched and remains
-- the definition of record — silo_assertions() reads it under pg_cron, where
-- there is no statement timeout, so the assertions still test the live
-- derivation rather than a snapshot of it.
--
-- mv_invoice_audit_summary also derives from the view. Left alone deliberately:
-- it is refreshed by a scheduled job running as postgres, so it never meets the
-- ceiling, and rebuilding a matview means DROP + CREATE with its own dependency
-- cascade. No reason to take that risk for no gain.

begin;

do $do$
declare
  v_cascade text := pg_get_viewdef('v_invoice_audit_line_cascade'::regclass, true);
  v_repeats text := pg_get_viewdef('v_no_price_repeats'::regclass, true);
begin
  if position('mv_invoice_audit_line' in v_cascade) = 0 then
    if position('v_invoice_audit_line' in v_cascade) = 0 then
      raise exception 'v_invoice_audit_line_cascade no longer references the audit line';
    end if;
    execute 'create or replace view public.v_invoice_audit_line_cascade as '
         || replace(v_cascade, 'v_invoice_audit_line', 'mv_invoice_audit_line');
  end if;

  if position('mv_invoice_audit_line' in v_repeats) = 0 then
    if position('v_invoice_audit_line' in v_repeats) = 0 then
      raise exception 'v_no_price_repeats no longer references the audit line';
    end if;
    execute 'create or replace view public.v_no_price_repeats as '
         || replace(v_repeats, 'v_invoice_audit_line', 'mv_invoice_audit_line');
  end if;
end $do$;

comment on view public.v_invoice_audit_line_cascade is
  'Benchmark cascade per invoice line. Reads mv_invoice_audit_line, not the live view: deriving from the view cost 8.59s for a single invoice because the planner materialises the whole audit line before joining, which put it over the 8s statement_timeout and turned the expand row into a network error (PEC-243).';

commit;

-- Verification:
--   explain analyze select * from v_invoice_audit_line_cascade
--    where invoice_number = '2013325104-001';                  -- index scan, ms
--   select count(*) from v_no_price_repeats;                   -- unchanged
