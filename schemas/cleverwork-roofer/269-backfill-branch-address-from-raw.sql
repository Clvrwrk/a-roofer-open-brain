-- 269 — recover branch addresses that were already sitting in the invoice payload.
--
-- NUMBERING NOTE — two identities, both authoritative in their own place:
--   * IN PROD: applied as `246_backfill_branch_address_from_raw`, 2026-08-20 10:59 UTC.
--     That label is fixed and will not change; Supabase keys on timestamp, not on the
--     number, so the applied order is unaffected by anything below.
--   * IN THIS REPO: the file is `269-...`. It was renumbered nine times (245 -> 251 ->
--     ... -> 269) as parallel sessions claimed numbers on main while this work was in
--     flight. Main is canonical, so this branch yields each time. Earlier revisions of
--     this header stopped at intermediate steps and were stale; do not use any
--     intermediate number to find a file.
-- The sibling migrations of this set are 268, 270 and 271, all applied to prod.
-- 8th renumber 2026-08-22: main took 263 for `263-wip-attention-flags.sql`.
-- 9th renumber 2026-08-22: main took 267 for `267-srs-colorado-price-list-backdate.sql`.
--
-- Found while putting dollars on the coverage gaps (migration 268). The largest single
-- un-audited bucket in the system is ABC branch 176: 11 invoices, $19,356.94 — on a branch
-- row with NO city and NO state, so it can never geocode, never land in a territory ring,
-- and never get priced. Same shape for branches 183 and 305.
--
-- Per CONVENTIONS "structured source before OCR": the address was never missing. It is in
-- abc_invoices.raw->'branch' already —
--   176 -> Webster, TX  (333 Tristar Dr, 77598)
--   183 -> Nolanville, TX (76559)
--   305 -> Sherman, TX  (75092)   <-- ~60 mi from the Richardson office
-- Branch 305 in particular may be inside Richardson's drive-time ring; it reads
-- `out_of_boundary` today only because it has no coordinates to test. Nobody needed to
-- build an invoice parser to learn this.
--
-- TRAP worth recording: the payload is NOT uniformly rich. 10 of branch 176's 11 invoices
-- carry only {"name":"176A","number":"176"}; exactly ONE carries the full address. Taking
-- the latest invoice would recover nothing. This picks the RICHEST payload per branch
-- (longest addressLine1), not the newest.
--
-- Scope: 23 branches have no city; 7 are recoverable from raw. The other 16 have no address
-- in any payload and stay `no_address` — honestly unknown rather than guessed.
--
-- Additive and idempotent: fills NULL columns ONLY, via COALESCE, so re-running is a no-op
-- and an existing human-entered fact is never overwritten. Rows that gain an address are
-- flipped to geocode_status='pending' so the existing geocoder picks them up on its next
-- pass. This migration deliberately does NOT set pricing_territory_office_id — territory
-- remains a human decision (vendor_branches.territory_decided_by), and geocoding must run
-- first anyway.

WITH raw_best AS (
    -- Richest payload per branch, with a deterministic tiebreak. Ordering by address length
    -- alone leaves ties unresolved, so two runs could pick different payloads (and so
    -- different city/state) for the same branch -- not idempotent. `invoice_number` breaks the tie
    -- stably. Added 2026-08-21 after review.
    SELECT i.vendor_branch_id,
           (array_agg(i.raw->'branch'
                      ORDER BY length(NULLIF(i.raw->'branch'->>'addressLine1','')) DESC NULLS LAST,
                               i.invoice_number))[1] AS b
      FROM public.abc_invoices i
     WHERE i.vendor_branch_id IS NOT NULL
       -- Any recoverable field qualifies, not city alone: the UPDATE below fills city,
       -- state AND address, so gating the CTE on city would silently drop a payload that
       -- carries only a street address. 0 of 1,093 payloads hit that case today, so this
       -- is rerun-correctness rather than a live repair. Added 2026-08-22 after review.
       AND (
            NULLIF(i.raw->'branch'->>'city','')         IS NOT NULL
         OR NULLIF(i.raw->'branch'->>'state','')        IS NOT NULL
         OR NULLIF(i.raw->'branch'->>'addressLine1','') IS NOT NULL
       )
     GROUP BY i.vendor_branch_id
)
UPDATE public.vendor_branches vb
   SET city    = COALESCE(vb.city,    NULLIF(rb.b->>'city','')),
       state   = COALESCE(vb.state,   NULLIF(rb.b->>'state','')),
       address = COALESCE(vb.address, NULLIF(rb.b->>'addressLine1','')),
       geocode_status = CASE
             -- Queue a geocode only for a branch that does not already have one, and key
             -- it on "did we supply location data", not on city alone.
             -- Corrected 2026-08-21 after review. The original keyed on `vb.city IS NULL`,
             -- which (a) demoted already-geocoded rows to 'pending' when their city
             -- happened to be NULL -- branches 21 and 684 were demoted from 'ok' by the
             -- applied run -- and (b) missed recovery of any field other than city.
             -- (a) matched 2 rows in prod; (b) matches 0 today.
             -- The predicate below is deliberately IDENTICAL to the WHERE clause, plus the
             -- geom guard: anything that qualifies the row for an update is exactly what
             -- should queue the geocode. Keep the two in sync if either changes.
             WHEN vb.geom IS NULL AND (
                    (vb.city    IS NULL AND NULLIF(rb.b->>'city','')         IS NOT NULL)
                 OR (vb.state   IS NULL AND NULLIF(rb.b->>'state','')        IS NOT NULL)
                 OR (vb.address IS NULL AND NULLIF(rb.b->>'addressLine1','') IS NOT NULL)
               )
             THEN 'pending'
             ELSE vb.geocode_status END,
       updated_at = now()
  FROM raw_best rb
 WHERE rb.vendor_branch_id = vb.id
   -- A row qualifies only when a NULL field has a real replacement waiting. Matching on
   -- "any field is NULL" alone would re-stamp updated_at on every rerun for branches raw
   -- cannot help, which is not idempotent even though COALESCE preserves the values.
   -- Added 2026-08-21 after review; the applied run's effect is unchanged, since the rows
   -- it would newly exclude were no-ops anyway.
   AND (
        (vb.city    IS NULL AND NULLIF(rb.b->>'city','')         IS NOT NULL)
     OR (vb.state   IS NULL AND NULLIF(rb.b->>'state','')        IS NOT NULL)
     OR (vb.address IS NULL AND NULLIF(rb.b->>'addressLine1','') IS NOT NULL)
   );
