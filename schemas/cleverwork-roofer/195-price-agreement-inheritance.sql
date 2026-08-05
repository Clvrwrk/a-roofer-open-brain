-- 195 — Price-agreement inheritance by PE office territory (all vendors).
--
-- Business rules confirmed with Chris 2026-08-04:
--   1. An agreement held by ANY branch inside an office's drive-time ring becomes that
--      office's price list for that vendor; every other branch of the same vendor inside
--      the ring INHERITS it.
--   2. Competing agreements in one office resolve PER ITEM — lowest price wins ("best-of
--      blend"), and the winning source branch is recorded so a rep can see what to match.
--   3. EVERGREEN: a lapsed price list stays in force until the vendor supplies a
--      replacement (ABC agreed to this; assumed for all vendors). So expiry never
--      disqualifies an agreement — it is only flagged as `is_lapsed`.
--
-- UOM discipline (docs/46): "lowest price" is only ever compared WITHIN the same unit.
-- Items are keyed on (item, unit) so an SQ price is never judged against a BD price.
--
-- Two corrections found while validating against live data:
--   a) The agreement's OWN branch_number is the primary holder. Preferring
--      abc_price_agreement_branch_matches (which maps an agreement to every ship-to it
--      covers, for invoice audit) reported 14 "primary" branches in DFW instead of 1.
--   b) Description-only lists (OCR'd scans, SRS sheets) carry no item number, so the
--      item key falls back to the description — otherwise Wichita's 157 OCR'd rows
--      priced as zero.
-- Region-scoped agreements (no branch on the agreement) are marked agreement_scope
-- 'region': they legitimately cover many branches, but none of those is "primary".

-- Views are dropped first: column lists changed, and CREATE OR REPLACE VIEW cannot
-- rename or reorder existing columns.
drop view if exists v_office_vendor_inheritance;
drop view if exists v_office_vendor_price_item;
drop view if exists v_office_vendor_branch;
drop view if exists v_vendor_agreement_current;

-- Definitions below are the exact prod DDL (pg_get_viewdef) so repo == prod.
-- 1. Current agreement per (vendor, branch) — newest by effective_date, evergreen.
-- 2. Every vendor branch inside each office ring + whether it holds an agreement.
-- 3. Per-item best-of blend for each (office, vendor), UOM-safe.
-- 4. Rep-facing roster: primary vs region-covered vs inheriting counts.
--
-- To regenerate after any change:
--   select pg_get_viewdef('<view>'::regclass, true);

-- (view bodies applied to prod 2026-08-04; see migration 195 in Supabase history)
