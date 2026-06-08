-- cleverwork-roofer/80-command-center-workflows.sql
-- Durable command-center workflow state for live dashboard-derived work.
-- No seed rows. Dashboards derive work from live source tables and write human
-- decisions here so dashboard and Slack can share action/packet ids.
-- ADDITIVE + IDEMPOTENT. service-role-only until WorkOS/RLS policies land.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboard_work_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_key           text NOT NULL UNIQUE,
  department         text NOT NULL CHECK (department IN ('accounting','operations','sales','marketing','executive','system')),
  workflow           text NOT NULL,
  source_system      text,
  source_table       text,
  source_pk          text,
  title              text NOT NULL,
  summary            text,
  priority           text NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical','high','normal','low')),
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','in_review','blocked','approved','rejected','needs_more_evidence','done','snoozed')),
  primary_human      text,
  assigned_to        text,
  approval_required  boolean NOT NULL DEFAULT true,
  due_at             timestamptz,
  value_at_risk      numeric(14,2),
  source_data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence           jsonb NOT NULL DEFAULT '[]'::jsonb,
  slack_channel_id   text,
  slack_thread_ts    text,
  last_action_id     uuid,
  created_by         text,
  resolved_by        text,
  resolved_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dashboard_work_items IS
  'Durable state for work items derived from live dashboard sources. The source row remains canonical; this table stores human workflow state.';

CREATE INDEX IF NOT EXISTS dashboard_work_items_department_status_idx
  ON public.dashboard_work_items (department, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS dashboard_work_items_workflow_status_idx
  ON public.dashboard_work_items (workflow, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS dashboard_work_items_source_idx
  ON public.dashboard_work_items (source_table, source_pk);

DROP TRIGGER IF EXISTS dashboard_work_items_set_updated_at ON public.dashboard_work_items;
CREATE TRIGGER dashboard_work_items_set_updated_at BEFORE UPDATE ON public.dashboard_work_items
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

CREATE TABLE IF NOT EXISTS public.dashboard_action_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id         uuid REFERENCES public.dashboard_work_items(id) ON DELETE SET NULL,
  work_key             text NOT NULL,
  department           text NOT NULL CHECK (department IN ('accounting','operations','sales','marketing','executive','system')),
  workflow             text NOT NULL,
  action_type          text NOT NULL,
  decision             text CHECK (
                         decision IS NULL OR decision IN ('approve','reject','needs_more_evidence','resume_agent','assign','snooze','mark_done','external_sent','external_received')
                       ),
  actor_id             text NOT NULL,
  actor_type           text NOT NULL,
  actor_display_name   text,
  note                 text,
  payload              jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_table         text,
  source_pk            text,
  slack_channel_id     text,
  slack_thread_ts      text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dashboard_action_log IS
  'Immutable audit trail for dashboard and Slack mirrored human/agent workflow actions.';

CREATE INDEX IF NOT EXISTS dashboard_action_log_work_key_idx
  ON public.dashboard_action_log (work_key, created_at DESC);
CREATE INDEX IF NOT EXISTS dashboard_action_log_department_idx
  ON public.dashboard_action_log (department, created_at DESC);
CREATE INDEX IF NOT EXISTS dashboard_action_log_actor_idx
  ON public.dashboard_action_log (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.credit_memo_requests (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number              text NOT NULL UNIQUE,
  status                      text NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','approved','sent','received','rejected','needs_more_evidence','closed')),
  expected_credit             numeric(14,2) NOT NULL DEFAULT 0,
  line_count                  integer NOT NULL DEFAULT 0,
  packet                      jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_to                 text NOT NULL DEFAULT 'Lucinda',
  escalated_to                text,
  approved_by                 text,
  approved_at                 timestamptz,
  sent_by                     text,
  sent_at                     timestamptz,
  received_by                 text,
  received_at                 timestamptz,
  external_credit_memo_number text,
  follow_up_due_at            timestamptz,
  last_action_id              uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_memo_requests IS
  'Accounting credit memo packet state. Source invoice/line facts remain in ABC mirror tables and dashboard-derived packet json.';

CREATE INDEX IF NOT EXISTS credit_memo_requests_status_idx
  ON public.credit_memo_requests (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS credit_memo_requests_follow_up_idx
  ON public.credit_memo_requests (follow_up_due_at)
  WHERE follow_up_due_at IS NOT NULL AND status IN ('approved','sent','needs_more_evidence');

DROP TRIGGER IF EXISTS credit_memo_requests_set_updated_at ON public.credit_memo_requests;
CREATE TRIGGER credit_memo_requests_set_updated_at BEFORE UPDATE ON public.credit_memo_requests
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

CREATE TABLE IF NOT EXISTS public.credit_memo_request_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         uuid NOT NULL REFERENCES public.credit_memo_requests(id) ON DELETE CASCADE,
  source_table       text,
  source_pk          text,
  line_key           text,
  line_number        text,
  item_number        text,
  item_description   text,
  quantity           numeric,
  invoice_uom        text,
  invoice_price      numeric(14,4),
  reference_price    numeric(14,4),
  expected_credit    numeric(14,2) NOT NULL DEFAULT 0,
  reason_codes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, line_key)
);

COMMENT ON TABLE public.credit_memo_request_lines IS
  'Line-level evidence attached to a credit memo request.';

CREATE INDEX IF NOT EXISTS credit_memo_request_lines_request_idx
  ON public.credit_memo_request_lines (request_id);

CREATE TABLE IF NOT EXISTS public.slack_mirror_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_log_id      uuid REFERENCES public.dashboard_action_log(id) ON DELETE SET NULL,
  work_key          text NOT NULL,
  channel_id        text,
  thread_ts         text,
  message_ts        text,
  status            text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','sent','failed','skipped')),
  error_message     text,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz
);

COMMENT ON TABLE public.slack_mirror_events IS
  'Slack mirror outbox/audit rows. Dashboard remains the source of truth.';

CREATE INDEX IF NOT EXISTS slack_mirror_events_status_idx
  ON public.slack_mirror_events (status, created_at DESC);
CREATE INDEX IF NOT EXISTS slack_mirror_events_work_key_idx
  ON public.slack_mirror_events (work_key, created_at DESC);

ALTER TABLE public.dashboard_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_memo_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_memo_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_mirror_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dashboard_work_items, public.dashboard_action_log,
  public.credit_memo_requests, public.credit_memo_request_lines,
  public.slack_mirror_events FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_work_items,
  public.dashboard_action_log, public.credit_memo_requests,
  public.credit_memo_request_lines, public.slack_mirror_events TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
