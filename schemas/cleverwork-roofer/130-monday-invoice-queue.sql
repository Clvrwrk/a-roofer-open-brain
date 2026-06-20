-- 130-monday-invoice-queue.sql
-- Staging for "Invoices to process on monday" (Lucinda's alpha-launch queue, 27 invoices).
-- Used to validate the per-office invoice filter method (due-date based) before go-live.
-- Additive; pdf_* columns are the values parsed from the PDF (DB is source of truth).
CREATE TABLE IF NOT EXISTS monday_invoice_queue (
  invoice_number text PRIMARY KEY,
  doc_type text,
  pdf_due_date date,
  pdf_amount numeric,
  source text DEFAULT 'lucinda_monday_pdf',
  loaded_at timestamptz DEFAULT now()
);
