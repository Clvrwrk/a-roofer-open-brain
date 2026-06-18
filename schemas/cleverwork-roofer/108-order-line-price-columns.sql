-- 108-order-line-price-columns.sql
-- Adds the priced order-line columns that the get-orders payload provides
-- (https://apidocs.abcsupply.com/get-orders/) and backfills existing rows from raw.
-- Additive + idempotent. Pairs with the orderLineRows() sync fix in
-- integrations/bridges/abc-supply/mirror-backfill.mjs (was mapping the wrong keys:
-- line.quantity/uom, which don't exist; correct paths are orderedQty.value/uom,
-- unitPrice.value, amount).

ALTER TABLE public.abc_order_lines ADD COLUMN IF NOT EXISTS unit_price numeric;
ALTER TABLE public.abc_order_lines ADD COLUMN IF NOT EXISTS extended_price numeric;

-- Backfill existing rows from raw (safe to re-run).
UPDATE public.abc_order_lines SET
  quantity = nullif(raw->'orderedQty'->>'value', '')::numeric,
  uom = coalesce(nullif(raw->'orderedQty'->>'uom', ''), nullif(raw->'orderedQty'->>'uomCode', ''), uom),
  unit_price = nullif(raw->'unitPrice'->>'value', '')::numeric,
  extended_price = nullif(raw->>'amount', '')::numeric
WHERE raw ? 'orderedQty' OR raw ? 'unitPrice' OR raw ? 'amount';
