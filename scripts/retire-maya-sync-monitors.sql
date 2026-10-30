-- Operational retirement requested by Chris, 2026-10-23. No jobs, events,
-- heartbeat credentials, or financial records are deleted. Existing observer,
-- scheduler reconciliation and delivery-status RPC honor this retirement table.
-- Rollback: remove only these two retirement keys after explicitly reauthorizing
-- Maya; do not restart providers/services as part of a database rollback.
BEGIN;
INSERT INTO public.integration_retired_components(component_key,reason) VALUES
 ('runtime:systemd.openbrain-maya-gate','Maya retired by Chris 2026-10-23; services, triggers and provider connections stopped'),
 ('runtime:systemd.openbrain-maya-qa','Maya retired by Chris 2026-10-23; services, triggers and provider connections stopped')
ON CONFLICT (component_key) DO NOTHING;
COMMIT;
