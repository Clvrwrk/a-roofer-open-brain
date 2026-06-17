-- 96-rls-abc-change-log.sql
-- Security fix: enable Row Level Security on public.abc_change_log (flagged by Supabase
-- advisor — currently readable/writable by anyone with the anon key) and add a service-role
-- policy so the existing ingestion path keeps working. Additive + idempotent.
-- PROPOSED / NOT YET APPLIED — apply on a Supabase branch first, verify ingestion still writes,
-- then promote. abc_change_log is append-only audit history of ABC table changes (see 93/94).

alter table public.abc_change_log enable row level security;

-- service-role (the ingestion path) keeps full access
drop policy if exists abc_change_log_service_all on public.abc_change_log;
create policy abc_change_log_service_all
  on public.abc_change_log
  for all
  to service_role
  using (true)
  with check (true);

-- read-only for authenticated app users (dashboards); no write/delete to preserve append-only audit
drop policy if exists abc_change_log_auth_read on public.abc_change_log;
create policy abc_change_log_auth_read
  on public.abc_change_log
  for select
  to authenticated
  using (true);

-- NOTE: anon role gets NO policy => no anon access (closes the advisor finding).
-- The two *_backup_* tables and spatial_ref_sys are handled separately (drop-if-verified
-- vs enable-RLS) — see docs/39 §6; not bundled here to keep this change single-purpose.
