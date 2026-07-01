-- 177 — AccuLynx RLS deny-by-default (Phase 3, REQ-07, plan 03-04, D-14)
--
-- PROBLEM (confirmed live, 03-LIVE-STATE.md OQ2): all acculynx_* tables already have RLS ENABLED,
-- but anon AND authenticated still hold FULL privileges (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) — the
-- default public-schema grant was never revoked. RLS-enabled + broad grants is a latent PII exposure
-- (contact names, phones, addresses) the moment any permissive policy is added or RLS is toggled.
--
-- FIX: the house deny-by-default pattern (migs 76, 148) applied to every acculynx_* data table —
-- ENABLE RLS (idempotent no-op, already on) + REVOKE ALL FROM anon, authenticated + GRANT ALL TO
-- service_role. The enable was already done; the REVOKE is the missing half that actually satisfies D-14.
--
-- DASHBOARD SAFETY: the Command Center reads all acculynx_* tables via app/command-center/src/lib/
-- supabase.server.ts, which always authenticates with SUPABASE_SERVICE_ROLE_KEY. service_role BYPASSES
-- RLS and retains ALL here, so revoking anon/authenticated does NOT affect the dashboard.
--
-- Not policy-based (no CREATE POLICY): D-14 is service-role-only, not authenticated-read.
-- acculynx_cron_dispatch is intentionally excluded — plan 03-02 mig 173 already applied deny-by-default.
--
-- Additive + idempotent; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).

alter table public.acculynx_accounts               enable row level security; revoke all on public.acculynx_accounts               from anon, authenticated; grant all on public.acculynx_accounts               to service_role;
alter table public.acculynx_api_catalog            enable row level security; revoke all on public.acculynx_api_catalog            from anon, authenticated; grant all on public.acculynx_api_catalog            to service_role;
alter table public.acculynx_api_probe              enable row level security; revoke all on public.acculynx_api_probe              from anon, authenticated; grant all on public.acculynx_api_probe              to service_role;
alter table public.acculynx_contact_emails         enable row level security; revoke all on public.acculynx_contact_emails         from anon, authenticated; grant all on public.acculynx_contact_emails         to service_role;
alter table public.acculynx_contact_phones         enable row level security; revoke all on public.acculynx_contact_phones         from anon, authenticated; grant all on public.acculynx_contact_phones         to service_role;
alter table public.acculynx_contacts               enable row level security; revoke all on public.acculynx_contacts               from anon, authenticated; grant all on public.acculynx_contacts               to service_role;
alter table public.acculynx_estimates              enable row level security; revoke all on public.acculynx_estimates              from anon, authenticated; grant all on public.acculynx_estimates              to service_role;
alter table public.acculynx_fetch_queue            enable row level security; revoke all on public.acculynx_fetch_queue            from anon, authenticated; grant all on public.acculynx_fetch_queue            to service_role;
alter table public.acculynx_get_checklist          enable row level security; revoke all on public.acculynx_get_checklist          from anon, authenticated; grant all on public.acculynx_get_checklist          to service_role;
alter table public.acculynx_insurance_carriers     enable row level security; revoke all on public.acculynx_insurance_carriers     from anon, authenticated; grant all on public.acculynx_insurance_carriers     to service_role;
alter table public.acculynx_invoice_lines          enable row level security; revoke all on public.acculynx_invoice_lines          from anon, authenticated; grant all on public.acculynx_invoice_lines          to service_role;
alter table public.acculynx_invoices               enable row level security; revoke all on public.acculynx_invoices               from anon, authenticated; grant all on public.acculynx_invoices               to service_role;
alter table public.acculynx_job_contacts           enable row level security; revoke all on public.acculynx_job_contacts           from anon, authenticated; grant all on public.acculynx_job_contacts           to service_role;
alter table public.acculynx_job_financials         enable row level security; revoke all on public.acculynx_job_financials         from anon, authenticated; grant all on public.acculynx_job_financials         to service_role;
alter table public.acculynx_job_insurance          enable row level security; revoke all on public.acculynx_job_insurance          from anon, authenticated; grant all on public.acculynx_job_insurance          to service_role;
alter table public.acculynx_job_milestone_history  enable row level security; revoke all on public.acculynx_job_milestone_history  from anon, authenticated; grant all on public.acculynx_job_milestone_history  to service_role;
alter table public.acculynx_jobs                   enable row level security; revoke all on public.acculynx_jobs                   from anon, authenticated; grant all on public.acculynx_jobs                   to service_role;
alter table public.acculynx_lead_sources           enable row level security; revoke all on public.acculynx_lead_sources           from anon, authenticated; grant all on public.acculynx_lead_sources           to service_role;
alter table public.acculynx_raw                    enable row level security; revoke all on public.acculynx_raw                    from anon, authenticated; grant all on public.acculynx_raw                    to service_role;
alter table public.acculynx_sync_cursor            enable row level security; revoke all on public.acculynx_sync_cursor            from anon, authenticated; grant all on public.acculynx_sync_cursor            to service_role;
alter table public.acculynx_sync_watermark         enable row level security; revoke all on public.acculynx_sync_watermark         from anon, authenticated; grant all on public.acculynx_sync_watermark         to service_role;
alter table public.acculynx_users                  enable row level security; revoke all on public.acculynx_users                  from anon, authenticated; grant all on public.acculynx_users                  to service_role;

-- Additive; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).
