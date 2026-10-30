-- 280 — a negative total IS a credit memo, and the QB export is per vendor.
--
-- Chris, 2026-08-25. Two rulings that supersede parts of docs/81.
--
-- RULING 1 — "If it's a negative number we can assume it's a credit memo, and therefore
-- we should have an original invoice given to us so we can match the CM to a CM TBD line."
--
--   A negative-total document is a credit, not a payable. It must never reach a QB bank
--   register as a negative bill; it belongs in credit-memo reconciliation against its
--   original invoice, or parked on a CM TBD line until the original is identified.
--
--   The vendor flags were not reliable. Across the mirrors:
--     abc_invoices     252 negative docs, 248 flagged is_credit_memo, 4 NOT flagged
--     vendor_invoices   14 negative docs,  13 flagged doc_type='credit', 1 NOT flagged
--   Those 5 unflagged negatives are exactly what leaked into the weekly QB file - among
--   them QXO UX97791 at -$3,723.59. v_credit_memo_match already derives credit status as
--   (is_credit_memo OR total_amount < 0), so the rule is only newly applied to the export
--   set and to the SRS/QXO arm. We derive rather than mutate: the nightly vendor sync
--   would overwrite a flag written onto the mirror.
--
-- RULING 2 — "ABC, SRS, and QXO all have separate QB Bank Registers, which is why we have
-- vendor specific downloads, so there should never be a mixed vendor QB Bank Export."
--
--   This SUPERSEDES docs/81 decision 2 ("One weekly QB file ... single cross-vendor file")
--   and decision 14 ("Spreadsheets/CSVs are cross-vendor; only the request emails are
--   vendor-specific"). It restores the docs/63 contract, which invoice-payment.ts still
--   carries: "One file per vendor - a batch spanning N vendors produces N files."
--   Enforced in scripts/build-inv-processed-weekly.mjs, which now writes one file per
--   vendor_slug and refuses to emit a mixed file. The view keeps vendor_slug so the
--   split has a single source.
--
-- Additive + idempotent.

begin;

-- 280a — the export set excludes credits. Negative totals route to CM reconciliation.
CREATE OR REPLACE VIEW public.v_inv_processed_weekly AS
WITH state AS (
  SELECT i.invoice_number, vv.vendor_slug, i.invoice_date,
         count(l.line_id) FILTER (WHERE l.is_auditable IS NOT FALSE) AS auditable_lines,
         count(*) FILTER (WHERE l.is_auditable IS NOT FALSE AND coalesce(c.audit_status,'pending')='pending') AS pending_lines,
         count(*) FILTER (WHERE c.audit_status='disputed') AS disputed_lines,
         bool_or(coalesce(l.priced_by_expired_agreement,false)) AS any_expired_agreement
  FROM public.v_invoice_audit_invoice i
  JOIN public.v_invoice_audit_invoice_vendor vv ON vv.invoice_number = i.invoice_number
  LEFT JOIN public.mv_invoice_audit_line l ON l.invoice_number = i.invoice_number
  LEFT JOIN public.v_invoice_line_audit_current c ON c.invoice_line_id::text = l.line_id::text
  WHERE coalesce(i.is_credit_memo,false)=false
  GROUP BY 1,2,3
)
SELECT s.invoice_number, s.vendor_slug, s.invoice_date::date AS invoice_date,
       round(coalesce(a.ar_total_due, a.total_amount, v.total_due),2) AS total_due,
       coalesce(a.purchase_order_number, v.po_number, '') AS po_number,
       coalesce(nullif(a.raw ->> 'discountMessage',''),'') AS discount_message,
       coalesce(a.due_date::date, v.due_date::date) AS due_date,
       coalesce(nullif(a.raw ->> 'terms',''), v.terms, '') AS terms,
       round(coalesce(nullif(a.raw ->> 'discountAmount','')::numeric, 0),2) AS discount_amount,
       'Yes'::text AS approved_to_pay,
       CASE WHEN EXISTS (SELECT 1 FROM public.credit_memo_requests r
                         WHERE r.invoice_number=s.invoice_number AND r.vendor_slug=s.vendor_slug AND r.status<>'cancelled')
              THEN 'Credit memo requested'
            WHEN s.any_expired_agreement THEN 'Passed - expired agreement in force'
            ELSE 'Passed' END AS disposition,
       s.auditable_lines, s.disputed_lines
FROM state s
LEFT JOIN public.abc_invoices a ON a.invoice_number = s.invoice_number AND s.vendor_slug='abc-supply'
LEFT JOIN public.vendor_invoices v ON v.invoice_number = s.invoice_number AND s.vendor_slug <> 'abc-supply'
WHERE s.auditable_lines > 0 AND s.pending_lines = 0
  -- Ruling 1: a negative total is a credit memo, never a payable line.
  AND coalesce(a.ar_total_due, a.total_amount, v.total_due) > 0
  AND NOT EXISTS (SELECT 1 FROM public.invoice_register_export e WHERE e.invoice_number = s.invoice_number);

COMMENT ON VIEW public.v_inv_processed_weekly IS
  'The export set behind the weekly QB file (docs/81 Phase 6, migrations 278/280). One row per invoice that is fully dispositioned, carries a POSITIVE total, and has never been register-exported (load-once). Negative totals are credit memos and are excluded - see v_credit_memo_tbd. vendor_slug is present because the export is written ONE FILE PER VENDOR: ABC, SRS and QXO keep separate QB bank registers, so a mixed-vendor export is invalid (Chris 2026-08-25, superseding docs/81 decisions 2 and 14). Rendered by scripts/build-inv-processed-weekly.mjs.';

-- 280b — the CM TBD queue, cross-vendor. Every negative-total document, with its
-- original invoice where one can be identified and a TBD flag where it cannot.
CREATE OR REPLACE VIEW public.v_credit_memo_tbd AS
  -- ABC: reuse the existing 4-tier cascade (reference > po_item > po_only > shipto_item).
  SELECT m.invoice_number            AS cm_invoice_number,
         'abc-supply'::text          AS vendor_slug,
         m.cm_date                   AS cm_date,
         m.credit_amount,
         m.original_invoice_number,
         m.match_tier,
         m.match_confidence,
         (m.original_invoice_number IS NULL) AS is_tbd,
         m.office,
         m.po_number
  FROM public.v_credit_memo_match m
UNION ALL
  -- SRS / QXO: no cascade existed at all. Match on vendor + branch + PO to an earlier
  -- POSITIVE invoice; anything unmatched is TBD.
  SELECT vi.invoice_number,
         coalesce(ve.slug, 'unknown'),
         vi.invoice_date::date,
         abs(vi.total_due),
         orig.invoice_number,
         CASE WHEN orig.invoice_number IS NOT NULL THEN 'po_vendor_branch' ELSE 'none' END,
         CASE WHEN orig.invoice_number IS NOT NULL THEN 'probable' ELSE 'none' END,
         (orig.invoice_number IS NULL),
         (SELECT o.name FROM public.office o
           JOIN public.vendor_branches vb ON vb.pricing_territory_office_id = o.id
          WHERE vb.id = vi.vendor_branch_id LIMIT 1),
         nullif(btrim(vi.po_number), '')
  FROM public.vendor_invoices vi
  LEFT JOIN public.vendors ve ON ve.id = vi.vendor_id
  LEFT JOIN LATERAL (
      SELECT o.invoice_number FROM public.vendor_invoices o
       WHERE o.vendor_id = vi.vendor_id
         AND o.total_due > 0
         AND nullif(btrim(o.po_number),'') IS NOT NULL
         AND lower(btrim(o.po_number)) = lower(btrim(vi.po_number))
         AND o.invoice_date <= vi.invoice_date
       ORDER BY o.invoice_date DESC
       LIMIT 1) orig ON true
  WHERE vi.total_due < 0 OR vi.doc_type = 'credit';

COMMENT ON VIEW public.v_credit_memo_tbd IS
  'Cross-vendor credit-memo reconciliation queue (migration 280). Every negative-total document from either mirror, with the original invoice where one can be identified and is_tbd = true where it cannot - the CM TBD line. A negative total IS a credit memo regardless of the vendor flag: 5 documents carried a negative total without being flagged (4 ABC, 1 QXO) and leaked into the QB payables export before this. ABC reuses the v_credit_memo_match cascade; SRS/QXO previously had no cascade at all and now match on vendor + PO to an earlier positive invoice.';

commit;

-- Verification:
--   select vendor_slug, is_tbd, count(*), round(sum(credit_amount),2) from v_credit_memo_tbd group by 1,2 order by 1,2;
--   select vendor_slug, count(*), round(sum(total_due),2) from v_inv_processed_weekly group by 1;  -- no negatives
