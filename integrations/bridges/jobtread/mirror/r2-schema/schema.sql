/*
  JobTread mirror and AccuLynx read-backfill scaffolding.

  Mapping contracts honored:
    integrations/bridges/jobtread/mirror/cost-accounting/mapping.md
    integrations/bridges/jobtread/mirror/jobs-core/mapping.md
    integrations/bridges/jobtread/mirror/branches-salesreps/mapping.md
    integrations/bridges/jobtread/mirror/pricing-catalog/mapping.md
    integrations/bridges/jobtread/mirror/vendors/mapping.md
    integrations/bridges/jobtread/mirror/companycam-links/mapping.md
    integrations/bridges/jobtread/mirror/estimates/mapping.md
    integrations/bridges/jobtread/mirror/stages-milestones/mapping.md
    integrations/bridges/jobtread/mirror/production/mapping.md

  Scope:
    Additive, idempotent DDL only in the new jt_mirror and
    acculynx_backfill schemas. No existing schema or object is changed.
    AccuLynx IDs and JobTread IDs remain opaque text. No credentials,
    API calls, data loads, grants, or RLS changes are included.

  Contract decisions:
    - source_id must contain the complete stable source identity when a
      source partitions IDs by account (for example account_key + GUID).
    - representative roles remain descriptive source data and are never
      modeled as JobTread users or memberships.
    - milestone settings preserve customer-defined spelling and raw status
      payloads; observed milestone history does not define settings.
    - worksheet_lines is deliberately lossless and provenance-first because
      worksheet section nesting varies by endpoint payload.
*/

CREATE SCHEMA IF NOT EXISTS jt_mirror;
CREATE SCHEMA IF NOT EXISTS acculynx_backfill;

CREATE TABLE IF NOT EXISTS jt_mirror.crosswalk (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_system text NOT NULL,
  source_id text NOT NULL,
  source_table text NOT NULL,
  source_account_key text,
  jt_organization_id text,
  jt_type text NOT NULL,
  jt_id text NOT NULL,
  domain text NOT NULL,
  source_fingerprint text,
  source_modified_at timestamptz,
  loader_version text,
  disposition text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  CONSTRAINT crosswalk_source_identity_unique
    UNIQUE (source_system, source_id, jt_type),
  CONSTRAINT crosswalk_target_identity_unique
    UNIQUE (jt_organization_id, jt_type, jt_id)
);

CREATE INDEX IF NOT EXISTS crosswalk_domain_idx
  ON jt_mirror.crosswalk (domain, source_table);
CREATE INDEX IF NOT EXISTS crosswalk_source_account_idx
  ON jt_mirror.crosswalk (source_system, source_account_key, source_table);

CREATE TABLE IF NOT EXISTS jt_mirror.pending_write (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain text NOT NULL,
  pave_op text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'staged',
  source_ref text NOT NULL,
  idempotency_key text,
  target_env text NOT NULL DEFAULT 'production',
  attempt integer NOT NULL DEFAULT 0,
  error text,
  jt_id text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  CONSTRAINT pending_write_status_allowed
    CHECK (status IN ('staged', 'approved', 'executed', 'failed', 'skipped')),
  CONSTRAINT pending_write_attempt_nonnegative CHECK (attempt >= 0),
  CONSTRAINT pending_write_source_ref_unique UNIQUE (domain, source_ref, pave_op),
  CONSTRAINT pending_write_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS pending_write_status_idx
  ON jt_mirror.pending_write (status, domain, created_at);

CREATE TABLE IF NOT EXISTS jt_mirror.write_action_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pending_write_id bigint,
  domain text NOT NULL,
  pave_op text NOT NULL,
  source_ref text,
  idempotency_key text,
  attempt integer NOT NULL DEFAULT 0,
  actor text,
  target_env text NOT NULL DEFAULT 'production',
  request_body_sample jsonb,
  response_body jsonb,
  http_status integer,
  status text NOT NULL,
  error text,
  jt_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT write_action_log_attempt_nonnegative CHECK (attempt >= 0),
  CONSTRAINT write_action_log_pending_write_fk
    FOREIGN KEY (pending_write_id) REFERENCES jt_mirror.pending_write (id)
);

CREATE INDEX IF NOT EXISTS write_action_log_pending_idx
  ON jt_mirror.write_action_log (pending_write_id, created_at);
CREATE INDEX IF NOT EXISTS write_action_log_source_idx
  ON jt_mirror.write_action_log (domain, source_ref, created_at);

CREATE TABLE IF NOT EXISTS jt_mirror.accounts (
  jt_id text PRIMARY KEY,
  jt_organization_id text,
  account_type text,
  name text,
  number text,
  raw jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jt_mirror.locations (
  jt_id text PRIMARY KEY,
  jt_organization_id text,
  account_jt_id text,
  name text,
  number text,
  address text,
  raw jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS locations_account_jt_id_idx
  ON jt_mirror.locations (account_jt_id);

CREATE TABLE IF NOT EXISTS jt_mirror.jobs (
  jt_id text PRIMARY KEY,
  jt_organization_id text,
  account_jt_id text,
  location_jt_id text,
  name text,
  number text,
  status text,
  raw jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_location_jt_id_idx
  ON jt_mirror.jobs (location_jt_id);
CREATE INDEX IF NOT EXISTS jobs_number_idx
  ON jt_mirror.jobs (jt_organization_id, number);

CREATE TABLE IF NOT EXISTS jt_mirror.documents (
  jt_id text PRIMARY KEY,
  jt_organization_id text,
  job_jt_id text,
  account_jt_id text,
  document_type text,
  name text,
  number text,
  external_id text,
  status text,
  total numeric,
  raw jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_job_jt_id_idx
  ON jt_mirror.documents (job_jt_id);
CREATE UNIQUE INDEX IF NOT EXISTS documents_org_external_id_unique
  ON jt_mirror.documents (jt_organization_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS jt_mirror.cost_items (
  jt_id text PRIMARY KEY,
  jt_organization_id text,
  job_jt_id text,
  document_jt_id text,
  cost_code_jt_id text,
  cost_type_jt_id text,
  unit_jt_id text,
  name text,
  number text,
  description text,
  quantity numeric,
  unit_cost numeric,
  unit_price numeric,
  raw jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cost_items_job_jt_id_idx
  ON jt_mirror.cost_items (job_jt_id);
CREATE INDEX IF NOT EXISTS cost_items_document_jt_id_idx
  ON jt_mirror.cost_items (document_jt_id);

CREATE TABLE IF NOT EXISTS jt_mirror.cost_codes (
  jt_id text PRIMARY KEY,
  jt_organization_id text,
  parent_jt_id text,
  name text,
  number text,
  raw jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cost_codes_parent_jt_id_idx
  ON jt_mirror.cost_codes (parent_jt_id);
CREATE UNIQUE INDEX IF NOT EXISTS cost_codes_org_number_unique
  ON jt_mirror.cost_codes (jt_organization_id, number)
  WHERE number IS NOT NULL;

CREATE TABLE IF NOT EXISTS jt_mirror.custom_fields (
  jt_id text PRIMARY KEY,
  jt_organization_id text,
  target_type text,
  field_type text,
  name text,
  number text,
  options jsonb,
  raw jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_fields_org_target_idx
  ON jt_mirror.custom_fields (jt_organization_id, target_type, name);

CREATE TABLE IF NOT EXISTS acculynx_backfill.estimate_sections (
  account_key text NOT NULL,
  acculynx_id text NOT NULL,
  estimate_id text NOT NULL,
  job_id text,
  parent_section_id text,
  name text,
  description text,
  section_type text,
  sort_order integer,
  total_price numeric,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_endpoint text NOT NULL,
  PRIMARY KEY (account_key, acculynx_id)
);

CREATE INDEX IF NOT EXISTS estimate_sections_estimate_idx
  ON acculynx_backfill.estimate_sections (account_key, estimate_id, sort_order);

CREATE TABLE IF NOT EXISTS acculynx_backfill.estimate_items (
  account_key text NOT NULL,
  acculynx_id text NOT NULL,
  estimate_id text NOT NULL,
  section_id text NOT NULL,
  job_id text,
  parent_item_id text,
  name text,
  override_name text,
  description text,
  item_type text,
  estimate_unit text,
  order_unit text,
  quantity numeric,
  measurement_quantity numeric,
  order_quantity numeric,
  unit_conversion numeric,
  material_cost numeric,
  labor_cost numeric,
  price numeric,
  total_price numeric,
  waste numeric,
  fixed_price boolean,
  sort_order integer,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_endpoint text NOT NULL,
  PRIMARY KEY (account_key, acculynx_id)
);

CREATE INDEX IF NOT EXISTS estimate_items_parent_idx
  ON acculynx_backfill.estimate_items
    (account_key, estimate_id, section_id, sort_order);

CREATE TABLE IF NOT EXISTS acculynx_backfill.job_representatives (
  account_key text NOT NULL,
  acculynx_id text NOT NULL,
  job_id text NOT NULL,
  user_id text NOT NULL,
  parent_representative_id text,
  representative_type text NOT NULL,
  user_display_name text,
  user_status text,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_endpoint text NOT NULL,
  PRIMARY KEY (account_key, job_id, acculynx_id)
);

CREATE INDEX IF NOT EXISTS job_representatives_job_type_idx
  ON acculynx_backfill.job_representatives
    (account_key, job_id, representative_type);

CREATE TABLE IF NOT EXISTS acculynx_backfill.vendors (
  account_key text NOT NULL,
  acculynx_id text NOT NULL,
  contact_id text NOT NULL,
  parent_contact_id text,
  contact_type_id text NOT NULL,
  contact_type_name text,
  company_name text,
  first_name text,
  last_name text,
  reviewed_vendor boolean,
  reviewed_subcontractor boolean,
  archived_at timestamptz,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_endpoint text NOT NULL,
  PRIMARY KEY (account_key, acculynx_id, contact_type_id)
);

CREATE INDEX IF NOT EXISTS vendors_contact_idx
  ON acculynx_backfill.vendors (account_key, contact_id);
CREATE INDEX IF NOT EXISTS vendors_type_idx
  ON acculynx_backfill.vendors (account_key, contact_type_id);

CREATE TABLE IF NOT EXISTS acculynx_backfill.contact_types (
  account_key text NOT NULL,
  acculynx_id text NOT NULL,
  parent_type_id text,
  name text NOT NULL,
  reviewed_vendor boolean,
  reviewed_subcontractor boolean,
  last_seen_at timestamptz,
  archived_at timestamptz,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_endpoint text NOT NULL,
  PRIMARY KEY (account_key, acculynx_id)
);

CREATE TABLE IF NOT EXISTS acculynx_backfill.contact_emails (
  account_key text NOT NULL,
  acculynx_id text NOT NULL,
  contact_id text NOT NULL,
  parent_contact_id text,
  email_address text,
  email_type text,
  is_primary boolean,
  archived_at timestamptz,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_endpoint text NOT NULL,
  PRIMARY KEY (account_key, acculynx_id)
);

CREATE INDEX IF NOT EXISTS contact_emails_contact_idx
  ON acculynx_backfill.contact_emails (account_key, contact_id, is_primary);

CREATE TABLE IF NOT EXISTS acculynx_backfill.contact_phones (
  account_key text NOT NULL,
  acculynx_id text NOT NULL,
  contact_id text NOT NULL,
  parent_contact_id text,
  phone_number text,
  phone_type text,
  is_primary boolean,
  archived_at timestamptz,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_endpoint text NOT NULL,
  PRIMARY KEY (account_key, acculynx_id)
);

CREATE INDEX IF NOT EXISTS contact_phones_contact_idx
  ON acculynx_backfill.contact_phones (account_key, contact_id, is_primary);

CREATE TABLE IF NOT EXISTS acculynx_backfill.milestone_settings (
  account_key text NOT NULL,
  acculynx_id text NOT NULL,
  parent_milestone_id text,
  milestone_name text NOT NULL,
  status_id text,
  status_name text,
  color text,
  sort_order integer,
  is_active boolean,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_endpoint text NOT NULL,
  PRIMARY KEY (account_key, acculynx_id)
);

CREATE INDEX IF NOT EXISTS milestone_settings_name_idx
  ON acculynx_backfill.milestone_settings (account_key, milestone_name);

CREATE TABLE IF NOT EXISTS acculynx_backfill.worksheet_lines (
  account_key text NOT NULL,
  acculynx_id text NOT NULL,
  financials_id text NOT NULL,
  worksheet_id text,
  job_id text NOT NULL,
  section_id text,
  parent_line_id text,
  name text,
  description text,
  item_type text,
  estimate_unit text,
  order_unit text,
  quantity numeric,
  measurement_quantity numeric,
  order_quantity numeric,
  unit_conversion numeric,
  material_cost numeric,
  labor_cost numeric,
  price numeric,
  total_price numeric,
  waste numeric,
  fixed_price boolean,
  sort_order integer,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_endpoint text NOT NULL,
  PRIMARY KEY (account_key, acculynx_id)
);

CREATE INDEX IF NOT EXISTS worksheet_lines_parent_idx
  ON acculynx_backfill.worksheet_lines
    (account_key, financials_id, worksheet_id, section_id, sort_order);
