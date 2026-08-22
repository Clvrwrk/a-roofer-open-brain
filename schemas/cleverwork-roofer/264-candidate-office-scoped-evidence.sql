-- 264 — PEC-226: office-scope the review queue's evidence.
--
-- WHY
-- ---
-- Migration 256's candidate generator aggregates vendor_invoice_lines by
-- (vendor_id, item_number) with NO branch or office constraint, and pairs a
-- sheet row to that pool on vendor_id alone. So `evidence_amount` — the column
-- v_price_agreement_item_review SORTS BY, and therefore the number a human
-- rules on — pools EVERY office's purchases of that item.
--
-- Measured on the 24 non-token_overlap candidates on 2026-08-22:
--
--   shown vendor-wide          own office
--   -----------------          ----------
--   $24,485  (5 candidates)    $13,631
--   $63,441  (18 candidates)   $0
--   $ 6,321  (1 candidate)     -$303.33   (a return line, nothing else)
--
-- The three top-ranked rows (IKOCAWWN $14,382.67, IKOCADBKN $10,794.67,
-- IKOCACHGN $6,320.67) are all DJWIC — Wichita, KS — purchases, displayed
-- against the Texas (SSMEL) and Colorado (AMSDE) sheets. Kansas already has
-- its own active agreement, 0049828559, binding IKOCACHGN at $92.00/SQ, which
-- is exactly what Kansas was invoiced. That spend is governed, not unpriced.
--
-- Binding raw_item_number is an identity statement and the audit office-
-- constrains separately (205/208/217), so nothing here created a cross-office
-- claim. The defect is that the review was RANKED and JUSTIFIED by a number
-- that does not describe what approving the row does.
--
-- WHAT THIS DOES
-- --------------
-- Adds own-office evidence beside the vendor-wide figure — never replacing it;
-- both are useful, and silently redefining a column a human already read once
-- is its own kind of drift. Ranks the review surface by the office figure.
--
-- Office resolution uses the same path as v_office_vendor_agreements (205):
--   agreement -> vendor_branch_id -> vendor_branches.pricing_territory_office_id
--   invoice   -> branch_key       -> vendor_branches.pricing_territory_office_id
--
-- MEASURED ACROSS THE WHOLE QUEUE after this migration ran (500 pending):
--   vendor-wide evidence   $304,869.76
--   own-office evidence     $31,721.37
--   358 of 500 candidates are worth exactly $0 to their own office.
-- The queue was overstating what was at stake by roughly ten times.
--
-- Additive and idempotent. Rule 1: no drops, no destructive statements.

begin;

-- ---------------------------------------------------------------------------
-- 1 · Columns. Nullable: an agreement with no vendor_branch_id has no office,
--     and that must read as "unknown", never as "$0".
-- ---------------------------------------------------------------------------

alter table public.price_agreement_item_candidates
  add column if not exists own_office_amount numeric;
alter table public.price_agreement_item_candidates
  add column if not exists own_office_lines integer;
alter table public.price_agreement_item_candidates
  add column if not exists office_id uuid;

comment on column public.price_agreement_item_candidates.own_office_amount is
  'Invoiced dollars behind proposed_item_number AT THE AGREEMENT''S OWN OFFICE — what approving this row actually makes auditable. NULL means the agreement carries no vendor_branch_id, so its office is unknown; that is not the same as zero. Compare against evidence_amount, which is vendor-wide across every office and is the figure the PEC-226 queue originally ranked by.';
comment on column public.price_agreement_item_candidates.own_office_lines is
  'Positive-value invoice lines behind own_office_amount. Returns and credit memos are excluded from the count but not from the amount, so a row showing 0 lines against a negative amount is evidence of a return and nothing else.';
comment on column public.price_agreement_item_candidates.office_id is
  'The agreement''s pricing-territory office, resolved via vendor_branch_id -> vendor_branches.pricing_territory_office_id (same path as v_office_vendor_agreements, migration 205).';

-- ---------------------------------------------------------------------------
-- 2 · Office-scoped evidence, as a view so the refresh function and any
--     backfill read one definition.
-- ---------------------------------------------------------------------------

create or replace view public.v_vendor_item_office_evidence as
select l.item_number,
       ivb.pricing_territory_office_id            as office_id,
       count(*) filter (where l.extended_price > 0)::int as pos_lines,
       round(sum(l.extended_price), 2)            as amount
from public.vendor_invoice_lines l
join public.vendor_invoices  i   on i.id = l.invoice_id
join public.vendor_branches  ivb on ivb.vendor_id = i.vendor_id
                                and ivb.branch_number = i.branch_key
where coalesce(l.item_number,'') <> ''
  and ivb.pricing_territory_office_id is not null
group by 1, 2;

comment on view public.v_vendor_item_office_evidence is
  'Invoiced lines and dollars per (vendor item number, PE pricing-territory office). The office-scoped counterpart to the vendor-wide pool migration 256 built its evidence from. Never join this to an agreement without also matching office_id — that join IS the office silo (migrations 205/208/217).';

commit;

begin;

-- ---------------------------------------------------------------------------
-- 3 · Teach the refresh function to stamp office-scoped evidence.
--     The generator itself is unchanged: candidates are still PROPOSED
--     vendor-wide, because a sheet row legitimately names a product the office
--     has simply not bought yet. What changes is that the row now carries what
--     it is worth AT ITS OWN OFFICE, so the review can rank on that.
-- ---------------------------------------------------------------------------

-- NOTE: the first cut of this function put the evidence lookup in the FROM with
-- a LEFT JOIN and then constrained it in WHERE. For a candidate with no
-- purchases at its own office the joined row is all-NULL, that predicate is
-- false, and the row was skipped — keeping a NULL, which this schema reads as
-- "office unknown". Wrong: the office IS known and the number is zero. Only
-- 148 of 500 rows stamped. Scalar subqueries instead, so the office gate lives
-- in the WHERE and the evidence lookup may legitimately return nothing.

create or replace function public.stamp_candidate_office_evidence(
  p_agreement_id uuid default null
) returns integer
language plpgsql
as $$
declare
  v_rows integer;
begin
  with agr as (
    select a.id, vb.pricing_territory_office_id as office_id
    from public.price_agreements a
    join public.vendor_branches vb on vb.id = a.vendor_branch_id
    where vb.pricing_territory_office_id is not null
  ), upd as (
    update public.price_agreement_item_candidates c
       set office_id         = agr.office_id,
           own_office_amount = coalesce((select e.amount
                                           from public.v_vendor_item_office_evidence e
                                          where e.office_id   = agr.office_id
                                            and e.item_number = c.proposed_item_number), 0),
           own_office_lines  = coalesce((select e.pos_lines
                                           from public.v_vendor_item_office_evidence e
                                          where e.office_id   = agr.office_id
                                            and e.item_number = c.proposed_item_number), 0)
      from agr
     where c.agreement_id = agr.id
       and (p_agreement_id is null or c.agreement_id = p_agreement_id)
    returning 1
  ) select count(*) into v_rows from upd;

  return v_rows;
end $$;

comment on function public.stamp_candidate_office_evidence(uuid) is
  'Fills own_office_amount / own_office_lines / office_id on the PEC-226 candidate queue from v_vendor_item_office_evidence. Safe to re-run; call after refresh_price_agreement_item_candidates(). A candidate whose agreement resolves to an office but whose item has no purchases there is stamped 0 - a real, known zero. Only an agreement with no vendor_branch_id (or a branch with no pricing territory) is left NULL, meaning the office is genuinely unknown. Do not collapse those two cases.';

select public.stamp_candidate_office_evidence();

-- ---------------------------------------------------------------------------
-- 4 · Review surface ranks on own-office dollars, and shows both figures side
--     by side so the gap between them is visible rather than inferred.
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
       c.review_status, c.reviewed_by, c.reviewed_at, c.review_note,
       -- APPENDED, not inserted: create or replace view cannot reorder or
       -- rename an existing view column (42P16). Consumers read by name, and
       -- the ORDER BY below is what actually drives the review.
       c.own_office_lines, c.own_office_amount,
       -- Disclosed, not hidden: a row whose evidence belongs to other offices
       -- is exactly the row a reviewer must not rank by evidence_amount.
       (coalesce(c.evidence_amount,0) - coalesce(c.own_office_amount,0)) as other_office_amount
from public.price_agreement_item_candidates c
join public.price_agreements pa on pa.id = c.agreement_id
left join public.vendors v      on v.id  = pa.vendor_id
order by
  case c.match_tier when 'exact_tokens_uom_mismatch' then 1 when 'colour_variant' then 2 else 3 end,
  c.own_office_amount desc nulls last,
  c.evidence_amount   desc nulls last;

comment on view public.v_price_agreement_item_review is
  'PEC-226 review surface, ranked by own_office_amount — the invoiced dollars behind the proposed item number AT THIS AGREEMENT''S OWN OFFICE, which is what approving the row makes auditable. evidence_amount is retained beside it as the vendor-wide pool the queue originally ranked by, and other_office_amount is the difference. A large other_office_amount means the item is bought, but by a different office against a different agreement — see migration 264. sibling_candidates > 1 means the sheet row covers a colour family and needs one price_agreement_items row per colour.';

commit;
