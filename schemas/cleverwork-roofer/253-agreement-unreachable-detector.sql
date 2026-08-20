-- 253 — an agreement that exists but reaches nothing. Detector + a corrected exposure gate.
-- Applied to prod 2026-08-20.
--
-- WHY: migration 252's `needs_ruling` keyed off `live_agreements = 0` — does the PAPERWORK
-- exist. That is the wrong question. Denver x SRS has a live, in-territory, 22-item
-- agreement (0049345641, S Denver / Englewood) that the office ring cannot reach, so the
-- coverage surface reports `priced_items = 0` for the pair. Keying on paperwork hid it.
-- The right question is whether the pair can actually be AUDITED — `priced_items = 0`.
--
-- CORRECTION (2026-08-20, after mig 248 landed from a parallel session): an earlier draft
-- of this header said the pair "prices NOTHING: $17,437.63 audits as no-price". That
-- OVERSTATED it. `priced_items = 0` is a fact about the OFFICE-RING path only. A separate
-- LINE-LEVEL path still prices some lines, and measuring it gives:
--     34 lines / $15,760.85 of line value on the 4 Denver x SRS invoices
--     11 lines / $2,296.05  DO carry a negotiated price
--     23 lines / $13,464.80 carry none          <-- the real un-priced figure
--      0 lines carry an agreement citation      <-- the defect mig 248 repairs for SRS
-- So the honest claim is $13,464.80 of line value un-priced, not $17,437.63, and the two
-- paths disagree with each other — which is itself the thing worth fixing.
--
-- ROOT CAUSE (worth reading before touching the agreement path):
-- `v_office_vendor_branch` still resolves an agreement to a branch by branch-number TEXT:
--
--     JOIN vendor_branches vb ON vb.geom IS NOT NULL AND st_contains(o.boundary, vb.geom)
--     LEFT JOIN v_vendor_agreement_current ag
--            ON ag.vendor_id = vb.vendor_id
--           AND ag.branch_key = NULLIF(regexp_replace(vb.branch_number,'^0+',''),'')
--
-- This is the LAST survivor of the text matching migration 244 removed from the pricing and
-- display paths. It fails in a way the FK cannot, and it needs BOTH halves to line up:
--   1. the branch must be geocoded (`geom IS NOT NULL`) to appear in the ring at all, and
--   2. the agreement's branch_key must equal that geocoded row's branch_number.
--
-- SRS South Denver exists as TWO rows for one physical branch:
--   AMSDE            no address, geocode pending, NO geom  -> holds the 22-item agreement
--   SBP-SOUTHDENVER  4393 S. Santa Fe Drive, geocoded, 6.1 mi -> is in the ring, holds nothing
-- Different numbers, so the text join never meets. Melissa (97 items) and Wichita (17) work
-- only because their duplicate rows happen to SHARE a branch_number — luck, not design.
--
-- All three active SRS agreements sit on rows with no coordinates. Two are one renamed row
-- away from silently pricing nothing.
--
-- NOT FIXED HERE, deliberately. Repointing the agreement join to vendor_branch_id is a
-- pricing-affecting change and earns the same equivalence proof migration 244 ran before it
-- switched (prove FK == text on every row, 0 disagreements, fingerprint unchanged). Merging
-- the duplicate rows is a branch-identity decision for a human — `vendor_branch_alias`
-- (migration 240) already encodes that boundary: a guess cannot become a fact. This
-- migration only makes the failure VISIBLE.

-- Detector: an active agreement whose branch cannot be reached by the ring join, with the
-- likely canonical twin named so a human can confirm the merge rather than hunt for it.
CREATE OR REPLACE VIEW public.v_agreement_unreachable AS
SELECT pa.id                AS agreement_id,
       pa.agreement_number,
       v.name               AS vendor_name,
       vb.id                AS held_by_branch_id,
       vb.branch_number     AS held_by_branch_number,
       vb.branch_name       AS held_by_branch_name,
       vb.city, vb.state,
       vb.geocode_status,
       (SELECT count(*) FROM public.price_agreement_items i WHERE i.agreement_id = pa.id) AS items,
       CASE WHEN vb.geom IS NULL THEN 'branch_not_geocoded'
            ELSE 'branch_outside_every_active_boundary' END AS reason,
       -- Same vendor, same city/state, geocoded: the row the agreement probably belongs on.
       (SELECT twin.id FROM public.vendor_branches twin
         WHERE twin.vendor_id = vb.vendor_id
           AND twin.id <> vb.id
           AND twin.geom IS NOT NULL
           AND lower(twin.city) = lower(vb.city)
           AND twin.state = vb.state
         ORDER BY twin.branch_name LIMIT 1) AS likely_canonical_branch_id,
       (SELECT twin.branch_number FROM public.vendor_branches twin
         WHERE twin.vendor_id = vb.vendor_id
           AND twin.id <> vb.id
           AND twin.geom IS NOT NULL
           AND lower(twin.city) = lower(vb.city)
           AND twin.state = vb.state
         ORDER BY twin.branch_name LIMIT 1) AS likely_canonical_branch_number
  FROM public.price_agreements pa
  JOIN public.vendor_branches vb ON vb.id = pa.vendor_branch_id
  LEFT JOIN public.vendors v ON v.id = pa.vendor_id
 WHERE pa.is_active
   -- TRAP: v_office_vendor_branch.agreement_id is a MIXED-TYPE text column. ABC agreements
   -- appear as legacy INTEGER ids ('105','8'); SRS ones as uuids. Casting either way throws
   -- (`invalid input syntax for type uuid: "105"`). Compare as text against BOTH id forms.
   AND NOT EXISTS (
        SELECT 1 FROM public.v_office_vendor_branch b
         WHERE b.agreement_id = pa.id::text
            OR (pa.legacy_id IS NOT NULL AND b.agreement_id = pa.legacy_id::text));

COMMENT ON VIEW public.v_agreement_unreachable IS
  'Active agreements that reach no branch in any active office ring, so their items price '
  'nothing. Cause is the branch-number TEXT join in v_office_vendor_branch (see mig 253 '
  'header). Non-empty means money is auditing as no-price despite a signed book existing.';

-- Corrected gate: auditability, not paperwork. Supersedes migration 252's predicate.
CREATE OR REPLACE VIEW public.v_office_vendor_gap_exposure AS
SELECT c.office_id,
       c.office            AS office_name,
       c.vendor_id,
       c.vendor            AS vendor_slug,
       c.covered_branches,
       c.live_agreements,
       c.status            AS agreement_status,
       c.note              AS ruling_note,
       c.decided_by,
       COALESCE(s.invoice_count, 0)        AS invoice_count,
       COALESCE(s.spend, 0)::numeric(14,2) AS spend,
       -- Money moved, nothing can be priced, and no human has accepted that state.
       (COALESCE(i.priced_items, 0) = 0
        AND c.status IN ('unrecorded', 'pending')
        AND COALESCE(s.invoice_count, 0) > 0) AS needs_ruling,
       -- The nastier subset: a book EXISTS and still prices nothing.
       (COALESCE(i.priced_items, 0) = 0 AND c.live_agreements > 0) AS agreement_not_reaching,
       -- Appended last: CREATE OR REPLACE VIEW may only ADD columns, never reorder them.
       COALESCE(i.priced_items, 0) AS priced_items
  FROM public.v_office_vendor_agreement_coverage c
  LEFT JOIN public.v_office_vendor_spend s
         ON s.office_id = c.office_id AND s.vendor_id = c.vendor_id
  LEFT JOIN public.v_office_vendor_inheritance i
         ON i.office_id = c.office_id AND i.vendor_id = c.vendor_id
 WHERE c.office_active;

COMMENT ON VIEW public.v_office_vendor_gap_exposure IS
  'Coverage gaps with the ruling (mig 245) AND the dollars (mig 250), gated on whether the '
  'pair can actually be audited (priced_items), not on whether paperwork exists. '
  'needs_ruling = spend occurred, nothing prices, nobody has accepted it. '
  'agreement_not_reaching = a signed book exists and still prices nothing (see '
  'v_agreement_unreachable). Never rank on spend alone: accepted no_book vendors (QXO) '
  'would resurface as false work.';
