-- Stormwatch AE visit-task payload support.
-- Additive/idempotent extension for in-person action recommendations.

alter table if exists public.stormwatch_zoominfo_contacts
  add column if not exists first_visit_task_summary text,
  add column if not exists first_visit_task_payload jsonb,
  add column if not exists first_visit_task_generated_at timestamptz;

alter table if exists public.stormwatch_ghl_sync
  add column if not exists first_visit_task_status text,
  add column if not exists first_visit_task_payload jsonb;
