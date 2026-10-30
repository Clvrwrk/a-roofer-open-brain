-- 228: v_qb_export_pending — per-vendor count of QB bank-ledger rows not yet
-- handed to QuickBooks (PEC-198 KPI pill 6 "QB Export Pending").
--
-- Mirrors the row universe of /api/accounting/qb-bank-csv (PEC-192):
--   invoice / cm_actual from the vendor ledgers since the export epoch
--   (2026-08-01 — the endpoint's default `since`), plus one cm_tbd row per SENT
--   credit-memo request. A row is pending until qb_bank_export_log carries its
--   (vendor_slug, row_kind, doc_number) — the same dedup key mode=export stamps.
--
-- Additive + idempotent (CREATE OR REPLACE VIEW). Read-only; QBO untouched (rule 13).

CREATE OR REPLACE VIEW public.v_qb_export_pending AS
WITH rows_universe AS (
  -- ABC ledger
  SELECT 'abc-supply'::text AS vendor_slug,
         CASE WHEN i.is_credit_memo THEN 'cm_actual' ELSE 'invoice' END AS row_kind,
         i.invoice_number::text AS doc_number
  FROM public.abc_invoices i
  WHERE i.invoice_date >= DATE '2026-08-01'
  UNION ALL
  -- Generic vendor ledgers (SRS, QXO, …)
  SELECT ven.slug,
         CASE WHEN vi.doc_type = 'credit' THEN 'cm_actual' ELSE 'invoice' END,
         vi.invoice_number::text
  FROM public.vendor_invoices vi
  JOIN public.vendors ven ON ven.id = vi.vendor_id
  WHERE vi.invoice_date >= DATE '2026-08-01' AND ven.slug <> 'abc-supply'
  UNION ALL
  -- Pending-credit QA lines: one per sent request
  SELECT r.vendor_slug, 'cm_tbd', r.invoice_number::text
  FROM public.credit_memo_requests r
  WHERE r.request_kind = 'requested' AND r.status = 'sent'
)
SELECT u.vendor_slug, count(*)::integer AS pending_rows
FROM rows_universe u
WHERE NOT EXISTS (
  SELECT 1 FROM public.qb_bank_export_log l
  WHERE l.vendor_slug = u.vendor_slug AND l.row_kind = u.row_kind AND l.doc_number = u.doc_number
)
GROUP BY u.vendor_slug;
