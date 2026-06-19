-- 123-abc-invoice-ar-status.sql
-- Additive, idempotent. Adds AR (accounts-receivable) status to abc_invoices.
--
-- WHY: The ABC Supply invoice API (raw payload = line items only) exposes NO
-- due date, NO date-paid, and NO open/closed status. The only source of that
-- truth is ABC's manually-downloaded open/closed invoice reports. These columns
-- hold the CSV-derived AR truth, keyed to the canonical invoice record.
--
-- date_paid policy (per Chris, 2026-06-19): closed invoices use the report's
-- DUE_DATE as the paid date (ABC's API has no real payment-clearing date — see
-- docs/47-external-abc-api-open-conversations.md). When DUE_DATE is blank
-- (credit memos, debit/finance-charge docs, "Due on Receipt"), date_paid falls
-- back to invoice_date and date_paid_is_proxy is set true.
--
-- NB: distinct from invoice_documents.payment_status / paid_at, which is the
-- manual per-PDF "Lucinda marks paid" gate. THIS is the bulk AR truth from ABC's
-- own report, covering every invoice the API returned (not just uploaded PDFs).
--
-- The sync writer (integrations/bridges/abc-supply/mirror-backfill.mjs,
-- invoiceDetailRow) does NOT set these columns, so a merge-upsert on
-- invoice_number leaves them intact across future syncs.

ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS ar_status text;            -- 'open' | 'paid'
ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS due_date date;             -- report DUE_DATE (nullable)
ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS date_paid date;            -- closed: DUE_DATE, else invoice_date
ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS date_paid_is_proxy boolean;-- true when date_paid fell back to invoice_date
ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS ar_total_due numeric;      -- report TOTAL_DUE (settled / open balance)
ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS ar_source text;            -- provenance, e.g. 'abc_csv_download'
ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS ar_synced_at timestamptz;  -- when AR fields were last set from a report

COMMENT ON COLUMN abc_invoices.ar_status IS 'CSV-derived AR status: open (unpaid) | paid (closed). NULL = no report coverage.';
COMMENT ON COLUMN abc_invoices.date_paid IS 'Closed-invoice paid date. Proxy = report DUE_DATE (ABC API has no real payment-clearing date); falls back to invoice_date when DUE_DATE blank (see date_paid_is_proxy).';
COMMENT ON COLUMN abc_invoices.date_paid_is_proxy IS 'TRUE when date_paid fell back to invoice_date because the report DUE_DATE was blank (credit memos, finance charges, Due-on-Receipt).';
