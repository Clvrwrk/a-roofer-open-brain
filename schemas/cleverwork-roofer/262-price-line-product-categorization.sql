-- 262 — every vendor price line points at a product in the PE product file.
--
-- Chris, 2026-08-21: "We need to scrub all uncategorized lines and make a
-- determination or add another worksurface within the price agreement workflow
-- to make sure all lines are properly categorized against the main PE product
-- file." Chosen end state: the line is BOUND to a products row and inherits
-- that product's taxonomy.
--
-- ── Why binding, not tagging ──────────────────────────────────────────────
--
-- abc_price_list_items.category_key is a GENERATED column:
--     classify_roof_system(description, item_number)
-- a keyword classifier. 440 of 1,690 lines came out 'uncategorized' — it had
-- no keyword to go on. Writing a category by hand is impossible (generated
-- columns reject it) and would be wrong anyway: it would be a second, drifting
-- copy of something the product already knows.
--
-- So the line gets a product_id, and category is READ through
-- products.taxonomy_id. One place, no drift. The generated classifier stays as
-- the fallback for lines that never get bound.
--
-- ── What auto-applies ─────────────────────────────────────────────────────
--
-- Exact manufacturer SKU, resolving to exactly one active product. That is
-- identity. It bound 748 of 1,690 ABC lines on first run.
--
-- Everything else is queued in product_match_candidate: 956 proposals across
-- 427 lines, tiered manufacturer_sku > colour_key > description, ranked by the
-- invoiced dollars behind the line ($40,279 in the queue). 224 lines have
-- exactly one candidate. SRS/QXO agreement items match almost nothing by SKU —
-- the PE product file is ABC-centric — so those arrive on description.
--
-- ── The performance trap this migration had to solve ──────────────────────
--
-- vendor_desc_color_key() is a STABLE SQL function, so the planner INLINES it
-- back into the join predicate and evaluates it per PAIR — 873 lines x 750
-- products — which times out no matter how the CTEs are arranged. Rearranging
-- into CTEs does not help; only materialising does. Hence the stored color_key
-- columns and refresh_color_keys().

begin;

alter table public.abc_price_list_items add column if not exists product_id uuid references public.products(id);
alter table public.abc_price_list_items add column if not exists product_match_type text;

comment on column public.abc_price_list_items.product_id is
  'The PE product this price-list line is. Source of truth for the line''s category - taxonomy is inherited from products.taxonomy_id, never typed twice.';
comment on column public.abc_price_list_items.product_match_type is
  'How product_id was established: manufacturer_sku (exact, auto-applied), colour_key, description, or manual.';

create index if not exists abc_pli_product_idx on public.abc_price_list_items (product_id);
create index if not exists pai_product_idx     on public.price_agreement_items (product_id);

-- Materialised colour keys. See the header: the function is inlined by the
-- planner, so it must not appear in a join predicate over large inputs.
alter table public.products              add column if not exists color_key text;
alter table public.abc_price_list_items  add column if not exists color_key text;
alter table public.price_agreement_items add column if not exists color_key text;

create index if not exists products_color_key_idx on public.products (color_key) where color_key is not null;
create index if not exists abc_pli_color_key_idx  on public.abc_price_list_items (color_key) where color_key is not null;
create index if not exists pai_color_key_idx      on public.price_agreement_items (color_key) where color_key is not null;

comment on column public.products.color_key is
  'Materialised vendor_desc_color_key(name). Stored because the function is inlined by the planner and evaluating it per join pair times out. Refresh with refresh_color_keys().';

create or replace function public.refresh_color_keys()
returns table (products_updated integer, abc_lines_updated integer, agreement_items_updated integer)
language plpgsql security definer set search_path to 'public' as $$
declare a integer; b integer; c integer;
begin
  update products set color_key = vendor_desc_color_key(name)
   where color_key is distinct from vendor_desc_color_key(name);
  get diagnostics a = row_count;
  update abc_price_list_items set color_key = vendor_desc_color_key(description)
   where color_key is distinct from vendor_desc_color_key(description);
  get diagnostics b = row_count;
  update price_agreement_items set color_key = vendor_desc_color_key(raw_description)
   where color_key is distinct from vendor_desc_color_key(raw_description);
  get diagnostics c = row_count;
  return query select a, b, c;
end $$;

comment on function public.refresh_color_keys() is
  'Recomputes the materialised colour keys. Run after refresh_product_color_terms() or after importing price-list lines - a stale key silently stops matching colour variants.';

create table if not exists public.product_match_candidate (
  id                 uuid primary key default gen_random_uuid(),
  source_table       text not null,
  source_id          text not null,
  vendor_slug        text,
  item_number        text,
  line_description   text not null,
  proposed_product_id uuid not null references public.products(id),
  product_name       text,
  match_tier         text not null,
  similarity_score   numeric,
  sibling_candidates integer,
  evidence_lines     integer,
  evidence_amount    numeric,
  review_status      text not null default 'pending',
  reviewed_by        text,
  reviewed_at        timestamptz,
  review_note        text,
  last_run_id        uuid,
  refreshed_at       timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='pmc_source_chk') then
    alter table public.product_match_candidate add constraint pmc_source_chk
      check (source_table in ('abc_price_list_items','price_agreement_items'));
  end if;
  if not exists (select 1 from pg_constraint where conname='pmc_tier_chk') then
    alter table public.product_match_candidate add constraint pmc_tier_chk
      check (match_tier in ('manufacturer_sku','colour_key','description'));
  end if;
  if not exists (select 1 from pg_constraint where conname='pmc_status_chk') then
    alter table public.product_match_candidate add constraint pmc_status_chk
      check (review_status in ('pending','approved','rejected'));
  end if;
end $$;

create unique index if not exists pmc_uniq on public.product_match_candidate (source_table, source_id, proposed_product_id);
create index if not exists pmc_pending_idx on public.product_match_candidate (review_status) where review_status='pending';

comment on table public.product_match_candidate is
  'Proposed bindings from a vendor price-line to a PE product. Nothing here categorizes anything - only an approved row is written back to product_id. sibling_candidates > 1 means the line has more than one plausible product and a human must choose.';
comment on column public.product_match_candidate.source_id is
  'Primary key of the source row, as text - abc_price_list_items.id is an integer and price_agreement_items.id is a uuid, so the queue stores both as text and casts on write-back.';

commit;

begin;

create or replace function public.refresh_product_match_candidates()
returns table (candidates_upserted integer, candidates_retired integer, sku_auto_applied integer)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_up integer := 0; v_ret integer := 0; v_applied integer := 0;
  v_run uuid := gen_random_uuid();
begin
  -- Auto-apply: the line's item number IS a product's manufacturer SKU and
  -- resolves to exactly one product. Identity, not inference.
  with hits as (
    select a.id as source_id, p.id as product_id, count(*) over (partition by a.id) as n
    from abc_price_list_items a
    join products p on p.is_active and upper(p.manufacturer_sku) = upper(a.item_number)
    where a.product_id is null and coalesce(a.item_number,'') <> ''
  ), upd as (
    update abc_price_list_items a
    set product_id = hits.product_id, product_match_type = 'manufacturer_sku'
    from hits where a.id = hits.source_id and hits.n = 1 and a.product_id is null
    returning 1
  ) select count(*) into v_applied from upd;

  -- Candidates for everything still unbound, both sources. Colour keys are
  -- read from the STORED columns; calling vendor_desc_color_key here would be
  -- inlined into the join and evaluated per pair.
  with lines as (
    select 'abc_price_list_items'::text src, a.id::text src_id, 'abc-supply'::text vendor,
           a.item_number, a.description descr, a.color_key ckey
    from abc_price_list_items a
    where a.product_id is null and coalesce(a.description,'') <> ''
    union all
    select 'price_agreement_items', pai.id::text, coalesce(lower(v.name),'vendor'),
           pai.raw_item_number, pai.raw_description, pai.color_key
    from price_agreement_items pai
    join price_agreements pa on pa.id = pai.agreement_id
    left join vendors v on v.id = pa.vendor_id
    where pai.product_id is null and coalesce(pai.raw_description,'') <> ''
  ), evidence as (
    select l.item_number, count(*) lines, round(sum(l.quantity * l.unit_price),2) amt
    from v_invoice_audit_line l where coalesce(l.item_number,'') <> '' group by 1
  ), paired as (
    select l.src, l.src_id, l.vendor, l.item_number, l.descr,
           p.id product_id, p.name product_name,
           case
             when coalesce(l.item_number,'') <> '' and upper(p.manufacturer_sku) = upper(l.item_number) then 'manufacturer_sku'
             when coalesce(l.ckey,'') <> '' and l.ckey = p.color_key then 'colour_key'
             else 'description'
           end tier,
           round(similarity(lower(l.descr), lower(p.name))::numeric, 3) sim
    from lines l
    join products p on p.is_active and (
         (coalesce(l.item_number,'') <> '' and upper(p.manufacturer_sku) = upper(l.item_number))
      or (coalesce(l.ckey,'') <> '' and l.ckey = p.color_key)
      -- 0.45 mirrors the ABC pricing arm. Here it only ever SUGGESTS, so a
      -- loose match costs a reviewer a click rather than money.
      or (lower(l.descr) % lower(p.name) and similarity(lower(l.descr), lower(p.name)) >= 0.45))
  ), counted as (
    select pr.*, count(*) over (partition by pr.src, pr.src_id)::int siblings, e.lines ev_lines, e.amt ev_amt
    from paired pr left join evidence e on e.item_number = pr.item_number
  ), ins as (
    insert into product_match_candidate as c (
      source_table, source_id, vendor_slug, item_number, line_description,
      proposed_product_id, product_name, match_tier, similarity_score,
      sibling_candidates, evidence_lines, evidence_amount, refreshed_at, last_run_id)
    select src, src_id, vendor, item_number, descr, product_id, product_name, tier, sim,
           siblings, ev_lines, ev_amt, clock_timestamp(), v_run
    from counted
    on conflict (source_table, source_id, proposed_product_id) do update set
      product_name = excluded.product_name, match_tier = excluded.match_tier,
      similarity_score = excluded.similarity_score, sibling_candidates = excluded.sibling_candidates,
      evidence_lines = excluded.evidence_lines, evidence_amount = excluded.evidence_amount,
      refreshed_at = clock_timestamp(), last_run_id = v_run
    returning 1
  ) select count(*) into v_up from ins;

  -- Retire by run id, never by timestamp: inside plpgsql the row default now()
  -- is transaction time and would make the run delete its own inserts.
  delete from product_match_candidate c
  where c.review_status = 'pending' and c.last_run_id is distinct from v_run;
  get diagnostics v_ret = row_count;

  return query select v_up, v_ret, v_applied;
end $function$;

comment on function public.refresh_product_match_candidates() is
  'Re-derives price-line -> PE product bindings. Auto-applies ONLY an exact manufacturer_sku match resolving to a single product. Everything else is queued in product_match_candidate for human review. Safe to re-run.';

create or replace view public.v_product_match_review as
select c.id, c.source_table, c.source_id, c.vendor_slug, c.item_number, c.line_description,
       c.proposed_product_id, c.product_name,
       t.major_group, t.category, t.product_type,
       c.match_tier, c.similarity_score, c.sibling_candidates,
       c.evidence_lines, c.evidence_amount,
       c.review_status, c.reviewed_by, c.reviewed_at, c.review_note
from product_match_candidate c
join products p on p.id = c.proposed_product_id
left join product_taxonomy t on t.id = p.taxonomy_id
order by
  case c.match_tier when 'manufacturer_sku' then 1 when 'colour_key' then 2 else 3 end,
  c.evidence_amount desc nulls last, c.similarity_score desc nulls last;

comment on view public.v_product_match_review is
  'Categorization queue, strongest evidence first. evidence_amount is the invoiced dollars behind the line - what categorizing it would bring under management.';

commit;

-- Bootstrap order matters: colour terms, then colour keys, then candidates.
--   select refresh_product_color_terms();
--   select * from refresh_color_keys();
--   select * from refresh_product_match_candidates();
--
-- 2026-08-21 first run: 748 auto-applied, 956 candidates over 427 lines.
