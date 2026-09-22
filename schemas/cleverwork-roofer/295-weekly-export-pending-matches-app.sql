-- 295 — v_inv_processed_weekly: "pending" means what the app means (docs/81 v2, Chris 2026-08-05).
--
-- Found 2026-09-22 while adding the September SRS invoices: they showed "Approved" on the
-- Invoice Audit surface (0 pending lines) yet never entered the Tuesday QB file. The view
-- (mig 278) counted EVERY undecided auditable line as pending, but the app's rule — set by
-- Chris's 2026-08-05 QA and coded in buildLineProgressByInvoice / the detail loader — is
-- that only a VISIBLE discrepancy line needs a decision:
--
--   pending = auditable AND no passed/disputed decision AND
--             (uom_mismatch OR negotiated_price IS NULL OR (quantity > 0 AND unit_price > negotiated_price))
--
-- A line priced at or under its agreement is valid as billed and is hidden from the audit;
-- nobody ever decides it, so under the old view the invoice was blocked from export forever.
-- Measured on prod 2026-09-22: 85 invoices "Approved" in the app but absent from the
-- export set — 53 ABC ($294,265, 44 of them already paid per the ABC AR report) and
-- 32 SRS ($164,689, none paid) — every SRS invoice with a within-agreement line since July.
--
-- Fix: the view uses the app's discrepancy rule, and (295b) the app's NOT-paid rule plus a
-- payment-ledger guard. Still not a credit memo, still ≥ 1 auditable line, still load-once
-- through invoice_register_export, same column contract. Additive + idempotent (CREATE OR REPLACE). Rollback: re-run mig 280's
-- definition.

CREATE OR REPLACE VIEW public.v_inv_processed_weekly AS
 WITH state AS (
         SELECT i.invoice_number,
            vv.vendor_slug,
            i.invoice_date,
            count(l.line_id) FILTER (WHERE l.is_auditable IS NOT FALSE) AS auditable_lines,
            -- mig 295: the app's rule — undecided AND a visible discrepancy
            count(*) FILTER (
              WHERE l.is_auditable IS NOT FALSE
                AND COALESCE(c.audit_status, 'pending'::text) NOT IN ('passed'::text, 'disputed'::text)
                AND (COALESCE(l.uom_mismatch, false)
                     OR l.negotiated_price IS NULL
                     OR (COALESCE(l.quantity, 0::numeric) > 0::numeric AND l.unit_price > l.negotiated_price))
            ) AS pending_lines,
            count(*) FILTER (WHERE c.audit_status = 'disputed'::text) AS disputed_lines,
            bool_or(COALESCE(l.priced_by_expired_agreement, false)) AS any_expired_agreement
           FROM v_invoice_audit_invoice i
             JOIN v_invoice_audit_invoice_vendor vv ON vv.invoice_number = i.invoice_number
             LEFT JOIN mv_invoice_audit_line l ON l.invoice_number = i.invoice_number
             LEFT JOIN v_invoice_line_audit_current c ON c.invoice_line_id::text = l.line_id::text
          WHERE COALESCE(i.is_credit_memo, false) = false
          GROUP BY i.invoice_number, vv.vendor_slug, i.invoice_date
        )
 SELECT s.invoice_number,
    s.vendor_slug,
    s.invoice_date::date AS invoice_date,
    round(COALESCE(a.ar_total_due, a.total_amount, v.total_due), 2) AS total_due,
    COALESCE(a.purchase_order_number, v.po_number, ''::text) AS po_number,
    COALESCE(NULLIF(a.raw ->> 'discountMessage'::text, ''::text), ''::text) AS discount_message,
    COALESCE(a.due_date, v.due_date) AS due_date,
    COALESCE(NULLIF(a.raw ->> 'terms'::text, ''::text), v.terms, ''::text) AS terms,
    round(COALESCE(NULLIF(a.raw ->> 'discountAmount'::text, ''::text)::numeric, 0::numeric), 2) AS discount_amount,
    'Yes'::text AS approved_to_pay,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM credit_memo_requests r
              WHERE r.invoice_number = s.invoice_number AND r.vendor_slug = s.vendor_slug AND r.status <> 'cancelled'::text)) THEN 'Credit memo requested'::text
            WHEN s.any_expired_agreement THEN 'Passed - expired agreement in force'::text
            ELSE 'Passed'::text
        END AS disposition,
    s.auditable_lines,
    s.disputed_lines
   FROM state s
     LEFT JOIN abc_invoices a ON a.invoice_number = s.invoice_number AND s.vendor_slug = 'abc-supply'::text
     LEFT JOIN vendor_invoices v ON v.invoice_number = s.invoice_number AND s.vendor_slug <> 'abc-supply'::text
  WHERE s.auditable_lines > 0 AND s.pending_lines = 0 AND COALESCE(a.ar_total_due, a.total_amount, v.total_due) > 0::numeric
    -- 295b: the app's register rule also says NOT paid (isInvoiceRegisterExportable). Once the
    -- pending rule was corrected, 46 ABC invoices the ABC AR report already shows PAID ($265K,
    -- hand-keyed into QBO long ago) and 15 already in the payment ledger fell into the set.
    -- A bill that is paid, or already went out for payment, is already in QuickBooks.
    AND COALESCE(a.ar_status, v.ar_status, '') NOT IN ('paid', 'closed')
    AND NOT (EXISTS ( SELECT 1
           FROM invoice_payment_processed p
          WHERE p.invoice_number = s.invoice_number AND p.vendor_slug = s.vendor_slug
            AND p.status IN ('exported', 'paid', 'paid_pending_verification', 'paid_verified')))
    AND NOT (EXISTS ( SELECT 1
           FROM invoice_register_export e
          WHERE e.invoice_number = s.invoice_number));

COMMENT ON VIEW public.v_inv_processed_weekly IS
  'The Tuesday QB export set (docs/81 Phase 6, migs 278/280/295): non-credit invoices with ≥ 1 auditable line, no VISIBLE discrepancy line left undecided (the app''s rule), not paid per the vendor AR report, not already in the payment ledger, a positive balance, and no invoice_register_export row yet. One file per vendor (Chris 2026-08-25).';
