-- 346 — Watch the daily CenterPoint pull.
--
-- Apply ONLY after openbrain-centerpoint-sync.timer is installed on the agent
-- host and has reported one run. Applied earlier, the monitor raises a stale
-- alarm for a job that does not exist yet.
-- 108000 s = 30 h, the same allowance as the other daily jobs (file 334).
insert into public.integration_sync_expectations (component_key, kind, ref, max_age_s)
values ('runtime:systemd.openbrain-centerpoint-sync', 'runtime', 'systemd.openbrain-centerpoint-sync', 108000)
on conflict do nothing;
