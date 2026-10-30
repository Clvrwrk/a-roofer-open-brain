-- 275 — make the PEC-215 phantom row structurally impossible, not merely absent.
--
-- Re-verified 2026-08-24: the blank-invoice-number row is gone. Migration 232
-- quarantined it (reversibly, into abc_invoices_quarantine with its full raw
-- payload), the mirror skips rows with no invoice number
-- (integrations/bridges/abc-supply/mirror-backfill.mjs:941), and the client
-- refuses to fetch detail for an empty invoice number
-- (src/scripts/invoice-audit-tree.ts:561).
--
--   blank rows in abc_invoices                         0
--   blank rows reaching v_invoice_audit_invoice        0
--   blank rows reaching v_invoice_acculynx_match       0
--
-- What was still missing is a guard that does not depend on which code path
-- does the writing. Every protection above is a behaviour of one caller; a new
-- backfill script, a manual upsert, or a future CSV import would each have to
-- remember. A CHECK constraint cannot be forgotten.
--
-- Additive and immediately valid — there is nothing to migrate, only something
-- to assert.

begin;

do $do$
declare v_blank integer;
begin
  select count(*) into v_blank
    from public.abc_invoices
   where coalesce(btrim(invoice_number), '') = '';

  if v_blank > 0 then
    raise exception
      'refusing to add the constraint: % blank invoice_number row(s) still present. Quarantine them first (see migration 232) rather than deleting - this is a money table.', v_blank;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'abc_invoices_invoice_number_not_blank') then
    alter table public.abc_invoices
      add constraint abc_invoices_invoice_number_not_blank
      check (coalesce(btrim(invoice_number), '') <> '');
  end if;
end $do$;

comment on constraint abc_invoices_invoice_number_not_blank on public.abc_invoices is
  'PEC-215. A CSV totals/footer line once entered as an invoice with a blank invoice_number and $59,639.20 of total_amount, overstating ABC spend by 2.7% and 404-ing the Invoice Audit page on every load. Route such a row to abc_invoices_quarantine (migration 232); never delete it - archive, never delete (hard rule 1).';

commit;

-- Verification:
--   select count(*) from abc_invoices where coalesce(btrim(invoice_number),'')='';  -- 0
--   insert into abc_invoices (invoice_number) values ('');                           -- rejected
