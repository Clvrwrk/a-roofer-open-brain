-- 276 — an item-level API price lookup, so the Price Agreements page stops
--       pulling a branch-level cross product it immediately collapses.
--
-- PEC-216, second half. The first half already landed: the page used to page
-- v_branch_item_api_price in full (39,984 rows, ~40 round trips) and now chunks
-- `.in(item_number, …)` for the ~597 gap-worksheet items. That took the page
-- from 13.56s / 3.77MB to 3.0s / 315KB.
--
-- ── What is still wasteful ────────────────────────────────────────────────
--
-- `v_branch_item_api_price` is keyed (item, branch). The caller wants one number
-- per item — the LOWEST positive price across branches:
--
--     if (cur == null || p < cur) apiByItem.set(r.item_number, p);
--
-- So a 200-item chunk returns **9,788 rows**: roughly 49 branches per item, 48
-- of which are discarded the moment they arrive. Three chunks move ~29,000 rows
-- across the wire to build a 597-entry map, and each chunk re-runs the view's
-- DISTINCT ON over all 39,984 observations because the `.in()` filter is applied
-- as a semi-join AFTER the Unique, not pushed into it.
--
-- ── What this installs ────────────────────────────────────────────────────
--
-- `v_item_api_price`, one row per item number, doing the collapse in SQL where
-- it costs nothing extra. One round trip, 597 rows, same numbers.
--
-- The branch-level view stays — the branch dimension is real and other surfaces
-- use it. This is a second lens on the same data, not a replacement.
--
-- Kept as a plain view rather than a matview on purpose. The underlying DISTINCT
-- ON costs ~230ms, which is acceptable for a single call, and API price
-- observations are the freshest thing on the page; materialising them would
-- trade a real 230ms for a staleness window on the one number an operator is
-- actively checking against a vendor.

begin;

create or replace view public.v_item_api_price as
  select b.item_number,
         min(b.api_price) filter (where b.api_price > 0)          as api_price_min,
         max(b.api_price) filter (where b.api_price > 0)          as api_price_max,
         count(*) filter (where b.api_price > 0)                  as priced_branches,
         max(b.observed_at)                                       as observed_at_max
    from public.v_branch_item_api_price b
   group by b.item_number;

comment on view public.v_item_api_price is
  'One row per item number: the lowest, highest and latest ABC API-observed price across branches. v_branch_item_api_price is keyed (item, branch) and callers that want a single number per item were pulling ~49 rows per item to keep one (PEC-216). api_price_min is the figure the gap worksheet uses; api_price_max is exposed beside it because a wide spread across branches is itself worth seeing.';

grant select on public.v_item_api_price to anon, authenticated, service_role;

commit;

-- Verification:
--   select count(*) from v_item_api_price;                         -- one row per item
--   -- the min must match what the client loop computed row by row:
--   select count(*) from (
--     select b.item_number, min(b.api_price) filter (where b.api_price > 0) m
--       from v_branch_item_api_price b group by b.item_number) x
--     join v_item_api_price i on i.item_number = x.item_number
--    where i.api_price_min is distinct from x.m;                   -- 0
