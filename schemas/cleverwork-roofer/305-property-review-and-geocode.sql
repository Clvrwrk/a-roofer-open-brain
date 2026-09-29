-- 305 — AccuLynx job→property review queue + geocode results (docs/115).
--
-- After 303/304 linked 5,869 of 7,028 AccuLynx jobs, 1,157 remain. Each needs either a
-- machine path to a property (standardize the address and re-enrich) or a human decision
-- (the data is bad, or two properties fit). This migration makes that queue durable:
--
--   * acculynx_job_property_review  — one row per unlinked job: why, what we suggest, and a
--                                     status a human (or a later pass) closes
--   * geocode_result                — every geocoder answer, kept (audit + cost trail)
--   * refresh_acculynx_job_property_review()  — classify / re-classify; closes rows whose
--                                               job has since been linked
--   * set_property_geom_from_jobs()           — property point from its AccuLynx job pins
--                                               (sane pins only), at no geocoding cost
--   * apply_geocode_results()                 — write geocoder answers to properties/queue
--
-- Additive (hard rule 1); service-role only.

CREATE TABLE IF NOT EXISTS public.geocode_result (
  target_kind       text NOT NULL CHECK (target_kind IN ('property', 'acculynx_job')),
  target_id         text NOT NULL,
  query             text NOT NULL,
  provider          text NOT NULL DEFAULT 'google',
  status            text NOT NULL,          -- provider status: OK, ZERO_RESULTS, ...
  location_type     text,                   -- ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER, APPROXIMATE
  partial_match     boolean,
  formatted_address text,
  latitude          numeric,
  longitude         numeric,
  place_id          text,
  county_name       text,                   -- administrative_area_level_2
  postal_code       text,
  geocoded_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_kind, target_id, query)
);

CREATE TABLE IF NOT EXISTS public.acculynx_job_property_review (
  job_id                text PRIMARY KEY REFERENCES public.acculynx_jobs(id),
  reason                text NOT NULL CHECK (reason IN (
                          'no_street', 'no_house_number', 'no_zip', 'po_box', 'ambiguous_multiple_properties',
                          'weak_match', 'not_enriched', 'county_unmapped')),
  submitted_address     text,
  suggested_property_id uuid REFERENCES public.properties(id),
  suggestion_score      numeric,
  candidate_count       integer,
  geocode_status        text,
  geocode_precision     text,
  geocoded_address      text,
  geocode_latitude      numeric,
  geocode_longitude     numeric,
  recommended_action    text CHECK (recommended_action IN (
                          'fix_address_in_acculynx', 'choose_property', 'confirm_suggested_match',
                          'resubmit_for_enrichment', 'confirm_not_a_property')),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution            text,
  resolved_property_id  uuid REFERENCES public.properties(id),
  resolved_by           text,
  resolved_at           timestamptz,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS acculynx_job_property_review_open_idx
  ON public.acculynx_job_property_review (reason) WHERE status = 'open';

-- ── Classify every unlinked job; close rows whose job got linked ───────────────────
CREATE OR REPLACE FUNCTION public.refresh_acculynx_job_property_review()
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_closed int; v_open int;
BEGIN
  UPDATE acculynx_job_property_review r
     SET status = 'resolved', resolution = coalesce(r.resolution, 'linked:' || j.property_link_method),
         resolved_property_id = j.property_id, resolved_by = coalesce(r.resolved_by, 'link_acculynx_jobs_to_properties'),
         resolved_at = now(), updated_at = now()
    FROM acculynx_jobs j
   WHERE j.id = r.job_id AND r.status = 'open' AND j.property_id IS NOT NULL;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  WITH jb AS (
    SELECT j.id,
           concat_ws(', ', nullif(btrim(concat_ws(' ', j.location_street1, j.raw->'locationAddress'->>'street2')), ''),
                     nullif(j.location_city, ''), btrim(concat_ws(' ', j.location_state_abbrev, j.location_zip))) AS submitted,
           acculynx_job_street(j.location_street1, j.raw->'locationAddress'->>'street2')                     AS street,
           normalize_street_address(acculynx_job_street(j.location_street1, j.raw->'locationAddress'->>'street2')) AS sk,
           nullif(left(regexp_replace(coalesce(j.location_zip, ''), '[^0-9]', '', 'g'), 5), '')              AS zip5
    FROM acculynx_jobs j
    WHERE j.property_id IS NULL
  ), exact AS (
    SELECT jb.id, count(DISTINCT p.id) AS n, min(p.id::text)::uuid AS pid
    FROM jb JOIN properties p ON p.status = 'active'
     AND split_part(p.address_key, '|', 1) = jb.sk AND split_part(p.address_key, '|', 3) = jb.zip5
    GROUP BY jb.id
  ), fz AS (
    SELECT DISTINCT ON (jb.id) jb.id, p.id AS pid,
           similarity(regexp_replace(jb.sk, '^\S+\s', ''), regexp_replace(split_part(p.address_key, '|', 1), '^\S+\s', '')) AS sim
    FROM jb JOIN properties p ON p.status = 'active'
     AND split_part(p.address_key, '|', 3) = jb.zip5
     AND split_part(split_part(p.address_key, '|', 1), ' ', 1) = split_part(jb.sk, ' ', 1)
    WHERE jb.sk ~ '^\d'
    ORDER BY jb.id, 3 DESC
  ), cls AS (
    SELECT jb.id, jb.submitted,
           CASE WHEN jb.street IS NULL                                   THEN 'no_street'
                WHEN jb.street ~* '^p\.?\s*o\.?\s*box'                   THEN 'po_box'
                WHEN jb.sk !~ '^\d'                                      THEN 'no_house_number'
                WHEN jb.zip5 IS NULL                                     THEN 'no_zip'
                WHEN e.n > 1                                             THEN 'ambiguous_multiple_properties'
                WHEN fz.sim >= 0.35                                      THEN 'weak_match'
                ELSE 'not_enriched' END                                  AS reason,
           CASE WHEN e.n > 1 THEN e.pid WHEN fz.sim >= 0.35 THEN fz.pid END AS suggested,
           CASE WHEN fz.sim >= 0.35 AND coalesce(e.n, 0) <= 1 THEN round(fz.sim::numeric, 2) END AS score,
           e.n AS candidates
    FROM jb LEFT JOIN exact e ON e.id = jb.id LEFT JOIN fz ON fz.id = jb.id
  )
  INSERT INTO acculynx_job_property_review AS r
         (job_id, reason, submitted_address, suggested_property_id, suggestion_score, candidate_count, recommended_action)
  SELECT id, reason, submitted, suggested, score, candidates,
         CASE reason
           WHEN 'ambiguous_multiple_properties' THEN 'choose_property'
           WHEN 'weak_match'                    THEN 'confirm_suggested_match'
           WHEN 'not_enriched'                  THEN 'resubmit_for_enrichment'
           ELSE 'fix_address_in_acculynx' END
  FROM cls
  ON CONFLICT (job_id) DO UPDATE SET
    reason = EXCLUDED.reason, submitted_address = EXCLUDED.submitted_address,
    suggested_property_id = EXCLUDED.suggested_property_id, suggestion_score = EXCLUDED.suggestion_score,
    candidate_count = EXCLUDED.candidate_count,
    -- a geocode verdict (applied later) refines the action; do not reset it on refresh
    recommended_action = CASE WHEN r.geocode_status IS NOT NULL AND EXCLUDED.reason = 'not_enriched'
                              THEN r.recommended_action ELSE EXCLUDED.recommended_action END,
    status = CASE WHEN r.status = 'resolved' THEN 'open' ELSE r.status END,
    updated_at = now()
  WHERE r.status <> 'dismissed';

  SELECT count(*) INTO v_open FROM acculynx_job_property_review WHERE status = 'open';
  RETURN jsonb_build_object('closed_now_linked', v_closed, 'open', v_open,
    'by_reason', (SELECT jsonb_object_agg(reason, n) FROM
                   (SELECT reason, count(*) n FROM acculynx_job_property_review WHERE status = 'open' GROUP BY 1) x));
END $$;

-- ── Property point from AccuLynx job pins (free) ───────────────────────────────────
-- Uses the most common sane pin among a property's jobs. Sane = non-zero, inside the
-- continental US / AK / HI bounding box.
CREATE OR REPLACE FUNCTION public.set_property_geom_from_jobs()
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH pins AS (
    SELECT DISTINCT ON (j.property_id) j.property_id, j.latitude, j.longitude
    FROM acculynx_jobs j
    WHERE j.property_id IS NOT NULL AND j.latitude IS NOT NULL AND j.longitude IS NOT NULL
      AND j.latitude BETWEEN 18 AND 72 AND j.longitude BETWEEN -170 AND -60
    GROUP BY j.property_id, j.latitude, j.longitude
    ORDER BY j.property_id, count(*) DESC
  )
  UPDATE properties p
     SET latitude = pins.latitude, longitude = pins.longitude,
         geom = ST_SetSRID(ST_MakePoint(pins.longitude, pins.latitude), 4326)::geography,
         geocode_status = 'ok', geocode_precision = 'acculynx_pin', geocode_source = 'acculynx_job',
         geocoded_at = now(), updated_at = now()
    FROM pins
   WHERE p.id = pins.property_id AND p.geom IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ── Apply geocoder answers ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_geocode_results()
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_props int; v_jobs int;
BEGIN
  WITH g AS (
    SELECT DISTINCT ON (target_id) * FROM geocode_result
    WHERE target_kind = 'property' ORDER BY target_id, geocoded_at DESC
  )
  UPDATE properties p SET
    latitude  = CASE WHEN g.status = 'OK' THEN g.latitude  ELSE p.latitude  END,
    longitude = CASE WHEN g.status = 'OK' THEN g.longitude ELSE p.longitude END,
    geom      = CASE WHEN g.status = 'OK' THEN ST_SetSRID(ST_MakePoint(g.longitude, g.latitude), 4326)::geography ELSE p.geom END,
    geocode_status = CASE
      WHEN g.status = 'OK' AND g.location_type IN ('ROOFTOP', 'RANGE_INTERPOLATED') AND NOT coalesce(g.partial_match, false) THEN 'ok'
      WHEN g.status = 'OK' THEN 'low_precision'
      WHEN g.status = 'ZERO_RESULTS' THEN 'no_result'
      ELSE 'error' END,
    geocode_precision = g.location_type, geocode_source = g.provider,
    geocoded_address = g.formatted_address, geocoded_at = g.geocoded_at, updated_at = now()
  FROM g
  WHERE p.id::text = g.target_id AND (p.geocode_source IS DISTINCT FROM 'acculynx_job');
  GET DIAGNOSTICS v_props = ROW_COUNT;

  WITH g AS (
    SELECT DISTINCT ON (target_id) * FROM geocode_result
    WHERE target_kind = 'acculynx_job' ORDER BY target_id, geocoded_at DESC
  )
  UPDATE acculynx_job_property_review r SET
    geocode_status = CASE
      WHEN g.status = 'OK' AND g.location_type IN ('ROOFTOP', 'RANGE_INTERPOLATED') AND NOT coalesce(g.partial_match, false) THEN 'ok'
      WHEN g.status = 'OK' THEN 'low_precision'
      WHEN g.status = 'ZERO_RESULTS' THEN 'no_result'
      ELSE 'error' END,
    geocode_precision = g.location_type, geocoded_address = g.formatted_address,
    geocode_latitude = g.latitude, geocode_longitude = g.longitude,
    -- a real, precisely-located address that simply was not enriched goes back to the
    -- vendor; anything the geocoder cannot pin is bad data for a human to fix in AccuLynx
    recommended_action = CASE
      WHEN r.reason = 'not_enriched' AND g.status = 'OK' AND g.location_type IN ('ROOFTOP', 'RANGE_INTERPOLATED')
           AND NOT coalesce(g.partial_match, false) THEN 'resubmit_for_enrichment'
      WHEN r.reason = 'not_enriched' THEN 'fix_address_in_acculynx'
      ELSE r.recommended_action END,
    updated_at = now()
  FROM g
  WHERE r.job_id = g.target_id;
  GET DIAGNOSTICS v_jobs = ROW_COUNT;

  RETURN jsonb_build_object('properties_updated', v_props, 'review_rows_updated', v_jobs,
    'property_geocode_status', (SELECT jsonb_object_agg(coalesce(geocode_status, 'none'), n)
                                FROM (SELECT geocode_status, count(*) n FROM properties GROUP BY 1) x));
END $$;

-- ── Access: service role only ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['geocode_result', 'acculynx_job_property_review'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.refresh_acculynx_job_property_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_property_geom_from_jobs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_geocode_results() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_acculynx_job_property_review(), public.set_property_geom_from_jobs(),
                          public.apply_geocode_results() TO service_role;
