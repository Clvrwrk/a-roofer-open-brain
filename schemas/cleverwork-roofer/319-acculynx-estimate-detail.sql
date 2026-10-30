-- 319 — AccuLynx estimate detail columns (2026-10-01).
--
-- Defect: public.acculynx_estimates.title and total_price were NULL on all 445 rows. The hourly sweep reads
-- GET /estimates, which returns stubs ({id, isPrimary, job, _link}); the per-estimate detail call was planned
-- ("Phase 3 enrichment") and never built, and the sweep upserted every detail column as NULL. The CRM Job profile
-- (crm.read_job_profile) showed estimates untitled with no total.
--
-- Fix (supabase/functions/acculynx-sync/resources/estimates.ts): the sweep now writes stub columns only; a detail pass
-- calls GET /estimates/{id} and UPDATEs the detail columns, keeping the full detail payload here and stamping when.
-- Additive and idempotent. Rollback: the columns are unused by anything but the sync; leave them.
ALTER TABLE public.acculynx_estimates ADD COLUMN IF NOT EXISTS raw_detail jsonb;
ALTER TABLE public.acculynx_estimates ADD COLUMN IF NOT EXISTS detail_synced_at timestamptz;
COMMENT ON COLUMN public.acculynx_estimates.raw_detail IS 'GET /estimates/{id} payload (the list sweep keeps the stub in raw). Migration 319.';
COMMENT ON COLUMN public.acculynx_estimates.detail_synced_at IS 'When the detail pass last read GET /estimates/{id} (a 404 stamps the attempt). Migration 319.';
CREATE INDEX IF NOT EXISTS acculynx_estimates_detail_due_idx ON public.acculynx_estimates (account_key, detail_synced_at NULLS FIRST) WHERE archived_at IS NULL;
