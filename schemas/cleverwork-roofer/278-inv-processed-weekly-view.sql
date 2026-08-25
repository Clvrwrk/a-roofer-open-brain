-- 278 — v_inv_processed_weekly: the export set behind the Tuesday QB file.
--
-- Chris, 2026-08-25. Closes the docs/81 Phase 6 gap.
--
-- docs/81 decision 2 replaced the on-demand payment/register batch exports with ONE
-- weekly cross-vendor file, INV-PROCESSED-[date].csv, generated every Tuesday. The
-- routes for the old exports were deleted in docs/82 ("Routes deleted (12 + tests):
-- process-batch, register-batch, ..."), but the Tuesday producer that was meant to
-- replace them was never built - it is still listed as open Phase 6 work. Net effect:
-- nothing has been written to invoice_register_export since 2026-07-19.
--
-- This view is the set half of that producer. It is the single source of truth for
-- "which invoices belong in this week's QB file", so the renderer stays dumb.
--
-- MEMBERSHIP (the load-once contract, docs/63 Change 1b):
--   * not a credit memo - credits reconcile against their original, never export
--   * every auditable line dispositioned (pending_lines = 0)
--   * at least one auditable line
--   * NOT already in invoice_register_export (one load per invoice, ever)
--
-- Cross-vendor by construction (decision 14: spreadsheets/CSVs are cross-vendor;
-- only the credit-memo request emails are vendor-specific).
--
-- Approved to Pay is always Yes (decision 1: payment runs ahead of audit; all
-- do-not-pay holds are removed - the audit recovers credits behind payment).
--
-- Column contract is the locked docs/63 9-column QB header plus Disposition. It is
-- validated against accounting's live import - do not reorder or rename.

begin;

CREATE OR REPLACE VIEW public.v_inv_processed_weekly AS
WITH state AS (
  SELECT i.invoice_number,
         vv.vendor_slug,
         i.invoice_date,
         count(l.line_id) FILTER (WHERE l.is_auditable IS NOT FALSE) AS auditable_lines,
         count(*) FILTER (WHERE l.is_auditable IS NOT FALSE
                            AND coalesce(c.audit_status, 'pending') = 'pending') AS pending_lines,
         count(*) FILTER (WHERE c.audit_status = 'disputed') AS disputed_lines,
         bool_or(coalesce(l.priced_by_expired_agreement, false)) AS any_expired_agreement
  FROM public.v_invoice_audit_invoice i
  JOIN public.v_invoice_audit_invoice_vendor vv ON vv.invoice_number = i.invoice_number
  LEFT JOIN public.mv_invoice_audit_line l ON l.invoice_number = i.invoice_number
  LEFT JOIN public.v_invoice_line_audit_current c ON c.invoice_line_id::text = l.line_id::text
  WHERE coalesce(i.is_credit_memo, false) = false
  GROUP BY 1, 2, 3
)
SELECT s.invoice_number,
       s.vendor_slug,
       s.invoice_date::date                                            AS invoice_date,
       round(coalesce(a.ar_total_due, a.total_amount, v.total_due), 2)  AS total_due,
       coalesce(a.purchase_order_number, v.po_number, '')               AS po_number,
       coalesce(nullif(a.raw ->> 'discountMessage', ''), '')            AS discount_message,
       coalesce(a.due_date::date, v.due_date::date)                     AS due_date,
       coalesce(nullif(a.raw ->> 'terms', ''), v.terms, '')             AS terms,
       round(coalesce(nullif(a.raw ->> 'discountAmount', '')::numeric, 0), 2) AS discount_amount,
       'Yes'::text                                                      AS approved_to_pay,
       CASE
         WHEN EXISTS (SELECT 1 FROM public.credit_memo_requests r
                      WHERE r.invoice_number = s.invoice_number
                        AND r.vendor_slug = s.vendor_slug
                        AND r.status <> 'cancelled')          THEN 'Credit memo requested'
         WHEN s.any_expired_agreement                         THEN 'Passed - expired agreement in force'
         ELSE 'Passed'
       END                                                              AS disposition,
       s.auditable_lines,
       s.disputed_lines
FROM state s
LEFT JOIN public.abc_invoices a   ON a.invoice_number = s.invoice_number AND s.vendor_slug = 'abc-supply'
LEFT JOIN public.vendor_invoices v ON v.invoice_number = s.invoice_number AND s.vendor_slug <> 'abc-supply'
WHERE s.auditable_lines > 0
  AND s.pending_lines = 0
  AND NOT EXISTS (SELECT 1 FROM public.invoice_register_export e
                  WHERE e.invoice_number = s.invoice_number);

COMMENT ON VIEW public.v_inv_processed_weekly IS
  'The export set behind the Tuesday INV-PROCESSED-[date].csv QB file (docs/81 Phase 6, migration 278). Cross-vendor. One row per invoice that is fully dispositioned and has never been register-exported - the load-once contract. Columns mirror the locked docs/63 QB header plus Disposition; do not reorder. Rendered by scripts/build-inv-processed-weekly.mjs, which only stamps invoice_register_export when run with --stamp.';

commit;

-- Verification:
--   select vendor_slug, count(*), round(sum(total_due),2) from v_inv_processed_weekly group by 1;
