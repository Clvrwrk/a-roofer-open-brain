-- 119-canonical-uom-columns.sql
-- UOM normalization, part 1 of 4: a single canonical source of truth for invoice
-- line pricing, derived straight from the ABC `raw` JSON payload.
--
-- WHY (the bug this kills):
--   abc_invoice_lines.quantity / .uom / .effective_unit_price were populated from an
--   INCONSISTENT source. For most lines the ingest used ABC's PRICING quantity
--   (raw.priceQty, e.g. SQ); for ~8.5% it used the SHIPPED quantity (raw.shippedQty,
--   e.g. BD). So the SAME shingle SKU stored a unit price of ~$46.50 (per bundle) on
--   some invoices and ~$132 (per square) on others, while price agreements are ALWAYS
--   quoted in the pricing UOM. Any line not in the pricing UOM compared apples-to-oranges.
--   (effective_unit_price is a STORED generated column = extended_price / quantity, so it
--   inherited the inconsistency.)
--
-- THE FIX:
--   ABC supplies, on 100% of invoice lines, raw.extendedPriceAmount + raw.priceQty.value
--   + raw.priceQty.uom + raw.priceQty.priceConversionFactor. The canonical, always-correct
--   per-unit price is  extendedPriceAmount / priceQty.value, expressed in priceQty.uom —
--   which is the unit the agreement is quoted in. We expose these as generated columns
--   derived from `raw`, so they are immune to however any ingest writer fills the legacy
--   quantity/uom columns, and they self-backfill for all historical rows.
--
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE VIEW). No drops.

-- Stocking (shipped) unit + quantity -- what was physically delivered (e.g. BD bundles)
ALTER TABLE public.abc_invoice_lines
  ADD COLUMN IF NOT EXISTS ship_uom text
    GENERATED ALWAYS AS (NULLIF(raw->'shippedQty'->>'uom','')) STORED;
ALTER TABLE public.abc_invoice_lines
  ADD COLUMN IF NOT EXISTS ship_qty numeric
    GENERATED ALWAYS AS (NULLIF(raw->'shippedQty'->>'value','')::numeric) STORED;

-- Pricing unit + quantity -- the UOM ABC prices in and that agreements are quoted in (e.g. SQ)
ALTER TABLE public.abc_invoice_lines
  ADD COLUMN IF NOT EXISTS price_uom text
    GENERATED ALWAYS AS (NULLIF(raw->'priceQty'->>'uom','')) STORED;
ALTER TABLE public.abc_invoice_lines
  ADD COLUMN IF NOT EXISTS price_qty numeric
    GENERATED ALWAYS AS (NULLIF(raw->'priceQty'->>'value','')::numeric) STORED;

-- Shipped units per priced unit (e.g. 3 BD per SQ). ABC ships it on every line.
ALTER TABLE public.abc_invoice_lines
  ADD COLUMN IF NOT EXISTS price_conversion_factor numeric
    GENERATED ALWAYS AS (NULLIF(raw->'priceQty'->>'priceConversionFactor','')::numeric) STORED;

-- THE canonical effective price, always in price_uom = extendedPriceAmount / priceQty.value.
-- Directly comparable to abc_price_list_items.unit_price (also in the pricing UOM).
ALTER TABLE public.abc_invoice_lines
  ADD COLUMN IF NOT EXISTS price_per_uom numeric
    GENERATED ALWAYS AS (
      NULLIF(raw->>'extendedPriceAmount','')::numeric
      / NULLIF(NULLIF(raw->'priceQty'->>'value','')::numeric, 0)
    ) STORED;

COMMENT ON COLUMN public.abc_invoice_lines.price_per_uom IS
  'Canonical effective unit price in price_uom (extendedPriceAmount / priceQty.value). Compare directly to abc_price_list_items.unit_price. Source of truth for all pricing dashboards.';

-- Authoritative per-item UOM identity, learned from the invoice feed (100% coverage).
-- This is how every dashboard answers "what UOM is this item priced in, and what is the
-- shipped<->priced conversion?" so observed prices can be aligned to the agreement unit.
CREATE OR REPLACE VIEW public.v_item_uom_map AS
SELECT
  item_number,
  mode() WITHIN GROUP (ORDER BY ship_uom)                AS ship_uom,
  mode() WITHIN GROUP (ORDER BY price_uom)               AS price_uom,
  mode() WITHIN GROUP (ORDER BY price_conversion_factor) AS units_per_price_uom,
  count(*)                                               AS line_count
FROM public.abc_invoice_lines
WHERE price_uom IS NOT NULL
GROUP BY item_number;

COMMENT ON VIEW public.v_item_uom_map IS
  'Per-item canonical UOM map from the ABC invoice feed: ship_uom (stocking unit), price_uom (pricing/agreement unit), units_per_price_uom (shipped units per priced unit, e.g. 3 BD/SQ). Used to align order/invoice prices to the agreement UOM.';
