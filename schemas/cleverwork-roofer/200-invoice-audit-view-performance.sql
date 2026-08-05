-- 200 — v_invoice_audit_invoice performance fix (2026-08-05)
-- The dashboard summary view was blowing past the PostgREST statement timeout (~6-7s):
--   1. Its branch laterals were keyed on the full abc_invoices.raw JSONB, so the planner
--      memoized on (and re-detoasted/hashed) multi-KB payloads for every invoice row.
--   2. The per-line negotiated lateral looped price-list items x branch matches without
--      a composite index (branch_matches grew ~87 rows/ship-to after the 08-04
--      inheritance work).
-- Fix (additive): stored generated columns extract the branch fields once at write time;
-- the view's rb lateral repoints to them; supporting indexes for the laterals.
-- Applied to prod 2026-08-05 (indexes idx_abc_pli_agreement_item /
-- idx_abc_pabm_shipto_agreement applied same session). Result: 7.5s -> sub-second.

ALTER TABLE public.abc_invoices ADD COLUMN IF NOT EXISTS branch_number_extracted text
  GENERATED ALWAYS AS (NULLIF((raw -> 'branch') ->> 'number', '')) STORED;
ALTER TABLE public.abc_invoices ADD COLUMN IF NOT EXISTS branch_name_extracted text
  GENERATED ALWAYS AS (NULLIF((raw -> 'branch') ->> 'name', '')) STORED;
ALTER TABLE public.abc_invoices ADD COLUMN IF NOT EXISTS branch_city_extracted text
  GENERATED ALWAYS AS (NULLIF((raw -> 'branch') ->> 'city', '')) STORED;
ALTER TABLE public.abc_invoices ADD COLUMN IF NOT EXISTS branch_state_extracted text
  GENERATED ALWAYS AS (NULLIF((raw -> 'branch') ->> 'state', '')) STORED;

CREATE INDEX IF NOT EXISTS idx_vendor_branches_branchnum_norm
  ON public.vendor_branches (ltrim(branch_number, '0'));
CREATE INDEX IF NOT EXISTS idx_abc_vendor_branches_branchnum_norm
  ON public.abc_vendor_branches (ltrim(branch_number, '0'));

CREATE INDEX IF NOT EXISTS idx_abc_pli_agreement_item
  ON public.abc_price_list_items (agreement_id, item_number) INCLUDE (unit_price, unit);
CREATE INDEX IF NOT EXISTS idx_abc_pabm_shipto_agreement
  ON public.abc_price_agreement_branch_matches (ship_to_number, abc_price_agreement_id) INCLUDE (confidence_score);

-- Same definition as before; ONLY the rb lateral changed (raw -> generated columns).
CREATE OR REPLACE VIEW public.v_invoice_audit_invoice AS
 WITH priced AS (
         SELECT l.invoice_number,
            l.id AS line_id,
            l.price_qty AS qty,
            NULLIF(l.raw ->> 'extendedPriceAmount', '')::numeric AS ext,
            l.price_per_uom AS eff_price,
                CASE
                    WHEN NOT neg.negotiated_uom IS DISTINCT FROM l.price_uom THEN neg.negotiated_price
                    ELSE NULL::numeric
                END AS negotiated_price,
            cur.audit_status,
            cur.decision
           FROM v_invoice_lines_complete l
             JOIN abc_invoices i_1 ON i_1.invoice_number = l.invoice_number
             LEFT JOIN LATERAL ( SELECT pli.unit_price AS negotiated_price,
                    pli.unit AS negotiated_uom
                   FROM abc_price_agreement_branch_matches m
                     JOIN abc_price_agreements a ON a.id = m.abc_price_agreement_id
                     JOIN abc_price_list_items pli ON pli.agreement_id = a.id AND pli.item_number = l.item_number
                  WHERE m.ship_to_number = i_1.ship_to_number AND a.agreement_number !~~* 'API-%' AND (a.effective_date IS NULL OR i_1.invoice_date IS NULL OR a.effective_date <= i_1.invoice_date)
                  ORDER BY a.effective_date DESC NULLS LAST, m.confidence_score DESC NULLS LAST, pli.unit_price
                 LIMIT 1) neg ON true
             LEFT JOIN v_invoice_line_audit_current cur ON cur.invoice_line_id = l.id
        ), roll AS (
         SELECT priced.invoice_number,
            count(*) AS line_count,
            count(*) FILTER (WHERE priced.negotiated_price IS NULL) AS no_price_lines,
            count(*) FILTER (WHERE priced.negotiated_price IS NOT NULL AND priced.negotiated_price <> 0::numeric AND priced.qty IS NOT NULL AND priced.qty <> 0::numeric AND abs((priced.eff_price - priced.negotiated_price) / priced.negotiated_price * 100::numeric) >= 0.01) AS flagged_lines,
            COALESCE(sum(
                CASE
                    WHEN priced.negotiated_price IS NOT NULL AND priced.qty > 0::numeric AND priced.eff_price > priced.negotiated_price AND COALESCE(priced.audit_status, '') <> 'passed' THEN (priced.eff_price - priced.negotiated_price) * priced.qty
                    ELSE 0::numeric
                END), 0::numeric) AS at_risk,
            COALESCE(sum(
                CASE
                    WHEN priced.negotiated_price IS NOT NULL AND priced.qty > 0::numeric AND priced.eff_price > priced.negotiated_price AND priced.audit_status = 'passed' AND (priced.decision = ANY (ARRAY['credit-flag'::text, 'credit-noflag'::text])) THEN (priced.eff_price - priced.negotiated_price) * priced.qty
                    ELSE 0::numeric
                END), 0::numeric) AS credit_memo_amount,
            COALESCE(max(
                CASE
                    WHEN priced.negotiated_price IS NOT NULL AND priced.negotiated_price <> 0::numeric AND priced.qty IS NOT NULL AND priced.qty <> 0::numeric THEN abs((priced.eff_price - priced.negotiated_price) / priced.negotiated_price * 100::numeric)
                    ELSE 0::numeric
                END), 0::numeric) AS worst_pct
           FROM priced
          GROUP BY priced.invoice_number
        )
 SELECT i.invoice_number,
    i.ship_to_number,
    i.invoice_date,
    i.order_date,
    i.total_amount,
    i.is_credit_memo,
    i.sales_type,
    i.purchase_order_number,
    i.order_name,
    rb.no AS branch_number,
    COALESCE(NULLIF(avb.branch_name, ''), NULLIF(vb.branch_name, ''), rb.nm, 'Branch ' || COALESCE(rb.no, i.ship_to_number)) AS branch_name,
    COALESCE(( SELECT o.name
           FROM office o
          WHERE o.id = vb.pricing_territory_office_id), NULLIF(TRIM(BOTH FROM (COALESCE(rb.city, avb.city, '') || ', ') || COALESCE(rb.state, avb.state, '')), ',') || ' area', 'Unassigned') AS office,
    COALESCE(rb.city, avb.city, '') AS branch_city,
    COALESCE(rb.state, avb.state, '') AS branch_state,
    COALESCE(r.line_count, 0::bigint) AS line_count,
    COALESCE(r.no_price_lines, 0::bigint) AS no_price_lines,
    COALESCE(r.flagged_lines, 0::bigint) AS flagged_lines,
    round(COALESCE(r.at_risk, 0::numeric), 2) AS at_risk,
    round(COALESCE(r.worst_pct, 0::numeric), 2) AS worst_pct,
    round(COALESCE(r.credit_memo_amount, 0::numeric), 2) AS credit_memo_amount
   FROM abc_invoices i
     CROSS JOIN LATERAL ( SELECT i.branch_number_extracted AS no,
            i.branch_name_extracted AS nm,
            i.branch_city_extracted AS city,
            i.branch_state_extracted AS state) rb
     LEFT JOIN LATERAL ( SELECT a.branch_name,
            a.city,
            a.state
           FROM abc_vendor_branches a
          WHERE rb.no IS NOT NULL AND ltrim(a.branch_number, '0') = ltrim(rb.no, '0')
         LIMIT 1) avb ON true
     LEFT JOIN LATERAL ( SELECT v.branch_name,
            v.pricing_territory_office_id
           FROM vendor_branches v
          WHERE rb.no IS NOT NULL AND ltrim(v.branch_number, '0') = ltrim(rb.no, '0')
          ORDER BY (v.pricing_territory_office_id IS NOT NULL) DESC
         LIMIT 1) vb ON true
     LEFT JOIN roll r ON r.invoice_number = i.invoice_number;
