-- Operational registration only, after human merge approval and service installation.
-- No DDL, grants, deletes or changes to any other sync contract.
INSERT INTO public.integration_sync_expectations(component_key,kind,ref,max_age_s)
VALUES('runtime:systemd.openbrain-sync-health-relay','runtime','systemd.openbrain-sync-health-relay',180)
ON CONFLICT(component_key) DO NOTHING;
