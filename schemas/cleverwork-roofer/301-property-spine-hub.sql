-- 301 — Property spine hub (docs/113 §3, build step 1).
--
-- Ruling (Chris 2026-09-29): one property = one APN/address = one geoid. Multi-parcel
-- sites link by owner_id, never by property UUID. Every property carries
-- property_class / property_type / occupancy.
--
-- Adds, additively and idempotently (hard rule 1):
--   * properties: parcel identity (apn, county_fips, geoid UNIQUE), address_key, unit,
--     type/occupancy, lifecycle (status, merged_into_property_id), geom, jurisdiction_id
--   * property_type_ref      — the docs/113 §2 taxonomy
--   * property_identifier    — outside / superseded IDs for a property
--   * owner, property_owner  — ownership; the link for multi-parcel portfolios
--   * owner_contact_point    — skip-traced phones/emails with DNC status
--   * property_assessment    — dated physical + valuation facts per source (era-aware)
--   * property_list_import   — raw vendor rows, preserved verbatim before extraction
--
-- CRM coexistence (docs/110, docs/111): crm.create_effort INSERTs into public.properties
-- and crm.property_links / crm.property_details hold FKs to it. Every new properties
-- column is therefore NULLable or defaulted, and the CRM reader's explicit column grant
-- (crm_property_reader) is untouched, so the CRM sees no change.
--
-- Access: the public schema's default ACL grants anon/authenticated ALL on new tables.
-- These tables hold owner names, phones and emails, so each one is REVOKEd from
-- anon/authenticated and read only through the service-role client (docs/300 pattern).
--
-- Rollback: the new tables are empty until a loader runs; drop them only by a reviewed
-- migration. The properties columns and constraints can be left in place (all nullable).

-- ── Taxonomy ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.property_type_ref (
  property_type  text PRIMARY KEY,
  property_class text NOT NULL CHECK (property_class IN ('residential', 'commercial', 'land')),
  label          text NOT NULL,
  sort_order     integer NOT NULL,
  CONSTRAINT property_type_ref_type_class_key UNIQUE (property_type, property_class)
);

INSERT INTO public.property_type_ref (property_type, property_class, label, sort_order) VALUES
  ('single_family',            'residential', 'Single-family detached',                      10),
  ('townhome',                 'residential', 'Townhome / attached single-family',           20),
  ('condo',                    'residential', 'Condominium unit',                            30),
  ('multifamily_2_4',          'residential', 'Multi-family, 2-4 units',                     40),
  ('multifamily_5_plus',       'residential', 'Multi-family, 5+ units (apartment community)', 50),
  ('manufactured',             'residential', 'Manufactured / mobile home',                  60),
  ('residential_other',        'residential', 'Residential, other',                          90),
  ('office',                   'commercial',  'Office',                                     110),
  ('medical_office',           'commercial',  'Medical office / clinic',                    120),
  ('commercial_condo',         'commercial',  'Commercial condominium unit',                125),
  ('retail',                   'commercial',  'Retail, standalone',                         130),
  ('shopping_center',          'commercial',  'Shopping / strip center',                    140),
  ('restaurant',               'commercial',  'Restaurant',                                 150),
  ('hospitality',              'commercial',  'Hotel / motel',                              160),
  ('industrial_warehouse',     'commercial',  'Warehouse / distribution',                   170),
  ('industrial_manufacturing', 'commercial',  'Manufacturing',                              180),
  ('flex',                     'commercial',  'Flex / light industrial',                    190),
  ('self_storage',             'commercial',  'Self-storage',                               200),
  ('auto',                     'commercial',  'Auto dealership / service / car wash',       210),
  ('parking',                  'commercial',  'Parking structure',                          215),
  ('healthcare',               'commercial',  'Hospital / healthcare / veterinary',         220),
  ('senior_living',            'commercial',  'Senior / assisted living',                   230),
  ('education',                'commercial',  'School / university / day care',             240),
  ('religious',                'commercial',  'House of worship',                           250),
  ('government',               'commercial',  'Government / civic',                         260),
  ('recreation',               'commercial',  'Recreation / fitness / clubhouse',           270),
  ('hoa_common',               'commercial',  'HOA common-area building',                   280),
  ('mixed_use',                'commercial',  'Mixed-use',                                  290),
  ('agricultural',             'commercial',  'Agricultural improvements',                  300),
  ('commercial_other',         'commercial',  'Commercial, other',                          390),
  ('vacant_land',              'land',        'Vacant lot / land, no structure',            410)
ON CONFLICT (property_type) DO UPDATE
  SET property_class = EXCLUDED.property_class, label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

-- ── properties: identity, type, lifecycle ──────────────────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS apn                     text,
  ADD COLUMN IF NOT EXISTS apn_normalized          text,
  ADD COLUMN IF NOT EXISTS county_fips             text,
  ADD COLUMN IF NOT EXISTS parcel_source           text,
  ADD COLUMN IF NOT EXISTS address_key             text,
  ADD COLUMN IF NOT EXISTS unit                    text,
  ADD COLUMN IF NOT EXISTS geom                    geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS jurisdiction_id         uuid REFERENCES public.jurisdiction(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS property_class          text,
  ADD COLUMN IF NOT EXISTS property_type           text,
  ADD COLUMN IF NOT EXISTS occupancy               text,
  ADD COLUMN IF NOT EXISTS type_source             text,
  ADD COLUMN IF NOT EXISTS type_trust_tier         text,
  ADD COLUMN IF NOT EXISTS units_count             integer,
  ADD COLUMN IF NOT EXISTS source                  text,
  ADD COLUMN IF NOT EXISTS status                  text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS merged_into_property_id uuid REFERENCES public.properties(id);

COMMENT ON COLUMN public.properties.geoid IS
  'One parcel = one geoid (docs/113 §1). Collin/Sedgwick keep their CAD format (R-..., SGK-...); other counties mint <5-digit county FIPS>-<normalized APN>. Join on property id, never on geoid.';
COMMENT ON COLUMN public.properties.address_key IS
  'normalize_street_address(street) | unit | zip5. Identity for address-only rows (geoid IS NULL) until an APN is known.';
COMMENT ON COLUMN public.properties.occupancy IS
  'owner_occupied | renter_occupied (for commercial: leased / not owner-occupied) | vacant | unknown.';

ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_property_class_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_property_class_check
  CHECK (property_class IS NULL OR property_class IN ('residential', 'commercial', 'land'));
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_occupancy_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_occupancy_check
  CHECK (occupancy IS NULL OR occupancy IN ('owner_occupied', 'renter_occupied', 'vacant', 'unknown'));
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_type_trust_tier_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_type_trust_tier_check
  CHECK (type_trust_tier IS NULL OR type_trust_tier IN ('evidence', 'instruction'));
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_status_check
  CHECK (status IN ('active', 'merged'));

DO $$
BEGIN
  -- type and class must agree with the taxonomy (MATCH SIMPLE: unenforced while either is NULL)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_type_class_fkey') THEN
    ALTER TABLE public.properties ADD CONSTRAINT properties_type_class_fkey
      FOREIGN KEY (property_type, property_class)
      REFERENCES public.property_type_ref (property_type, property_class);
  END IF;
  -- one geoid = one property (NULLs are distinct, so address-only rows are unaffected)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_geoid_key') THEN
    ALTER TABLE public.properties ADD CONSTRAINT properties_geoid_key UNIQUE (geoid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_county_apn_key') THEN
    ALTER TABLE public.properties ADD CONSTRAINT properties_county_apn_key UNIQUE (county_fips, apn_normalized);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS properties_address_key_no_parcel_uidx
  ON public.properties (address_key)
  WHERE geoid IS NULL AND address_key IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS properties_type_idx ON public.properties (property_class, property_type);
CREATE INDEX IF NOT EXISTS properties_address_key_idx ON public.properties (address_key);

-- CAD lookups by geoid. Deliberately NOT unique: a future tax-year load appends rows with
-- the same geoid ((propid, propyear) is the table's own key), and a unique index would
-- break that load.
CREATE INDEX IF NOT EXISTS idx_cad_geoid ON public.collin_cad_appraisal_data (geoid);

-- ── Outside and superseded identifiers ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.property_identifier (
  id_type      text NOT NULL,           -- legacy_geoid, superseded_apn, acculynx_location, ghl_property, stormwatch_research, eagleview_report
  id_value     text NOT NULL,
  property_id  uuid NOT NULL REFERENCES public.properties(id),
  source       text,
  match_method text,
  confidence   numeric,
  trust_tier   text NOT NULL DEFAULT 'evidence' CHECK (trust_tier IN ('evidence', 'instruction')),
  valid_from   date,
  valid_to     date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_type, id_value)
);
CREATE INDEX IF NOT EXISTS property_identifier_property_idx ON public.property_identifier (property_id);

-- ── Owners ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.owner (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_key          text NOT NULL UNIQUE,   -- upper(name) | normalized mailing street | mailing zip5
  display_name       text NOT NULL,
  first_name         text,
  last_name          text,
  owner_type         text CHECK (owner_type IS NULL OR owner_type IN
                       ('individual', 'company', 'trust', 'government', 'hoa', 'religious', 'other')),
  care_of_name       text,
  mailing_address    text,
  mailing_unit       text,
  mailing_city       text,
  mailing_state      text,
  mailing_zip        text,
  mailing_county     text,
  do_not_mail        boolean,
  is_tcpa_litigator  boolean,               -- vendor litigator flag: never dial, route to a human
  compliance_source  text,
  compliance_as_of   date,
  source             text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.owner IS
  'Legal owner of one or more properties (docs/113 §1). Owners tie multi-parcel sites and portfolios together; properties never share a UUID.';

CREATE TABLE IF NOT EXISTS public.property_owner (
  property_id    uuid NOT NULL REFERENCES public.properties(id),
  owner_id       uuid NOT NULL REFERENCES public.owner(id),
  role           text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'co_owner')),
  co_owner_name  text,                      -- second owner as printed by the source; not yet an owner entity
  owner_occupied boolean,
  valid_from     date,                      -- last recorded sale, when the source gives it
  valid_to       date,
  is_current     boolean NOT NULL DEFAULT true,
  source         text NOT NULL,
  first_seen     date,
  last_seen      date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, owner_id, role)
);
CREATE INDEX IF NOT EXISTS property_owner_owner_idx ON public.property_owner (owner_id);

CREATE TABLE IF NOT EXISTS public.owner_contact_point (
  owner_id        uuid NOT NULL REFERENCES public.owner(id),
  kind            text NOT NULL CHECK (kind IN ('phone', 'email')),
  value           text NOT NULL,           -- phone: 10 digits; email: lower-case
  phone_line_type text CHECK (phone_line_type IS NULL OR phone_line_type IN ('cell', 'landline', 'voip', 'unknown')),
  dnc_status      text CHECK (dnc_status IS NULL OR dnc_status IN ('public_dnc', 'internal_dnc')),
  rank            smallint,
  source          text NOT NULL,
  first_seen      date,
  last_seen       date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, kind, value)
);
COMMENT ON COLUMN public.owner_contact_point.dnc_status IS
  'Sticky: once a number is flagged DNC a later load never clears it. Dial only through v_owner_callable_phone.';

-- ── Dated physical and valuation facts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.property_assessment (
  property_id          uuid NOT NULL REFERENCES public.properties(id),
  source               text NOT NULL,
  as_of                date NOT NULL,
  vendor_property_type text,
  building_sqft        numeric,
  lot_sqft             numeric,
  effective_year_built integer,
  bedrooms             numeric,
  bathrooms            numeric,
  total_assessed_value numeric,
  est_value            numeric,
  last_sale_date       date,
  last_sale_amount     numeric,
  open_loans_count     integer,
  open_loans_balance   numeric,
  est_ltv              numeric,
  est_equity           numeric,
  lien_amount          numeric,
  mls_status           text,
  mls_date             date,
  mls_amount           numeric,
  owner_occupied       boolean,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, source, as_of)
);

-- ── Raw vendor rows, preserved before extraction ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.property_list_import (
  import_batch text NOT NULL,
  source_file  text NOT NULL,
  row_number   integer NOT NULL,
  market       text,
  apn          text,
  county       text,
  raw          jsonb NOT NULL,
  property_id  uuid REFERENCES public.properties(id),
  loaded_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (import_batch, source_file, row_number)
);
CREATE INDEX IF NOT EXISTS property_list_import_apn_idx ON public.property_list_import (apn);

-- ── Access: service role only ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['property_type_ref', 'property_identifier', 'owner', 'property_owner',
                           'owner_contact_point', 'property_assessment', 'property_list_import'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
