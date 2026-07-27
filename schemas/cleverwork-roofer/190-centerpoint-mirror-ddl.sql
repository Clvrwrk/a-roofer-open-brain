-- 190 — CenterPoint Connect relational mirror (PEC-110 / docs/78)
--
-- PE service/commercial division CRM → PE Supabase.
-- READ-ONLY against CenterPoint API. Additive + idempotent.
--
-- JSON:API resources land in cp_resources keyed by (resource_type, cp_id).
-- File binaries are NOT downloaded — metadata rows only for files/model_files.

CREATE TABLE IF NOT EXISTS public.cp_sync_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key         text NOT NULL UNIQUE,
  app_id          text,
  mode            text NOT NULL DEFAULT 'backfill', -- backfill | thursday | smoke
  status          text NOT NULL DEFAULT 'running', -- running | ok | failed
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  entities        text[] NOT NULL DEFAULT '{}',
  stats           jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings        jsonb NOT NULL DEFAULT '[]'::jsonb,
  error           text,
  content_hash    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cp_sync_watermarks (
  resource_type   text NOT NULL,
  watermark_at    timestamptz,
  last_run_key    text,
  last_count      integer,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_type)
);

CREATE TABLE IF NOT EXISTS public.cp_resources (
  resource_type   text NOT NULL, -- list path / collection (identity)
  cp_id           text NOT NULL,
  api_type        text,          -- JSON:API data.type (may collide across paths)
  name            text,
  status          text,
  created_at_src  timestamptz,
  updated_at_src  timestamptz,
  deleted_at_src  timestamptz,
  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  relationships   jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw             jsonb NOT NULL,
  content_hash    text NOT NULL,
  pull_batch      text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_type, cp_id)
);
-- Additive if table already existed without api_type:
ALTER TABLE public.cp_resources ADD COLUMN IF NOT EXISTS api_type text;

CREATE INDEX IF NOT EXISTS cp_resources_type_name_idx
  ON public.cp_resources (resource_type, name);
CREATE INDEX IF NOT EXISTS cp_resources_type_status_idx
  ON public.cp_resources (resource_type, status);
CREATE INDEX IF NOT EXISTS cp_resources_type_updated_idx
  ON public.cp_resources (resource_type, updated_at_src DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS cp_resources_attrs_gin
  ON public.cp_resources USING gin (attributes jsonb_path_ops);

-- Convenience views (exact resource_type names from CenterPoint JSON:API)
CREATE OR REPLACE VIEW public.v_cp_companies AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'companies';
CREATE OR REPLACE VIEW public.v_cp_productions AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'productions';
CREATE OR REPLACE VIEW public.v_cp_opportunities AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'opportunities';
CREATE OR REPLACE VIEW public.v_cp_properties AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'properties';
CREATE OR REPLACE VIEW public.v_cp_profiles AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'profiles';
CREATE OR REPLACE VIEW public.v_cp_employees AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'employees';
CREATE OR REPLACE VIEW public.v_cp_invoices AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'invoices';
CREATE OR REPLACE VIEW public.v_cp_services AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'services';
CREATE OR REPLACE VIEW public.v_cp_service_agreements AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'service_agreements';
CREATE OR REPLACE VIEW public.v_cp_materials AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'materials';
CREATE OR REPLACE VIEW public.v_cp_products AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'products';
CREATE OR REPLACE VIEW public.v_cp_product_templates AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'product_templates';
CREATE OR REPLACE VIEW public.v_cp_purchase_orders AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'purchase_orders';
CREATE OR REPLACE VIEW public.v_cp_tasks AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'tasks';
CREATE OR REPLACE VIEW public.v_cp_work_time_entries AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'work_time_entries';
CREATE OR REPLACE VIEW public.v_cp_production_days AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'production_days';
CREATE OR REPLACE VIEW public.v_cp_production_items AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'production_items';
CREATE OR REPLACE VIEW public.v_cp_production_materials AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'production_materials';
CREATE OR REPLACE VIEW public.v_cp_cost_codes AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'cost_codes';
CREATE OR REPLACE VIEW public.v_cp_tax_codes AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'tax_codes';
CREATE OR REPLACE VIEW public.v_cp_budget_types AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'budget_types';
CREATE OR REPLACE VIEW public.v_cp_budget AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'budget';
CREATE OR REPLACE VIEW public.v_cp_warranties AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'warranties';
CREATE OR REPLACE VIEW public.v_cp_locations AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'locations';
CREATE OR REPLACE VIEW public.v_cp_files AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'files';
CREATE OR REPLACE VIEW public.v_cp_model_files AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'model_files';
CREATE OR REPLACE VIEW public.v_cp_product_template_tags AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'product_template_tags';
CREATE OR REPLACE VIEW public.v_cp_transactions AS
  SELECT * FROM public.cp_resources WHERE resource_type = 'transactions';

COMMENT ON TABLE public.cp_resources IS
  'CenterPoint Connect JSON:API mirror (PEC-110). Full historical extract; files/model_files are metadata only.';
COMMENT ON VIEW public.v_cp_productions IS
  'CenterPoint productions (commercial/service jobs). Filter/join via attributes jsonb. PEC-110.';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cp_sync_runs', 'cp_sync_watermarks', 'cp_resources']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Restrict convenience views to service_role
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_cp_companies','v_cp_productions','v_cp_opportunities','v_cp_properties',
    'v_cp_profiles','v_cp_employees','v_cp_invoices','v_cp_services',
    'v_cp_service_agreements','v_cp_materials','v_cp_products','v_cp_product_templates',
    'v_cp_purchase_orders','v_cp_tasks','v_cp_work_time_entries','v_cp_production_days',
    'v_cp_production_items','v_cp_production_materials','v_cp_cost_codes','v_cp_tax_codes',
    'v_cp_budget_types','v_cp_budget','v_cp_warranties','v_cp_locations','v_cp_files',
    'v_cp_model_files','v_cp_product_template_tags','v_cp_transactions'
  ]
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', v);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v);
  END LOOP;
END $$;
