-- 113-invoice-line-price-backfill.sql
-- Backfills abc_invoice_lines qty/uom/unit_price/extended_price from raw for rows the
-- ingestion mapper left null. Pairs with the invoiceLineRows() fix in
-- integrations/bridges/abc-supply/mirror-backfill.mjs — the invoice payload nests these
-- under shippedQty.value/.uom (or priceQty), pricePerUnitAmount, extendedPriceAmount, but
-- the mapper read flat keys (line.quantity / unitPrice / extendedPrice) that do not exist,
-- so the 2026-06-18 incremental batch (171 lines / 40 invoices) stored nulls while raw held
-- every value. Same class of bug as the order fix (schema 108).
-- Additive + idempotent: only fills NULLs from raw; safe to re-run.

UPDATE public.abc_invoice_lines SET
  quantity = coalesce(quantity, nullif(raw->'shippedQty'->>'value', '')::numeric, nullif(raw->'priceQty'->>'value', '')::numeric),
  uom = coalesce(uom, nullif(raw->'shippedQty'->>'uom', ''), nullif(raw->'priceQty'->>'uom', '')),
  unit_price = coalesce(unit_price, nullif(raw->>'pricePerUnitAmount', '')::numeric),
  extended_price = coalesce(extended_price, nullif(raw->>'extendedPriceAmount', '')::numeric)
WHERE (quantity IS NULL OR uom IS NULL OR unit_price IS NULL OR extended_price IS NULL)
  AND (raw ? 'shippedQty' OR raw ? 'priceQty' OR raw ? 'pricePerUnitAmount' OR raw ? 'extendedPriceAmount');
