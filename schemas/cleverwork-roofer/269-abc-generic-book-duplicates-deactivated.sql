-- 269 — the 7 duplicate ABC rows in the generic price book go inert, and the
--       "no invoice is audited twice" invariant becomes a standing assertion.
--
-- Chris, 2026-08-24: approved (PEC-239).
--
-- ── The condition ─────────────────────────────────────────────────────────
--
-- The price audit has two arms that never mix:
--
--   ABC arm     abc_invoices    priced from abc_price_list_items
--   Vendor arm  vendor_invoices priced from price_agreement_items
--
-- ABC Supply nonetheless owns 7 rows in the generic price_agreements table,
-- two of them carrying 317 item rows between them. Verified on 2026-08-24:
-- both item-carrying rows are exact duplicates of an ABC-native row — same
-- agreement number, same effective and expiry dates, same item count:
--
--   generic 2036874-16  eff 2026-06-01  exp 2026-06-30  164 items  == abc id 7
--   generic 2036874-9   eff 2026-06-03  exp 2026-12-31  153 items  == abc id 8
--
-- The other five carry zero items. So they are duplicate ingest, not something
-- still needed — which is what made this safe to close rather than design around.
--
-- They are inert today only because vendor_invoices holds no ABC data (SRS and
-- QXO only, zero invoice-number overlap). The moment ABC invoices are mirrored
-- into vendor_invoices — a plausible consolidation step — ABC would be audited
-- two ways at once, against two price books, with two different fallback
-- matchers, and because the arms are a UNION ALL both rows would appear.
--
-- ── What this migration does ──────────────────────────────────────────────
--
-- 1. is_active = false on the 7 rows. Archive, never delete (hard rule 1). The
--    vendor arm already asserts pa.is_active IS NOT FALSE, so this removes them
--    from every pricing path without touching a single item row.
-- 2. Adds the overlap check to silo_assertions(), which the nightly
--    'nightly-silo-assertions' cron already logs into dashboard_action_log.
--    Today the count is 0; nothing enforced that it stays 0.
--
-- Moves no number: nothing reads these rows. Verified before and after.

begin;

update public.price_agreements pa
   set is_active = false,
       notes = coalesce(pa.notes || ' · ', '')
             || '2026-08-24 (mig 269): deactivated. Duplicate ingest of an ABC-native '
             || 'abc_price_agreements row; the ABC audit arm reads abc_price_list_items '
             || 'and never this table. Deactivated rather than deleted (hard rule 1) to '
             || 'neutralise the dual-audit hazard in PEC-239. Set is_active = true to revert.'
  from public.vendors v
 where v.id = pa.vendor_id
   and lower(v.name) like '%abc%'
   and pa.is_active is not false;

-- The standing invariant. CREATE OR REPLACE keeps the (check_name, detail)
-- signature the nightly cron inserts from.
create or replace function public.silo_assertions()
returns table(check_name text, detail text) language sql stable as $function$
  SELECT 'generic_line_cross_silo',
         vl.invoice_number || ' line ' || vl.id
  FROM vendor_invoice_lines vl
  JOIN vendor_invoices vi ON vi.id = vl.invoice_id
  LEFT JOIN vendor_branches vb ON vb.id = vi.vendor_branch_id
  JOIN v_invoice_audit_line l ON l.line_id = vl.id AND l.negotiated_price IS NOT NULL
  JOIN LATERAL (
    SELECT pa.vendor_id, vb2.pricing_territory_office_id AS office_id
    FROM price_agreements pa
    JOIN vendor_branches vb2 ON vb2.id = pa.vendor_branch_id
      AND vb2.pricing_territory_office_id = vb.pricing_territory_office_id
    JOIN price_agreement_items pai ON pai.agreement_id = pa.id
      AND (pai.raw_item_number = vl.item_number OR pai.raw_description_normalized = lower(vl.item_description))
    WHERE pa.vendor_id = vi.vendor_id AND pa.is_active IS NOT FALSE
      AND (pa.effective_date IS NULL OR vi.invoice_date IS NULL OR pa.effective_date <= vi.invoice_date)
    ORDER BY (upper(COALESCE(pai.price_uom,'')) = upper(COALESCE(vl.price_uom,''))) DESC, pai.negotiated_price
    LIMIT 1) w ON true
  WHERE w.vendor_id <> vi.vendor_id
     OR w.office_id IS DISTINCT FROM vb.pricing_territory_office_id
  UNION ALL
  SELECT 'audit_ledger_vendor_mismatch',
         a.invoice_number || ' row ' || a.id
  FROM invoice_line_audit a
  JOIN vendor_invoices vi ON vi.invoice_number = a.invoice_number
  JOIN vendors v ON v.id = vi.vendor_id
  WHERE a.vendor_slug <> v.slug
    AND EXISTS (SELECT 1 FROM vendor_invoice_lines vl WHERE vl.id = a.invoice_line_id)
  UNION ALL
  SELECT 'cm_request_vendor_mismatch',
         q.invoice_number || ' request ' || q.id
  FROM credit_memo_requests q
  JOIN vendor_invoices vi ON vi.invoice_number = q.invoice_number
  JOIN vendors v ON v.id = vi.vendor_id
  WHERE q.vendor_slug <> v.slug
    AND NOT EXISTS (SELECT 1 FROM abc_invoices ai WHERE ai.invoice_number = q.invoice_number)
  UNION ALL
  -- PEC-239. An invoice present in both mirrors is audited by both arms, against
  -- two different price books with two different fallback matchers, and the
  -- UNION ALL shows both rows. Must stay 0.
  SELECT 'invoice_in_both_mirrors',
         ai.invoice_number
  FROM abc_invoices ai
  JOIN vendor_invoices vi ON vi.invoice_number = ai.invoice_number
  UNION ALL
  -- PEC-239. ABC pricing must live in the ABC-native book only. An active ABC
  -- row in the generic book is the other half of the same hazard.
  SELECT 'abc_pricing_in_generic_book',
         pa.id::text || ' (' || coalesce(pa.agreement_number,'no number') || ')'
  FROM price_agreements pa
  JOIN vendors v ON v.id = pa.vendor_id
  WHERE lower(v.name) LIKE '%abc%' AND pa.is_active IS NOT FALSE;
$function$;

comment on function public.silo_assertions() is
  'Standing silo invariants, logged nightly into dashboard_action_log by the nightly-silo-assertions cron. Every row returned is a violation; an empty result is the healthy state. Added 2026-08-24 (mig 269): invoice_in_both_mirrors and abc_pricing_in_generic_book, the two halves of the PEC-239 dual-audit hazard.';

commit;

-- Verification:
--   select * from silo_assertions();                                    -- 0 rows
--   select count(*) from price_agreements pa join vendors v on v.id=pa.vendor_id
--    where lower(v.name) like '%abc%' and pa.is_active is not false;    -- 0
--   ABC priced-line count and claim total must be unchanged by this migration.
