-- PEC-755: publish newly mirrored payments to the report without waiting overnight.
-- Existing refresh contract is reused; upstream accounting remains read-only.
SELECT cron.schedule('wip-ar-sync-refresh','*/5 * * * *','select * from public.refresh_wip_ar_master()');
INSERT INTO public.integration_sync_expectations(component_key,kind,ref,max_age_s)
VALUES('cron:wip-ar-sync-refresh','pg_cron','wip-ar-sync-refresh',900)
ON CONFLICT DO NOTHING;
