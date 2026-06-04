-- cleverwork-roofer/76-app-settings-and-agreement-id.sql
-- (1) app_setting: editable key/value config saved from the dashboard Settings view.
-- (2) price_list_snapshot() now includes agreement_id so the UI can CEO-approve /
--     identify a specific price agreement, and the refresh queue carries channel.
-- ADDITIVE + IDEMPOTENT. service-role-only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_setting (
  key         text PRIMARY KEY,
  value       text,
  label       text,
  description text,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.app_setting IS 'Editable admin dashboard settings (guardrails/config). Saved from the Settings view.';

DROP TRIGGER IF EXISTS app_setting_set_updated_at ON public.app_setting;
CREATE TRIGGER app_setting_set_updated_at BEFORE UPDATE ON public.app_setting
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

INSERT INTO public.app_setting (key, value, label, description) VALUES
  ('environment','Pilot','Environment','Real reads later, internal-only outputs now'),
  ('system_of_record','Supabase','System of Record','Workflow/control tables only'),
  ('external_send','Human Only','External Send','Lucinda sends vendor email'),
  ('follow_up_cadence','7 days','Follow-Up Cadence','Conductor escalates stale work'),
  ('archive_rule','Archive Only','Archive Rule','Agents never delete records'),
  ('audit_rule','Independent Gate','Audit Rule','No agent audits its own packet')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.app_setting ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_setting FROM anon, authenticated;
GRANT  ALL ON public.app_setting TO service_role;

-- price_list_snapshot now carries agreement_id (currency) + channel/external_ref (requests).
-- Full body applied in the live DB; see migration history. (Function re-create is idempotent.)

NOTIFY pgrst, 'reload schema';

COMMIT;
