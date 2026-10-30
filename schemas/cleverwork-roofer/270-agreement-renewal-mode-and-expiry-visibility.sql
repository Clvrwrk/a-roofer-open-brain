-- 270 — expiry becomes an explicit per-agreement choice, a visible flag on the
--       audit line, and the legacy branch arm stops reaching back to superseded
--       versions.
--
-- Chris, 2026-08-24: approved (PEC-238).
--
-- ── What was measured ─────────────────────────────────────────────────────
--
-- The string `expiry` appeared nowhere in v_invoice_audit_line. Both arms gated
-- on is_active and effective_date only, so an agreement past its stated expiry
-- kept pricing invoices indefinitely.
--
-- Tested against Chris's "we only review last week's invoices":
--
--   677 lines priced by an agreement expired at the invoice date  $2,959.82
--   ...of those, invoiced in the last 30 days                     $0.00
--   ...of those, invoiced in the last 7 days                      $0.00
--
-- So the DOLLARS are back-catalogue. The CONDITION is current, and worse than
-- the ticket described: of the 8 ABC invoices in the last 7 days, 5 lines
-- priced, and all 5 resolved to 2036874-16 effective 2026-06-01, expired
-- 2026-06-30. Zero lines priced off an in-date book.
--
--   office                          latest ABC book   expiry       in-date books
--   Wichita, KS                     2036874-16        2026-07-31   0
--   Richardson, TX                  2036874-2         2026-08-19   0
--   Kansas City, MO                 2036874-20        2026-03-31   0
--   Denver (Greenwood Village), CO  PA-90502-9AMTT6   2026-12-31   2
--
-- Getting those books renewed is a phone call, not a migration. What the schema
-- owes is (a) an explicit record of whether an agreement is meant to lapse, and
-- (b) visibility when a price came off an expired one.
--
-- ── Why the default is evergreen, and the gate ships dormant ──────────────
--
-- All five recent lines price at 0.00% variance. ABC is still charging exactly
-- the expired book's prices, which is direct evidence these national-account
-- agreements roll in practice. Enforcing expiry would cost coverage and gain
-- nothing. The two SRS quotes are already documented evergreen in their own
-- notes (docs/81 §4).
--
-- So renewal_mode defaults to 'evergreen' and every existing agreement is
-- evergreen: the gate installed below is real but fires on nothing today. That
-- is deliberate. The value delivered now is that the choice is RECORDED rather
-- than implied by omission, and flipping one agreement to 'expires' is a data
-- change rather than a migration.
--
-- ── The supersession gap, found while measuring ───────────────────────────
--
-- The office arm correctly excludes a superseded version for a later invoice.
-- The legacy branch-match arm did not: it only asserted the agreement appears
-- SOMEWHERE in the office's version list, with no "latest version <= invoice
-- date" test. That is how v3 (expired 2026-06-30) still priced August lines
-- although v4 supersedes it — v4 does not carry those items, so the fallback
-- reached back a version.
--
-- Measured: 137 lines are reachable ONLY through a superseded version, carrying
-- $10.75 of claims across 3 lines. Negligible in money, wrong in principle.

begin;

-- 1 · The explicit choice.
alter table public.abc_price_agreements add column if not exists renewal_mode text not null default 'evergreen';
alter table public.price_agreements     add column if not exists renewal_mode text not null default 'evergreen';

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'abc_price_agreements_renewal_mode_ck') then
    alter table public.abc_price_agreements
      add constraint abc_price_agreements_renewal_mode_ck check (renewal_mode in ('evergreen','expires'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'price_agreements_renewal_mode_ck') then
    alter table public.price_agreements
      add constraint price_agreements_renewal_mode_ck check (renewal_mode in ('evergreen','expires'));
  end if;
end $do$;

comment on column public.abc_price_agreements.renewal_mode is
  '''evergreen'' (default): expiry_date is documentary and the agreement keeps pricing past it - the ABC national-account behaviour, evidenced by August invoices billing at exactly the June book price. ''expires'': the audit stops pricing invoices dated after expiry_date. Set deliberately per agreement; the default preserves the behaviour that existed before migration 270, so nothing moved when this column was added.';
comment on column public.price_agreements.renewal_mode is
  'See abc_price_agreements.renewal_mode. The two SRS quotes are evergreen by an explicit decision recorded in their notes (docs/81 §4); this column is where that decision now lives in the schema rather than in free text.';

-- 2 · Patch v_invoice_audit_line: the expiry gate on all three ABC arms and the
--     vendor arm, the supersession fix on the legacy branch arm, and the visible
--     flag. Anchored replacement, same discipline as 261 and 268.
do $do$
declare
  v_def text := pg_get_viewdef('v_invoice_audit_line'::regclass, true);
  a_oav text := 'JOIN mv_office_agreement_versions oav ON oav.office_id = io.office_id AND (i.invoice_date IS NULL OR oav.effective_date IS NULL OR oav.effective_date <= i.invoice_date)';
  a_apn text := 'AND a.agreement_number !~~* ''API-%''::text';
  a_arc text := 'io2.invoice_number = l.invoice_number))';
  a_ven text := 'WHERE pa.vendor_id = vi.vendor_id AND pa.is_active IS NOT FALSE AND (pa.effective_date IS NULL OR vi.invoice_date IS NULL OR pa.effective_date <= vi.invoice_date)';
  a_abc text := 'neg.agreement_id AS negotiated_agreement_id';
  a_vnl text := 'NULL::integer AS negotiated_agreement_id';
  n integer;
begin
  if position('priced_by_expired_agreement' in v_def) > 0 then
    raise notice 'expiry gate already present; nothing to patch';
    return;
  end if;

  -- Expiry gate, ABC office arms (exact-item and description). Two occurrences,
  -- one per arm, and both must be gated.
  select count(*) into n from regexp_matches(v_def, 'JOIN mv_office_agreement_versions oav ON oav\.office_id', 'g');
  if n <> 2 then raise exception 'expected 2 ABC oav joins, found %', n; end if;
  v_def := replace(v_def, a_oav, a_oav ||
    ' AND NOT (EXISTS (SELECT 1 FROM abc_price_agreements ag WHERE ag.id = oav.agreement_id'
    || ' AND ag.renewal_mode = ''expires''::text AND ag.expiry_date IS NOT NULL'
    || ' AND i.invoice_date IS NOT NULL AND ag.expiry_date < i.invoice_date))');

  -- Expiry gate, ABC legacy branch arm.
  if position(a_apn in v_def) = 0 then raise exception 'ABC legacy-arm anchor not found'; end if;
  v_def := replace(v_def, a_apn, a_apn ||
    ' AND (a.renewal_mode = ''evergreen''::text OR a.expiry_date IS NULL'
    || ' OR i.invoice_date IS NULL OR a.expiry_date >= i.invoice_date)');

  -- Supersession, ABC legacy branch arm. agreement_number must be compared in
  -- the same COALESCE form mv_office_agreement_versions publishes it.
  select count(*) into n from regexp_matches(v_def, 'io2\.invoice_number = l\.invoice_number\)\)', 'g');
  if n <> 1 then raise exception 'expected 1 legacy-arm office assertion, found %', n; end if;
  v_def := replace(v_def, a_arc, a_arc ||
    ' AND NOT (EXISTS (SELECT 1 FROM mv_invoice_pricing_office io3'
    || ' JOIN mv_office_agreement_versions o3 ON o3.office_id = io3.office_id'
    || ' WHERE io3.invoice_number = l.invoice_number'
    || ' AND o3.agreement_number = COALESCE(a.agreement_number, ''PA-''::text || a.id)'
    || ' AND (i.invoice_date IS NULL OR o3.effective_date <= i.invoice_date)'
    || ' AND o3.effective_date > a.effective_date))');

  -- Expiry gate, vendor arm.
  if position(a_ven in v_def) = 0 then raise exception 'vendor-arm WHERE anchor not found'; end if;
  v_def := replace(v_def, a_ven, a_ven ||
    ' AND (pa.renewal_mode = ''evergreen''::text OR pa.expiry_date IS NULL'
    || ' OR vi.invoice_date IS NULL OR pa.expiry_date >= vi.invoice_date)');

  -- The visible flag. NULL where nothing priced the line, and NULL on the vendor
  -- arm, which does not publish which agreement won - a known zero and an
  -- unknown are different values (docs/104).
  if position(a_abc in v_def) = 0 then raise exception 'ABC select-list anchor not found'; end if;
  if position(a_vnl in v_def) = 0 then raise exception 'vendor select-list anchor not found'; end if;
  v_def := replace(v_def, a_abc, a_abc ||
    ', CASE WHEN neg.agreement_id IS NULL THEN NULL::boolean ELSE (EXISTS ('
    || 'SELECT 1 FROM abc_price_agreements ag WHERE ag.id = neg.agreement_id'
    || ' AND ag.expiry_date IS NOT NULL AND i.invoice_date IS NOT NULL'
    || ' AND ag.expiry_date < i.invoice_date)) END AS priced_by_expired_agreement');
  v_def := replace(v_def, a_vnl, a_vnl || ', NULL::boolean AS priced_by_expired_agreement');

  execute 'create or replace view public.v_invoice_audit_line as ' || v_def;
end $do$;

comment on view public.v_invoice_audit_line is
  'One row per invoice line with its governing negotiated price. priced_by_expired_agreement is TRUE when the winning agreement''s expiry_date precedes the invoice date, NULL when the line is unpriced or came from the vendor arm (which does not publish its agreement id). It is a disclosure, not a gate - whether expiry actually stops pricing is renewal_mode, per agreement.';

commit;

-- Verification (2026-08-24):
--   select count(*) from v_invoice_audit_line a join abc_invoices i
--     on i.invoice_number = a.invoice_number where a.negotiated_price is not null;  -- 2,179 -> ~2,042
--   select count(*) from v_invoice_audit_line where priced_by_expired_agreement;    -- the disclosure
--   select * from silo_assertions();                                               -- 0 rows
