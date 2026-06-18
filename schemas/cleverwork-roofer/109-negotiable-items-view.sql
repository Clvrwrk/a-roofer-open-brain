-- 109-negotiable-items-view.sql
-- The curated negotiable item master for the Price Agreement Builder (Item 3).
-- Additive + idempotent. Read-only.
--
-- CURATION RULE (confirmed with Chris 2026-06-18): the negotiable set = ABC
-- review-class A+B (the 36-month purchase velocity tiers from
-- abc_recompute_review_schedule(), schema 94). That is 857 SKUs across ~454
-- families = ~87% of $6.14M 36-mo spend. The Builder shows ~500 TOP-LEVEL
-- (family) items that expand to their SKU/color variations — `family_id` is the
-- grouping key (fall back to item_number when a SKU has no family).
--
-- Per-branch PREFILL (latest agreement price, else 0) is NOT in this master view
-- — it's branch-specific and joined in the loader from
-- abc_price_agreement_branch_matches → abc_price_list_items by the branch's ship-to.
-- Vendor-agnostic: keyed on item_number; an ABC-only source today, same shape for
-- any vendor's catalog later.

CREATE OR REPLACE VIEW public.v_negotiable_items AS
SELECT
  c.item_number,
  coalesce(nullif(c.family_id, ''), c.item_number) AS family_id,
  coalesce(nullif(c.family_name, ''), nullif(c.item_description, ''), c.item_number) AS family_name,
  coalesce(nullif(c.item_description, ''), nullif(c.marketing_description, ''), nullif(c.family_name, ''), c.item_number) AS description,
  c.review_class,
  c.spend_36mo,
  c.purchases_36mo,
  c.last_purchased_at,
  c.supplier_name,
  c.uoms->0->>'code' AS uom,
  (nullif(c.family_id, '') IS NULL) AS is_standalone
FROM public.abc_product_catalog c
WHERE c.review_class IN ('A', 'B');
