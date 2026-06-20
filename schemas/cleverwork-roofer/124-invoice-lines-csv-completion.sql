-- 124-invoice-lines-csv-completion.sql
-- Additive, idempotent. Phase 1 of closing the ABC API 10-line truncation gap
-- (docs/47 item #2, docs/48) using the full-line detail from the ABC open/closed
-- report CSV download (verified complete — see abc-invoice-line-truncation-bug-report.md).
--
-- The ABC invoice API caps GET /invoices/id/{id} at 10 line items. 152 invoices in
-- abc_invoices are maxed at 10 and are missing line detail. The downloaded report CSV
-- carries every line (e.g. 26 lines summing exactly to the subtotal), so we land the
-- complete lines here WITHOUT touching abc_invoice_lines — the ~8 live audit views read
-- that table directly and would double-count if we appended rows there. Phase 2
-- (separate) repoints those views/libs at v_invoice_lines_complete.
--
-- NB: this DELETES nothing. The partial API lines stay in abc_invoice_lines untouched
-- (rule 1). v_invoice_lines_complete substitutes the full CSV set ONLY for invoices
-- flagged lines_truncated_by_api.

-- Truncation flags on the canonical invoice record
ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS lines_truncated_by_api boolean;
ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS api_line_count int;
ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS full_line_count int;
ALTER TABLE abc_invoices ADD COLUMN IF NOT EXISTS lines_complete_source text; -- 'abc_api' | 'abc_csv'

COMMENT ON COLUMN abc_invoices.lines_truncated_by_api IS 'TRUE when the ABC API returned a capped (10) line set for this invoice and the complete set lives in abc_invoice_lines_full.';

-- Full, untruncated line detail sourced from the ABC report CSV. Mirrors the shape of
-- abc_invoice_lines (incl. canonical pricing-UOM columns, migs 119-122) so it UNIONs cleanly.
CREATE TABLE IF NOT EXISTS abc_invoice_lines_full (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  line_seq int NOT NULL,
  line_key text,
  line_number text,
  item_number text,
  item_description text,
  quantity numeric,        -- ship qty
  uom text,                -- ship uom
  unit_price numeric,
  extended_price numeric,  -- CSV NET_AMOUNT (sums to invoice subtotal)
  ship_uom text,
  ship_qty numeric,
  price_uom text,          -- canonical pricing UOM (CSV CONV_UOM)
  price_qty numeric,       -- canonical pricing qty (CSV CONV_QTY)
  price_per_uom numeric,   -- canonical: extended_price / price_qty
  raw jsonb,
  line_source text NOT NULL DEFAULT 'abc_csv',
  source_file text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (invoice_number, line_seq)
);

-- Canonical complete-line source: API lines for un-truncated invoices, full CSV lines
-- for truncated ones. No double counting. Phase 2 repoints audit views here.
CREATE OR REPLACE VIEW public.v_invoice_lines_complete AS
SELECT l.id, l.invoice_number, l.line_key, l.line_number, l.item_number, l.item_description,
       l.quantity, l.uom, l.unit_price, l.extended_price, l.effective_unit_price,
       l.ship_uom, l.ship_qty, l.price_uom, l.price_qty, l.price_conversion_factor, l.price_per_uom,
       l.raw, 'abc_api'::text AS line_source
FROM public.abc_invoice_lines l
JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
WHERE NOT COALESCE(i.lines_truncated_by_api, false)
UNION ALL
SELECT f.id, f.invoice_number, f.line_key, f.line_number, f.item_number, f.item_description,
       f.quantity, f.uom, f.unit_price, f.extended_price, NULL::numeric AS effective_unit_price,
       f.ship_uom, f.ship_qty, f.price_uom, f.price_qty, NULL::numeric AS price_conversion_factor, f.price_per_uom,
       f.raw, f.line_source
FROM public.abc_invoice_lines_full f;
