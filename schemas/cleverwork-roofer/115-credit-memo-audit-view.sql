-- 115-credit-memo-audit-view.sql
-- Credit-memo audit view. For each credit memo (is_credit_memo OR negative total), resolve
-- the original invoice via original_invoice_reference (root matched to the held invoice,
-- preferring the -001 suffix) and compare each CM line's unit price to the original line's
-- unit price (by item_number). Powers the Accounting > Credit Memos queue so a CM that
-- matches its original can be dispositioned/approved quickly. Read-only, additive.
--
-- match_status: matches (all lines match an original line) · mismatch (a price differs) ·
-- partial (matched but some CM items not on the original) · no_reference (original unresolved).
CREATE OR REPLACE VIEW public.v_credit_memo_audit AS
WITH cm AS (
  SELECT c.invoice_number, c.invoice_date, c.total_amount, c.ship_to_number,
         c.original_invoice_reference, split_part(coalesce(c.original_invoice_reference, ''), '-', 1) AS orig_root
  FROM public.abc_invoices c
  WHERE c.is_credit_memo OR c.total_amount < 0
),
orig AS (
  SELECT cm.invoice_number AS cm_inv,
    (SELECT i.invoice_number FROM public.abc_invoices i
       WHERE cm.orig_root <> '' AND split_part(i.invoice_number, '-', 1) = cm.orig_root
       ORDER BY (i.invoice_number = cm.orig_root || '-001') DESC, i.invoice_number
       LIMIT 1) AS orig_inv
  FROM cm
),
ln AS (
  SELECT cm.invoice_number AS cm_inv,
    CASE WHEN ol.unit_price IS NULL THEN 'no_original'
         WHEN round(cl.unit_price::numeric, 2) = round(ol.unit_price::numeric, 2) THEN 'match'
         ELSE 'mismatch' END AS st
  FROM cm
  JOIN orig o ON o.cm_inv = cm.invoice_number
  JOIN public.abc_invoice_lines cl ON cl.invoice_number = cm.invoice_number
  LEFT JOIN public.abc_invoice_lines ol ON ol.invoice_number = o.orig_inv AND ol.item_number = cl.item_number
),
brmatch AS (
  SELECT DISTINCT ON (ship_to_number) ship_to_number, branch_number
  FROM public.abc_price_agreement_branch_matches
  ORDER BY ship_to_number, confidence_score DESC NULLS LAST
)
SELECT
  cm.invoice_number,
  cm.invoice_date,
  cm.total_amount::numeric AS credit_amount,
  cm.ship_to_number,
  cm.original_invoice_reference,
  o.orig_inv AS original_invoice_number,
  coalesce(nullif(avb.branch_name, ''), 'Branch ' || coalesce(bm.branch_number, cm.ship_to_number)) AS branch_name,
  coalesce(agg.matched, 0) AS matched_lines,
  coalesce(agg.mismatch, 0) AS mismatch_lines,
  coalesce(agg.no_orig, 0) AS unmatched_lines,
  coalesce(agg.matched, 0) + coalesce(agg.mismatch, 0) + coalesce(agg.no_orig, 0) AS line_count,
  CASE
    WHEN o.orig_inv IS NULL THEN 'no_reference'
    WHEN coalesce(agg.mismatch, 0) > 0 THEN 'mismatch'
    WHEN coalesce(agg.no_orig, 0) > 0 THEN 'partial'
    WHEN coalesce(agg.matched, 0) > 0 THEN 'matches'
    ELSE 'no_reference' END AS match_status
FROM cm
JOIN orig o ON o.cm_inv = cm.invoice_number
LEFT JOIN brmatch bm ON bm.ship_to_number = cm.ship_to_number
LEFT JOIN public.abc_vendor_branches avb ON avb.branch_number = bm.branch_number
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE st = 'match') AS matched,
         count(*) FILTER (WHERE st = 'mismatch') AS mismatch,
         count(*) FILTER (WHERE st = 'no_original') AS no_orig
  FROM ln WHERE ln.cm_inv = cm.invoice_number
) agg ON true;
