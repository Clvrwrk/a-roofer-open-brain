-- 340-rls-spatial-ref-sys.sql
-- Security fix: enable Row Level Security on public.spatial_ref_sys (PostGIS 3.3.7 EPSG catalog;
-- flagged CRITICAL by Supabase advisor rls_disabled_in_public on project rnhmvcpsvtqjlffpsayu).
-- Exposure: anon + authenticated hold INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER;
-- anyone with the anon key can corrupt or wipe SRID definitions and break geometry ops (6 geometry/
-- geography columns in public). Data is public EPSG reference data; risk is integrity, not secrecy.
-- Fix: revoke writes from anon/authenticated, enable RLS, SELECT for all roles (PostGIS needs it),
-- writes for service_role only. Additive + idempotent where privileges allow.
-- PROPOSED / NOT YET APPLIED — table owner is supabase_admin; postgres may lack grant option.
-- Each step is guarded; if WARN only, Supabase support must run as supabase_admin. See PR body.
-- Related: docs/39 §6, mig 96 (abc_change_log); 39 other public tables out of scope (PEC-807).

begin;

-- 1) Remove anon/authenticated write paths (the real risk: anyone with the anon key can corrupt/TRUNCATE the SRID catalog).
do $$ begin
  revoke insert, update, delete, truncate, references, trigger on public.spatial_ref_sys from anon, authenticated;
exception when insufficient_privilege then
  raise warning 'revoke on spatial_ref_sys refused: needs supabase_admin';
end $$;

-- 2) Enable RLS + read-only policy. SELECT stays open because PostGIS functions (ST_Transform, ST_SetSRID lookups)
--    read this table as the calling role; denying SELECT would break geometry ops for any role.
do $$ begin
  alter table public.spatial_ref_sys enable row level security;
  drop policy if exists spatial_ref_sys_read_all on public.spatial_ref_sys;
  create policy spatial_ref_sys_read_all on public.spatial_ref_sys for select to anon, authenticated, service_role using (true);
  drop policy if exists spatial_ref_sys_service_write on public.spatial_ref_sys;
  create policy spatial_ref_sys_service_write on public.spatial_ref_sys for all to service_role using (true) with check (true);
exception when insufficient_privilege then
  raise warning 'enable RLS on spatial_ref_sys refused: needs supabase_admin (table owner)';
end $$;

commit;

-- Verify (read-only):
-- select relrowsecurity from pg_class where oid='public.spatial_ref_sys'::regclass;
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema='public' and table_name='spatial_ref_sys' and grantee in ('anon','authenticated');
-- Then re-run the security advisor.

-- ROLLBACK:
-- drop policy if exists spatial_ref_sys_read_all on public.spatial_ref_sys;
-- drop policy if exists spatial_ref_sys_service_write on public.spatial_ref_sys;
-- alter table public.spatial_ref_sys disable row level security;
-- grant insert, update, delete, truncate, references, trigger on public.spatial_ref_sys to anon, authenticated;
