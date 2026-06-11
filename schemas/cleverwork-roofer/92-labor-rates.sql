-- cleverwork-roofer/92-labor-rates.sql
-- Labor rate table + labor observation table (requested 2026-06-10, Chris).
-- Observations are append-only facts harvested from completed-job document
-- packages (sub-crew invoices); rates are derived per PE office and stay
-- 'proposed' until Ops approves — agents never self-activate a rate
-- (trust-tier discipline, docs/33 §3 / §6.6). Office FK targets the live
-- public.office table (Wichita first; same workflow for every PE office).
-- ADDITIVE + IDEMPOTENT. service-role-only until WorkOS/RLS policies land.

BEGIN;

CREATE TABLE IF NOT EXISTS public.labor_observations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id          uuid REFERENCES public.office(id) ON DELETE SET NULL,
  office_name        text,                  -- denormalized convenience ('Wichita')
  job_code           text NOT NULL,         -- e.g. 'KS-109'
  acculynx_job_id    text REFERENCES public.acculynx_jobs(id) ON DELETE SET NULL,
  property_address   text,
  crew_name          text NOT NULL,         -- e.g. 'Chokan Exteriors (Ramiro Hernandez)'
  trade              text NOT NULL DEFAULT 'roofing'
                       CHECK (trade IN ('roofing','gutters','paint','siding','permit','other')),
  vendor_invoice_no  text,
  invoice_date       date,
  task_code          text NOT NULL,         -- normalized: shingle_install_per_sq, decking_per_sheet, ...
  description        text,                  -- raw invoice line wording
  unit_rate          numeric(12,4),         -- null for lump sums
  quantity           numeric(12,4),
  uom                text,                  -- sq | sheet | ea | lf | flat | job
  amount             numeric(12,2) NOT NULL,
  invoice_total      numeric(12,2),         -- full invoice total this line came from
  settled_amount     numeric(12,2),         -- after handwritten adjustments/backcharges
  adjustment_note    text,                  -- e.g. 'KS-79 backcharge -1058.86'
  source_document    text NOT NULL,         -- filename in the job doc package
  source_locator     text,                  -- page/line where read
  extraction_method  text NOT NULL DEFAULT 'visual_pdf_read',
  confidence         numeric(4,3),
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.labor_observations IS
  'Append-only labor cost facts from completed-job sub invoices. Source of truth for labor_rates derivation and per-office pricing-change tracking.';

CREATE INDEX IF NOT EXISTS labor_observations_office_task_idx
  ON public.labor_observations (office_name, trade, task_code, invoice_date DESC);
CREATE INDEX IF NOT EXISTS labor_observations_job_idx
  ON public.labor_observations (job_code);

CREATE TABLE IF NOT EXISTS public.labor_rates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id          uuid REFERENCES public.office(id) ON DELETE SET NULL,
  office_name        text NOT NULL,         -- 'Wichita'
  trade              text NOT NULL DEFAULT 'roofing'
                       CHECK (trade IN ('roofing','gutters','paint','siding','permit','other')),
  task_code          text NOT NULL,
  task_label         text,                  -- human label for estimates/dashboard
  uom                text NOT NULL,         -- sq | sheet | ea | lf | flat
  rate               numeric(12,4) NOT NULL,
  derivation         text NOT NULL DEFAULT 'observed'
                       CHECK (derivation IN ('observed','ops_set','blended')),
  observation_count  int NOT NULL DEFAULT 0,
  stats              jsonb NOT NULL DEFAULT '{}'::jsonb,  -- min/max/avg/stddev, source job codes
  effective_from     date NOT NULL DEFAULT current_date,
  effective_to       date,                  -- NULL = current
  status             text NOT NULL DEFAULT 'proposed'
                       CHECK (status IN ('proposed','active','superseded','rejected')),
  approved_by        text,                  -- Ops Manager; required before status=active
  approved_at        timestamptz,
  notes              text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_name, trade, task_code, effective_from)
);

COMMENT ON TABLE public.labor_rates IS
  'Per-office labor rate table for the estimating engine. Derived rates are proposed until Ops approval; rate changes close the prior row (effective_to) — history is the pricing-change track.';

CREATE INDEX IF NOT EXISTS labor_rates_lookup_idx
  ON public.labor_rates (office_name, trade, task_code, status, effective_from DESC);

DROP TRIGGER IF EXISTS labor_rates_set_updated_at ON public.labor_rates;
CREATE TRIGGER labor_rates_set_updated_at BEFORE UPDATE ON public.labor_rates
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['labor_observations','labor_rates']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
