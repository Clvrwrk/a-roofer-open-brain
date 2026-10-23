-- Synthetic support tables for the sync monitor tests. Apply after acculynx-sync-fixture.sql in an EMPTY DISPOSABLE database only.
CREATE SCHEMA cron;
CREATE TABLE cron.job(jobid bigint,jobname text,active boolean);
CREATE TABLE cron.job_run_details(runid bigint GENERATED ALWAYS AS IDENTITY,jobid bigint,start_time timestamptz,end_time timestamptz,status text,return_message text);
CREATE TABLE public.runtime_heartbeats(component_key text,kind text,created_at timestamptz,period_s integer,grace_s integer,last_pinged_success_at timestamptz);
CREATE TABLE public.runtime_job_runs(id bigint GENERATED ALWAYS AS IDENTITY,component_key text,status text,finished_at timestamptz);
CREATE VIEW public.v_runtime_job_latest AS SELECT * FROM public.runtime_job_runs;

CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;
CREATE TABLE public.acculynx_jobs(id text PRIMARY KEY,account_key text,archived_at timestamptz);
CREATE TABLE public.wip_ar_master(acculynx_job_id text,in_ar_population boolean);
CREATE TABLE public.acculynx_job_financials(job_id text,synced_at timestamptz);

CREATE FUNCTION cron.unschedule(bigint) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
