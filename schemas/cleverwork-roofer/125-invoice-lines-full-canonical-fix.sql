-- 125-invoice-lines-full-canonical-fix.sql
-- Additive, idempotent. Completes mig 124 so abc_invoice_lines_full is a true drop-in
-- for abc_invoice_lines across every audit view (Phase 2 prep).
--
-- Adds price_conversion_factor (the column v_item_uom_map reads). The data load also
-- sets unit_price to the ABC pricePerUnitAmount convention (= price_per_uom ×
-- price_conversion_factor, validated against 1440/1490 overlapping API lines) and reshapes
-- raw to mirror the ABC API line JSON (priceQty/shippedQty/extendedPriceAmount/
-- pricePerUnitAmount) so views that read l.raw->>'extendedPriceAmount' work unchanged.

ALTER TABLE public.abc_invoice_lines_full ADD COLUMN IF NOT EXISTS price_conversion_factor numeric;

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
       f.ship_uom, f.ship_qty, f.price_uom, f.price_qty, f.price_conversion_factor, f.price_per_uom,
       f.raw, f.line_source
FROM public.abc_invoice_lines_full f;

COMMENT ON VIEW public.v_invoice_lines_complete IS
  'Canonical complete invoice-line source: API lines for un-truncated invoices + full CSV lines (abc_invoice_lines_full) for invoices flagged lines_truncated_by_api. Drop-in shape for abc_invoice_lines. Audit views read this so every line is interrogated despite the ABC API 10-line cap (docs/47 #2, docs/48).';
