-- 302 — Parcel-list loader + CRM read views (docs/113 §4, docs/114).
--
-- load_property_list_import(batch) turns raw rows in property_list_import (the
-- property-list export format: Address, Unit #, City, State, Zip, County, APN, Phone 1..5
-- with Type/DNC, Email 1..4, Owner 1/2, Mailing *, Litigator, Do Not Mail, Property Type,
-- Building Sqft, ... 75 columns) into the property spine:
--   properties (one per geoid) → property_owner → owner → owner_contact_point,
--   plus one property_assessment row per property per batch.
--
-- Identity (docs/113 §1): Collin County APNs ARE the Collin CAD geoid (R-3744-00A-001R-1),
-- so they are used verbatim. Other mapped counties mint '<county FIPS>-<normalized APN>'.
-- A county not in the map is skipped and counted, never guessed. Sedgwick is deliberately
-- absent: its geoid is the SGK- form, and minting FIPS-APN would duplicate those parcels.
--
-- Precedence: it never overwrites a value another source already set on properties
-- (COALESCE existing first). Type is only set where the property has none. DNC flags,
-- the litigator flag and do-not-mail are sticky: a later load can set them, never clear them.
-- Re-running a batch is idempotent.
--
-- Additive (hard rule 1). Functions/views are service-role only.

-- ── Safe casts for vendor text ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.property_list_num(t text)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN s ~ '^-?[0-9]+(\.[0-9]+)?$' THEN s::numeric END
  FROM (SELECT rtrim(regexp_replace(coalesce(t, ''), '[^0-9.\-]', '', 'g'), '.') AS s) x
$$;

CREATE OR REPLACE FUNCTION public.property_list_date(t text)
RETURNS date LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN t ~ '^\d{4}-\d{2}-\d{2}' THEN left(t, 10)::date END
$$;

-- ── Type from sources (docs/113 §2 precedence) ─────────────────────────────────────
-- A specific vendor land-use label wins. Generic labels ("Commercial (General)",
-- "Miscellaneous (General)", "Commercial Building") fall through to the county code.
-- County "no improvement" codes (C1 vacant lot, D1 ag land, E rural land) override any
-- vendor label: a parcel with no structure cannot be a restaurant.
CREATE OR REPLACE FUNCTION public.property_type_from_sources(
  p_vendor_type text, p_cad_category text, p_building_sqft numeric,
  OUT property_class text, OUT property_type text, OUT type_source text)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT split_part(r, '|', 1), split_part(r, '|', 2), split_part(r, '|', 3) FROM (
    SELECT CASE
      WHEN p_cad_category IN ('C1', 'D1', 'E')                         THEN 'land|vacant_land|county_cad'
      WHEN v ILIKE 'commercial condominium%'                            THEN 'commercial|commercial_condo|vendor_list'
      WHEN v ILIKE '%shopping center%' OR v ILIKE '%strip center%' OR v ILIKE '%mall%'
                                                                        THEN 'commercial|shopping_center|vendor_list'
      WHEN v ILIKE '%restaurant%' OR v ILIKE '%fast food%'              THEN 'commercial|restaurant|vendor_list'
      WHEN v ILIKE 'hotel%' OR v ILIKE '%motel%'                        THEN 'commercial|hospitality|vendor_list'
      WHEN v ILIKE '%storage%'                                          THEN 'commercial|self_storage|vendor_list'
      WHEN v ILIKE 'auto%' OR v ILIKE '%car wash%' OR v ILIKE 'vehicle%' OR v ILIKE 'service station%'
                                                                        THEN 'commercial|auto|vendor_list'
      WHEN v ILIKE 'parking%'                                           THEN 'commercial|parking|vendor_list'
      WHEN v ILIKE '%veterinary%' OR v ILIKE '%hospital%' OR v ILIKE '%medical%'
                                                                        THEN 'commercial|healthcare|vendor_list'
      WHEN v ILIKE '%day care%' OR v ILIKE '%school%' OR v ILIKE '%college%'
                                                                        THEN 'commercial|education|vendor_list'
      WHEN v ILIKE '%church%' OR v ILIKE '%worship%'                    THEN 'commercial|religious|vendor_list'
      WHEN v ILIKE '%office%'                                           THEN 'commercial|office|vendor_list'
      WHEN v ILIKE '%warehouse%' OR v ILIKE '%distribution%'            THEN 'commercial|industrial_warehouse|vendor_list'
      WHEN v ILIKE 'store%' OR v ILIKE 'retail%' OR v ILIKE 'grocery%' OR v ILIKE '%supermarket%'
                                                                        THEN 'commercial|retail|vendor_list'
      WHEN p_cad_category = 'F2'                                        THEN 'commercial|industrial_manufacturing|county_cad'
      WHEN p_cad_category IN ('A', 'O')                                 THEN 'residential|single_family|county_cad'
      WHEN p_cad_category = 'B'                                         THEN 'residential|residential_other|county_cad'
      WHEN p_cad_category = 'M1'                                        THEN 'residential|manufactured|county_cad'
      WHEN p_cad_category = 'D2'                                        THEN 'commercial|agricultural|county_cad'
      WHEN p_cad_category = 'F1'                                        THEN 'commercial|commercial_other|county_cad'
      WHEN v ILIKE 'miscellaneous%' AND coalesce(p_building_sqft, 0) = 0 THEN 'land|vacant_land|vendor_list_inferred'
      WHEN v IS NOT NULL                                                THEN 'commercial|commercial_other|vendor_list'
      ELSE NULL
    END AS r
    FROM (SELECT nullif(btrim(p_vendor_type), '') AS v) x
  ) y
  WHERE r IS NOT NULL
$$;

-- ── Owner type from the printed name ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.owner_type_from_name(p_name text, p_has_first_name boolean)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN n IS NULL THEN NULL
    WHEN n ~ '(OWNERS? ASS|PROPERTY OWNERS|COMMUNITY ASS|CONDOMINIUM ASS|HOMEOWNERS|\mHOA\M|\mPOA\M)' THEN 'hoa'
    WHEN n ~ '(CITY OF|COUNTY OF|STATE OF|\mISD\M|INDEPENDENT SCHOOL|\mDISTRICT\M|\mAUTHORITY\M|UNITED STATES|\mTXDOT\M|COLLEGE DIST)' THEN 'government'
    WHEN n ~ '(CHURCH|MINISTR|BAPTIST|METHODIST|CATHOLIC|DIOCESE|LUTHERAN|PRESBYTERIAN|\mTEMPLE\M|MOSQUE|SYNAGOGUE)' THEN 'religious'
    WHEN n ~ '(\mTRUST\M|\mTRUSTEE|\mTR\M|LIVING TR|FAMILY TR)' THEN 'trust'
    WHEN n ~ '(\mLLC\M|\mL L C\M|\mINC\M|\mCORP|\mCO\M|COMPANY|\mLP\M|\mLTD\M|\mLLP\M|PARTNERS|HOLDING|INVEST|PROPERT|\mGROUP\M|\mBANK\M|\mFUND\M|\mREIT\M|VENTURE|ENTERPRISE|ASSOCIATES|CAPITAL|REALTY|MANAGEMENT|DEVELOPMENT|\mJV\M|\mPLLC\M|\mPC\M|\mPA\M)' THEN 'company'
    WHEN p_has_first_name THEN 'individual'
    ELSE 'other'
  END
  FROM (SELECT upper(nullif(btrim(p_name), '')) AS n) x
$$;

-- ── The loader ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.load_property_list_import(p_batch text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows int; v_no_county int; v_no_apn int;
  v_prop_ins int; v_prop_upd int; v_owners int; v_links int; v_phones int; v_emails int; v_assess int;
BEGIN
  -- 1. Parse every raw row of the batch.
  DROP TABLE IF EXISTS _pli;
  CREATE TEMP TABLE _pli ON COMMIT DROP AS
  WITH r AS (
    SELECT i.source_file, i.row_number, i.market, i.raw,
           nullif(btrim(i.raw->>'APN'), '')                                             AS apn,
           nullif(btrim(i.raw->>'County'), '')                                          AS county,
           upper(nullif(btrim(i.raw->>'State'), ''))                                    AS st,
           nullif(btrim(regexp_replace(coalesce(i.raw->>'Address', ''), '\s+', ' ', 'g')), '') AS address,
           nullif(btrim(i.raw->>'Unit #'), '')                                          AS unit,
           nullif(initcap(btrim(regexp_replace(coalesce(i.raw->>'City', ''), '\s+', ' ', 'g'))), '') AS city,
           nullif(left(regexp_replace(coalesce(i.raw->>'Zip', ''), '[^0-9]', '', 'g'), 5), '') AS zip5,
           coalesce(property_list_date(i.raw->>'Date Added to List'), current_date)      AS added_on
    FROM property_list_import i
    WHERE i.import_batch = p_batch
  )
  SELECT r.*,
         c.fips                                                   AS county_fips,
         upper(regexp_replace(r.apn, '[^A-Za-z0-9]', '', 'g'))    AS apn_norm,
         CASE WHEN c.fips = '48085' THEN r.apn
              WHEN c.fips IS NOT NULL THEN c.fips || '-' || upper(regexp_replace(r.apn, '[^A-Za-z0-9]', '', 'g'))
         END                                                      AS geoid,
         nullif(btrim(regexp_replace(r.address, '\s*#\s*\S+$', '')), '') AS street
  FROM r
  LEFT JOIN (VALUES ('TX', 'COLLIN', '48085'), ('TX', 'DALLAS', '48113'), ('TX', 'DENTON', '48121'),
                    ('TX', 'TARRANT', '48439'), ('TX', 'ROCKWALL', '48397')) c(st, county, fips)
         ON c.st = r.st AND c.county = upper(r.county) AND r.apn IS NOT NULL;

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
      CASE pp.st WHEN 'TX' THEN 'Texas' WHEN 'KS' THEN 'Kansas' WHEN 'MO' THEN 'Missouri' ELSE pp.st END,
      pp.st, pp.zip5, initcap(pp.county), 'US',
      pp.geoid, pp.apn, pp.apn_norm, pp.county_fips,
      CASE WHEN pp.cad_category IS NOT NULL THEN 'collin_cad' ELSE 'list:' || p_batch END,
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

  -- 3. Owners (Owner 1 + mailing address). Owner 2 is kept as co_owner_name on the link:
  --    the source prints it without its own mailing address, and it is often a truncation.
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

  -- 4. Contact points. DNC is sticky: once flagged, a later load never clears it.
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

  -- 5. Dated facts: one row per property per batch (re-running refreshes it).
  INSERT INTO property_assessment AS pa (
    property_id, source, as_of, vendor_property_type, building_sqft, lot_sqft, effective_year_built,
    bedrooms, bathrooms, total_assessed_value, est_value, last_sale_date, last_sale_amount,
    open_loans_count, open_loans_balance, est_ltv, est_equity, lien_amount, mls_status, mls_date, mls_amount,
    owner_occupied)
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
         CASE pp.raw->>'Owner Occupied' WHEN 'Yes' THEN true WHEN 'No' THEN false END
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
    owner_occupied = EXCLUDED.owner_occupied;
  GET DIAGNOSTICS v_assess = ROW_COUNT;

  -- 6. Stamp the raw rows with their property.
  UPDATE property_list_import i SET property_id = g.id, loaded_at = now()
  FROM _pli p JOIN properties g ON g.geoid = p.geoid
  WHERE i.import_batch = p_batch AND i.source_file = p.source_file AND i.row_number = p.row_number;

  RETURN jsonb_build_object(
    'batch', p_batch, 'rows', v_rows, 'skipped_no_apn', v_no_apn, 'skipped_unmapped_county', v_no_county,
    'properties_inserted', v_prop_ins, 'properties_already_present', v_prop_upd,
    'owners', v_owners, 'property_owner_links', v_links,
    'phones_upserted', v_phones, 'emails_upserted', v_emails, 'assessments', v_assess);
END;
$$;

-- ── CRM read views ─────────────────────────────────────────────────────────────────
-- Phones an agent may dial: not DNC-flagged and the owner is not a flagged TCPA litigator.
-- This is a suppression floor, not legal clearance: cell numbers still need the consent
-- rules that apply to automated dialing, and do_not_mail governs mail separately.
CREATE OR REPLACE VIEW public.v_owner_callable_phone AS
SELECT cp.owner_id, o.display_name, o.owner_type, cp.value AS phone, cp.phone_line_type, cp.rank, cp.last_seen
FROM public.owner_contact_point cp
JOIN public.owner o ON o.id = cp.owner_id
WHERE cp.kind = 'phone'
  AND cp.dnc_status IS NULL
  AND NOT coalesce(o.is_tcpa_litigator, false);

-- Owner portfolio: every current property an owner holds (the multi-parcel link, docs/113 §1).
CREATE OR REPLACE VIEW public.v_owner_portfolio AS
SELECT o.id AS owner_id, o.display_name, o.owner_type,
       o.mailing_address, o.mailing_city, o.mailing_state, o.mailing_zip,
       o.is_tcpa_litigator, o.do_not_mail,
       count(DISTINCT po.property_id)                                   AS property_count,
       count(DISTINCT po.property_id) FILTER (WHERE p.property_class = 'commercial') AS commercial_count,
       sum(a.building_sqft)                                             AS building_sqft,
       sum(a.total_assessed_value)                                      AS total_assessed_value,
       array_agg(DISTINCT p.city ORDER BY p.city)                       AS cities
FROM public.owner o
JOIN public.property_owner po ON po.owner_id = o.id AND po.is_current
JOIN public.properties p ON p.id = po.property_id AND p.status = 'active'
LEFT JOIN LATERAL (
  SELECT building_sqft, total_assessed_value FROM public.property_assessment pa
  WHERE pa.property_id = p.id ORDER BY pa.as_of DESC LIMIT 1
) a ON true
GROUP BY o.id;

-- One row per commercial property with its owner, reachability and latest facts: the feed
-- a CRM commercial pipeline reads (through a crm_gateway view the CRM publishes, docs/110 §3).
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
WHERE p.property_class = 'commercial' AND p.status = 'active';

-- ── Access: service role only ──────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.load_property_list_import(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_property_list_import(text) TO service_role;
REVOKE ALL ON public.v_owner_callable_phone FROM anon, authenticated;
REVOKE ALL ON public.v_owner_portfolio      FROM anon, authenticated;
REVOKE ALL ON public.v_commercial_prospect  FROM anon, authenticated;
GRANT SELECT ON public.v_owner_callable_phone, public.v_owner_portfolio, public.v_commercial_prospect TO service_role;
