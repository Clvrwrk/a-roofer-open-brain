CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
INSERT INTO vault.decrypted_secrets VALUES('acculynx_sync_auth_jwt','synthetic-test-bearer');
CREATE SCHEMA net; CREATE SEQUENCE net.req;
CREATE TABLE net.queue(id bigint,headers jsonb,body jsonb);
CREATE TABLE net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text,content text,created timestamptz DEFAULT clock_timestamp());
CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}'::jsonb,params jsonb DEFAULT '{}'::jsonb,headers jsonb DEFAULT '{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds integer DEFAULT 1000) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint:=nextval('net.req'); BEGIN INSERT INTO net.queue VALUES(n,headers,body);RETURN n;END $$;
CREATE TABLE public.acculynx_accounts(account_key text,environment text,is_active boolean);
INSERT INTO public.acculynx_accounts VALUES('test','production',true);
CREATE TABLE public.crm_sync_log(id bigint GENERATED ALWAYS AS IDENTITY,sync_batch_id text UNIQUE,sync_type text CHECK(sync_type IN ('daily','manual','backfill','incremental','cron_trigger')),status text CHECK(status IN ('running','completed','failed','partial','queued')),api_endpoint text,notes text,started_at timestamptz DEFAULT now());
CREATE TABLE public.acculynx_cron_dispatch(request_id bigint PRIMARY KEY,batch_context jsonb,dispatched_at timestamptz DEFAULT now(),status_code integer,timed_out boolean,error_msg text,response_preview text,reconciled_at timestamptz);
CREATE FUNCTION public.check_acculynx_alerts() RETURNS integer LANGUAGE sql AS $$SELECT 0$$;
