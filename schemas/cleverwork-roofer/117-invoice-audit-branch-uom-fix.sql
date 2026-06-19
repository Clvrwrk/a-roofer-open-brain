-- 117-invoice-audit-branch-uom-fix.sql
-- Two corrections to the Invoice Audit views (additive + idempotent, CREATE OR REPLACE).
--
-- FIX 1 — Branch / office assignment (was wrong for EVERY invoice).
--   v_invoice_audit_invoice derived the branch from ship_to_number → the highest-
--   confidence price-agreement branch match. That always collapsed to a SINGLE branch
--   (e.g. "152 Edmond, OK") and ignored the branch ABC actually stamps on each invoice.
--   The ship_to address is just the Pro Exteriors HQ (Richardson, TX), so it carries no
--   geography. The real selling branch lives in abc_invoices.raw->'branch'
--   (e.g. {"number":"481","name":"481 Aurora, CO","state":"CO"}). We now key branch +
--   office off raw->'branch', matched to vendor_branches by zero-stripped branch number
--   (raw "11" == stored "011"). The ship_to→price-agreement match is still used ONLY for
--   negotiated pricing (price agreements are per account, independent of selling branch).
--
-- FIX 2 — UOM normalization of the negotiated price (variance sign was inverted).
--   Migration 99 fixed the INVOICE side (effective price = extended/qty) but the
--   NEGOTIATED side (abc_price_list_items.unit_price) is quoted in ABC's priced UOM,
--   which can differ from the line's ordered UOM. Shingles (e.g. 02TKTXTRB, "3 BD/SQ")
--   are ordered in BD but the agreement price is per SQ. Comparing $54.46/BD against
--   $134.90/SQ produced -59.6% (looked like a saving) when the true, normalized variance
--   is +21% (an overcharge). ABC gives the factor on every line:
--   raw->'priceQty'->>'priceConversionFactor' (ordered units per priced unit). When the
--   line's ordered UOM differs from raw->'priceQty'->>'uom', divide the negotiated price
--   by that factor so both sides are per ordered-UOM ($134.90/SQ ÷ 3 = $44.97/BD).

CREATE OR REPLACE VIEW public.v_invoice_audit_line AS
WITH neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number, pli.item_number, pli.unit_price AS negotiated_price
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price ASC
),
base AS (
  SELECT
    l.id AS line_id,
    l.invoice_number,
    l.item_number,
    l.item_description,
    i.ship_to_number,
    COALESCE(l.quantity::numeric, nullif(l.raw->'shippedQty'->>'value', '')::numeric, nullif(l.raw->'priceQty'->>'value', '')::numeric) AS qty,
    COALESCE(l.uom, nullif(l.raw->'shippedQty'->>'uom', ''), nullif(l.raw->'priceQty'->>'uom', '')) AS uom,
    COALESCE(l.extended_price::numeric, nullif(l.raw->>'extendedPriceAmount', '')::numeric) AS ext,
    -- FIX 2: ordered-units-per-priced-unit, applied only when the ordered UOM differs
    -- from ABC's priced UOM. 1 (no-op) for the vast majority of lines.
    CASE
      WHEN nullif(l.raw->'priceQty'->>'uom', '') IS NOT NULL
       AND COALESCE(l.uom, nullif(l.raw->'shippedQty'->>'uom', ''), nullif(l.raw->'priceQty'->>'uom', ''))
           IS DISTINCT FROM nullif(l.raw->'priceQty'->>'uom', '')
      THEN coalesce(nullif((l.raw->'priceQty'->>'priceConversionFactor')::numeric, 0), 1)
      ELSE 1
    END AS neg_factor
  FROM public.abc_invoice_lines l
  JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
),
priced AS (
  SELECT b.*, (n.negotiated_price / b.neg_factor)::numeric AS neg_price
  FROM base b
  LEFT JOIN neg n ON n.ship_to_number = b.ship_to_number AND n.item_number = b.item_number
)
SELECT
  b.line_id,
  b.invoice_number,
  b.item_number,
  b.item_description,
  b.qty AS quantity,
  b.uom,
  CASE WHEN b.qty IS NOT NULL AND b.qty <> 0 THEN round((b.ext / b.qty)::numeric, 4) END AS unit_price,
  b.ext AS extended_price,
  round(b.neg_price, 4) AS negotiated_price,
  CASE WHEN b.neg_price IS NOT NULL AND b.neg_price <> 0 AND b.qty IS NOT NULL AND b.qty <> 0
       THEN round((((b.ext / b.qty) - b.neg_price) / b.neg_price * 100)::numeric, 2) END AS variance_pct,
  CASE WHEN b.neg_price IS NOT NULL AND b.qty IS NOT NULL AND b.qty <> 0
       THEN round((((b.ext / b.qty) - b.neg_price) * b.qty)::numeric, 2) END AS variance_ext,
  -- appended last so CREATE OR REPLACE stays additive
  (b.qty IS NOT NULL AND b.qty <> 0 AND b.ext IS NOT NULL) AS is_auditable,
  coalesce(o.category_key, public.classify_roof_system(b.item_description, b.item_number)) AS category_key
FROM priced b
LEFT JOIN public.item_roof_system_category o ON o.item_number = b.item_number;

CREATE OR REPLACE VIEW public.v_invoice_audit_invoice AS
WITH neg AS (
  SELECT DISTINCT ON (m.ship_to_number, pli.item_number)
    m.ship_to_number, pli.item_number, pli.unit_price AS negotiated_price
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_list_items pli ON pli.agreement_id = m.abc_price_agreement_id
  ORDER BY m.ship_to_number, pli.item_number, m.confidence_score DESC NULLS LAST, pli.unit_price ASC
),
priced AS (
  SELECT
    l.invoice_number,
    l.id AS line_id,
    COALESCE(l.quantity::numeric, nullif(l.raw->'shippedQty'->>'value', '')::numeric, nullif(l.raw->'priceQty'->>'value', '')::numeric) AS qty,
    COALESCE(l.extended_price::numeric, nullif(l.raw->>'extendedPriceAmount', '')::numeric) AS ext,
    -- FIX 2: negotiated price normalized into the line's ordered UOM.
    n.negotiated_price / CASE
      WHEN nullif(l.raw->'priceQty'->>'uom', '') IS NOT NULL
       AND COALESCE(l.uom, nullif(l.raw->'shippedQty'->>'uom', ''), nullif(l.raw->'priceQty'->>'uom', ''))
           IS DISTINCT FROM nullif(l.raw->'priceQty'->>'uom', '')
      THEN coalesce(nullif((l.raw->'priceQty'->>'priceConversionFactor')::numeric, 0), 1)
      ELSE 1
    END AS negotiated_price,
    cur.audit_status,
    cur.decision
  FROM public.abc_invoice_lines l
  JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
  LEFT JOIN neg n ON n.ship_to_number = i.ship_to_number AND n.item_number = l.item_number
  LEFT JOIN public.v_invoice_line_audit_current cur ON cur.invoice_line_id = l.id
),
roll AS (
  SELECT
    invoice_number,
    count(*) AS line_count,
    count(*) FILTER (WHERE negotiated_price IS NULL) AS no_price_lines,
    count(*) FILTER (WHERE negotiated_price IS NOT NULL AND negotiated_price <> 0 AND qty IS NOT NULL AND qty <> 0
                       AND abs(((ext / qty) - negotiated_price) / negotiated_price * 100) >= 0.01) AS flagged_lines,
    coalesce(sum(CASE WHEN negotiated_price IS NOT NULL AND qty > 0 AND (ext / qty) > negotiated_price
                       AND coalesce(audit_status, '') <> 'passed'
                      THEN ((ext / qty) - negotiated_price) * qty ELSE 0 END), 0) AS at_risk,
    coalesce(sum(CASE WHEN negotiated_price IS NOT NULL AND qty > 0 AND (ext / qty) > negotiated_price
                       AND audit_status = 'passed' AND decision IN ('credit-flag', 'credit-noflag')
                      THEN ((ext / qty) - negotiated_price) * qty ELSE 0 END), 0) AS credit_memo_amount,
    coalesce(max(CASE WHEN negotiated_price IS NOT NULL AND negotiated_price <> 0 AND qty IS NOT NULL AND qty <> 0
                      THEN abs(((ext / qty) - negotiated_price) / negotiated_price * 100) ELSE 0 END), 0) AS worst_pct
  FROM priced
  GROUP BY invoice_number
)
SELECT
  i.invoice_number, i.ship_to_number, i.invoice_date, i.order_date,
  i.total_amount::numeric AS total_amount, i.is_credit_memo, i.sales_type,
  i.purchase_order_number, i.order_name,
  -- FIX 1: branch identity from the invoice's own selling branch (raw->'branch').
  rb.no AS branch_number,
  coalesce(nullif(avb.branch_name, ''), nullif(vb.branch_name, ''), rb.nm, 'Branch ' || coalesce(rb.no, i.ship_to_number)) AS branch_name,
  coalesce(
    (SELECT o.name FROM public.office o WHERE o.id = vb.pricing_territory_office_id),
    nullif(trim(coalesce(rb.city, avb.city, '') || ', ' || coalesce(rb.state, avb.state, '')), ',') || ' area',
    'Unassigned'
  ) AS office,
  coalesce(rb.city, avb.city, '') AS branch_city,
  coalesce(rb.state, avb.state, '') AS branch_state,
  coalesce(r.line_count, 0) AS line_count,
  coalesce(r.no_price_lines, 0) AS no_price_lines,
  coalesce(r.flagged_lines, 0) AS flagged_lines,
  round(coalesce(r.at_risk, 0), 2) AS at_risk,
  round(coalesce(r.worst_pct, 0), 2) AS worst_pct,
  -- appended last so CREATE OR REPLACE stays additive
  round(coalesce(r.credit_memo_amount, 0), 2) AS credit_memo_amount
FROM public.abc_invoices i
CROSS JOIN LATERAL (
  SELECT
    nullif(i.raw->'branch'->>'number', '') AS no,
    nullif(i.raw->'branch'->>'name', '')   AS nm,
    nullif(i.raw->'branch'->>'city', '')   AS city,
    nullif(i.raw->'branch'->>'state', '')  AS state
) rb
LEFT JOIN LATERAL (
  SELECT a.branch_name, a.city, a.state
  FROM public.abc_vendor_branches a
  WHERE rb.no IS NOT NULL AND ltrim(a.branch_number, '0') = ltrim(rb.no, '0')
  LIMIT 1
) avb ON true
LEFT JOIN LATERAL (
  SELECT v.branch_name, v.pricing_territory_office_id
  FROM public.vendor_branches v
  WHERE rb.no IS NOT NULL AND ltrim(v.branch_number, '0') = ltrim(rb.no, '0')
  ORDER BY (v.pricing_territory_office_id IS NOT NULL) DESC
  LIMIT 1
) vb ON true
LEFT JOIN roll r ON r.invoice_number = i.invoice_number;
