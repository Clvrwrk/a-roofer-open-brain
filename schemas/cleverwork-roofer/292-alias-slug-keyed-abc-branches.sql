-- 292 — alias every slug-keyed ABC vendor_branches row to its master branch number.
--
-- Context (docs/109 F42, mig 291): the 2026-05-27 location import keyed ABC branch rows as
-- '<city>-<ST>-<postal>' instead of the ABC branch number. Since mig 243 an ABC invoice
-- resolves its branch AT INGEST through vendor_branch_alias, and mig 243 seeded aliases only
-- for numeric-keyed rows — so any slug-keyed branch that starts invoicing ingests with a NULL
-- vendor_branch_id, resolves to no PE office, and every line reads No-Price (branch 326,
-- Topeka, 2026-09-14). Chris 2026-09-15: "alias every slug-keyed branch row to its master number".
--
-- Matching the slug row to the ABC branch master (abc_vendor_branches, 720 rows), strongest
-- key first, each tier accepted only when it yields exactly ONE master branch number:
--   tier 1 'postal'        — same state + identical ZIP+4                       (506 rows)
--   tier 2 'postal5+city'  — same state + same 5-digit ZIP + same city          (1 row)
--   tier 3 'city'          — same state + same city, and that city has exactly one master
--                            branch AND exactly one slug row                   (129 rows)
--   unmatched              — left alone and listed for a human                  (48 rows)
-- Aliases are written in both spellings the sources use (bare and zero-padded, mig 243 §3).
-- Where a numeric-keyed row already owns the alias (the "slug twins" from mig 239's
-- inserts), ON CONFLICT DO NOTHING keeps the numeric row as the resolver — the twin slug
-- row is a duplicate to retire later, not a second identity.
-- Result on prod 2026-09-15: 670 alias rows for 589 slug branches (465 postal, 1 postal5+city,
-- 123 city); 25 slug rows are twins of a numeric resolver; 70 slug rows stay unaliased (48
-- unmatched — mostly Canadian branches and multi-branch US cities where no tier is unique —
-- plus 22 whose master number was already owned). Every one of the 62 master branches we
-- have bought from in 36 months resolves at ingest; 678 of 698 masters resolve overall.
--
-- The slug rows keep their branch_number: the (vendor_id, branch_number) unique key would
-- collide with the numeric twins, and the alias is what the ingest reads. Additive +
-- idempotent. Rollback: DELETE FROM vendor_branch_alias WHERE source LIKE 'migration-292%'.

WITH slug AS (
  SELECT vb.id, vb.vendor_id, vb.branch_number, vb.city, vb.state,
         split_part(vb.branch_number, '-', 3)
           || CASE WHEN split_part(vb.branch_number, '-', 4) <> '' THEN '-' || split_part(vb.branch_number, '-', 4) ELSE '' END AS slug_postal
  FROM public.vendor_branches vb
  JOIN public.vendors v ON v.id = vb.vendor_id AND v.slug = 'abc-supply'
  WHERE vb.branch_number !~ '^[0-9]+$'
),
t AS (
  SELECT s.*,
    (SELECT array_agg(DISTINCT ltrim(a.branch_number, '0')) FROM public.abc_vendor_branches a
      WHERE a.branch_number ~ '^[0-9]+$' AND a.state = s.state AND a.postal = s.slug_postal) AS t1,
    (SELECT array_agg(DISTINCT ltrim(a.branch_number, '0')) FROM public.abc_vendor_branches a
      WHERE a.branch_number ~ '^[0-9]+$' AND a.state = s.state
        AND left(a.postal, 5) = left(s.slug_postal, 5) AND a.city ILIKE s.city) AS t2,
    (SELECT array_agg(DISTINCT ltrim(a.branch_number, '0')) FROM public.abc_vendor_branches a
      WHERE a.branch_number ~ '^[0-9]+$' AND a.state = s.state AND a.city ILIKE s.city) AS t3,
    (SELECT count(*) FROM slug s2 WHERE s2.state = s.state AND s2.city ILIKE s.city) AS slug_rows_same_city
  FROM slug s
),
matched AS (
  SELECT id, vendor_id, branch_number,
    CASE WHEN cardinality(t1) = 1 THEN 'postal'
         WHEN cardinality(t2) = 1 THEN 'postal5+city'
         WHEN cardinality(t3) = 1 AND slug_rows_same_city = 1 THEN 'city' END AS tier,
    COALESCE(CASE WHEN cardinality(t1) = 1 THEN t1[1] END,
             CASE WHEN cardinality(t2) = 1 THEN t2[1] END,
             CASE WHEN cardinality(t3) = 1 AND slug_rows_same_city = 1 THEN t3[1] END) AS master
  FROM t
)
INSERT INTO public.vendor_branch_alias (vendor_id, alias_key, alias_raw, vendor_branch_id, status, source, decided_by, notes)
SELECT m.vendor_id, public.vendor_branch_alias_key(sp.spelling), sp.spelling, m.id,
       'resolved', 'migration-292 slug row → master branch number (tier ' || m.tier || ')', 'agent',
       'slug key ' || m.branch_number
FROM matched m
CROSS JOIN LATERAL (VALUES (m.master), (lpad(m.master, 3, '0'))) AS sp(spelling)
WHERE m.tier IS NOT NULL AND m.master IS NOT NULL
ON CONFLICT (vendor_id, alias_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Part 2 (applied as 292b) — the mirror-image case found while verifying part 1.
-- Four NUMERIC rows already owned the ingest alias for their branch number but carried
-- no office (stubs created without geo, so the isochrone left them out_of_boundary),
-- while their slug twins — same master ZIP+4 — held the isochrone assignment:
--   1278 Granbury TX  ← granbury-TX-76048-5495   (Richardson, TX)
--   1306 Enid OK      ← enid-OK-73701-9465       (Wichita, KS)
--    185 Marietta GA  ← marietta-GA-30066-6519   (Atlanta (Jonesboro), GA)
--    305 Sherman TX   ← sherman-TX-75092-2518    (Richardson, TX) — 3 invoices (Jan 2026)
--                                                 already resolved to the stub and priced as No-Price
-- The stub is the identity the ingest uses (FK on abc_invoices), so the assignment moves
-- TO the stub: office, suggestion, status, and any missing city/state/geo come from the
-- twin (or the branch master). territory_decided_by records the provenance.
-- ---------------------------------------------------------------------------
WITH stub AS (
  SELECT vb.id, vb.vendor_id, vb.branch_number, a.postal AS master_postal, a.state AS master_state, a.city AS master_city,
         a.latitude AS master_lat, a.longitude AS master_lng
  FROM public.vendor_branches vb
  JOIN public.vendors v ON v.id = vb.vendor_id AND v.slug = 'abc-supply'
  JOIN public.abc_vendor_branches a ON ltrim(a.branch_number, '0') = vb.branch_number
  WHERE vb.branch_number ~ '^[0-9]+$' AND vb.pricing_territory_office_id IS NULL
),
twin AS (
  SELECT s.id AS stub_id, s.master_city, s.master_state, s.master_lat, s.master_lng, t.id AS twin_id,
         t.pricing_territory_office_id, t.suggested_office_id, t.pricing_status, t.latitude, t.longitude, t.branch_number AS twin_slug
  FROM stub s
  JOIN public.vendor_branches t ON t.vendor_id = s.vendor_id AND t.branch_number !~ '^[0-9]+$'
   AND t.state = s.master_state
   AND split_part(t.branch_number, '-', 3) || CASE WHEN split_part(t.branch_number, '-', 4) <> '' THEN '-' || split_part(t.branch_number, '-', 4) ELSE '' END = s.master_postal
  WHERE t.pricing_territory_office_id IS NOT NULL AND t.pricing_status = 'covered'
)
UPDATE public.vendor_branches vb
SET pricing_territory_office_id = tw.pricing_territory_office_id,
    suggested_office_id = COALESCE(vb.suggested_office_id, tw.suggested_office_id),
    pricing_status = 'covered',
    pricing_status_computed_at = now(),
    city = COALESCE(vb.city, tw.master_city),
    state = COALESCE(vb.state, tw.master_state),
    latitude = COALESCE(vb.latitude, tw.latitude, tw.master_lat),
    longitude = COALESCE(vb.longitude, tw.longitude, tw.master_lng),
    territory_decided_by = 'migration-292b (isochrone assignment carried from slug twin ' || tw.twin_slug || ')',
    territory_decided_at = now(),
    notes = COALESCE(vb.notes || ' · ', '') || 'mig 292b (2026-09-15): office carried from slug twin ' || tw.twin_slug,
    updated_at = now()
FROM twin tw
WHERE vb.id = tw.stub_id;

-- then: SELECT public.request_matview_refresh('mv_invoice_audit_line', 'mig 292b');
