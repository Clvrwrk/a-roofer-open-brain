-- 122-downstream-pricing-views-canonical-uom.sql
-- UOM normalization, part 4 of 4: repoint the remaining pricing views that read the
-- legacy/inconsistent invoice columns onto the canonical price_per_uom / price_qty.
--
--   v_recent_invoice_price   -> price_per_uom (was COALESCE(effective_unit_price, unit_price),
--                                both of which inherit the BD/SQ inconsistency). Feeds the
--                                agreement-builder prefill.
--   v_branch_item_spend      -> qty_36mo in the pricing UOM (was COALESCE(quantity, ...),
--                                which mixed BD and SQ for the same SKU). Feeds histAvg = spend/qty.
--   v_invoice_line_audit_eval-> price_per_uom + unit alignment (was l.unit_price =
--                                raw.pricePerUnitAmount, per-pack, vs agreement per-SQ). This
--                                view GATES auto-pass, so the old form auto-passed/failed wrongly.
--   v_abc_invoice_lines_with_pdf -> expose canonical columns for detail consumers.
--
-- Additive + idempotent (CREATE OR REPLACE VIEW; new columns appended at the end).

-- 60-day recent invoice price, canonical (price_per_uom, in price_uom)
CREATE OR REPLACE VIEW public.v_recent_invoice_price AS
SELECT DISTINCT ON (i.ship_to_number, l.item_number)
  i.ship_to_number,
  l.item_number,
  l.price_per_uom AS unit_price,
  i.invoice_date::date AS invoice_date,
  l.price_uom
FROM public.abc_invoice_lines l
JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
WHERE i.invoice_date >= (CURRENT_DATE - 60)
  AND l.price_per_uom IS NOT NULL
ORDER BY i.ship_to_number, l.item_number, i.invoice_date DESC;

-- 36-month branch spend; qty consistently in the pricing UOM
CREATE OR REPLACE VIEW public.v_branch_item_spend AS
SELECT
  COALESCE(NULLIF(ltrim((i.raw -> 'branch') ->> 'number', '0'), ''), (i.raw -> 'branch') ->> 'number') AS branch_number,
  l.item_number,
  sum(l.price_qty) AS qty_36mo,
  round(sum(COALESCE(l.extended_price, NULLIF(l.raw ->> 'extendedPriceAmount', '')::numeric)), 2) AS spend_36mo,
  count(*) AS line_count,
  max(i.invoice_date) AS last_purchased_at,
  mode() WITHIN GROUP (ORDER BY l.price_uom) AS price_uom
FROM public.abc_invoice_lines l
JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
WHERE i.invoice_date >= (CURRENT_DATE - '3 years'::interval)
  AND NULLIF((i.raw -> 'branch') ->> 'number', '') IS NOT NULL
  AND l.item_number IS NOT NULL
GROUP BY 1, l.item_number;

-- Auto-pass evaluation; canonical price + unit alignment (within the agreement date window)
CREATE OR REPLACE VIEW public.v_invoice_line_audit_eval AS
WITH m AS (
  SELECT DISTINCT ON (l.id)
    l.id AS invoice_line_id,
    l.invoice_number,
    l.item_number,
    i.invoice_date,
    l.price_per_uom AS unit_price,
    l.price_uom,
    pa.id AS agreement_id,
    pa.effective_date,
    pa.expiry_date,
    pli.unit_price AS negotiated_price,
    pli.unit AS negotiated_uom,
    (CURRENT_DATE >= pa.effective_date AND (pa.expiry_date IS NULL OR CURRENT_DATE <= pa.expiry_date)) AS agreement_current
  FROM public.abc_invoice_lines l
  JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
  JOIN public.abc_price_agreement_branch_matches bm ON bm.ship_to_number = i.ship_to_number
  JOIN public.abc_price_agreements pa ON pa.id = bm.abc_price_agreement_id
  JOIN public.abc_price_list_items pli ON pli.agreement_id = pa.id AND pli.item_number = l.item_number
  WHERE i.invoice_date >= pa.effective_date AND (pa.expiry_date IS NULL OR i.invoice_date <= pa.expiry_date)
  ORDER BY l.id, bm.confidence_score DESC NULLS LAST, pli.unit_price
)
SELECT
  invoice_line_id,
  invoice_number,
  item_number,
  invoice_date,
  unit_price,
  agreement_id,
  effective_date,
  expiry_date,
  negotiated_price,
  agreement_current,
  round(abs(unit_price - negotiated_price), 2) AS price_diff,
  -- only a match when the units line up AND the price matches
  (negotiated_uom IS NOT DISTINCT FROM price_uom AND round(unit_price, 2) = round(negotiated_price, 2)) AS price_matches,
  price_uom,
  negotiated_uom
FROM m;

-- Invoice-line + PDF passthrough, now also exposing the canonical columns
CREATE OR REPLACE VIEW public.v_abc_invoice_lines_with_pdf AS
SELECT
  t.id,
  t.invoice_number,
  t.line_key,
  t.line_number,
  t.item_number,
  t.item_description,
  t.quantity,
  t.uom,
  t.unit_price,
  t.extended_price,
  t.raw,
  t.created_at,
  t.updated_at,
  t.effective_unit_price,
  d.storage_bucket,
  d.storage_path,
  d.original_filename,
  d.customer_number AS pdf_customer_number,
  t.ship_uom,
  t.ship_qty,
  t.price_uom,
  t.price_qty,
  t.price_per_uom
FROM public.abc_invoice_lines t
LEFT JOIN public.invoice_documents d ON d.invoice_number = t.invoice_number;
