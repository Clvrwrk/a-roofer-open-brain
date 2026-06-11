-- cleverwork-roofer/90-estimate-pipeline.sql
-- Estimate-to-proposal pipeline data foundation (docs/33 §8, Phase 1).
-- Measurement upload → packages → branch/pricing → scenarios → proposal /
-- invoice / order / schedule drafts → handoff, with verification evidence,
-- approval tasks, and learning records on every artifact.
-- Every extracted/calculated value carries provenance (§8.2).
-- Live-DB binding (decision 2026-06-10): properties are public.properties
-- (uuid, live since 2026-05-08) and jobs are public.acculynx_jobs (text ids,
-- AccuLynx GUIDs) — NOT the OB1-template property/job/crew core, which was
-- never applied to this brain. Crew is a text ref until a crew table exists.
-- ADDITIVE + IDEMPOTENT. service-role-only until WorkOS/RLS policies land.

BEGIN;

-- ---------------------------------------------------------------------------
-- Runs and sources
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  acculynx_job_id    text REFERENCES public.acculynx_jobs(id) ON DELETE SET NULL,
  job_type           text NOT NULL DEFAULT 'retail'
                       CHECK (job_type IN ('retail','insurance')),
  status             text NOT NULL DEFAULT 'intake'
                       CHECK (status IN ('intake','extracting','packaging','pricing',
                              'scenarios','proposal_draft','awaiting_approval','approved',
                              'client_selected','handoff','order_draft','schedule_draft',
                              'blocked','rejected','closed')),
  client_name        text,
  client_contact     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- no raw PII beyond what the job needs
  preferred_brands   text[],
  companycam_ref     text,
  created_by         text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.estimate_runs IS
  'One end-to-end pre-sale estimate pass: intake through proposal, handoff, order and schedule drafts (docs/33 §4).';

CREATE INDEX IF NOT EXISTS estimate_runs_status_idx
  ON public.estimate_runs (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS estimate_runs_property_idx
  ON public.estimate_runs (property_id);

CREATE TABLE IF NOT EXISTS public.estimate_source_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  doc_kind           text NOT NULL
                       CHECK (doc_kind IN ('measurement_pdf','measurement_csv','photo',
                              'companycam_link','insurance_scope','screenshot_template',
                              'price_sheet','other')),
  storage_path       text,                  -- Supabase storage or external ref
  external_url       text,
  original_filename  text,
  content_hash       text,                  -- dedup/provenance anchor
  uploaded_by        text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_source_documents_run_idx
  ON public.estimate_source_documents (run_id, doc_kind);

-- ---------------------------------------------------------------------------
-- Measurements (§4.2). One extraction attempt per row; fields itemized with
-- full provenance so a human override never erases the machine value.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_measurements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  source_document_id uuid REFERENCES public.estimate_source_documents(id) ON DELETE SET NULL,
  extraction_method  text,                  -- parser/model/manual
  extraction_status  text NOT NULL DEFAULT 'pending'
                       CHECK (extraction_status IN ('pending','complete','partial',
                              'failed','human_completed')),
  missing_fields     text[] NOT NULL DEFAULT '{}',
  companycam_reviewed boolean NOT NULL DEFAULT false,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_measurements_run_idx
  ON public.estimate_measurements (run_id);

CREATE TABLE IF NOT EXISTS public.estimate_measurement_fields (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id     uuid NOT NULL REFERENCES public.estimate_measurements(id) ON DELETE CASCADE,
  field_name         text NOT NULL,         -- e.g. 'squares','eaves_lf','pitch_primary'
  value_numeric      numeric(14,4),
  value_text         text,
  uom                text,                  -- 'sq','lf','ea','count' etc.
  -- provenance (§8.2)
  source_document_id uuid REFERENCES public.estimate_source_documents(id) ON DELETE SET NULL,
  source_locator     text,                  -- page/row/cell where available
  extraction_method  text,
  confidence         numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  human_override     boolean NOT NULL DEFAULT false,
  override_reason    text,
  overridden_by      text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (measurement_id, field_name)
);

CREATE INDEX IF NOT EXISTS estimate_measurement_fields_measurement_idx
  ON public.estimate_measurement_fields (measurement_id);

-- ---------------------------------------------------------------------------
-- Package templates (§4.3). Screenshot-derived templates become structured
-- lines here; the screenshot itself stays an estimate_source_document.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_package_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  package_tier       text NOT NULL CHECK (package_tier IN ('good','better','best','custom')),
  brand              text,                  -- Malarkey | GAF | Owens Corning | ...
  shingle_line       text,
  warranty_tier      text,
  labor_warranty     text,
  market_zone        text,                  -- zone-level brand priority support
  version            int NOT NULL DEFAULT 1,
  active             boolean NOT NULL DEFAULT true,
  source_document_id uuid REFERENCES public.estimate_source_documents(id) ON DELETE SET NULL,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS public.estimate_template_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id        uuid NOT NULL REFERENCES public.estimate_package_templates(id) ON DELETE CASCADE,
  line_no            int NOT NULL,
  category           text,                  -- shingle, starter, hip_ridge, underlayment, ...
  description        text NOT NULL,
  qty_basis          text,                  -- measurement field or formula driving qty
  waste_factor       numeric(6,4),
  sell_uom           text,
  purchase_uom       text,
  notes              text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.estimate_product_mappings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_line_id   uuid REFERENCES public.estimate_template_lines(id) ON DELETE CASCADE,
  vendor             text NOT NULL DEFAULT 'abc_supply',
  vendor_item_id     text,                  -- ABC item identifier
  vendor_item_name   text,
  vendor_uom         text,
  uom_conversion     numeric(12,6),         -- vendor uom → sell uom
  mapping_status     text NOT NULL DEFAULT 'unmapped'
                       CHECK (mapping_status IN ('unmapped','mapped','needs_human',
                              'substituted','unavailable')),
  substitution_note  text,
  -- provenance (§8.2)
  mapped_by          text,                  -- agent/service or human
  mapping_evidence   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- spreadsheet row, screenshot ref
  human_override     boolean NOT NULL DEFAULT false,
  override_reason    text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_product_mappings_line_idx
  ON public.estimate_product_mappings (template_line_id);
CREATE INDEX IF NOT EXISTS estimate_product_mappings_status_idx
  ON public.estimate_product_mappings (mapping_status);

-- ---------------------------------------------------------------------------
-- Branch evaluation and live pricing (§4.4–4.5)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_branch_evaluations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  branch_code        text NOT NULL,
  branch_name        text,
  ship_to_account    text,
  distance_miles     numeric(8,2),
  drive_time_minutes numeric(8,2),
  eligible           boolean NOT NULL DEFAULT true,
  selected           boolean NOT NULL DEFAULT false,
  evaluation_source  text,                  -- google_maps | manual | ...
  evaluated_at       timestamptz NOT NULL DEFAULT now(),
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_branch_evaluations_run_idx
  ON public.estimate_branch_evaluations (run_id, selected);

CREATE TABLE IF NOT EXISTS public.estimate_pricing_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  branch_code        text NOT NULL,
  ship_to_account    text,
  request_status     text NOT NULL DEFAULT 'pending'
                       CHECK (request_status IN ('pending','complete','partial','failed')),
  requested_at       timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_pricing_requests_run_idx
  ON public.estimate_pricing_requests (run_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.estimate_pricing_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_request_id uuid NOT NULL REFERENCES public.estimate_pricing_requests(id) ON DELETE CASCADE,
  vendor_item_id     text NOT NULL,
  vendor_item_name   text,
  quantity           numeric(14,4) NOT NULL,
  uom                text NOT NULL,
  unit_price         numeric(14,4),
  extended_price     numeric(14,2),
  currency           text NOT NULL DEFAULT 'USD',
  price_source       text NOT NULL DEFAULT 'live_api'
                       CHECK (price_source IN ('live_api','static_fallback','manual')),
  price_timestamp    timestamptz,           -- approval policy checks freshness here
  availability       text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_pricing_lines_request_idx
  ON public.estimate_pricing_lines (pricing_request_id);

-- ---------------------------------------------------------------------------
-- Scenarios: Good/Better/Best options, UOM rounding (§4.6), costs and margin
-- (§4.7). estimate_scenario_lines stores the full §4.6 quantity trail.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_scenario_options (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  template_id        uuid REFERENCES public.estimate_package_templates(id) ON DELETE SET NULL,
  package_tier       text NOT NULL CHECK (package_tier IN ('good','better','best','custom')),
  total_price        numeric(14,2),
  total_cost         numeric(14,2),
  gross_margin_pct   numeric(6,3),
  client_selected    boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','verified','approved','rejected','superseded')),
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_scenario_options_run_idx
  ON public.estimate_scenario_options (run_id, package_tier);

CREATE TABLE IF NOT EXISTS public.estimate_scenario_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id          uuid NOT NULL REFERENCES public.estimate_scenario_options(id) ON DELETE CASCADE,
  template_line_id   uuid REFERENCES public.estimate_template_lines(id) ON DELETE SET NULL,
  product_mapping_id uuid REFERENCES public.estimate_product_mappings(id) ON DELETE SET NULL,
  pricing_line_id    uuid REFERENCES public.estimate_pricing_lines(id) ON DELETE SET NULL,
  description        text NOT NULL,
  -- §4.6 quantity trail (all stored, never collapsed)
  raw_quantity       numeric(14,4),
  waste_factor       numeric(6,4),
  required_quantity  numeric(14,4),
  uom_conversion     numeric(12,6),
  rounded_quantity   numeric(14,4),
  vendor_price_uom   text,
  sell_uom           text,
  rounding_delta     numeric(14,4),
  unit_cost          numeric(14,4),
  line_cost          numeric(14,2),
  line_price         numeric(14,2),
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_scenario_lines_option_idx
  ON public.estimate_scenario_lines (option_id);

CREATE TABLE IF NOT EXISTS public.estimate_cost_components (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id          uuid NOT NULL REFERENCES public.estimate_scenario_options(id) ON DELETE CASCADE,
  component          text NOT NULL
                       CHECK (component IN ('materials','labor','permit','disposal','delivery',
                              'financing_fees','payment_fees','sales_commission',
                              'supplement_admin','contingency','other')),
  amount             numeric(14,2) NOT NULL,
  calculation_basis  text,                  -- how the amount was derived
  source             text,                  -- rate table, config, manual
  human_override     boolean NOT NULL DEFAULT false,
  override_reason    text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_cost_components_option_idx
  ON public.estimate_cost_components (option_id);

CREATE TABLE IF NOT EXISTS public.estimate_margin_checks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id          uuid NOT NULL REFERENCES public.estimate_scenario_options(id) ON DELETE CASCADE,
  job_type           text NOT NULL CHECK (job_type IN ('retail','insurance')),
  gross_margin_pct   numeric(6,3) NOT NULL,
  target_pct         numeric(6,3) NOT NULL,           -- 40 retail / 42 insurance (configurable)
  floor_pct          numeric(6,3) NOT NULL DEFAULT 28,
  outcome            text NOT NULL
                       CHECK (outcome IN ('pass','ops_manager_approval','ceo_escalation')),
  routed_to          text,                  -- approver role per §7
  decision           text CHECK (decision IN ('approved','rejected','pending')),
  decided_by         text,
  decided_at         timestamptz,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_margin_checks_option_idx
  ON public.estimate_margin_checks (option_id);

-- ---------------------------------------------------------------------------
-- Drafts: proposal, invoice, material order, schedule (§4.8–4.12)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  version            int NOT NULL DEFAULT 1,
  pdf_storage_path   text,
  includes_options   uuid[],                -- scenario option ids presented
  payment_terms      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- deposit / deductible+depreciation
  warranty_terms     jsonb NOT NULL DEFAULT '{}'::jsonb,
  initials_fields    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- §4.8 required initials checklist
  signature_required boolean NOT NULL DEFAULT true,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','verified','awaiting_approval','approved',
                              'sent','accepted','rejected','superseded')),
  approved_by        text,
  approved_at        timestamptz,
  sent_via           text,                  -- recorded by the human who sends; never an agent
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, version)
);

CREATE TABLE IF NOT EXISTS public.estimate_invoice_drafts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  proposal_id        uuid REFERENCES public.estimate_proposals(id) ON DELETE SET NULL,
  invoice_kind       text NOT NULL DEFAULT 'deposit'
                       CHECK (invoice_kind IN ('deposit','deductible_depreciation','progress','final')),
  amount             numeric(14,2),
  amount_basis       text,                  -- traces to proposal total or insurance obligation (§5.6)
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','verified','awaiting_approval','approved','sent','void')),
  approved_by        text,
  approved_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estimate_material_order_drafts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  option_id          uuid REFERENCES public.estimate_scenario_options(id) ON DELETE SET NULL,
  branch_code        text,
  ship_to_account    text,
  delivery_address   text,
  delivery_notes     text,
  order_lines        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- item id/name/qty/uom/price/flags (§4.11)
  human_selection_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  substitution_notes text,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','verified','awaiting_approval','approved',
                              'placed_by_human','cancelled')),
  approved_by        text,
  approved_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estimate_schedule_recommendations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  option_id          uuid REFERENCES public.estimate_scenario_options(id) ON DELETE SET NULL,
  proposed_start     date,
  proposed_end       date,
  crew_ref           text,                  -- crew name/id; FK once a crew table exists
  inputs             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- size/pitch/stories/layers/weather/permit (§4.12)
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','verified','awaiting_approval','approved',
                              'crew_confirmed','cancelled')),
  approved_by        text,
  approved_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- AccuLynx handoff (§4.10, §5.9): API write when permitted, structured
-- Slack/dashboard fallback when not. Post-write verification recorded.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_acculynx_handoffs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  handoff_mode       text NOT NULL CHECK (handoff_mode IN ('api_write','slack_fallback','dashboard_fallback')),
  target_action      text NOT NULL,         -- job_fields, estimate_items, proposal_doc, status, ...
  acculynx_job_ref   text,
  request_payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_record_ids jsonb NOT NULL DEFAULT '{}'::jsonb,  -- returned IDs stored (§5.9)
  write_status       text NOT NULL DEFAULT 'pending'
                       CHECK (write_status IN ('pending','succeeded','failed','rolled_back',
                              'fallback_posted','remediation_open')),
  verified_at        timestamptz,
  error_message      text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_acculynx_handoffs_run_idx
  ON public.estimate_acculynx_handoffs (run_id, write_status);

-- ---------------------------------------------------------------------------
-- Verification evidence (§5.1) and approval tasks (§7). Generic across all
-- artifact types so every gate writes the same evidence shape.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_verification_checks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  work_product_type  text NOT NULL
                       CHECK (work_product_type IN ('measurement','product_mapping','pricing',
                              'scenario','proposal','invoice','material_order','schedule',
                              'acculynx_write','learning_improvement')),
  work_product_id    uuid,                  -- id in the relevant table
  work_product_version int NOT NULL DEFAULT 1,
  source_refs        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- source files + extraction refs
  generated_by       text,                  -- agent or service
  checks_executed    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{check, result, detail}]
  result             text NOT NULL DEFAULT 'pending'
                       CHECK (result IN ('pending','pass','fail','pass_with_exceptions')),
  confidence         numeric(4,3),
  human_approver     text,
  approved_at        timestamptz,
  exception_notes    text,
  remediation_refs   jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_decision     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_verification_checks_run_idx
  ON public.estimate_verification_checks (run_id, work_product_type);
CREATE INDEX IF NOT EXISTS estimate_verification_checks_product_idx
  ON public.estimate_verification_checks (work_product_type, work_product_id);

CREATE TABLE IF NOT EXISTS public.estimate_approval_tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid REFERENCES public.estimate_runs(id) ON DELETE CASCADE,
  work_item_id       uuid REFERENCES public.dashboard_work_items(id) ON DELETE SET NULL,
  decision_type      text NOT NULL,         -- §7 row, e.g. 'retail_proposal_below_40'
  approver_role      text NOT NULL,         -- ops_manager | ceo | quality_control | scheduling
  artifact_type      text,
  artifact_id        uuid,
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','approved','rejected','escalated','withdrawn')),
  decided_by         text,
  decided_at         timestamptz,
  notes              text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_approval_tasks_status_idx
  ON public.estimate_approval_tasks (status, approver_role, created_at DESC);

-- ---------------------------------------------------------------------------
-- Learning loop (§6.1–6.3): learning events, SOP proposals, A3 proposals.
-- Nothing in these tables self-activates; activation is a human approval.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estimate_learning_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid REFERENCES public.estimate_runs(id) ON DELETE SET NULL,
  acculynx_job_id    text REFERENCES public.acculynx_jobs(id) ON DELETE SET NULL,
  event_kind         text NOT NULL,         -- §6.1 trigger, e.g. 'estimate_override'
  artifact_type      text,
  artifact_id        uuid,
  ai_recommendation  jsonb NOT NULL DEFAULT '{}'::jsonb,
  human_change       jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_reason      text,
  cost_impact        numeric(14,2),
  margin_impact_pct  numeric(6,3),
  schedule_impact    text,
  supplement_impact  text,
  client_impact      text,
  source_evidence    jsonb NOT NULL DEFAULT '[]'::jsonb,
  responsible_role   text,
  proposed_action    text,
  status             text NOT NULL DEFAULT 'captured'
                       CHECK (status IN ('captured','needs_review','accepted_one_off',
                              'sop_candidate','template_candidate','pricing_rule_candidate',
                              'agent_skill_candidate','a3_required','approved','rejected',
                              'deferred','implemented','verified_after_implementation')),
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_learning_events_status_idx
  ON public.estimate_learning_events (status, created_at DESC);
CREATE INDEX IF NOT EXISTS estimate_learning_events_run_idx
  ON public.estimate_learning_events (run_id);

CREATE TABLE IF NOT EXISTS public.estimate_sop_proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_type      text NOT NULL
                       CHECK (proposal_type IN ('estimating_sop','product_mapping_sop','pricing_sop',
                              'measurement_extraction_sop','companycam_review_sop',
                              'acculynx_handoff_sop','permit_discovery_sop','agent_skill',
                              'template_update','approval_policy')),
  title              text NOT NULL,
  problem_statement  text NOT NULL,
  source_learning_event_ids uuid[] NOT NULL DEFAULT '{}',
  frequency_note     text,
  impact_note        text,                  -- cost/margin impact + time saved (§6.3)
  risk_if_ignored    text,
  proposed_behavior  text NOT NULL,
  verification_requirements text,
  rollback_plan      text,
  owner              text,
  approver           text,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','in_review','approved','rejected','deferred',
                              'implemented','verified')),
  decided_at         timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estimate_a3_proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_proposal_id    uuid REFERENCES public.estimate_sop_proposals(id) ON DELETE SET NULL,
  title              text NOT NULL,
  a3_document_path   text,                  -- proposals/ doc in repo or storage
  roi_multiple       numeric(8,2),          -- 10x ROI gate evidence
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','in_review','approved','rejected','deferred')),
  owner              text,
  approver           text,
  decided_at         timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers (cw_set_updated_at defined in 70-vendor-territory-pricing.sql)
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'estimate_runs','estimate_measurements','estimate_measurement_fields',
    'estimate_package_templates','estimate_template_lines','estimate_product_mappings',
    'estimate_scenario_options','estimate_scenario_lines','estimate_proposals',
    'estimate_invoice_drafts','estimate_material_order_drafts',
    'estimate_schedule_recommendations','estimate_acculynx_handoffs',
    'estimate_verification_checks','estimate_approval_tasks',
    'estimate_learning_events','estimate_sop_proposals','estimate_a3_proposals'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS + grants: service-role-only, matching 80-command-center-workflows.sql
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'estimate_runs','estimate_source_documents','estimate_measurements',
    'estimate_measurement_fields','estimate_package_templates','estimate_template_lines',
    'estimate_product_mappings','estimate_branch_evaluations','estimate_pricing_requests',
    'estimate_pricing_lines','estimate_scenario_options','estimate_scenario_lines',
    'estimate_cost_components','estimate_margin_checks','estimate_proposals',
    'estimate_invoice_drafts','estimate_material_order_drafts',
    'estimate_schedule_recommendations','estimate_acculynx_handoffs',
    'estimate_verification_checks','estimate_approval_tasks',
    'estimate_learning_events','estimate_sop_proposals','estimate_a3_proposals'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
