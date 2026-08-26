-- 286 — put DOLLARS on the coverage gaps.
--
-- NUMBERING NOTE — two identities, both authoritative in their own place:
--   * IN PROD: applied as `245_office_vendor_spend_exposure`, 2026-08-20 10:57 UTC. Fixed;
--     Supabase keys on TIMESTAMP, not on this label, so the applied order is unaffected by
--     any renumbering below. This set applied BEFORE the file numbered 246 existed.
--   * IN THIS REPO: the file is `286-...`, renumbered ELEVEN times as parallel sessions
--     claimed numbers on main while this work was in flight. Main is canonical, so this
--     branch yields every time. Intermediate numbers (250-253, 263-266, 267, 281-285) no longer
--     name any file in this set.
-- The sibling migrations of this set are 287, 288, 289 and 290, all applied to prod.
--
-- The last two moves, for anyone tracing a stale reference:
--   8th, 2026-08-22: main landed `263-wip-attention-flags.sql`  -> set moved 263-266 to 267-270
--   9th, 2026-08-22: main landed `267-srs-colorado-price-list-backdate.sql`
--                                                                -> set moved 267-270 to 268-271
--  10th, 2026-08-24: main landed its own 268-280 (ABC colour arm, matview audit line,
--                    credit memos)                              -> set moved 268-272 to 281-285
--  11th, 2026-08-26: main landed `281-ceo-fixed-cost-13wcf.sql`
--                                                                -> set moved 281-285 to 286-290
-- Each time the WHOLE set moves, not just the colliding file, so the spend view keeps
-- preceding the two migrations that read it.
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
--
-- INVARIANT — the two views below are an EXACT complementary partition, and must stay one.
--   resolved   (v_office_vendor_spend)     = vendor_branch_id IS NOT NULL
--                                            AND vb.pricing_territory_office_id IS NOT NULL
--   unresolved (v_unresolved_branch_spend) = vendor_branch_id IS NULL
--                                            OR  vb.pricing_territory_office_id IS NULL
-- Every invoice lands in exactly one. Verified 2026-08-26 against prod:
--   $2,278,692.71 resolved + $27,566.56 unresolved = $2,306,259.27 total, 1,134 = 1,134 rows.
--
-- A 2026-08-26 review proposed tightening the RESOLVED arm only — requiring a covered
-- `abc-supply` branch and `vendor_invoices.vendor_id = vendor_branches.vendor_id` — on the
-- theory that spend could enter resolved and vanish from unresolved. It cannot: the two
-- predicates are exact complements, so nothing can be absent from both. Applying that change
-- to the resolved arm alone would CREATE the leak it was meant to prevent, because the
-- unresolved arm keys on office nullity and would not pick the excluded rows back up.
-- If either predicate is ever tightened, tighten BOTH and re-run the reconciliation above.
--
-- The underlying mismatch also has no instances: 0 abc_invoices rows point at a non-ABC
-- branch, 0 vendor_invoices rows disagree with their branch's vendor, 0 carry a NULL
-- vendor_id alongside a branch (prod, 2026-08-26). Note the vendor label here is derived
-- FROM the branch (vb.vendor_id), never assumed from the source table, so a mismatched FK
-- would be attributed to the branch's real vendor rather than silently mislabelled.
-- A cross-vendor FK mismatch is a data-integrity concern for a constraint or monitor, not a
-- reason to reshape spend attribution.

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
