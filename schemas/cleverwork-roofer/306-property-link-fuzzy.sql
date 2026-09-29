-- Ledger: registered in prod as `304_property_link_fuzzy` (20260929124145); the file was renumbered because open
-- PRs #16/#17 took 303/304 in the repo first. The ledger name keeps the original number.
-- 306 — Job→property fuzzy link step + county name "Saint" normalization (docs/116).
--
-- Measured 2026-09-29 after loading the AccuLynx enrichment: 1,587 jobs stayed unlinked,
-- largely because the enrichment vendor standardizes street names ("SCHALIMAR" → "SHALIMAR",
-- "SEVEN LAKES" → "7 LAKES", "CHAUTAUQUA" → "S CHAUTAUQUA AVE"). Calibration on those jobs:
-- same zip + same house number + street-name trigram similarity >= 0.6 with a single candidate
-- was a true match in every sampled pair (429 jobs); below 0.6 the pairs mix real matches with
-- different streets ("ELLIS ST" vs "ELLIS AVE"), so those go to human review, not auto-link.
-- Fuzzy links carry method 'address_fuzzy', confidence 0.8, trust tier evidence.
--
-- county_key(): "Saint John the Baptist" (vendor) vs "St. John the Baptist Parish" (Census).
-- Independent cities (e.g. Hampton, VA → "Hampton city") are left to human review.
--
-- Additive / CREATE OR REPLACE only (hard rule 1).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.county_key(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(btrim(regexp_replace(regexp_replace(regexp_replace(
           upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 ]', '', 'g')),
           '(^|\s)SAINTE?(\s)', '\1ST\2', 'g'),
           '\s+(COUNTY|PARISH|BOROUGH|CENSUS AREA|MUNICIPALITY)$', ''), '\s+', ' ', 'g')), '')
$$;

-- Re-key stored rows with the new rule (idempotent).
UPDATE public.county_ref SET county_key = public.county_key(county_name)
WHERE county_key IS DISTINCT FROM public.county_key(county_name);

CREATE OR REPLACE FUNCTION public.link_acculynx_jobs_to_properties()
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_addr int := 0; v_cad int := 0; v_sedg int := 0; v_fuzzy int := 0; v_open int;
BEGIN
  DROP TABLE IF EXISTS _jobs;
  CREATE TEMP TABLE _jobs ON COMMIT DROP AS
  SELECT j.id,
         normalize_street_address(acculynx_job_street(j.location_street1, j.raw->'locationAddress'->>'street2')) AS street_key,
         nullif(left(regexp_replace(coalesce(j.location_zip, ''), '[^0-9]', '', 'g'), 5), '') AS zip5
  FROM acculynx_jobs j
  WHERE j.property_id IS NULL;

  -- 1. Exact street + zip, one active property (unit-agnostic; several = ambiguous).
  WITH cand AS (
    SELECT jb.id AS job_id, min(p.id::text)::uuid AS property_id, count(DISTINCT p.id) AS n
    FROM _jobs jb
    JOIN properties p ON p.status = 'active'
     AND split_part(p.address_key, '|', 1) = jb.street_key
     AND split_part(p.address_key, '|', 3) = jb.zip5
    WHERE jb.street_key IS NOT NULL AND jb.zip5 IS NOT NULL
    GROUP BY jb.id
  )
  UPDATE acculynx_jobs j SET property_id = c.property_id, property_link_method = 'address_zip',
         property_link_confidence = 0.95, property_linked_at = now()
  FROM cand c WHERE j.id = c.job_id AND c.n = 1;
  GET DIAGNOSTICS v_addr = ROW_COUNT;

  -- 2. Collin CAD situs: establish the parcel as a property, then link.
  DROP TABLE IF EXISTS _cad;
  CREATE TEMP TABLE _cad ON COMMIT DROP AS
  SELECT DISTINCT ON (jb.id) jb.id AS job_id, c.geoid, c.situsconcatshort, c.situscity, c.situszip
  FROM _jobs jb
  JOIN acculynx_jobs x ON x.id = jb.id AND x.property_id IS NULL
  JOIN collin_cad_appraisal_data c
    ON normalize_street_address(c.situsconcatshort) = jb.street_key AND c.situszip = jb.zip5
   AND c.proptype IN ('Real', 'Mobile Home')
  ORDER BY jb.id, c.propyear DESC;

  INSERT INTO properties (address_full, street_number, street_name, city, state, state_abbrev, zip, county, country,
                          geoid, apn, apn_normalized, county_fips, parcel_source, address_key, source)
  SELECT DISTINCT ON (m.geoid)
         initcap(m.situsconcatshort) || ', ' || initcap(m.situscity) || ', TX ' || m.situszip,
         substring(m.situsconcatshort FROM '^(\d+[A-Za-z]?)\s'),
         nullif(btrim(regexp_replace(m.situsconcatshort, '^\d+[A-Za-z]?\s+', '')), ''),
         initcap(m.situscity), 'Texas', 'TX', m.situszip, 'Collin', 'US',
         m.geoid, m.geoid, upper(regexp_replace(m.geoid, '[^A-Za-z0-9]', '', 'g')), '48085', 'collin_cad',
         normalize_street_address(m.situsconcatshort) || '||' || m.situszip, 'acculynx_link:collin_cad'
  FROM _cad m
  ON CONFLICT (geoid) DO NOTHING;

  UPDATE acculynx_jobs j SET property_id = p.id, property_link_method = 'collin_cad_situs',
         property_link_confidence = 0.9, property_linked_at = now()
  FROM _cad m JOIN properties p ON p.geoid = m.geoid
  WHERE j.id = m.job_id;
  GET DIAGNOSTICS v_cad = ROW_COUNT;

  -- 3. Sedgwick CAD situs, same pattern.
  DROP TABLE IF EXISTS _sgk;
  CREATE TEMP TABLE _sgk ON COMMIT DROP AS
  SELECT DISTINCT ON (jb.id) jb.id AS job_id, s.geoid, s.situs_address, s.situs_city, s.situs_zip, s.ain
  FROM _jobs jb
  JOIN acculynx_jobs x ON x.id = jb.id AND x.property_id IS NULL
  JOIN sedgwick_property_data s
    ON normalize_street_address(s.situs_address) = jb.street_key AND s.situs_zip = jb.zip5
  ORDER BY jb.id, s.tax_year DESC NULLS LAST;

  INSERT INTO properties (address_full, street_number, street_name, city, state, state_abbrev, zip, county, country,
                          geoid, apn, apn_normalized, county_fips, parcel_source, address_key, source)
  SELECT DISTINCT ON (m.geoid)
         initcap(m.situs_address) || ', ' || initcap(m.situs_city) || ', KS ' || m.situs_zip,
         substring(m.situs_address FROM '^(\d+[A-Za-z]?)\s'),
         nullif(btrim(regexp_replace(m.situs_address, '^\d+[A-Za-z]?\s+', '')), ''),
         initcap(m.situs_city), 'Kansas', 'KS', m.situs_zip, 'Sedgwick', 'US',
         m.geoid, m.ain, m.ain, '20173', 'sedgwick_cad',
         normalize_street_address(m.situs_address) || '||' || m.situs_zip, 'acculynx_link:sedgwick_cad'
  FROM _sgk m
  ON CONFLICT (geoid) DO NOTHING;

  UPDATE acculynx_jobs j SET property_id = p.id, property_link_method = 'sedgwick_cad_situs',
         property_link_confidence = 0.9, property_linked_at = now()
  FROM _sgk m JOIN properties p ON p.geoid = m.geoid
  WHERE j.id = m.job_id;
  GET DIAGNOSTICS v_sedg = ROW_COUNT;

  -- 4. Fuzzy: same zip + same house number + street-name similarity >= 0.6, single candidate.
  WITH c AS (
    SELECT jb.id AS job_id, p.id AS property_id,
           similarity(regexp_replace(jb.street_key, '^\S+\s', ''),
                      regexp_replace(split_part(p.address_key, '|', 1), '^\S+\s', '')) AS sim
    FROM _jobs jb
    JOIN acculynx_jobs x ON x.id = jb.id AND x.property_id IS NULL
    JOIN properties p ON p.status = 'active'
     AND split_part(p.address_key, '|', 3) = jb.zip5
     AND split_part(split_part(p.address_key, '|', 1), ' ', 1) = split_part(jb.street_key, ' ', 1)
    WHERE jb.street_key ~ '^\d'
  ), best AS (
    SELECT job_id, min(property_id::text)::uuid AS property_id, count(*) AS n
    FROM c WHERE sim >= 0.6 GROUP BY job_id
  )
  UPDATE acculynx_jobs j SET property_id = b.property_id, property_link_method = 'address_fuzzy',
         property_link_confidence = 0.8, property_linked_at = now()
  FROM best b WHERE j.id = b.job_id AND b.n = 1;
  GET DIAGNOSTICS v_fuzzy = ROW_COUNT;

  SELECT count(*) INTO v_open FROM acculynx_jobs WHERE property_id IS NULL;
  RETURN jsonb_build_object('linked_by_address', v_addr, 'linked_by_collin_cad', v_cad,
                            'linked_by_sedgwick_cad', v_sedg, 'linked_by_fuzzy', v_fuzzy,
                            'jobs_still_unlinked', v_open);
END $$;

REVOKE ALL ON FUNCTION public.link_acculynx_jobs_to_properties() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_acculynx_jobs_to_properties() TO service_role;
