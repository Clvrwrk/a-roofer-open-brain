-- 118-branch-item-spend-view.sql
-- Per-branch purchase volume + spend per item over the trailing 36 months, keyed by the
-- REAL selling branch ABC stamps on each invoice (abc_invoices.raw->'branch'), normalized
-- with the same ltrim('0') rule used by the invoice/PA audits. This is the per-branch
-- volume basis the Agreement Builder needs to roll up negotiated cost (Σ set-price × qty)
-- and savings vs. historical spend at each branch. Additive, read-only.

CREATE OR REPLACE VIEW public.v_branch_item_spend AS
SELECT
  COALESCE(NULLIF(ltrim(i.raw->'branch'->>'number', '0'), ''), i.raw->'branch'->>'number') AS branch_number,
  l.item_number,
  sum(COALESCE(l.quantity::numeric, nullif(l.raw->'shippedQty'->>'value', '')::numeric, nullif(l.raw->'priceQty'->>'value', '')::numeric)) AS qty_36mo,
  round(sum(COALESCE(l.extended_price::numeric, nullif(l.raw->>'extendedPriceAmount', '')::numeric)), 2) AS spend_36mo,
  count(*) AS line_count,
  max(i.invoice_date) AS last_purchased_at
FROM public.abc_invoice_lines l
JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
WHERE i.invoice_date >= (CURRENT_DATE - INTERVAL '36 months')
  AND nullif(i.raw->'branch'->>'number', '') IS NOT NULL
  AND l.item_number IS NOT NULL
GROUP BY 1, 2;
