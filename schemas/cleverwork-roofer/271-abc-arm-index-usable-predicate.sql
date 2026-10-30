-- 271 — restore index usage on the ABC description arm. Corrects a performance
--       regression introduced by migration 268.
--
-- ── What went wrong ───────────────────────────────────────────────────────
--
-- 268 replaced the ABC description join with a four-way OR:
--
--   exact description OR prefix OR colour-key equality OR (trigram AND guard)
--
-- The prefix disjunct — `lower(l.item_description) LIKE pli.description_normalized
-- || '%'` — takes its pattern FROM the indexed column, so it is not indexable.
-- One non-indexable disjunct disqualifies the whole OR from a BitmapOr, and the
-- planner fell back to scanning every item in the agreement and filtering:
--
--   before 268   Bitmap Index Scan on idx_abc_pli_desc_trgm    4.1 s
--   after  268   Index Scan on idx_price_list_items_agreement  19.9 s
--                (6,732 loops x ~157 rows = ~1.06M similarity() calls)
--
-- Measured on `select count(*) from v_invoice_audit_line`. The Invoice Audit
-- page did not finish inside 120 s.
--
-- Second fault, also from 268: the GIN index on num_tokens. Array containment
-- over 1-3 element arrays is hopelessly unselective — the planner chose it over
-- the trigram index and matched 907 rows per loop where trigram matches 18.
-- Dropping the index is the fix; the guard is a filter, not an access path.
--
-- ── The correction ────────────────────────────────────────────────────────
--
-- Two indexable disjuncts, so the planner can BitmapOr them:
--
--   (trigram >= 0.45 AND dimension guard)  OR  (colour-key equality)
--
-- The exact and prefix disjuncts are removed from the JOIN and left where they
-- were before 268 — in the CASE that assigns match_rank. An exact description
-- match has similarity 1.0 and most prefix matches carry the book row's tokens
-- as a subset of the invoice line's, so they still arrive through the trigram
-- arm and still rank 2.
--
-- This is NOT cost-free, and the first draft of this migration wrongly said it
-- was. Measured: 29 lines and $523.48 of claims are lost, all of them matches
-- scoring under 0.45 that only the ungated prefix arm could reach.
--
-- Removing them is still right. Those 29 lines were not part of what Chris
-- approved — PEC-231 approved the colour arm and the dimension guard. The
-- ungated prefix arm was an extra 268 introduced on the theory that a long
-- invoice description could push a legitimate prefix match under the threshold.
-- That theory is plausible and untested: a book row that is a bare prefix of a
-- much longer invoice line is exactly the generic-row-meets-specific-product
-- shape that produces indefensible claims, and none of these 29 were ever
-- reviewed. Widening the matcher is its own decision with its own evidence, so
-- it goes back to the pre-268 doctrine and can be proposed separately.
--
--   after 271    BitmapOr(idx_abc_pli_desc_trgm, abc_pli_color_key_idx)  1.5 s
--
-- Faster than the pre-268 baseline, because the colour arm resolves through an
-- index rather than widening the trigram candidate set.
--
-- ── Invariant earned ──────────────────────────────────────────────────────
--
-- A matcher change is not verified by its match counts alone. 268's numbers were
-- right and its plan was wrong, and the plan is what the user experiences.
-- EXPLAIN the predicate before shipping a join that touches a large input.

begin;

-- The GIN index the planner mis-chose. The dimension guard is a filter applied
-- after the trigram bitmap; it never wanted an access path of its own.
drop index if exists public.abc_pli_num_tokens_idx;

do $do$
declare
  v_def text := pg_get_viewdef('v_invoice_audit_line'::regclass, true);
  a_join text := 'JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id AND (pli.description_normalized = lower(l.item_description) OR lower(l.item_description) ~~ (pli.description_normalized || ''%''::text) OR pli.color_key IS NOT NULL AND pli.color_key <> ''''::text AND pli.color_key = l.color_key OR pli.description_normalized % lower(l.item_description) AND similarity(pli.description_normalized, lower(l.item_description)) >= 0.45::double precision AND l.num_tokens @> pli.num_tokens)';
  b_join text := 'JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id AND (pli.description_normalized % lower(l.item_description) AND similarity(pli.description_normalized, lower(l.item_description)) >= 0.45::double precision AND l.num_tokens @> pli.num_tokens OR pli.color_key IS NOT NULL AND pli.color_key <> ''''::text AND pli.color_key = l.color_key)';
begin
  if position(a_join in v_def) = 0 then
    raise notice 'ABC description JOIN is not in the 268 four-way form; nothing to correct';
    return;
  end if;
  v_def := replace(v_def, a_join, b_join);
  execute 'create or replace view public.v_invoice_audit_line as ' || v_def;
end $do$;

commit;

-- Verification:
--   explain analyze select count(*) from v_invoice_audit_line;   -- BitmapOr, ~1.5 s
--   ABC priced lines / claim total / worst variance unchanged from migration 270.
