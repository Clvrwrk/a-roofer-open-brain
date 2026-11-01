-- Rollback for schemas/cleverwork-roofer/341-acculynx-job-worksheet-items.sql (F2 / PEC-876).
-- Applied to prod rnhmvcpsvtqjlffpsayu on 2026-11-01 (Chris approval t136s732). Re-apply was a verified no-op.
-- Roll back the acculynx-sync code first (runbook Scenario C), otherwise the walk logs job_worksheet errors.
drop view if exists public.acculynx_job_worksheet_current;
drop table if exists public.acculynx_job_worksheet_items;
