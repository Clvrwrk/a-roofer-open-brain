-- 97-branch-contact-projection.sql
-- Fill vendor_branches contacts from sources we ALREADY hold (don't crawl the ABC site — it has
-- no emails). The official ABC Location API mirror abc_vendor_branches.manager_json carries
-- manager firstName/lastName/EMAIL (696/720). vendor_branches (756, canonical) and the mirror
-- were populated semi-independently, so we build a TIERED crosswalk and project.
--
-- Verified read-only (2026-06-17): of 54 in-scope branches, 45 matched on high-confidence keys;
-- the other 9 were just un-padded branch numbers ("49" vs API "049") + one zip-bearing slug
-- ("denver-CO-80216-1333" -> API postal 80216-1333 / branch 617). With the zero-pad + zip tiers
-- below, ALL 54 in-scope branches resolve to an ABC manager email — 0 need Firecrawl.
--
-- Additive + idempotent (fills NULLs only). PROPOSED / NOT YET APPLIED — apply on a Supabase
-- branch first and VERIFY the in-scope 54 by hand before promoting. Firecrawl remains a fallback
-- only for branches genuinely absent from the ABC API or for non-ABC vendors (name/phone/hours,
-- never email). Sales-rep EMAIL stays a go-live task.

-- --- tiered crosswalk: vendor_branches.id -> best abc_vendor_branches match (prefer email-bearing) ---
create or replace view public.v_vendor_branch_abc_xref as
with ranked as (
  select
    vb.id            as vendor_branch_id,
    ab.id            as abc_id,
    ab.branch_number as abc_branch_number,
    ab.manager_json,
    ab.contact_json,
    case
      when vb.legacy_id     = ab.id                                                     then 1  -- seeded link
      when vb.branch_number = ab.branch_number                                         then 2  -- exact
      when vb.branch_number ~ '^[0-9]+$' and lpad(vb.branch_number,3,'0') = ab.branch_number then 3  -- zero-pad ("49"->"049")
      when left(ab.postal,5) = substring(vb.branch_number from '(\d{5})')               then 4  -- zip in slug
      else 5  -- lat/long ~1km
    end as match_rank,
    case
      when vb.legacy_id     = ab.id                                                     then 'legacy_id'
      when vb.branch_number = ab.branch_number                                         then 'branch_number'
      when vb.branch_number ~ '^[0-9]+$' and lpad(vb.branch_number,3,'0') = ab.branch_number then 'branch_number_padded'
      when left(ab.postal,5) = substring(vb.branch_number from '(\d{5})')               then 'zip'
      else 'latlong'
    end as match_method
  from vendor_branches vb
  join abc_vendor_branches ab
    on  vb.legacy_id     = ab.id
    or  vb.branch_number = ab.branch_number
    or (vb.branch_number ~ '^[0-9]+$' and lpad(vb.branch_number,3,'0') = ab.branch_number)
    or (substring(vb.branch_number from '(\d{5})') is not null and left(ab.postal,5) = substring(vb.branch_number from '(\d{5})'))
    or (vb.latitude is not null and ab.latitude is not null
        and abs(vb.latitude  - ab.latitude)  < 0.01
        and abs(vb.longitude - ab.longitude) < 0.01)
)
select distinct on (vendor_branch_id)
  vendor_branch_id, abc_id, abc_branch_number, manager_json, contact_json, match_rank, match_method
from ranked
-- prefer a match that HAS an email, then the highest-confidence key
order by vendor_branch_id, ((manager_json->>'email') is null), match_rank;

-- --- project ABC branch-manager name + email into vendor_branches (NULLs only) ---
-- High-confidence first (tiers 1-3: id / exact / zero-pad). Run on staging, verify, then promote:
-- update public.vendor_branches vb
-- set manager_name  = coalesce(vb.manager_name,
--                       nullif(trim(concat_ws(' ', x.manager_json->>'firstName', x.manager_json->>'lastName')), '')),
--     manager_email = coalesce(vb.manager_email, x.manager_json->>'email'),
--     updated_at    = now()
-- from public.v_vendor_branch_abc_xref x
-- where x.vendor_branch_id = vb.id
--   and x.match_rank <= 3
--   and x.manager_json->>'email' is not null
--   and (vb.manager_email is null or vb.manager_name is null);
--
-- Then zip/latlong matches (tiers 4-5) — review the diff before running on the full set:
-- ... same UPDATE with x.match_rank in (4,5) ...

-- --- sales rep (name only) from negotiated agreements, per Chris ("use price_agreements.sales_rep for now") ---
-- update public.vendor_branches vb
-- set sales_rep_name = coalesce(vb.sales_rep_name, pa.sales_rep), updated_at = now()
-- from public.price_agreements pa
-- where pa.vendor_branch_id = vb.id and pa.is_active and pa.sales_rep is not null
--   and vb.sales_rep_name is null;

-- COVERAGE: in-scope 54/54 resolve to an ABC manager email via tiers 1-4. Across all 756 the
-- crosswalk is looser on tiers 4-5 (shared-zip / proximity) — verify before a full-set projection;
-- the in-scope set is hand-verifiable. Rep EMAIL remains a go-live task (not on site or Location API).
