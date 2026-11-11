-- 342-privacy-anon-lockdown-and-agent-reader.sql
-- Privacy review 2026-11-11 (docs/131), Chris approved "go, close the call list leak"
-- and "build all 6 recommendations into the app".
--
-- 1) public.call_priority_today: 500 rows of contact name, phone, email and home
--    address were readable with the public (anon) key through policy
--    anon_read_call_priority_today (USING true). Verified from outside 2026-11-11.
--    No app reads it without signing in (only server roles; see docs/117 row 291).
-- 2) public.agreement_version_review, public.price_list_pdf_staging: same anon
--    USING (true) pattern, pricing data only. Closed for the same reason.
-- 3) public.fleet_drivers, public.fleet_driver_approvals (driver license numbers,
--    MVR results): anon and authenticated held every table right. RLS is on with
--    no policies, so nothing gets through today; the grants are removed so a
--    future policy cannot expose them. Server roles keep access.
-- 4) agent_reader: a NOLOGIN, read-only role for AI agents and ad-hoc analysis.
--    It inherits ob_readonly (SELECT only, no hr schema), and forces read-only
--    transactions plus a statement timeout. LOGIN + password are set by a human
--    out of band (password in 1Password), never in this file.
--
-- GRANT/REVOKE/POLICY only; no data touched. Idempotent (hard rule 1).

begin;

-- 1 + 2) Close anonymous read policies and anonymous table rights.
drop policy if exists anon_read_call_priority_today on public.call_priority_today;
drop policy if exists avr_auth_read on public.agreement_version_review;
drop policy if exists plps_auth_read on public.price_list_pdf_staging;

revoke all on public.call_priority_today from anon;
revoke all on public.agreement_version_review from anon;
revoke all on public.price_list_pdf_staging from anon;

-- Signed-in browser users keep read on the two pricing tables (they had it through
-- the same policy); call_priority_today stays server-only.
drop policy if exists avr_authenticated_read on public.agreement_version_review;
create policy avr_authenticated_read on public.agreement_version_review
  for select to authenticated using (true);
drop policy if exists plps_authenticated_read on public.price_list_pdf_staging;
create policy plps_authenticated_read on public.price_list_pdf_staging
  for select to authenticated using (true);

-- 3) Fleet driver PII: no browser role holds table rights.
revoke all on public.fleet_drivers from anon, authenticated;
revoke all on public.fleet_driver_approvals from anon, authenticated;

-- 4) Read-only agent role, no hr access.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'agent_reader') then
    create role agent_reader nologin noinherit;
  end if;
end $$;
alter role agent_reader inherit;
grant ob_readonly to agent_reader;
alter role agent_reader set default_transaction_read_only = on;
alter role agent_reader set statement_timeout = '30s';
alter role agent_reader set idle_in_transaction_session_timeout = '60s';
revoke all on schema hr from agent_reader;

commit;

-- Verify (read-only):
-- select tablename, policyname, roles from pg_policies
--   where schemaname='public' and tablename in ('call_priority_today','agreement_version_review','price_list_pdf_staging');
-- select has_table_privilege('anon','public.call_priority_today','select');            -- false
-- select has_table_privilege('anon','public.fleet_drivers','select');                  -- false
-- select has_schema_privilege('agent_reader','hr','usage');                            -- false
-- From outside: HEAD /rest/v1/call_priority_today with the publishable key -> 401/permission denied.
--
-- Enable agent login (human, out of band, password from 1Password):
--   alter role agent_reader login password '<from 1Password>';
