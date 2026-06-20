-- 137-invoice-date-effective-negotiated-price.sql
-- Invoice-date price lock (Chris, 2026-06-20): "the invoice date is the date used to assign a
-- negotiated price list and then lock it in place." The audit must compare each invoice line to
-- the price list IN EFFECT at invoice time — the most recent agreement whose effective_date is on
-- or before the invoice_date — locked until a newer version supersedes it. A stale expiry does NOT
-- void the price (pricing above the last agreed price is exactly the overcharge to catch).
--
-- Before this, both audit views matched the highest-confidence agreement regardless of date, so an
-- invoice could be audited against the wrong version once a branch had multiple versions (e.g.
-- 2036874-16 Sep2025 / Apr2026 / Jun2026). invoice_date is immutable, so the date match IS the lock.
-- API price lists are excluded (negotiated only). Both v_invoice_audit_line and the rollup
-- v_invoice_audit_invoice are updated so the line detail and the $ At Risk KPI agree.
-- Additive: CREATE OR REPLACE of views; no data change. (Impact: open $ At Risk $4,437 -> ~$3,341,
-- the date-correct figure.)

CREATE OR REPLACE VIEW public.v_invoice_audit_line AS
SELECT
  l.id AS line_id,
  l.invoice_number,
  l.item_number,
  l.item_description,
  l.price_qty AS quantity,
  l.price_uom AS uom,
  round(l.price_per_uom, 4) AS unit_price,
  NULLIF(l.raw ->> 'extendedPriceAmount', '')::numeric AS extended_price,
  CASE WHEN NOT neg.negotiated_uom IS DISTINCT FROM l.price_uom THEN round(neg.negotiated_price, 4) ELSE NULL END AS negotiated_price,
  CASE WHEN neg.negotiated_price IS NOT NULL AND neg.negotiated_price <> 0 AND NOT neg.negotiated_uom IS DISTINCT FROM l.price_uom AND l.price_per_uom IS NOT NULL
       THEN round((l.price_per_uom - neg.negotiated_price) / neg.negotiated_price * 100, 2) ELSE NULL END AS variance_pct,
  CASE WHEN neg.negotiated_price IS NOT NULL AND NOT neg.negotiated_uom IS DISTINCT FROM l.price_uom AND l.price_per_uom IS NOT NULL AND l.price_qty IS NOT NULL
       THEN round((l.price_per_uom - neg.negotiated_price) * l.price_qty, 2) ELSE NULL END AS variance_ext,
  l.price_qty IS NOT NULL AND l.price_qty <> 0 AND l.price_per_uom IS NOT NULL AS is_auditable,
  COALESCE(o.category_key, classify_roof_system(l.item_description, l.item_number)) AS category_key,
  neg.negotiated_uom,
  neg.negotiated_price IS NOT NULL AND neg.negotiated_uom IS DISTINCT FROM l.price_uom AS uom_mismatch,
  neg.agreement_id AS negotiated_agreement_id
FROM public.v_invoice_lines_complete l
JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
LEFT JOIN LATERAL (
  SELECT pli.unit_price AS negotiated_price, pli.unit AS negotiated_uom, a.id AS agreement_id
  FROM public.abc_price_agreement_branch_matches m
  JOIN public.abc_price_agreements a ON a.id = m.abc_price_agreement_id
  JOIN public.abc_price_list_items pli ON pli.agreement_id = a.id AND pli.item_number = l.item_number
  WHERE m.ship_to_number = i.ship_to_number
    AND a.agreement_number NOT ILIKE 'API-%'
    AND (a.effective_date IS NULL OR i.invoice_date IS NULL OR a.effective_date <= i.invoice_date)
  ORDER BY a.effective_date DESC NULLS LAST, m.confidence_score DESC NULLS LAST, pli.unit_price
  LIMIT 1
) neg ON true
LEFT JOIN public.item_roof_system_category o ON o.item_number = l.item_number;

COMMENT ON VIEW public.v_invoice_audit_line IS
  'Per-invoice-line audit vs the negotiated price list in effect at invoice time = most recent agreement with effective_date <= invoice_date (invoice-date lock, Chris 2026-06-20; locked until superseded). API lists excluded. negotiated_agreement_id = the locked version.';

CREATE OR REPLACE VIEW public.v_invoice_audit_invoice AS
WITH priced AS (
  SELECT l.invoice_number, l.id AS line_id, l.price_qty AS qty,
    NULLIF(l.raw ->> 'extendedPriceAmount', '')::numeric AS ext,
    l.price_per_uom AS eff_price,
    CASE WHEN NOT neg.negotiated_uom IS DISTINCT FROM l.price_uom THEN neg.negotiated_price ELSE NULL END AS negotiated_price,
    cur.audit_status, cur.decision
  FROM v_invoice_lines_complete l
    JOIN abc_invoices i_1 ON i_1.invoice_number = l.invoice_number
    LEFT JOIN LATERAL (
      SELECT pli.unit_price AS negotiated_price, pli.unit AS negotiated_uom
      FROM abc_price_agreement_branch_matches m
      JOIN abc_price_agreements a ON a.id = m.abc_price_agreement_id
      JOIN abc_price_list_items pli ON pli.agreement_id = a.id AND pli.item_number = l.item_number
      WHERE m.ship_to_number = i_1.ship_to_number
        AND a.agreement_number NOT ILIKE 'API-%'
        AND (a.effective_date IS NULL OR i_1.invoice_date IS NULL OR a.effective_date <= i_1.invoice_date)
      ORDER BY a.effective_date DESC NULLS LAST, m.confidence_score DESC NULLS LAST, pli.unit_price
      LIMIT 1
    ) neg ON true
    LEFT JOIN v_invoice_line_audit_current cur ON cur.invoice_line_id = l.id
), roll AS (
  SELECT priced.invoice_number,
    count(*) AS line_count,
    count(*) FILTER (WHERE priced.negotiated_price IS NULL) AS no_price_lines,
    count(*) FILTER (WHERE priced.negotiated_price IS NOT NULL AND priced.negotiated_price <> 0 AND priced.qty IS NOT NULL AND priced.qty <> 0 AND abs((priced.eff_price - priced.negotiated_price) / priced.negotiated_price * 100) >= 0.01) AS flagged_lines,
    COALESCE(sum(CASE WHEN priced.negotiated_price IS NOT NULL AND priced.qty > 0 AND priced.eff_price > priced.negotiated_price AND COALESCE(priced.audit_status, '') <> 'passed' THEN (priced.eff_price - priced.negotiated_price) * priced.qty ELSE 0 END), 0) AS at_risk,
    COALESCE(sum(CASE WHEN priced.negotiated_price IS NOT NULL AND priced.qty > 0 AND priced.eff_price > priced.negotiated_price AND priced.audit_status = 'passed' AND (priced.decision = ANY (ARRAY['credit-flag', 'credit-noflag'])) THEN (priced.eff_price - priced.negotiated_price) * priced.qty ELSE 0 END), 0) AS credit_memo_amount,
    COALESCE(max(CASE WHEN priced.negotiated_price IS NOT NULL AND priced.negotiated_price <> 0 AND priced.qty IS NOT NULL AND priced.qty <> 0 THEN abs((priced.eff_price - priced.negotiated_price) / priced.negotiated_price * 100) ELSE 0 END), 0) AS worst_pct
  FROM priced GROUP BY priced.invoice_number
)
SELECT i.invoice_number, i.ship_to_number, i.invoice_date, i.order_date, i.total_amount, i.is_credit_memo, i.sales_type, i.purchase_order_number, i.order_name,
  rb.no AS branch_number,
  COALESCE(NULLIF(avb.branch_name, ''), NULLIF(vb.branch_name, ''), rb.nm, 'Branch ' || COALESCE(rb.no, i.ship_to_number)) AS branch_name,
  COALESCE((SELECT o.name FROM office o WHERE o.id = vb.pricing_territory_office_id), NULLIF(TRIM(BOTH FROM (COALESCE(rb.city, avb.city, '') || ', ') || COALESCE(rb.state, avb.state, '')), ',') || ' area', 'Unassigned') AS office,
  COALESCE(rb.city, avb.city, '') AS branch_city,
  COALESCE(rb.state, avb.state, '') AS branch_state,
  COALESCE(r.line_count, 0) AS line_count,
  COALESCE(r.no_price_lines, 0) AS no_price_lines,
  COALESCE(r.flagged_lines, 0) AS flagged_lines,
  round(COALESCE(r.at_risk, 0), 2) AS at_risk,
  round(COALESCE(r.worst_pct, 0), 2) AS worst_pct,
  round(COALESCE(r.credit_memo_amount, 0), 2) AS credit_memo_amount
FROM abc_invoices i
  CROSS JOIN LATERAL (SELECT NULLIF((i.raw -> 'branch') ->> 'number', '') AS no, NULLIF((i.raw -> 'branch') ->> 'name', '') AS nm, NULLIF((i.raw -> 'branch') ->> 'city', '') AS city, NULLIF((i.raw -> 'branch') ->> 'state', '') AS state) rb
  LEFT JOIN LATERAL (SELECT a.branch_name, a.city, a.state FROM abc_vendor_branches a WHERE rb.no IS NOT NULL AND ltrim(a.branch_number, '0') = ltrim(rb.no, '0') LIMIT 1) avb ON true
  LEFT JOIN LATERAL (SELECT v.branch_name, v.pricing_territory_office_id FROM vendor_branches v WHERE rb.no IS NOT NULL AND ltrim(v.branch_number, '0') = ltrim(rb.no, '0') ORDER BY (v.pricing_territory_office_id IS NOT NULL) DESC LIMIT 1) vb ON true
  LEFT JOIN roll r ON r.invoice_number = i.invoice_number;
