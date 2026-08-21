-- 256 — PEC-226: give the SRS description-only price sheets item numbers.
--
-- Context: docs/101 §2. The vendor price path matches EXACTLY on
--   pai.raw_item_number = line.item_number
--   OR pai.raw_description_normalized = lower(line.item_description)
-- and the two SRS price sheets (Melissa TX Level 4, Colorado 2026-08-14) are
-- description-only — 198 negotiated prices resolving zero invoice lines since
-- 2026-02-16.
--
-- Chris, 2026-08-21: "Backfill raw_item_number on the SRS Melissa and Colorado
-- price sheets from invoice history, holding anything below an exact-token
-- match for my review."  That is exactly the split this migration implements:
--
--   AUTO-APPLIED  the sheet description and the invoice description's product
--                 head are the SAME TOKEN SET, the price UOMs agree, and the
--                 sheet row maps to exactly ONE item number. That is identity,
--                 not inference. 8 rows (4 Melissa + 4 Colorado).
--
--   HELD          everything else lands in price_agreement_item_candidates
--                 with its evidence and prices NOTHING until a human approves.
--
-- Why the line sits there: the raw candidate pool contains matches like
-- 'IKO HIP & RIDGE' → TAMHRARRBK ('TAMKO HIP & RIDGE RUSTIC BLACK') — a
-- different manufacturer — and 'COIL ROOFING NAILS 1-1/2"' → TOPCOIL114, a
-- 1-1/4" nail. These feed credit-memo claims sent to a vendor. A wrong price
-- is worse than no price.
--
-- Two structural facts the design has to respect:
--   * SRS invoice descriptions are pipe-delimited —
--     '<PRODUCT + COLOUR> | <attributes> | <pack size>'. Only the first
--     segment names the product.
--   * One price-sheet row legitimately covers MANY item numbers: the sheet
--     says 'IKO CAMBRIDGE AR', the invoices carry IKOCAWWN / IKOCADBKN /
--     IKOCACHGN / IKOCADBRN / IKOCAECN / IKOCADGN. raw_item_number is a single
--     column, so a colour family cannot be expressed by writing one value into
--     it — approving that family means creating one row per colour. The
--     candidate table records sibling_candidates so the reviewer sees this.
--
-- Additive and idempotent (hard rule 1). Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1 · Token helpers
-- ---------------------------------------------------------------------------

create or replace function public.vendor_desc_tokens(p_text text)
returns text[] language sql immutable set search_path to 'public' as $$
  select array_remove(
           string_to_array(
             regexp_replace(
               regexp_replace(upper(coalesce(p_text, '')), '[^A-Z0-9&/\-\. ]', ' ', 'g'),
             '\s+', ' ', 'g'),
           ' '),
         '');
$$;

comment on function public.vendor_desc_tokens(text) is
  'Normalises a vendor item description to an uppercase token array: punctuation to spaces, whitespace collapsed. Keeps & / - . because they carry meaning in SRS descriptions (ICE & WATER, 1-1/4", 10.1 OZ).';

create or replace function public.vendor_desc_token_key(p_text text)
returns text language sql immutable set search_path to 'public' as $$
  select array_to_string(
           array(select distinct t from unnest(public.vendor_desc_tokens(p_text)) t order by t),
         ' ');
$$;

comment on function public.vendor_desc_token_key(text) is
  'Order-free deduplicated token signature of a description. Equality of two keys is exact-token equality - the only tier PEC-226 auto-applies.';

create or replace function public.vendor_desc_head(p_text text)
returns text language sql immutable set search_path to 'public' as $$
  select nullif(trim(split_part(coalesce(p_text, ''), '|', 1)), '');
$$;

comment on function public.vendor_desc_head(text) is
  'First pipe-delimited segment of an SRS invoice description - the product + colour. Later segments are pack size, attributes, and credit-memo annotations.';

-- Tokens the SRS invoice product head never carries, so they cannot be
-- required for a match. Everything dropped is recorded on the candidate:
-- ignoring AR vs IR is precisely the assumption a human must sign off on.
create or replace function public.vendor_desc_core_tokens(p_text text)
returns text[] language sql immutable set search_path to 'public' as $$
  select array(
    select t from unnest(public.vendor_desc_tokens(p_text)) t
    where t !~ '^(AR|IR|CLASS|SPECIFIC|COLORS|AND|X)$'
      and t !~ '^[0-9]+(\.[0-9]+)?$'
      and t !~ '^(BD|SQ|LF|RL|PC|EA|BX|PAL|BKT|CTN|OZ|M|MIL)/(BD|SQ|LF|RL|PC|EA|BX|PAL|BKT|CTN|OZ|M)$'
  );
$$;

comment on function public.vendor_desc_core_tokens(text) is
  'Sheet description tokens minus grade qualifiers and pack-size noise. Price sheets say "IKO CAMBRIDGE AR 3 BD/SQ"; the invoice head says "IKO CAMBRIDGE WEATHERWOOD". The core is what both can share.';

create or replace function public.vendor_desc_dropped_tokens(p_text text)
returns text[] language sql immutable set search_path to 'public' as $$
  select array(
    select t from unnest(public.vendor_desc_tokens(p_text)) t
    where t ~ '^(AR|IR|CLASS|SPECIFIC|COLORS|AND|X)$'
       or t ~ '^[0-9]+(\.[0-9]+)?$'
       or t ~ '^(BD|SQ|LF|RL|PC|EA|BX|PAL|BKT|CTN|OZ|M|MIL)/(BD|SQ|LF|RL|PC|EA|BX|PAL|BKT|CTN|OZ|M)$'
  );
$$;

comment on function public.vendor_desc_dropped_tokens(text) is
  'The complement of vendor_desc_core_tokens - what a candidate had to ignore to match. Stored on every candidate so the reviewer sees the assumption.';

-- ---------------------------------------------------------------------------
-- 2 · The review queue. Nothing here prices anything.
-- ---------------------------------------------------------------------------

create table if not exists public.price_agreement_item_candidates (
  id                       uuid primary key default gen_random_uuid(),
  agreement_id             uuid not null references public.price_agreements(id) on delete cascade,
  agreement_item_id        uuid not null references public.price_agreement_items(id) on delete cascade,
  sheet_description        text not null,
  sheet_price_uom          text,
  negotiated_price         numeric,
  proposed_item_number     text not null,
  invoice_description_head text,
  invoice_price_uom        text,
  match_tier               text not null,
  shared_tokens            integer,
  sheet_token_count        integer,
  invoice_token_count      integer,
  uom_agrees               boolean,
  evidence_lines           integer,
  evidence_amount          numeric,
  sibling_candidates       integer,
  sheet_qualifiers_dropped text[],
  review_status            text not null default 'pending',
  reviewed_by              text,
  reviewed_at              timestamptz,
  review_note              text,
  refreshed_at             timestamptz not null default now(),
  last_run_id              uuid,
  created_at               timestamptz not null default now()
);

alter table public.price_agreement_item_candidates
  add column if not exists sheet_qualifiers_dropped text[];
alter table public.price_agreement_item_candidates
  add column if not exists last_run_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'paic_match_tier_chk') then
    alter table public.price_agreement_item_candidates
      add constraint paic_match_tier_chk check (match_tier in (
        'exact_tokens_uom_mismatch',  -- core token subset, but the price UOMs disagree
        'colour_variant',             -- sheet row names a product line; invoice adds a colour
        'token_overlap'               -- brand agrees, partial overlap only — weakest
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'paic_review_status_chk') then
    alter table public.price_agreement_item_candidates
      add constraint paic_review_status_chk check (review_status in ('pending','approved','rejected'));
  end if;
end $$;

create unique index if not exists paic_item_proposed_uniq
  on public.price_agreement_item_candidates (agreement_item_id, proposed_item_number);
create index if not exists paic_pending_idx
  on public.price_agreement_item_candidates (review_status, agreement_id)
  where review_status = 'pending';
create index if not exists paic_last_run_idx
  on public.price_agreement_item_candidates (last_run_id);

comment on table public.price_agreement_item_candidates is
  'PEC-226 review queue: proposed description->item-number bindings for description-only vendor price sheets. Rows here price NOTHING. Only an approved row may be promoted into price_agreement_items by a human.';
comment on column public.price_agreement_item_candidates.match_tier is
  'How the candidate was derived. exact_tokens_uom_mismatch = core tokens match but the price UOMs disagree, so the negotiated price cannot be applied without a conversion factor. colour_variant = the sheet row names a product line and the invoice adds a colour. token_overlap = partial overlap only.';
comment on column public.price_agreement_item_candidates.sibling_candidates is
  'How many item numbers this same sheet row proposes. > 1 means the row covers a colour family, and approving it needs one price_agreement_items row per colour, not a single raw_item_number.';
comment on column public.price_agreement_item_candidates.sheet_qualifiers_dropped is
  'Tokens removed from the sheet description before the subset test - grade qualifiers (AR/IR/CLASS) and pack-size noise (3, BD/SQ). Disclosed because ignoring AR vs IR is exactly the kind of assumption a human must sign off on.';
comment on column public.price_agreement_item_candidates.last_run_id is
  'Identifies the refresh run that last proposed this candidate. A pending row not carrying the current run id is no longer proposed and is retired. Never retire by timestamp here: inside plpgsql, the row default now() is TRANSACTION time and is therefore EARLIER than a clock_timestamp() captured at function entry, so a timestamp comparison makes a run delete its own inserts.';

-- ---------------------------------------------------------------------------
-- 3 · Re-runnable derivation. New invoices refresh the evidence without a new
--     migration; human review decisions are never overwritten.
-- ---------------------------------------------------------------------------

drop function if exists public.refresh_price_agreement_item_candidates(uuid);

create or replace function public.refresh_price_agreement_item_candidates(p_agreement_id uuid default null)
returns table (candidates_upserted integer, candidates_retired integer, exact_auto_applied integer)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_upserted integer := 0;
  v_retired  integer := 0;
  v_applied  integer := 0;
  v_run      uuid := gen_random_uuid();
begin
  -- ── Auto-apply first, so bound rows never enter the review queue.
  with sheet as (
    select pai.id, pai.agreement_id, pai.price_uom,
           public.vendor_desc_token_key(pai.raw_description) as tok_key
    from price_agreement_items pai
    where pai.raw_item_number is null and coalesce(pai.raw_description,'') <> ''
      and (p_agreement_id is null or pai.agreement_id = p_agreement_id)
  ), heads as (
    select vil.vendor_id, vil.item_number,
           public.vendor_desc_token_key(public.vendor_desc_head(vil.item_description)) as tok_key,
           mode() within group (order by vil.price_uom) as price_uom
    from vendor_invoice_lines vil
    where coalesce(vil.item_number,'') <> '' and public.vendor_desc_head(vil.item_description) is not null
    group by 1,2,3
  ), hits as (
    select s.id as agreement_item_id, h.item_number, count(*) over (partition by s.id) as n_items
    from sheet s join heads h
      -- vendor silo: never resolve a price across vendors.
      on h.vendor_id = (select vendor_id from price_agreements where id = s.agreement_id)
     and h.tok_key = s.tok_key
     -- UOM contract (docs/46): a price only transfers when the pricing UOMs agree.
     and h.price_uom is not distinct from s.price_uom
  ), upd as (
    update price_agreement_items pai
    set raw_item_number = hits.item_number, match_type = 'exact', match_confidence = 100,
        needs_review = false,
        notes = trim(both ' ' from coalesce(pai.notes,'') ||
                ' [PEC-226: raw_item_number derived by exact token-set equality with the vendor invoice description head; price UOM agrees.]'),
        updated_at = now()
    from hits
    -- n_items = 1: bind only when the sheet row has ONE possible target.
    where pai.id = hits.agreement_item_id and hits.n_items = 1 and pai.raw_item_number is null
    returning 1
  ) select count(*) into v_applied from upd;

  -- ── Candidates for everything still unbound.
  with sheet as (
    select pai.id, pai.agreement_id, pai.raw_description, pai.price_uom, pai.negotiated_price,
           public.vendor_desc_tokens(pai.raw_description)         as tok,
           public.vendor_desc_core_tokens(pai.raw_description)    as ctok,
           public.vendor_desc_dropped_tokens(pai.raw_description) as dropped
    from price_agreement_items pai
    where pai.raw_item_number is null and coalesce(pai.raw_description,'') <> ''
      and (p_agreement_id is null or pai.agreement_id = p_agreement_id)
  ), heads as (
    select vil.vendor_id, vil.item_number,
           public.vendor_desc_head(vil.item_description) as head,
           public.vendor_desc_tokens(public.vendor_desc_head(vil.item_description)) as tok,
           mode() within group (order by vil.price_uom) as price_uom,
           count(*) as evidence_lines, round(sum(vil.extended_price),2) as evidence_amount
    from vendor_invoice_lines vil
    where coalesce(vil.item_number,'') <> '' and public.vendor_desc_head(vil.item_description) is not null
    group by 1,2,3,4
  ), paired as (
    select s.id as agreement_item_id, s.agreement_id, s.raw_description, s.price_uom as sheet_uom,
           s.negotiated_price, s.dropped, h.item_number, h.head, h.price_uom as invoice_uom,
           h.evidence_lines, h.evidence_amount,
           cardinality(s.tok) as sheet_token_count, cardinality(h.tok) as invoice_token_count,
           cardinality(array(select unnest(s.ctok) intersect select unnest(h.tok))) as shared_tokens,
           (s.ctok <@ h.tok) as core_subset,
           (s.price_uom is not distinct from h.price_uom) as uom_agrees
    from sheet s join heads h
      on h.vendor_id = (select vendor_id from price_agreements where id = s.agreement_id)
     -- BRAND GATE: the first core token must agree. Without it the pool fills
     -- with cross-manufacturer garbage ('IKO HIP & RIDGE' -> a TAMKO item).
     -- This single clause cut the queue from 1,115 rows to 500.
     and s.ctok[1] = h.tok[1]
     and cardinality(s.ctok) >= 2
     and cardinality(array(select unnest(s.ctok) intersect select unnest(h.tok))) >= 2
  ), tiered as (
    select p.*, case when p.core_subset and not p.uom_agrees then 'exact_tokens_uom_mismatch'
                     when p.core_subset then 'colour_variant' else 'token_overlap' end as match_tier
    from paired p
  ), counted as (
    select t.*, count(*) over (partition by t.agreement_item_id)::int as sibling_candidates from tiered t
  ), ins as (
    insert into price_agreement_item_candidates as c (
      agreement_id, agreement_item_id, sheet_description, sheet_price_uom, negotiated_price,
      proposed_item_number, invoice_description_head, invoice_price_uom, match_tier,
      shared_tokens, sheet_token_count, invoice_token_count, uom_agrees,
      evidence_lines, evidence_amount, sibling_candidates, sheet_qualifiers_dropped,
      refreshed_at, last_run_id)
    select agreement_id, agreement_item_id, raw_description, sheet_uom, negotiated_price,
           item_number, head, invoice_uom, match_tier, shared_tokens, sheet_token_count,
           invoice_token_count, uom_agrees, evidence_lines, evidence_amount, sibling_candidates,
           dropped, clock_timestamp(), v_run
    from counted
    on conflict (agreement_item_id, proposed_item_number) do update set
      -- evidence refreshes as invoices land; the human decision does not.
      invoice_description_head = excluded.invoice_description_head,
      invoice_price_uom = excluded.invoice_price_uom, match_tier = excluded.match_tier,
      shared_tokens = excluded.shared_tokens, sheet_token_count = excluded.sheet_token_count,
      invoice_token_count = excluded.invoice_token_count, uom_agrees = excluded.uom_agrees,
      evidence_lines = excluded.evidence_lines, evidence_amount = excluded.evidence_amount,
      sibling_candidates = excluded.sibling_candidates,
      sheet_qualifiers_dropped = excluded.sheet_qualifiers_dropped,
      refreshed_at = clock_timestamp(), last_run_id = v_run
    returning 1
  ) select count(*) into v_upserted from ins;

  -- Retire PENDING candidates this run no longer proposes. Reviewed rows are
  -- the human record and are never touched. See the last_run_id comment for
  -- why this is not a timestamp comparison.
  delete from price_agreement_item_candidates c
  where c.review_status = 'pending'
    and c.last_run_id is distinct from v_run
    and (p_agreement_id is null or c.agreement_id = p_agreement_id);
  get diagnostics v_retired = row_count;

  return query select v_upserted, v_retired, v_applied;
end;
$function$;

comment on function public.refresh_price_agreement_item_candidates(uuid) is
  'PEC-226. Re-derives description->item-number evidence for description-only price sheets. Auto-applies ONLY exact token-set equality with an agreeing price UOM and a unique target. Everything else is queued in price_agreement_item_candidates, brand-gated and tiered, for human review. Safe to re-run: reviewed rows are preserved, stale pending rows are retired.';

-- ---------------------------------------------------------------------------
-- 4 · Run it for the two SRS description-only sheets.
--     2026-08-21 result: 8 auto-applied (4 + 4), 500 candidates queued
--     (21 colour_variant, 3 exact_tokens_uom_mismatch, 476 token_overlap).
-- ---------------------------------------------------------------------------

select * from public.refresh_price_agreement_item_candidates('df0bb65a-4e01-4f43-9d85-422eb46bfcd9'::uuid);
select * from public.refresh_price_agreement_item_candidates('9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34'::uuid);

-- ---------------------------------------------------------------------------
-- 5 · Read surface for the review, strongest evidence first.
-- ---------------------------------------------------------------------------

create or replace view public.v_price_agreement_item_review as
select c.id,
       pa.version_label as agreement,
       v.name           as vendor,
       c.sheet_description, c.negotiated_price, c.sheet_price_uom,
       c.proposed_item_number, c.invoice_description_head, c.invoice_price_uom,
       c.match_tier, c.uom_agrees, c.sheet_qualifiers_dropped, c.sibling_candidates,
       c.evidence_lines, c.evidence_amount,
       c.shared_tokens, c.sheet_token_count, c.invoice_token_count,
       c.review_status, c.reviewed_by, c.reviewed_at, c.review_note
from price_agreement_item_candidates c
join price_agreements pa on pa.id = c.agreement_id
left join vendors v      on v.id  = pa.vendor_id
order by
  case c.match_tier when 'exact_tokens_uom_mismatch' then 1 when 'colour_variant' then 2 else 3 end,
  c.evidence_amount desc nulls last;

comment on view public.v_price_agreement_item_review is
  'PEC-226 review surface. evidence_amount is the invoiced dollars behind the proposed item number - what approving this row would make auditable. sibling_candidates > 1 means the sheet row covers a colour family.';

commit;
