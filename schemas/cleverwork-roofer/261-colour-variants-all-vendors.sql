-- 261 — colour variants priced the same way for every vendor.
--
-- Chris, 2026-08-21: "please handle color variants the same for all vendors
-- (review ABC to acquire this rule)."
--
-- ── What ABC's rule actually is, and why it was not copied verbatim ────────
--
-- ABC's arm (migrations 201/217/233) is a trigram fallback:
--     similarity(pli.description_normalized, lower(l.item_description)) >= 0.45
-- It works on ABC because ABC price lists carry item numbers on 1,292 of 1,690
-- rows, so the exact arm does the heavy lifting and trigram only mops up.
--
-- Applied verbatim to the SRS description-only sheets — where there is no
-- exact arm to carry the load — it was measured on real invoice lines and
-- produced, among 21 matches:
--
--   TOP SHIELD STEEL FLASHING SHINGLES BLACK   priced off
--   TOP SHIELD STEEL A ROOF EDGE BLACK         at $7.80  ->  +1,630.8% variance
--   TOP SHIELD STEEL GUTTER APRON TERITONE     off SR ROOF EDGE  ->  +22.9%
--
-- Those are different products, and that variance feeds a credit-memo claim
-- sent to a vendor. "A wrong price is worse than no price" (docs/101).
--
-- ── The rule this migration installs instead ──────────────────────────────
--
-- Two descriptions are colour variants when they are the SAME PRODUCT with the
-- colour removed:
--
--     vendor_desc_color_key(a) = vendor_desc_color_key(b)
--
-- where the key is the product head (first pipe-delimited segment — SRS
-- invoice descriptions are '<PRODUCT + COLOUR> | <attributes> | <pack>';
-- descriptions with no pipe pass through whole, so ABC-shaped text works
-- identically), minus grade/pack qualifiers, minus colour terms.
--
-- The colour vocabulary is read from the PE product file — product_color_variants
-- split into words, plus base colour words — NOT hardcoded, so it grows with
-- the catalog.
--
-- Measured on the same lines:
--   IKO CAMBRIDGE AR                                       -> CAMBRIDGE IKO
--   IKO CAMBRIDGE CHARCOAL GRAY CLASS 3 IMPACT RESISTANT   -> CAMBRIDGE IKO   MATCH
--   IKO CAMBRIDGE WEATHERWOOD | CLASS 3 IMPACT RESISTANT…  -> CAMBRIDGE IKO   MATCH
--   TOP SHIELD STEEL FLASHING SHINGLES BLACK  -> FLASHING SHIELD SHINGLES STEEL TOP
--   TOP SHIELD STEEL A ROOF EDGE BLACK …      -> A EDGE GALVANIZED KLAUER ROOF …   NO MATCH
--
-- Result: SRS priced lines 78 -> 93, unpriced value $87,394 -> $56,701, and the
-- colour arm matched exactly one product family — IKOCACHGN / IKOCADBKN /
-- IKOCADBRN / IKOCADGN / IKOCAWWN, five colours of IKO Cambridge, 15 lines.
-- Worst variance on the board stays 128.18% (a genuine Englewood coil-nail
-- finding), not the 1,630% the trigram arm invented.
--
-- ── Still outstanding, needs Chris ────────────────────────────────────────
--
-- ABC keeps its 0.45 trigram arm for now. Making the two genuinely identical
-- means moving ABC onto this colour rule as well — but ABC has 2,263 priced
-- lines today and changing its matcher moves live claim numbers, so that is a
-- deliberate decision rather than a side effect of this migration.

begin;

-- 1 · Colour vocabulary, from the PE product file.
create table if not exists public.product_color_term (
  term        text primary key,
  source      text not null default 'product_color_variants',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.product_color_term is
  'Single-word colour terms used to decide whether two item descriptions are the same product in different colours. Seeded from product_color_variants.color_name (split into words) plus base colour words the catalog does not happen to carry. Refresh with refresh_product_color_terms().';

create or replace function public.refresh_product_color_terms()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_n integer;
begin
  insert into product_color_term (term, source)
  select distinct upper(t), 'product_color_variants'
  from product_color_variants v,
       lateral unnest(string_to_array(regexp_replace(upper(coalesce(v.color_name,'')), '[^A-Z ]', ' ', 'g'), ' ')) t
  where length(t) >= 3
  on conflict (term) do nothing;

  insert into product_color_term (term, source) values
    ('BLACK','base'),('WHITE','base'),('GRAY','base'),('GREY','base'),('BROWN','base'),
    ('BRONZE','base'),('TAN','base'),('BEIGE','base'),('RED','base'),('GREEN','base'),
    ('BLUE','base'),('COPPER','base'),('SILVER','base'),('IVORY','base'),('CREAM','base'),
    ('CHARCOAL','base'),('SLATE','base'),('CEDAR','base'),('WEATHERWOOD','base'),
    ('WEATHERED','base'),('DRIFTWOOD','base'),('TERRATONE','base'),('TERITONE','base'),
    ('MILL','base'),('CLEAR','base'),('SAND','base'),('SANDSTONE','base'),('ALMOND','base'),
    ('WICKER','base'),('LINEN','base'),('PEWTER','base'),('ONYX','base'),('EARTHTONE','base'),
    ('DUAL','base'),('SUMMIT','base'),('HARVEST','base'),('AUTUMN','base'),('DESERT','base'),
    ('ANTIQUE','base'),('VINTAGE','base'),('RUSTIC','base'),('NATURAL','base'),('MIDNIGHT','base'),
    ('BRILLIANT','base'),('MOIRE','base'),('ABYSS','base'),('STORM','base'),('STONE','base'),
    ('WOOD','base'),('OAK','base'),('TEAK','base'),('HEATHER','base'),('BLEND','base'),
    ('CHESTNUT','base'),('GRANITE','base'),('PRIMED','base'),('COTTA','base'),('TERRA','base'),
    ('SIENNA','base'),('SNOWSCAPE','base'),('MAVERICK','base'),('ROYAL','base'),('DOVE','base'),
    ('MEDIUM','base'),('DARK','base'),('LIGHT','base'),('TILE','base'),('BRNZE','base'),
    ('BLND','base'),('BROWNSTONE','base'),('FROSTONE','base'),('ESTATE','base')
  on conflict (term) do nothing;

  select count(*) into v_n from product_color_term where is_active;
  return v_n;
end $$;

comment on function public.refresh_product_color_terms() is
  'Re-seeds product_color_term from the PE product file. Additive - a term is never removed automatically, because dropping one silently un-matches colour variants that were previously priced.';

select public.refresh_product_color_terms();

-- 2 · IMPACT / RESISTANT join the qualifier strip. SRS quotes carry them inline
--     in the product name; invoices carry them after the pipe. Leaving them in
--     makes the two sides of the same product look different.
create or replace function public.vendor_desc_core_tokens(p_text text)
returns text[] language sql immutable set search_path to 'public' as $$
  select array(
    select t from unnest(public.vendor_desc_tokens(p_text)) t
    where t !~ '^(AR|IR|CLASS|SPECIFIC|COLORS|AND|X|IMPACT|RESISTANT)$'
      and t !~ '^[0-9]+(\.[0-9]+)?$'
      and t !~ '^(BD|SQ|LF|RL|PC|EA|BX|PAL|BKT|CTN|OZ|M|MIL)/(BD|SQ|LF|RL|PC|EA|BX|PAL|BKT|CTN|OZ|M)$'
  );
$$;

create or replace function public.vendor_desc_dropped_tokens(p_text text)
returns text[] language sql immutable set search_path to 'public' as $$
  select array(
    select t from unnest(public.vendor_desc_tokens(p_text)) t
    where t ~ '^(AR|IR|CLASS|SPECIFIC|COLORS|AND|X|IMPACT|RESISTANT)$'
       or t ~ '^[0-9]+(\.[0-9]+)?$'
       or t ~ '^(BD|SQ|LF|RL|PC|EA|BX|PAL|BKT|CTN|OZ|M|MIL)/(BD|SQ|LF|RL|PC|EA|BX|PAL|BKT|CTN|OZ|M)$'
  );
$$;

create or replace function public.vendor_desc_color_key(p_text text)
returns text language sql stable set search_path to 'public' as $$
  select array_to_string(array(
    select distinct t
    from unnest(public.vendor_desc_core_tokens(public.vendor_desc_head(p_text))) t
    where not exists (select 1 from product_color_term c where c.is_active and c.term = t)
    order by t
  ), ' ');
$$;

comment on function public.vendor_desc_color_key(text) is
  'Colour-blind signature of an item description: product head, minus grade/pack qualifiers, minus colour terms. Equality of two keys means same product, different colour - a far tighter statement than 0.45 trigram similarity, which matched STEEL FLASHING SHINGLES to STEEL A ROOF EDGE and would have claimed a 1,630% overcharge.';

-- 3 · Patch the vendor arm of v_invoice_audit_line in place.
--     The view is a UNION of an ABC block and a vendor block, ~8k characters;
--     re-typing it would risk transcription drift in the block NOT being
--     changed. The anchors below are unique to the vendor LATERAL, and the
--     DO block fails loudly rather than silently no-op'ing if they move.
do $do$
declare
  v_def text := pg_get_viewdef('v_invoice_audit_line'::regclass, true);
  a_join text := 'pai.raw_item_number = vl.item_number OR pai.raw_description_normalized = lower(vl.item_description))';
  b_join text := 'pai.raw_item_number = vl.item_number OR pai.raw_description_normalized = lower(vl.item_description) OR pai.raw_description IS NOT NULL AND vendor_desc_color_key(pai.raw_description) <> ''''::text AND vendor_desc_color_key(pai.raw_description) = vendor_desc_color_key(vl.item_description))';
  a_ord text := 'ORDER BY (upper(COALESCE(pai.price_uom, ''''::text)) = upper(COALESCE(vl.price_uom, ''''::text))) DESC, pai.negotiated_price';
  b_ord text := 'ORDER BY (upper(COALESCE(pai.price_uom, ''''::text)) = upper(COALESCE(vl.price_uom, ''''::text))) DESC, (CASE WHEN pai.raw_item_number = vl.item_number THEN 1 WHEN pai.raw_description_normalized = lower(vl.item_description) THEN 2 ELSE 3 END), pai.negotiated_price';
begin
  if position('vendor_desc_color_key' in v_def) > 0 then
    raise notice 'colour arm already present; nothing to patch';
    return;
  end if;
  if position(a_join in v_def) = 0 then raise exception 'vendor JOIN anchor not found'; end if;
  if position(a_ord  in v_def) = 0 then raise exception 'vendor ORDER BY anchor not found'; end if;
  v_def := replace(v_def, a_join, b_join);
  v_def := replace(v_def, a_ord,  b_ord);
  execute 'create or replace view public.v_invoice_audit_line as ' || v_def;
end $do$;

commit;

-- The match_rank in the ORDER BY is what makes the colour arm a FALLBACK:
--   1 = exact item number, 2 = exact description, 3 = colour variant.
-- With LIMIT 1, a colour-variant price is only ever used when no exact match
-- exists in the office's governing book.
