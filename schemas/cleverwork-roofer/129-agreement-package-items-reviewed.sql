-- 129-agreement-package-items-reviewed.sql
-- Agreement Builder Phase B (#6): per-item reviewed/audited flag, set via the per-family
-- review checkbox. Drives the per-branch progress bar + confetti + Submit-for-review.
-- Additive + idempotent.

ALTER TABLE public.agreement_package_items ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false;
ALTER TABLE public.agreement_package_items ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.agreement_package_items ADD COLUMN IF NOT EXISTS reviewed_by text;
COMMENT ON COLUMN public.agreement_package_items.reviewed IS 'Agreement Builder Phase B: per-item reviewed/audited flag (set via the family review checkbox).';
