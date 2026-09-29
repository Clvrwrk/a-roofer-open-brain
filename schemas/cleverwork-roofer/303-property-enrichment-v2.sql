-- 303 — Property enrichment v2 (docs/115): every list field typed, any-county geoIDs,
-- Collin sub-type refinement, geocode + job-link bookkeeping.
--
-- Why: the AccuLynx enrichment round trip (docs/113 §4) came back in the list tool's
-- 75-column format across 178 counties in 25 states, without the FIPS column. 302's loader
-- only knew five DFW counties, and six list fields lived only in raw jsonb.
--
-- Adds (additive, idempotent — hard rule 1):
--   * county_ref            — Census 2020 county FIPS list (data loaded by
--                             scripts/load-county-ref.py from national_county2020.txt)
--   * property_assessment   — condition fields, foreclosure factor, property status, notes
--   * property_list_import  — the list tool's workflow counters as typed columns
--   * properties            — geocode bookkeeping (status / precision / source / time)
--   * acculynx_jobs         — property_link_method / _confidence / _linked_at
--                             (safe: supabase/functions/acculynx-sync upserts a fixed column
--                             list without property_id, so links survive every sync)
--   * property_type_ref     — multifamily_unspecified
--   * property_type_from_sources()        — full residential + commercial vendor vocabulary
--   * property_type_from_collin_class()   — Collin improvement class code → sub-type
--   * refine_property_type_from_collin_class()
--   * load_property_list_import()         — county_ref FIPS for any county; Sedgwick KS
--                                           resolves to its existing SGK- geoid via AIN
--   * link_acculynx_jobs_to_properties()  — address → property, then Collin/Sedgwick CAD
--   * v_commercial_prospect                — now includes 5+ unit apartment communities
--
-- Collin class codes: decoded from the Collin CAD improvement class list as published on
-- taxnetusa.com/texas/collin (CS = convenience store, FF = fast food, WO = warehouse office, ...).
-- Codes without a published description (AH, CR, PE, GC, FH, TE) are left unrefined.

-- ── County FIPS reference ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.county_ref (
  county_fips  text PRIMARY KEY,           -- 5-digit state+county FIPS
  state_abbrev text NOT NULL,
  state_fips   text NOT NULL,
  county_name  text NOT NULL,              -- as published, e.g. 'Collin County', 'St. Louis city'
  county_key   text NOT NULL,              -- upper, no punctuation, no ' COUNTY' / ' PARISH'
  source       text NOT NULL DEFAULT 'census:national_county2020'
);
CREATE UNIQUE INDEX IF NOT EXISTS county_ref_state_key_uidx ON public.county_ref (state_abbrev, county_key);

CREATE OR REPLACE FUNCTION public.county_key(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(btrim(regexp_replace(regexp_replace(
           upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 ]', '', 'g')),
           '\s+(COUNTY|PARISH|BOROUGH|CENSUS AREA|MUNICIPALITY)$', ''), '\s+', ' ', 'g')), '')
$$;

-- ── New typed fields ───────────────────────────────────────────────────────────────
ALTER TABLE public.property_assessment
  ADD COLUMN IF NOT EXISTS total_condition     text,
  ADD COLUMN IF NOT EXISTS interior_condition  text,
  ADD COLUMN IF NOT EXISTS exterior_condition  text,
  ADD COLUMN IF NOT EXISTS bathroom_condition  text,
  ADD COLUMN IF NOT EXISTS kitchen_condition   text,
  ADD COLUMN IF NOT EXISTS foreclosure_factor  text,
  ADD COLUMN IF NOT EXISTS property_status     text,
  ADD COLUMN IF NOT EXISTS notes               text;

ALTER TABLE public.property_list_import
  ADD COLUMN IF NOT EXISTS marketing_lists     integer,
  ADD COLUMN IF NOT EXISTS marketing_campaigns integer,
  ADD COLUMN IF NOT EXISTS voicemail_drops     integer,
  ADD COLUMN IF NOT EXISTS dialer              integer,
  ADD COLUMN IF NOT EXISTS postcards           integer,
  ADD COLUMN IF NOT EXISTS emails_sent         integer,
  ADD COLUMN IF NOT EXISTS skip_traces         integer,
  ADD COLUMN IF NOT EXISTS date_added_to_list  timestamptz,
  ADD COLUMN IF NOT EXISTS method_of_add       text;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS geocode_status    text,
  ADD COLUMN IF NOT EXISTS geocode_precision text,
  ADD COLUMN IF NOT EXISTS geocode_source    text,
  ADD COLUMN IF NOT EXISTS geocoded_address  text,
  ADD COLUMN IF NOT EXISTS geocoded_at       timestamptz;
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_geocode_status_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_geocode_status_check
  CHECK (geocode_status IS NULL OR geocode_status IN ('ok', 'low_precision', 'no_result', 'error'));
CREATE INDEX IF NOT EXISTS properties_geom_gix ON public.properties USING gist (geom);

ALTER TABLE public.acculynx_jobs
  ADD COLUMN IF NOT EXISTS property_link_method     text,
  ADD COLUMN IF NOT EXISTS property_link_confidence numeric,
  ADD COLUMN IF NOT EXISTS property_linked_at       timestamptz;

CREATE INDEX IF NOT EXISTS idx_sedgwick_ain ON public.sedgwick_property_data (ain);

INSERT INTO public.property_type_ref (property_type, property_class, label, sort_order) VALUES
  ('multifamily_unspecified', 'residential', 'Multi-family, unit count unknown', 55)
ON CONFLICT (property_type) DO UPDATE
  SET property_class = EXCLUDED.property_class, label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

-- ── Type from sources: full vendor vocabulary ──────────────────────────────────────
-- Order matters: no-improvement land first, then specific labels, then county codes, then
-- generic fallbacks. Generic vendor labels ("Commercial (General)", "Miscellaneous
-- (General)", "Commercial Building", "Exempt", "Personal Property") fall through to the
-- county code.
CREATE OR REPLACE FUNCTION public.property_type_from_sources(
  p_vendor_type text, p_cad_category text, p_building_sqft numeric,
  OUT property_class text, OUT property_type text, OUT type_source text)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT split_part(r, '|', 1), split_part(r, '|', 2), split_part(r, '|', 3) FROM (
    SELECT CASE
      WHEN p_cad_category IN ('C1', 'D1', 'E')                                   THEN 'land|vacant_land|county_cad'
      WHEN v ~* '(vacant land|unimproved vacant|open space|^farm land|pasture|timberland)' THEN 'land|vacant_land|vendor_list'
      -- residential
      WHEN v ~* '(single family residential|residential \(general\) \(single\)|rural residence)' THEN 'residential|single_family|vendor_list'
      WHEN v ~* 'townhouse'                                                      THEN 'residential|townhome|vendor_list'
      WHEN v ~* '^condominium \(residential\)'                                   THEN 'residential|condo|vendor_list'
      WHEN v ~* '(duplex|triplex|quadruplex|fourplex)'                           THEN 'residential|multifamily_2_4|vendor_list'
      WHEN v ~* '(apartment house \(5\+|garden apt|high-rise apartments|^apartments)' THEN 'residential|multifamily_5_plus|vendor_list'
      WHEN v ~* '(multi-family dwellings|residential income)'                    THEN 'residential|multifamily_unspecified|vendor_list'
      WHEN v ~* '(mobile home|manufactured)'                                     THEN 'residential|manufactured|vendor_list'
      WHEN v ~* '(misc residential|fraternity|sorority)'                         THEN 'residential|residential_other|vendor_list'
      -- commercial
      WHEN v ~* 'transient lodging|^hotel|motel'                                 THEN 'commercial|hospitality|vendor_list'
      WHEN v ~* '^commercial condominium'                                        THEN 'commercial|commercial_condo|vendor_list'
      WHEN v ~* '(mixed use)'                                                    THEN 'commercial|mixed_use|vendor_list'
      WHEN v ~* '(shopping center|strip center|mall)'                            THEN 'commercial|shopping_center|vendor_list'
      WHEN v ~* '(restaurant|fast food|bar, tavern|nightclub)'                   THEN 'commercial|restaurant|vendor_list'
      WHEN v ~* 'storage yard'                                                   THEN 'commercial|commercial_other|vendor_list'
      WHEN v ~* 'storage'                                                        THEN 'commercial|self_storage|vendor_list'
      WHEN v ~* '(^auto|car wash|^vehicle|service station)'                      THEN 'commercial|auto|vendor_list'
      WHEN v ~* '^parking'                                                       THEN 'commercial|parking|vendor_list'
      WHEN v ~* '(retired, handicap|nursing home|assisted living|convalescent)'  THEN 'commercial|senior_living|vendor_list'
      WHEN v ~* '(medical bldg|medical office|clinic)'                           THEN 'commercial|medical_office|vendor_list'
      WHEN v ~* '(veterinary|hospital)'                                          THEN 'commercial|healthcare|vendor_list'
      WHEN v ~* '(day care|school|college)'                                      THEN 'commercial|education|vendor_list'
      WHEN v ~* '(church|worship)'                                               THEN 'commercial|religious|vendor_list'
      WHEN v ~* '(governmental|municipal|emergency \(police)'                    THEN 'commercial|government|vendor_list'
      WHEN v ~* '(gym|health spa|recreation|country club|golf|amusement|theater|museum)' THEN 'commercial|recreation|vendor_list'
      WHEN v ~* '(office|financial bldg)'                                        THEN 'commercial|office|vendor_list'
      WHEN v ~* '(warehouse|distribution)'                                       THEN 'commercial|industrial_warehouse|vendor_list'
      WHEN v ~* 'light industrial'                                               THEN 'commercial|flex|vendor_list'
      WHEN v ~* '(manufacturing|heavy industrial|industrial \(general\))'        THEN 'commercial|industrial_manufacturing|vendor_list'
      WHEN v ~* '(^store|retail|grocery|supermarket|convenience store|wholesale outlet|drug store|pharmacy|dry cleaner)' THEN 'commercial|retail|vendor_list'
      WHEN v ~* '(ranch, farm|^agricultural)'                                    THEN 'commercial|agricultural|vendor_list'
      -- county codes
      WHEN p_cad_category = 'F2'                                                 THEN 'commercial|industrial_manufacturing|county_cad'
      WHEN p_cad_category IN ('A', 'O')                                          THEN 'residential|single_family|county_cad'
      WHEN p_cad_category = 'B'                                                  THEN 'residential|multifamily_unspecified|county_cad'
      WHEN p_cad_category = 'M1'                                                 THEN 'residential|manufactured|county_cad'
      WHEN p_cad_category = 'D2'                                                 THEN 'commercial|agricultural|county_cad'
      WHEN p_cad_category = 'F1'                                                 THEN 'commercial|commercial_other|county_cad'
      -- generic fallbacks
      WHEN v ~* '^miscellaneous' AND coalesce(p_building_sqft, 0) = 0            THEN 'land|vacant_land|vendor_list_inferred'
      WHEN v ~* 'residential'                                                    THEN 'residential|residential_other|vendor_list'
      WHEN v IS NOT NULL                                                         THEN 'commercial|commercial_other|vendor_list'
      ELSE NULL
    END AS r
    FROM (SELECT nullif(btrim(p_vendor_type), '') AS v) x
  ) y
  WHERE r IS NOT NULL
$$;

-- ── Collin improvement class → sub-type ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.property_type_from_collin_class(p_class text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN c IN ('AA', 'AO', 'MA')                                   THEN 'multifamily_5_plus'
    WHEN c IN ('AL', 'NH')                                         THEN 'senior_living'
    WHEN c IN ('AM', 'AS', 'CW', 'MB', 'ML', 'SC', 'SF', 'SS')     THEN 'auto'
    WHEN c IN ('BA', 'CC', 'RB', 'TH')                             THEN 'recreation'
    WHEN c IN ('BD', 'BK', 'MS', 'OS', 'SO')                       THEN 'office'
    WHEN c IN ('CO', 'SE', 'SG', 'SM')                             THEN 'shopping_center'
    WHEN c IN ('CS', 'DG', 'DI', 'DS', 'ME', 'MG', 'RC', 'RO')     THEN 'retail'
    WHEN c = 'DN'                                                  THEN 'education'
    WHEN c IN ('FF', 'RS', 'TR')                                   THEN 'restaurant'
    WHEN c = 'GH'                                                  THEN 'agricultural'
    WHEN c = 'HI'                                                  THEN 'industrial_manufacturing'
    WHEN c = 'LI'                                                  THEN 'flex'
    WHEN c = 'HM'                                                  THEN 'hospitality'
    WHEN c = 'HP'                                                  THEN 'healthcare'
    WHEN c IN ('MM', 'OM')                                         THEN 'medical_office'
    WHEN c = 'PG'                                                  THEN 'parking'
    WHEN c IN ('WH', 'WO')                                         THEN 'industrial_warehouse'
    WHEN c = 'WM'                                                  THEN 'self_storage'
  END
  FROM (SELECT substring(upper(btrim(p_class)) FROM '^[A-Z]+') AS c) x
$$;

-- Refines only the "commercial, sub-type unknown" rows and never a human-confirmed type.
CREATE OR REPLACE FUNCTION public.refine_property_type_from_collin_class()
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH c AS (
    SELECT p.id, t.property_type, t.property_class
    FROM properties p
    JOIN LATERAL (
      SELECT cad.imprvclasscd FROM collin_cad_appraisal_data cad
      WHERE cad.geoid = p.geoid ORDER BY cad.propyear DESC LIMIT 1
    ) cad ON true
    JOIN property_type_ref t ON t.property_type = property_type_from_collin_class(cad.imprvclasscd)
    WHERE p.property_type = 'commercial_other'
      AND p.county_fips = '48085'
      AND coalesce(p.type_trust_tier, 'evidence') <> 'instruction'
  )
  UPDATE properties p
     SET property_type = c.property_type, property_class = c.property_class,
         type_source = 'collin_cad_class', updated_at = now()
    FROM c WHERE p.id = c.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ── Loader v2: any county, Sedgwick SGK resolution, every field typed ─────────────
CREATE OR REPLACE FUNCTION public.load_property_list_import(p_batch text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows int; v_no_county int; v_no_apn int; v_refined int;
  v_prop_ins int; v_prop_upd int; v_owners int; v_links int; v_phones int; v_emails int; v_assess int;
BEGIN
  -- 0. List-tool workflow counters as typed columns on the raw row.
  UPDATE property_list_import i SET
    marketing_lists     = property_list_num(i.raw->>'Marketing Lists')::int,
    marketing_campaigns = property_list_num(i.raw->>'Marketing Campaigns')::int,
    voicemail_drops     = property_list_num(i.raw->>'Voicemail Drops')::int,
    dialer              = property_list_num(i.raw->>'Dialer')::int,
    postcards           = property_list_num(i.raw->>'Postcards')::int,
    emails_sent         = property_list_num(i.raw->>'E-Mails')::int,
    skip_traces         = property_list_num(i.raw->>'Skip Traces')::int,
    date_added_to_list  = CASE WHEN i.raw->>'Date Added to List' ~ '^\d{4}-\d{2}-\d{2}' THEN (i.raw->>'Date Added to List')::timestamptz END,
    method_of_add       = nullif(btrim(i.raw->>'Method of Add'), '')
  WHERE i.import_batch = p_batch;

  -- 1. Parse every raw row; county FIPS from county_ref (or a FIPS column when present).
  DROP TABLE IF EXISTS _pli;
  CREATE TEMP TABLE _pli ON COMMIT DROP AS
  WITH r AS (
    SELECT i.source_file, i.row_number, i.market, i.raw,
           nullif(btrim(i.raw->>'APN'), '')                                             AS apn,
           nullif(btrim(i.raw->>'County'), '')                                          AS county,
           upper(nullif(btrim(i.raw->>'State'), ''))                                    AS st,
           nullif(left(regexp_replace(coalesce(i.raw->>'FIPS', ''), '[^0-9]', '', 'g'), 5), '') AS raw_fips,
           nullif(btrim(regexp_replace(coalesce(i.raw->>'Address', ''), '\s+', ' ', 'g')), '') AS address,
           nullif(btrim(i.raw->>'Unit #'), '')                                          AS unit,
           nullif(initcap(btrim(regexp_replace(coalesce(i.raw->>'City', ''), '\s+', ' ', 'g'))), '') AS city,
           nullif(left(regexp_replace(coalesce(i.raw->>'Zip', ''), '[^0-9]', '', 'g'), 5), '') AS zip5,
           coalesce(property_list_date(i.raw->>'Date Added to List'), current_date)      AS added_on
    FROM property_list_import i
    WHERE i.import_batch = p_batch
  ), f AS (
    SELECT r.*,
           CASE WHEN r.apn IS NULL THEN NULL
                WHEN length(r.raw_fips) = 5 THEN r.raw_fips
                ELSE cr.county_fips END                           AS county_fips,
           upper(regexp_replace(r.apn, '[^A-Za-z0-9]', '', 'g'))  AS apn_norm
    FROM r
    LEFT JOIN county_ref cr ON cr.state_abbrev = r.st AND cr.county_key = county_key(r.county)
  )
  SELECT f.*,
         CASE WHEN f.county_fips = '48085' THEN f.apn
              WHEN f.county_fips = '20173' THEN coalesce(sg.geoid, '20173-' || f.apn_norm)
              WHEN f.county_fips IS NOT NULL THEN f.county_fips || '-' || f.apn_norm
         END                                                      AS geoid,
         nullif(btrim(regexp_replace(f.address, '\s*#\s*\S+$', '')), '') AS street
  FROM f
  LEFT JOIN LATERAL (
    SELECT s.geoid FROM sedgwick_property_data s
    WHERE f.county_fips = '20173' AND s.ain = f.apn_norm ORDER BY s.tax_year DESC NULLS LAST LIMIT 1
  ) sg ON true;

  SELECT count(*), count(*) FILTER (WHERE apn IS NULL), count(*) FILTER (WHERE apn IS NOT NULL AND geoid IS NULL)
    INTO v_rows, v_no_apn, v_no_county FROM _pli;

  -- 2. One property row per geoid: prefer a row with a street, then the newest.
  DROP TABLE IF EXISTS _pp;
  CREATE TEMP TABLE _pp ON COMMIT DROP AS
  SELECT DISTINCT ON (p.geoid) p.*,
         cad.propcategorycode AS cad_category, cad.situsconcatshort AS cad_street, cad.situscity AS cad_city,
         property_list_num(p.raw->>'Building Sqft') AS building_sqft
  FROM _pli p
  LEFT JOIN collin_cad_appraisal_data cad ON p.county_fips = '48085' AND cad.geoid = p.geoid
  WHERE p.geoid IS NOT NULL
  ORDER BY p.geoid, (p.address IS NOT NULL) DESC, p.added_on DESC, p.source_file, p.row_number;

  WITH up AS (
    INSERT INTO properties AS pr (
      address_full, street_number, street_name, city, state, state_abbrev, zip, county, country,
      geoid, apn, apn_normalized, county_fips, parcel_source, address_key, unit,
      property_class, property_type, occupancy, type_source, type_trust_tier, source)
    SELECT
      concat_ws(', ',
        coalesce(pp.address, initcap(pp.cad_street), 'Parcel ' || pp.apn),
        coalesce(pp.city, initcap(pp.cad_city)),
        pp.st || coalesce(' ' || pp.zip5, '')),
      substring(coalesce(pp.street, pp.cad_street) FROM '^(\d+[A-Za-z]?)\s'),
      nullif(btrim(regexp_replace(coalesce(pp.street, pp.cad_street, ''), '^\d+[A-Za-z]?\s+', '')), ''),
      coalesce(pp.city, initcap(pp.cad_city), initcap(pp.county) || ' County'),
      coalesce((SELECT CASE s.st WHEN 'TX' THEN 'Texas' WHEN 'KS' THEN 'Kansas' WHEN 'MO' THEN 'Missouri'
                     WHEN 'CO' THEN 'Colorado' WHEN 'GA' THEN 'Georgia' WHEN 'FL' THEN 'Florida'
                     WHEN 'OK' THEN 'Oklahoma' WHEN 'NC' THEN 'North Carolina' WHEN 'SC' THEN 'South Carolina'
                     WHEN 'LA' THEN 'Louisiana' END FROM (SELECT pp.st AS st) s), pp.st),
      pp.st, pp.zip5, initcap(pp.county), 'US',
      pp.geoid, pp.apn, pp.apn_norm, pp.county_fips,
      CASE WHEN pp.cad_category IS NOT NULL THEN 'collin_cad'
           WHEN pp.county_fips = '20173' AND pp.geoid LIKE 'SGK-%' THEN 'sedgwick_cad'
           ELSE 'list:' || p_batch END,
      CASE WHEN coalesce(pp.street, pp.cad_street) IS NOT NULL
           THEN normalize_street_address(coalesce(pp.street, pp.cad_street)) || '|' || upper(coalesce(pp.unit, '')) || '|' || coalesce(pp.zip5, '') END,
      pp.unit,
      t.property_class, t.property_type,
      CASE WHEN t.property_class = 'land' THEN 'vacant'
           WHEN pp.raw->>'Owner Occupied' = 'Yes' THEN 'owner_occupied'
           WHEN pp.raw->>'Owner Occupied' = 'No'  THEN 'renter_occupied'
           ELSE 'unknown' END,
      t.type_source, CASE WHEN t.property_type IS NOT NULL THEN 'evidence' END,
      'list:' || p_batch
    FROM _pp pp
    LEFT JOIN LATERAL property_type_from_sources(pp.raw->>'Property Type', pp.cad_category, pp.building_sqft) t ON true
    ON CONFLICT (geoid) DO UPDATE SET
      street_number   = coalesce(pr.street_number, EXCLUDED.street_number),
      street_name     = coalesce(pr.street_name, EXCLUDED.street_name),
      zip             = coalesce(pr.zip, EXCLUDED.zip),
      county          = coalesce(pr.county, EXCLUDED.county),
      apn             = coalesce(pr.apn, EXCLUDED.apn),
      apn_normalized  = coalesce(pr.apn_normalized, EXCLUDED.apn_normalized),
      county_fips     = coalesce(pr.county_fips, EXCLUDED.county_fips),
      parcel_source   = coalesce(pr.parcel_source, EXCLUDED.parcel_source),
      address_key     = coalesce(pr.address_key, EXCLUDED.address_key),
      unit            = coalesce(pr.unit, EXCLUDED.unit),
      property_class  = CASE WHEN pr.property_type IS NULL THEN EXCLUDED.property_class  ELSE pr.property_class  END,
      type_source     = CASE WHEN pr.property_type IS NULL THEN EXCLUDED.type_source     ELSE pr.type_source     END,
      type_trust_tier = CASE WHEN pr.property_type IS NULL THEN EXCLUDED.type_trust_tier ELSE pr.type_trust_tier END,
      property_type   = coalesce(pr.property_type, EXCLUDED.property_type),
      occupancy       = coalesce(pr.occupancy, EXCLUDED.occupancy),
      source          = coalesce(pr.source, EXCLUDED.source),
      updated_at      = now()
    RETURNING (xmax = 0) AS inserted
  )
  SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted) INTO v_prop_ins, v_prop_upd FROM up;

  -- 3. Owners (Owner 1 + mailing address); Owner 2 stays as co_owner_name on the link.
  DROP TABLE IF EXISTS _pw;
  CREATE TEMP TABLE _pw ON COMMIT DROP AS
  SELECT p.*, g.id AS property_id,
         nullif(btrim(p.raw->>'Owner 1 First Name'), '') AS o_first,
         nullif(btrim(p.raw->>'Owner 1 Last Name'), '')  AS o_last,
         nullif(btrim(concat_ws(' ', nullif(btrim(p.raw->>'Owner 1 First Name'), ''), nullif(btrim(p.raw->>'Owner 1 Last Name'), ''))), '') AS o_name,
         nullif(btrim(p.raw->>'Mailing Address'), '') AS m_street,
         nullif(left(regexp_replace(coalesce(p.raw->>'Mailing Zip', ''), '[^0-9]', '', 'g'), 5), '') AS m_zip5
  FROM _pli p JOIN properties g ON g.geoid = p.geoid;

  ALTER TABLE _pw ADD COLUMN owner_key text;
  UPDATE _pw SET owner_key = upper(o_name) || '|'
                 || coalesce(normalize_street_address(regexp_replace(m_street, '\s*#\s*\S+$', '')), '') || '|'
                 || coalesce(m_zip5, '')
  WHERE o_name IS NOT NULL;

  INSERT INTO owner AS o (owner_key, display_name, first_name, last_name, owner_type, care_of_name,
                          mailing_address, mailing_unit, mailing_city, mailing_state, mailing_zip, mailing_county,
                          do_not_mail, is_tcpa_litigator, compliance_source, compliance_as_of, source)
  SELECT DISTINCT ON (w.owner_key)
         w.owner_key, w.o_name, w.o_first, w.o_last,
         owner_type_from_name(w.o_name, w.o_first IS NOT NULL),
         nullif(btrim(w.raw->>'Mailing Care of Name'), ''),
         w.m_street, nullif(btrim(w.raw->>'Mailing Unit #'), ''), nullif(initcap(btrim(w.raw->>'Mailing City')), ''),
         nullif(upper(btrim(w.raw->>'Mailing State')), ''), w.m_zip5, nullif(btrim(w.raw->>'Mailing County'), ''),
         bool_or(w.raw->>'Do Not Mail' = 'Yes') OVER (PARTITION BY w.owner_key),
         bool_or(w.raw->>'Litigator' = 'Yes')   OVER (PARTITION BY w.owner_key),
         'list:' || p_batch,
         max(w.added_on) OVER (PARTITION BY w.owner_key),
         'list:' || p_batch
  FROM _pw w
  WHERE w.owner_key IS NOT NULL
  ORDER BY w.owner_key, w.added_on DESC
  ON CONFLICT (owner_key) DO UPDATE SET
    do_not_mail       = coalesce(o.do_not_mail, false) OR coalesce(EXCLUDED.do_not_mail, false),
    is_tcpa_litigator = coalesce(o.is_tcpa_litigator, false) OR coalesce(EXCLUDED.is_tcpa_litigator, false),
    compliance_source = EXCLUDED.compliance_source,
    compliance_as_of  = greatest(o.compliance_as_of, EXCLUDED.compliance_as_of),
    care_of_name      = coalesce(o.care_of_name, EXCLUDED.care_of_name),
    mailing_county    = coalesce(o.mailing_county, EXCLUDED.mailing_county),
    owner_type        = coalesce(o.owner_type, EXCLUDED.owner_type),
    updated_at        = now();
  SELECT count(DISTINCT owner_key) INTO v_owners FROM _pw WHERE owner_key IS NOT NULL;

  INSERT INTO property_owner AS po (property_id, owner_id, role, co_owner_name, owner_occupied, valid_from,
                                    is_current, source, first_seen, last_seen)
  SELECT DISTINCT ON (w.property_id, o.id)
         w.property_id, o.id, 'owner',
         nullif(btrim(concat_ws(' ', nullif(btrim(w.raw->>'Owner 2 First Name'), ''), nullif(btrim(w.raw->>'Owner 2 Last Name'), ''))), ''),
         CASE w.raw->>'Owner Occupied' WHEN 'Yes' THEN true WHEN 'No' THEN false END,
         property_list_date(w.raw->>'Last Sale Recording Date'),
         true, 'list:' || p_batch, w.added_on, w.added_on
  FROM _pw w JOIN owner o ON o.owner_key = w.owner_key
  ORDER BY w.property_id, o.id, w.added_on DESC
  ON CONFLICT (property_id, owner_id, role) DO UPDATE SET
    co_owner_name = coalesce(po.co_owner_name, EXCLUDED.co_owner_name),
    valid_from    = coalesce(po.valid_from, EXCLUDED.valid_from),
    first_seen    = least(po.first_seen, EXCLUDED.first_seen),
    last_seen     = greatest(po.last_seen, EXCLUDED.last_seen);
  GET DIAGNOSTICS v_links = ROW_COUNT;

  -- 4. Contact points. DNC is sticky.
  INSERT INTO owner_contact_point AS cp (owner_id, kind, value, phone_line_type, dnc_status, rank, source, first_seen, last_seen)
  SELECT DISTINCT ON (o.id, ph.value)
         o.id, 'phone', ph.value,
         CASE lower(ph.line_type) WHEN 'cell' THEN 'cell' WHEN 'landline' THEN 'landline' WHEN 'voip' THEN 'voip' ELSE 'unknown' END,
         ph.dnc, ph.n, 'list:' || p_batch, w.added_on, w.added_on
  FROM _pw w
  JOIN owner o ON o.owner_key = w.owner_key
  CROSS JOIN LATERAL (
    SELECT n,
           right(regexp_replace(coalesce(w.raw->>('Phone ' || n), ''), '[^0-9]', '', 'g'), 10) AS value,
           w.raw->>('Phone ' || n || ' Type') AS line_type,
           CASE WHEN w.raw->>('Phone ' || n || ' DNC') ILIKE '%internal%' THEN 'internal_dnc'
                WHEN w.raw->>('Phone ' || n || ' DNC') ILIKE '%dnc%'      THEN 'public_dnc' END AS dnc
    FROM generate_series(1, 5) n
  ) ph
  WHERE length(ph.value) = 10
  ORDER BY o.id, ph.value, (ph.dnc IS NOT NULL) DESC, ph.n
  ON CONFLICT (owner_id, kind, value) DO UPDATE SET
    dnc_status      = coalesce(cp.dnc_status, EXCLUDED.dnc_status),
    phone_line_type = coalesce(nullif(cp.phone_line_type, 'unknown'), EXCLUDED.phone_line_type),
    rank            = least(cp.rank, EXCLUDED.rank),
    last_seen       = greatest(cp.last_seen, EXCLUDED.last_seen);
  GET DIAGNOSTICS v_phones = ROW_COUNT;

  INSERT INTO owner_contact_point AS cp (owner_id, kind, value, rank, source, first_seen, last_seen)
  SELECT DISTINCT ON (o.id, em.value)
         o.id, 'email', em.value, em.n, 'list:' || p_batch, w.added_on, w.added_on
  FROM _pw w
  JOIN owner o ON o.owner_key = w.owner_key
  CROSS JOIN LATERAL (
    SELECT n, lower(btrim(w.raw->>('Email ' || n))) AS value FROM generate_series(1, 4) n
  ) em
  WHERE em.value LIKE '%_@_%.__%'
  ORDER BY o.id, em.value, em.n
  ON CONFLICT (owner_id, kind, value) DO UPDATE SET
    rank      = least(cp.rank, EXCLUDED.rank),
    last_seen = greatest(cp.last_seen, EXCLUDED.last_seen);
  GET DIAGNOSTICS v_emails = ROW_COUNT;

  -- 5. Dated facts, every list field typed.
  INSERT INTO property_assessment AS pa (
    property_id, source, as_of, vendor_property_type, building_sqft, lot_sqft, effective_year_built,
    bedrooms, bathrooms, total_assessed_value, est_value, last_sale_date, last_sale_amount,
    open_loans_count, open_loans_balance, est_ltv, est_equity, lien_amount, mls_status, mls_date, mls_amount,
    owner_occupied, total_condition, interior_condition, exterior_condition, bathroom_condition,
    kitchen_condition, foreclosure_factor, property_status, notes)
  SELECT g.id, 'list:' || p_batch, pp.added_on,
         nullif(btrim(pp.raw->>'Property Type'), ''),
         nullif(property_list_num(pp.raw->>'Building Sqft'), 0),
         nullif(property_list_num(pp.raw->>'Lot Size Sqft'), 0),
         nullif(property_list_num(pp.raw->>'Effective Year Built'), 0)::int,
         nullif(property_list_num(pp.raw->>'Bedrooms'), 0),
         nullif(property_list_num(pp.raw->>'Total Bathrooms'), 0),
         nullif(property_list_num(pp.raw->>'Total Assessed Value'), 0),
         nullif(property_list_num(pp.raw->>'Est. Value'), 0),
         property_list_date(pp.raw->>'Last Sale Recording Date'),
         nullif(property_list_num(pp.raw->>'Last Sale Amount'), 0),
         property_list_num(pp.raw->>'Total Open Loans')::int,
         nullif(property_list_num(pp.raw->>'Est. Remaining balance of Open Loans'), 0),
         property_list_num(pp.raw->>'Est. Loan-to-Value'),
         property_list_num(pp.raw->>'Est. Equity'),
         nullif(property_list_num(pp.raw->>'Lien Amount'), 0),
         nullif(btrim(pp.raw->>'MLS Status'), ''),
         property_list_date(pp.raw->>'MLS Date'),
         nullif(property_list_num(pp.raw->>'MLS Amount'), 0),
         CASE pp.raw->>'Owner Occupied' WHEN 'Yes' THEN true WHEN 'No' THEN false END,
         nullif(btrim(pp.raw->>'Total Condition'), ''),
         nullif(btrim(pp.raw->>'Interior Condition'), ''),
         nullif(btrim(pp.raw->>'Exterior Condition'), ''),
         nullif(btrim(pp.raw->>'Bathroom Condition'), ''),
         nullif(btrim(pp.raw->>'Kitchen Condition'), ''),
         nullif(btrim(pp.raw->>'Foreclosure Factor'), ''),
         nullif(btrim(pp.raw->>'Property Status'), ''),
         nullif(btrim(pp.raw->>'Notes'), '')
  FROM _pp pp JOIN properties g ON g.geoid = pp.geoid
  ON CONFLICT (property_id, source, as_of) DO UPDATE SET
    vendor_property_type = EXCLUDED.vendor_property_type, building_sqft = EXCLUDED.building_sqft,
    lot_sqft = EXCLUDED.lot_sqft, effective_year_built = EXCLUDED.effective_year_built,
    bedrooms = EXCLUDED.bedrooms, bathrooms = EXCLUDED.bathrooms,
    total_assessed_value = EXCLUDED.total_assessed_value, est_value = EXCLUDED.est_value,
    last_sale_date = EXCLUDED.last_sale_date, last_sale_amount = EXCLUDED.last_sale_amount,
    open_loans_count = EXCLUDED.open_loans_count, open_loans_balance = EXCLUDED.open_loans_balance,
    est_ltv = EXCLUDED.est_ltv, est_equity = EXCLUDED.est_equity, lien_amount = EXCLUDED.lien_amount,
    mls_status = EXCLUDED.mls_status, mls_date = EXCLUDED.mls_date, mls_amount = EXCLUDED.mls_amount,
    owner_occupied = EXCLUDED.owner_occupied,
    total_condition = EXCLUDED.total_condition, interior_condition = EXCLUDED.interior_condition,
    exterior_condition = EXCLUDED.exterior_condition, bathroom_condition = EXCLUDED.bathroom_condition,
    kitchen_condition = EXCLUDED.kitchen_condition, foreclosure_factor = EXCLUDED.foreclosure_factor,
    property_status = EXCLUDED.property_status, notes = EXCLUDED.notes;
  GET DIAGNOSTICS v_assess = ROW_COUNT;

  -- 6. Stamp raw rows; refine Collin sub-types.
  UPDATE property_list_import i SET property_id = g.id, loaded_at = now()
  FROM _pli p JOIN properties g ON g.geoid = p.geoid
  WHERE i.import_batch = p_batch AND i.source_file = p.source_file AND i.row_number = p.row_number;

  v_refined := refine_property_type_from_collin_class();

  RETURN jsonb_build_object(
    'batch', p_batch, 'rows', v_rows, 'skipped_no_apn', v_no_apn, 'skipped_unmapped_county', v_no_county,
    'properties_inserted', v_prop_ins, 'properties_already_present', v_prop_upd,
    'owners', v_owners, 'property_owner_links', v_links,
    'phones_upserted', v_phones, 'emails_upserted', v_emails, 'assessments', v_assess,
    'collin_subtypes_refined', v_refined);
END;
$$;

-- ── AccuLynx job → property linking ────────────────────────────────────────────────
-- Street is cleaned the way scripts/export-acculynx-property-addresses.py cleans it
-- (house number or street name typed into street2, "City ST zip" riding in street1).
CREATE OR REPLACE FUNCTION public.acculynx_job_street(p_street1 text, p_street2 text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(btrim(regexp_replace(
           CASE WHEN s2 ~ '^\d+[A-Za-z]?(-\d+)?$' AND s1 !~ '^\d' THEN s2 || ' ' || s1
                WHEN s1 ~ '^\d+[A-Za-z]?$' AND s2 ~ '^[A-Za-z]'    THEN s1 || ' ' || s2
                ELSE s1 END,
           '([\s,]+[A-Za-z]{2}\.?\s+\d{5}(-\d{4})?|\s*(,\s*|\s+)(#|apt|apartment|unit|ste|suite|bldg|building|lot|spc|space|fl|floor|rm|room)\.?\s*#?\s*[\w-]+)\s*$', '', 'i')), '')
  FROM (SELECT btrim(regexp_replace(coalesce(p_street1, ''), '\s+', ' ', 'g')) AS s1,
               btrim(regexp_replace(coalesce(p_street2, ''), '\s+', ' ', 'g')) AS s2) x
$$;

CREATE OR REPLACE FUNCTION public.link_acculynx_jobs_to_properties()
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_addr int := 0; v_cad int := 0; v_sedg int := 0; v_open int;
BEGIN
  DROP TABLE IF EXISTS _jobs;
  CREATE TEMP TABLE _jobs ON COMMIT DROP AS
  SELECT j.id,
         normalize_street_address(acculynx_job_street(j.location_street1, j.raw->'locationAddress'->>'street2')) AS street_key,
         nullif(left(regexp_replace(coalesce(j.location_zip, ''), '[^0-9]', '', 'g'), 5), '') AS zip5
  FROM acculynx_jobs j
  WHERE j.property_id IS NULL;

  -- 1. Address: one active property at this street + zip (unit-agnostic; several = ambiguous).
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

  -- 2. Collin CAD situs: establish the parcel as a property, then link. (Separate
  --    statements: rows a CTE inserts are invisible to the rest of its own statement.)
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

  SELECT count(*) INTO v_open FROM acculynx_jobs WHERE property_id IS NULL;
  RETURN jsonb_build_object('linked_by_address', v_addr, 'linked_by_collin_cad', v_cad,
                            'linked_by_sedgwick_cad', v_sedg, 'jobs_still_unlinked', v_open);
END $$;

-- ── Prospect view: include apartment communities (commercial roofing targets) ──────
CREATE OR REPLACE VIEW public.v_commercial_prospect AS
SELECT p.id AS property_id, p.geoid, p.apn, p.address_full, p.unit, p.city, p.state_abbrev, p.zip, p.county,
       p.property_class, p.property_type, t.label AS property_type_label, p.occupancy,
       o.id AS owner_id, o.display_name AS owner_name, o.owner_type, o.is_tcpa_litigator, o.do_not_mail,
       (SELECT count(*) FROM public.v_owner_callable_phone c WHERE c.owner_id = o.id)                    AS callable_phones,
       (SELECT count(*) FROM public.owner_contact_point e WHERE e.owner_id = o.id AND e.kind = 'email')  AS emails,
       a.building_sqft, a.lot_sqft, a.effective_year_built, a.total_assessed_value, a.last_sale_date,
       (SELECT count(*) FROM public.property_owner x WHERE x.owner_id = o.id AND x.is_current)           AS owner_property_count,
       EXISTS (SELECT 1 FROM public.acculynx_jobs j WHERE j.property_id = p.id)                          AS is_acculynx_customer
FROM public.properties p
LEFT JOIN public.property_type_ref t ON t.property_type = p.property_type
LEFT JOIN LATERAL (
  SELECT po.owner_id FROM public.property_owner po
  WHERE po.property_id = p.id AND po.is_current AND po.role = 'owner'
  ORDER BY po.last_seen DESC NULLS LAST LIMIT 1
) cur ON true
LEFT JOIN public.owner o ON o.id = cur.owner_id
LEFT JOIN LATERAL (
  SELECT * FROM public.property_assessment pa WHERE pa.property_id = p.id ORDER BY pa.as_of DESC LIMIT 1
) a ON true
WHERE (p.property_class = 'commercial' OR p.property_type = 'multifamily_5_plus') AND p.status = 'active';

-- ── Access: service role only ──────────────────────────────────────────────────────
ALTER TABLE public.county_ref ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.county_ref FROM anon, authenticated;
GRANT ALL ON public.county_ref TO service_role;
REVOKE ALL ON FUNCTION public.load_property_list_import(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_acculynx_jobs_to_properties() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refine_property_type_from_collin_class() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_property_list_import(text), public.link_acculynx_jobs_to_properties(),
                          public.refine_property_type_from_collin_class() TO service_role;
REVOKE ALL ON public.v_commercial_prospect FROM anon, authenticated;
GRANT SELECT ON public.v_commercial_prospect TO service_role;
