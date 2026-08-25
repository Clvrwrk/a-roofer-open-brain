-- 268 — ABC adopts the colour-variant rule, and its trigram arm gets a dimension guard.
--
-- Chris, 2026-08-24: "go with the dimension guard" (PEC-231).
--
-- ── What was measured before this migration ───────────────────────────────
--
-- PEC-231 was written as "move ABC onto the colour rule so the two vendors are
-- genuinely identical." Simulated against prod, that swap is not like-for-like:
--
--   priced ABC lines   2,230 -> 1,403   (-39%)
--   claim value      $7,270.65 -> $1,376.47   (-81%)
--
-- The premise in migration 261 — that ABC's exact arm does the heavy lifting and
-- trigram "only mops up" — is true of the ABC price LIST (item numbers on 1,292
-- of 1,690 rows) and false of the ABC invoice LINES. Winning arm per priced line:
--
--   exact item number            1,230
--   exact / prefix description      39
--   trigram >= 0.45 only           961   (43%, and 91% of all ABC claim value)
--
-- The colour key was tuned on SRS text, which is pipe-delimited and consistent.
-- ABC writes free-text abbreviations, and the key does not survive them:
--
--   Mal Vista AR 252 Storm Grey 3BDL/SQ  ->  3BDL/SQ MAL VISTA
--   vista ar 252 3bdls sq   (book row)   ->  3BDLS SQ VISTA        NO MATCH
--   Mal EZ Ridge XT 224 Mid Black 20LF   ->  20LF EZ MAL MID RIDGE XT
--   malarkey 224 ez ridge xt 20lf (book) ->  20LF EZ MALARKEY RIDGE XT   NO MATCH
--
-- MAL vs MALARKEY, 3BDL/SQ vs 3BDLS SQ. The Malarkey Vista colour family — five
-- colours priced off one colour-generic book row — is exactly what the colour
-- rule exists for, and on ABC's text it misses.
--
-- ── ABC's real failure mode is dimension blindness, not colour blindness ──
--
-- The two worst false claims in the ABC audit are both a WIDTH, not a colour:
--
--   GAF 12" Cobra Snow Country 4' Adv   priced off  cobra 9 snow country 4
--       +129.3%, $412.08 — the largest single claim on the board
--   GAF Cobra Rigid Vent 3 12" W/Nails  priced off  gaf cobra ridge vent 9 12 w nails
--       +28.4%, $129.60
--
-- Trigram drops the digits. So does vendor_desc_color_key, which strips bare
-- numerics as noise. Neither rule can tell 9" from 12".
--
-- ── What this migration installs ──────────────────────────────────────────
--
-- A four-rank fallback on the ABC arm:
--
--   1  exact item number                     (unchanged)
--   2  exact or prefix description           (was gated behind the 0.45 threshold,
--                                             which could exclude a legitimate
--                                             prefix match on a long invoice
--                                             description — now ungated)
--   3  colour-key equality                   (the SRS rule, as Chris asked)
--   4  trigram >= 0.45 AND the book row's numeric tokens are a subset of the
--      invoice line's                        (the dimension guard)
--
-- {9,4} is not a subset of {12,4}   -> the Cobra claim dies.
-- {252,3} is a subset of {252,3}    -> Malarkey Vista survives.
--
-- Measured effect:
--
--                        before      after
--   priced ABC lines      2,230      2,143   (-87, -3.9%)
--   claim value       $7,270.65  $6,620.78
--   claim lines             244        229
--   worst variance      129.28%     58.84%
--   lines won by colour arm   0        105
--
-- ── Superseded in part by migration 271 ─────────────────────────────────
--
-- The four-way OR below is NOT the shipped predicate. It disabled the trigram
-- index (one non-indexable disjunct disqualifies the whole OR from a BitmapOr)
-- and took `select count(*) from v_invoice_audit_line` from 4.1 s to 19.9 s.
-- Migration 271 reduces the JOIN to two indexable disjuncts — (trigram AND
-- guard) OR colour — and drops the num_tokens GIN index the planner mis-chose.
-- Read 271 alongside this file; the rationale here still holds, the predicate
-- does not.
--
-- LIMIT 1 over the rank order keeps every fallback a fallback: a colour or
-- guarded-trigram price is only used when no exact match exists in the office's
-- governing book.

begin;

-- 1 · The dimension signature. IMMUTABLE and table-free, unlike
--     vendor_desc_color_key, which reads product_color_term and is only STABLE.
create or replace function public.desc_num_tokens(p_text text)
returns text[] language sql immutable set search_path to 'public' as $$
  select array(
    select distinct m[1]
    from regexp_matches(coalesce(p_text, ''), '[0-9]+', 'g') m
    order by 1
  );
$$;

comment on function public.desc_num_tokens(text) is
  'Distinct numeric tokens in an item description, sorted - the dimension signature. Two descriptions naming different sizes of the same product differ here even though trigram similarity and vendor_desc_color_key both treat the digits as noise. Returns {} (not NULL) for text with no digits, so an empty result is a known zero.';

-- 2 · Materialised match keys. Same reason as migration 262: these functions are
--     inlined by the planner and must not be evaluated per join pair. Both sides
--     of the comparison are stored so the predicate is column-to-column.
alter table public.abc_price_list_items  add column if not exists num_tokens text[];
alter table public.abc_invoice_lines     add column if not exists color_key  text;
alter table public.abc_invoice_lines     add column if not exists num_tokens text[];
alter table public.abc_invoice_lines_full add column if not exists color_key  text;
alter table public.abc_invoice_lines_full add column if not exists num_tokens text[];

create index if not exists abc_pli_num_tokens_idx  on public.abc_price_list_items using gin (num_tokens);
create index if not exists abc_il_color_key_idx    on public.abc_invoice_lines (color_key) where color_key is not null;
create index if not exists abc_ilf_color_key_idx   on public.abc_invoice_lines_full (color_key) where color_key is not null;

comment on column public.abc_price_list_items.num_tokens is
  'Materialised desc_num_tokens(description_normalized). The dimension guard on the trigram arm tests num_tokens containment; a NULL here fails the guard closed, which is the intended behaviour for a key that was never computed.';
comment on column public.abc_invoice_lines.color_key is
  'Materialised vendor_desc_color_key(item_description), maintained by trigger. Stored so the ABC colour arm is a column equality rather than a per-pair function call.';

-- 3 · Keep them current as the Hetzner mirror writes. A refresh function alone
--     would leave every newly mirrored line unmatchable until the next run.
create or replace function public.abc_line_match_keys_tg()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  -- OLD is unassigned on INSERT and plpgsql does not promise to short-circuit an
  -- OR, so the two cases are branched rather than combined.
  if tg_op = 'INSERT' then
    new.color_key  := vendor_desc_color_key(new.item_description);
    new.num_tokens := desc_num_tokens(new.item_description);
  elsif new.item_description is distinct from old.item_description
     or new.color_key is null or new.num_tokens is null then
    new.color_key  := vendor_desc_color_key(new.item_description);
    new.num_tokens := desc_num_tokens(new.item_description);
  end if;
  return new;
end $$;

comment on function public.abc_line_match_keys_tg() is
  'BEFORE INSERT/UPDATE on the ABC invoice-line tables: recomputes color_key and num_tokens whenever the description changes or a key is missing. Colour-vocabulary changes do NOT retro-update existing rows - that is what refresh_abc_match_keys() is for.';

drop trigger if exists abc_invoice_lines_match_keys on public.abc_invoice_lines;
create trigger abc_invoice_lines_match_keys
  before insert or update on public.abc_invoice_lines
  for each row execute function public.abc_line_match_keys_tg();

drop trigger if exists abc_invoice_lines_full_match_keys on public.abc_invoice_lines_full;
create trigger abc_invoice_lines_full_match_keys
  before insert or update on public.abc_invoice_lines_full
  for each row execute function public.abc_line_match_keys_tg();

-- 4 · Backfill + a re-run path for when the colour vocabulary moves.
create or replace function public.refresh_abc_match_keys()
returns table (price_items integer, api_lines integer, full_lines integer)
language plpgsql security definer set search_path to 'public' as $$
declare a integer; b integer; c integer;
begin
  update abc_price_list_items
     set num_tokens = desc_num_tokens(description_normalized)
   where num_tokens is distinct from desc_num_tokens(description_normalized);
  get diagnostics a = row_count;

  update abc_invoice_lines
     set color_key  = vendor_desc_color_key(item_description),
         num_tokens = desc_num_tokens(item_description)
   where color_key  is distinct from vendor_desc_color_key(item_description)
      or num_tokens is distinct from desc_num_tokens(item_description);
  get diagnostics b = row_count;

  update abc_invoice_lines_full
     set color_key  = vendor_desc_color_key(item_description),
         num_tokens = desc_num_tokens(item_description)
   where color_key  is distinct from vendor_desc_color_key(item_description)
      or num_tokens is distinct from desc_num_tokens(item_description);
  get diagnostics c = row_count;

  return query select a, b, c;
end $$;

comment on function public.refresh_abc_match_keys() is
  'Recomputes the ABC-side materialised match keys. Run after refresh_product_color_terms() or refresh_color_keys() - a stale colour key silently stops matching colour variants, which reads as "no negotiated price" rather than as an error.';

select * from public.refresh_abc_match_keys();

-- 5 · Expose the keys through v_invoice_lines_complete. Appended, never inserted,
--     so create-or-replace accepts it and no dependent view sees a column move.
do $do$
declare
  v_def text := pg_get_viewdef('v_invoice_lines_complete'::regclass, true);
begin
  if position('color_key' in v_def) > 0 then
    raise notice 'v_invoice_lines_complete already exposes the match keys';
    return;
  end if;
  if position('FROM abc_invoice_lines l' in v_def) = 0 then raise exception 'api-line anchor not found'; end if;
  if position('FROM abc_invoice_lines_full f' in v_def) = 0 then raise exception 'full-line anchor not found'; end if;
  v_def := replace(v_def, 'FROM abc_invoice_lines l',
                          ', l.color_key, l.num_tokens FROM abc_invoice_lines l');
  v_def := replace(v_def, 'FROM abc_invoice_lines_full f',
                          ', f.color_key, f.num_tokens FROM abc_invoice_lines_full f');
  execute 'create or replace view public.v_invoice_lines_complete as ' || v_def;
end $do$;

-- 6 · Patch the ABC arm of v_invoice_audit_line in place. Same discipline as
--     migration 261: the view is a UNION of an ABC block and a vendor block, and
--     re-typing the whole thing would risk transcription drift in the block NOT
--     being changed. Anchors are unique to the ABC LATERAL and fail loudly.
do $do$
declare
  v_def   text := pg_get_viewdef('v_invoice_audit_line'::regclass, true);
  a_join  text := 'JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id AND pli.description_normalized % lower(l.item_description) AND similarity(pli.description_normalized, lower(l.item_description)) >= 0.45::double precision';
  b_join  text := 'JOIN abc_price_list_items pli ON pli.agreement_id = oav.agreement_id AND (pli.description_normalized = lower(l.item_description) OR lower(l.item_description) ~~ (pli.description_normalized || ''%''::text) OR pli.color_key IS NOT NULL AND pli.color_key <> ''''::text AND pli.color_key = l.color_key OR pli.description_normalized % lower(l.item_description) AND similarity(pli.description_normalized, lower(l.item_description)) >= 0.45::double precision AND l.num_tokens @> pli.num_tokens)';
  b_case  text := 'THEN 2 WHEN pli.color_key IS NOT NULL AND pli.color_key <> ''''::text AND pli.color_key = l.color_key THEN 3 ELSE 4 END AS "case"';
  v_hits  integer;
begin
  if position('pli.color_key' in v_def) > 0 then
    raise notice 'ABC colour arm already present; nothing to patch';
    return;
  end if;

  if position(a_join in v_def) = 0 then
    raise exception 'ABC trigram JOIN anchor not found - the view has moved, re-derive the anchor before re-running';
  end if;
  v_def := replace(v_def, a_join, b_join);

  -- Whitespace-tolerant, because pg_get_viewdef indents by nesting depth.
  select count(*) into v_hits
  from regexp_matches(v_def, 'THEN 2\s+ELSE 3\s+END AS "case"', 'g');
  if v_hits <> 1 then
    raise exception 'expected exactly 1 ABC match_rank CASE, found %', v_hits;
  end if;
  v_def := regexp_replace(v_def, 'THEN 2\s+ELSE 3\s+END AS "case"', b_case);

  execute 'create or replace view public.v_invoice_audit_line as ' || v_def;
end $do$;

commit;

-- Verification (expected values as simulated on 2026-08-24):
--   select count(*) filter (where negotiated_price is not null) from v_invoice_audit_line a
--     join abc_invoices i on i.invoice_number = a.invoice_number;              -- ~2,143
--   select round(sum(variance_ext),2) from v_invoice_audit_line a
--     join abc_invoices i on i.invoice_number = a.invoice_number
--    where quantity > 0 and variance_ext > 0;                                  -- ~6,620.78
--   select max(variance_pct) from v_invoice_audit_line a
--     join abc_invoices i on i.invoice_number = a.invoice_number
--    where quantity > 0;                                                       -- 58.84
