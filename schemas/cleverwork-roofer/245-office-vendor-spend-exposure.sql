-- 245 — put DOLLARS on the coverage gaps.
--
-- Context: v_office_vendor_inheritance already tells us which (office x vendor) pairs have
-- no price agreement — `priced_items = 0`. The Command Center renders that as a gap count.
-- But a gap count treats all gaps alike, and they are NOT alike: of the 9 zero-priced pairs
-- in prod on 2026-08-20, SIX have never had a single invoice. They are theoretical gaps —
-- branches sit in the territory, nothing was ever bought there. Three carry real spend.
--
-- Without dollars, "9 coverage gaps" reads as a large uniform problem and the actual
-- exposure is invisible. This view attaches spend to every (office x vendor) pair so a gap
-- can be ranked by what it actually costs.
--
-- Measured exposure at apply time (pairs with priced_items = 0):
--   Denver (Greenwood Village), CO x SRS Distribution   4 invoices   $17,437.63
--   Wichita, KS               x QXO                     2 invoices    $5,697.47
--   Atlanta (Jonesboro), GA   x ABC Supply Co.          5 invoices    $5,226.90
--   Richardson, TX            x QXO                     1 invoice    -$3,723.59  (net credit)
--   ...the remaining 5 pairs: 0 invoices, $0.
-- Total live un-audited spend: $28,362.00 across 11 invoices.
--
-- Note this REORDERS the previously recorded priority. The 2026-08-19 log named Atlanta/ABC
-- ($5,226.90) as the next agreement to chase; Denver/SRS is 3.3x larger and was not on the
-- list at all.
--
-- Branch -> office resolution uses the vendor_branch_id FK only (migration 244's contract).
-- No query here resolves a branch from a text label. An invoice whose branch label never
-- resolved has vendor_branch_id NULL, so it joins to no office and is reported separately
-- by v_unresolved_branch_spend rather than being silently folded into an office's total.
--
-- Additive and idempotent: CREATE OR REPLACE VIEW only. No table is altered.

CREATE OR REPLACE VIEW public.v_office_vendor_spend AS
WITH invoice_union AS (
    SELECT i.vendor_branch_id, i.total_amount AS amount, i.invoice_date
      FROM public.abc_invoices i
     WHERE i.vendor_branch_id IS NOT NULL
    UNION ALL
    SELECT vi.vendor_branch_id, COALESCE(vi.total_due, vi.sub_total) AS amount, vi.invoice_date
      FROM public.vendor_invoices vi
     WHERE vi.vendor_branch_id IS NOT NULL
)
SELECT vb.pricing_territory_office_id       AS office_id,
       o.name                               AS office_name,
       vb.vendor_id                         AS vendor_id,
       v.name                               AS vendor_name,
       count(*)                             AS invoice_count,
       COALESCE(sum(u.amount), 0)::numeric(14,2) AS spend,
       min(u.invoice_date)                  AS first_invoice_date,
       max(u.invoice_date)                  AS last_invoice_date
  FROM invoice_union u
  JOIN public.vendor_branches vb ON vb.id = u.vendor_branch_id
  LEFT JOIN public.office  o ON o.id = vb.pricing_territory_office_id
  LEFT JOIN public.vendors v ON v.id = vb.vendor_id
 WHERE vb.pricing_territory_office_id IS NOT NULL
 GROUP BY vb.pricing_territory_office_id, o.name, vb.vendor_id, v.name;

COMMENT ON VIEW public.v_office_vendor_spend IS
  'Invoice count + spend per (office x vendor), resolved through vendor_branch_id (mig 244). '
  'Join to v_office_vendor_inheritance on (office_id, vendor_id) to rank coverage gaps '
  '(priced_items = 0) by real dollar exposure instead of by branch count.';

-- Spend that resolves to NO office: either the branch label never resolved (vendor_branch_id
-- NULL) or the branch has no pricing territory. Fail-closed per migration 244 — but it must
-- still be VISIBLE, or money quietly leaves the audit entirely.
CREATE OR REPLACE VIEW public.v_unresolved_branch_spend AS
WITH invoice_union AS (
    SELECT i.vendor_branch_id, i.total_amount AS amount
      FROM public.abc_invoices i
    UNION ALL
    SELECT vi.vendor_branch_id, COALESCE(vi.total_due, vi.sub_total) AS amount
      FROM public.vendor_invoices vi
)
SELECT CASE WHEN u.vendor_branch_id IS NULL THEN 'no_branch_resolved'
            ELSE 'branch_has_no_office' END      AS reason,
       count(*)                                  AS invoice_count,
       COALESCE(sum(u.amount), 0)::numeric(14,2) AS spend
  FROM invoice_union u
  LEFT JOIN public.vendor_branches vb ON vb.id = u.vendor_branch_id
 WHERE u.vendor_branch_id IS NULL
    OR vb.pricing_territory_office_id IS NULL
 GROUP BY 1;

COMMENT ON VIEW public.v_unresolved_branch_spend IS
  'Spend that reaches no pricing office, split by cause. Non-zero here means invoices are '
  'outside the price audit entirely — triage before trusting any coverage total.';
