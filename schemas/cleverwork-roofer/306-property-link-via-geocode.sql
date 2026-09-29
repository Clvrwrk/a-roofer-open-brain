-- 306 — Link AccuLynx jobs to properties through the geocoder's standardized address (docs/115).
--
-- Measured 2026-09-29 after geocoding the 1,083 open review jobs that have a street: 202
-- resolve to exactly one property once Google standardizes the address or pins it. Most are
-- AccuLynx data errors the geocoder corrects — Frisco jobs entered as 75034 that are 75033,
-- "North Waco St" that is "N Waco Ave". Two routes, both precise-geocode only:
--   geocode_address    standardized street + zip equals exactly one property's address key
--   geocode_proximity  job point within 30 m of exactly one property point with the same
--                      house number
-- Confidence 0.85, trust tier evidence. When the AccuLynx zip disagrees with the geocoder's,
-- the review row records it so the source record can be corrected in AccuLynx.
--
-- Additive (hard rule 1); service-role only.

CREATE OR REPLACE FUNCTION public.link_acculynx_jobs_via_geocode()
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_addr int := 0; v_near int := 0;
BEGIN
  DROP TABLE IF EXISTS _gj;
  CREATE TEMP TABLE _gj ON COMMIT DROP AS
  SELECT r.job_id,
         normalize_street_address(split_part(r.geocoded_address, ',', 1))             AS gsk,
         substring(r.geocoded_address FROM '[A-Z]{2} (\d{5})')                          AS gzip,
         nullif(left(regexp_replace(coalesce(j.location_zip, ''), '[^0-9]', '', 'g'), 5), '') AS jzip,
         ST_SetSRID(ST_MakePoint(r.geocode_longitude, r.geocode_latitude), 4326)::geography AS pt
  FROM acculynx_job_property_review r
  JOIN acculynx_jobs j ON j.id = r.job_id AND j.property_id IS NULL
  WHERE r.status = 'open' AND r.geocode_status = 'ok';

  WITH c AS (
    SELECT g.job_id, count(DISTINCT p.id) AS n, min(p.id::text)::uuid AS pid
    FROM _gj g JOIN properties p ON p.status = 'active'
     AND split_part(p.address_key, '|', 1) = g.gsk AND split_part(p.address_key, '|', 3) = g.gzip
    GROUP BY g.job_id
  )
  UPDATE acculynx_jobs j SET property_id = c.pid, property_link_method = 'geocode_address',
         property_link_confidence = 0.85, property_linked_at = now()
  FROM c WHERE j.id = c.job_id AND c.n = 1 AND j.property_id IS NULL;
  GET DIAGNOSTICS v_addr = ROW_COUNT;

  WITH c AS (
    SELECT g.job_id, count(DISTINCT p.id) AS n, min(p.id::text)::uuid AS pid
    FROM _gj g JOIN properties p ON p.status = 'active' AND p.geom IS NOT NULL
     AND ST_DWithin(p.geom, g.pt, 30)
     AND split_part(split_part(p.address_key, '|', 1), ' ', 1) = split_part(g.gsk, ' ', 1)
    GROUP BY g.job_id
  )
  UPDATE acculynx_jobs j SET property_id = c.pid, property_link_method = 'geocode_proximity',
         property_link_confidence = 0.85, property_linked_at = now()
  FROM c WHERE j.id = c.job_id AND c.n = 1 AND j.property_id IS NULL;
  GET DIAGNOSTICS v_near = ROW_COUNT;

  -- Close the queue rows these links satisfy, noting a wrong AccuLynx zip for correction.
  UPDATE acculynx_job_property_review r SET
    status = 'resolved', resolved_property_id = j.property_id, resolved_by = 'link_acculynx_jobs_via_geocode',
    resolved_at = now(), updated_at = now(),
    resolution = 'linked:' || j.property_link_method
                 || CASE WHEN g.jzip IS DISTINCT FROM g.gzip
                         THEN '; AccuLynx zip ' || coalesce(g.jzip, 'blank') || ' should be ' || g.gzip ELSE '' END
  FROM _gj g JOIN acculynx_jobs j ON j.id = g.job_id
  WHERE r.job_id = g.job_id AND j.property_id IS NOT NULL AND r.status = 'open';

  RETURN jsonb_build_object('linked_by_geocode_address', v_addr, 'linked_by_geocode_proximity', v_near,
                            'jobs_still_unlinked', (SELECT count(*) FROM acculynx_jobs WHERE property_id IS NULL));
END $$;

REVOKE ALL ON FUNCTION public.link_acculynx_jobs_via_geocode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_acculynx_jobs_via_geocode() TO service_role;
