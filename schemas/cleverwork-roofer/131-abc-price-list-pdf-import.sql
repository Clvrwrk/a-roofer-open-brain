-- 131-abc-price-list-pdf-import.sql
-- Staging for the scanned ABC price PDFs from Justin (2026-06). NOT live — feeds the
-- price-list review phase (docs/50). PA 2036874-16 = new SKU-level negotiated agreement
-- (lower prices: Highlander 147.17->126.00/SQ); Wichita branch 113 = family-level list.
CREATE TABLE IF NOT EXISTS abc_price_list_pdf_import (
  source_doc text NOT NULL,
  page int,
  item_number text,
  item_description text,
  unit_price numeric,
  uom text,
  effective_date date,
  expiry_date date,
  loaded_at timestamptz DEFAULT now(),
  PRIMARY KEY (source_doc, item_description)
);
