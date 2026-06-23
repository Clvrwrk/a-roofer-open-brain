-- cleverwork-roofer/145-communications-preview-workflow.sql
-- Invoice-audit communications preview workflow:
-- draft -> approval -> queued_for_release (internal-only simulated send)
-- ADDITIVE + IDEMPOTENT. No destructive changes.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'cw_set_updated_at'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.cw_set_updated_at()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $body$
      BEGIN
        NEW.updated_at := now();
        RETURN NEW;
      END;
      $body$;
    $fn$;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.communication_routes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department          text NOT NULL CHECK (department IN ('accounting','operations','sales','marketing','executive','system')),
  workflow            text NOT NULL,
  trigger_action      text NOT NULL,
  channel_type        text NOT NULL CHECK (channel_type IN ('slack','email')),
  target_agent        text,
  target_channel_id   text,
  target_email        text,
  priority            integer NOT NULL DEFAULT 100,
  active              boolean NOT NULL DEFAULT true,
  valid_from          timestamptz,
  valid_to            timestamptz,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department, workflow, trigger_action, channel_type, priority)
);

COMMENT ON TABLE public.communication_routes IS
  'DB-backed routing table for communication previews and release queues.';

CREATE INDEX IF NOT EXISTS communication_routes_lookup_idx
  ON public.communication_routes (department, workflow, trigger_action, channel_type, active, priority);

DROP TRIGGER IF EXISTS communication_routes_set_updated_at ON public.communication_routes;
CREATE TRIGGER communication_routes_set_updated_at BEFORE UPDATE ON public.communication_routes
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

CREATE TABLE IF NOT EXISTS public.communication_threads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department            text NOT NULL CHECK (department IN ('accounting','operations','sales','marketing','executive','system')),
  workflow              text NOT NULL,
  source_table          text,
  source_pk             text,
  invoice_number        text,
  invoice_line_id       uuid,
  item_number           text,
  trigger_action        text NOT NULL,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','awaiting_internal_approval','approved','queued_for_release','rejected','deleted')),
  subject               text NOT NULL,
  owner_actor_id        text,
  last_event_id         uuid,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text NOT NULL,
  updated_by            text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.communication_threads IS
  'Workflow-level communication preview state anchored to an originating source row.';

CREATE INDEX IF NOT EXISTS communication_threads_source_idx
  ON public.communication_threads (source_table, source_pk, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_threads_invoice_idx
  ON public.communication_threads (invoice_number, item_number, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_threads_status_idx
  ON public.communication_threads (department, workflow, status, updated_at DESC);

DROP TRIGGER IF EXISTS communication_threads_set_updated_at ON public.communication_threads;
CREATE TRIGGER communication_threads_set_updated_at BEFORE UPDATE ON public.communication_threads
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

CREATE TABLE IF NOT EXISTS public.communication_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id             uuid NOT NULL REFERENCES public.communication_threads(id) ON DELETE CASCADE,
  channel_type          text NOT NULL CHECK (channel_type IN ('slack','email')),
  route_id              uuid REFERENCES public.communication_routes(id) ON DELETE SET NULL,
  subject               text NOT NULL,
  body_html             text NOT NULL DEFAULT '',
  body_text             text NOT NULL DEFAULT '',
  recipients            jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments           jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_state      text NOT NULL DEFAULT 'pending'
                          CHECK (validation_state IN ('pending','ready','failed')),
  validation_errors     jsonb NOT NULL DEFAULT '[]'::jsonb,
  edited_by             text,
  edited_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.communication_messages IS
  'Channel-specific message drafts (Slack + email) for each communication thread.';

CREATE INDEX IF NOT EXISTS communication_messages_thread_idx
  ON public.communication_messages (thread_id, channel_type);
CREATE UNIQUE INDEX IF NOT EXISTS communication_messages_unique_channel_idx
  ON public.communication_messages (thread_id, channel_type);

DROP TRIGGER IF EXISTS communication_messages_set_updated_at ON public.communication_messages;
CREATE TRIGGER communication_messages_set_updated_at BEFORE UPDATE ON public.communication_messages
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

CREATE TABLE IF NOT EXISTS public.communication_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id             uuid NOT NULL REFERENCES public.communication_threads(id) ON DELETE CASCADE,
  actor_id              text NOT NULL,
  actor_type            text NOT NULL,
  actor_display_name    text,
  event_type            text NOT NULL,
  action                text,
  before_state          jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state           jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.communication_events IS
  'Immutable full-fidelity event ledger for communication validation and execution.';

CREATE INDEX IF NOT EXISTS communication_events_thread_idx
  ON public.communication_events (thread_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.cw_block_mutation_communication_events()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'communication_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS communication_events_no_update ON public.communication_events;
CREATE TRIGGER communication_events_no_update
  BEFORE UPDATE ON public.communication_events
  FOR EACH ROW EXECUTE FUNCTION public.cw_block_mutation_communication_events();

DROP TRIGGER IF EXISTS communication_events_no_delete ON public.communication_events;
CREATE TRIGGER communication_events_no_delete
  BEFORE DELETE ON public.communication_events
  FOR EACH ROW EXECUTE FUNCTION public.cw_block_mutation_communication_events();

CREATE TABLE IF NOT EXISTS public.communication_delivery_attempts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id             uuid NOT NULL REFERENCES public.communication_threads(id) ON DELETE CASCADE,
  message_id            uuid NOT NULL REFERENCES public.communication_messages(id) ON DELETE CASCADE,
  channel_type          text NOT NULL CHECK (channel_type IN ('slack','email')),
  delivery_mode         text NOT NULL DEFAULT 'internal_simulated'
                          CHECK (delivery_mode IN ('internal_simulated','manual_release_required')),
  status                text NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','validated','ready_to_send','failed','skipped')),
  recipient_snapshot    jsonb NOT NULL DEFAULT '[]'::jsonb,
  route_snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message         text,
  created_by            text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.communication_delivery_attempts IS
  'Delivery verification ledger; does not send external messages.';

CREATE INDEX IF NOT EXISTS communication_delivery_attempts_thread_idx
  ON public.communication_delivery_attempts (thread_id, channel_type, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_delivery_attempts_status_idx
  ON public.communication_delivery_attempts (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS communication_delivery_attempts_dedupe_idx
  ON public.communication_delivery_attempts (thread_id, message_id, status)
  WHERE status IN ('queued', 'validated', 'ready_to_send');

DROP TRIGGER IF EXISTS communication_delivery_attempts_set_updated_at ON public.communication_delivery_attempts;
CREATE TRIGGER communication_delivery_attempts_set_updated_at BEFORE UPDATE ON public.communication_delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

CREATE OR REPLACE VIEW public.v_communication_preview_queue AS
SELECT
  t.id,
  t.department,
  t.workflow,
  t.source_table,
  t.source_pk,
  t.invoice_number,
  t.invoice_line_id,
  t.item_number,
  t.trigger_action,
  t.status,
  t.subject,
  t.owner_actor_id,
  t.metadata,
  t.updated_at,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'channel_type', m.channel_type,
        'route_id', m.route_id,
        'subject', m.subject,
        'body_html', m.body_html,
        'body_text', m.body_text,
        'recipients', m.recipients,
        'attachments', m.attachments,
        'validation_state', m.validation_state,
        'validation_errors', m.validation_errors,
        'updated_at', m.updated_at
      )
      ORDER BY m.channel_type
    ) FILTER (WHERE m.id IS NOT NULL),
    '[]'::jsonb
  ) AS messages
FROM public.communication_threads t
LEFT JOIN public.communication_messages m
  ON m.thread_id = t.id
GROUP BY t.id;

COMMENT ON VIEW public.v_communication_preview_queue IS
  'Preview queue with thread state and channel drafts.';

CREATE OR REPLACE VIEW public.v_communication_event_timeline AS
SELECT
  e.id,
  e.thread_id,
  t.department,
  t.workflow,
  t.invoice_number,
  t.item_number,
  e.actor_id,
  e.actor_type,
  e.actor_display_name,
  e.event_type,
  e.action,
  e.before_state,
  e.after_state,
  e.payload,
  e.created_at
FROM public.communication_events e
JOIN public.communication_threads t
  ON t.id = e.thread_id;

COMMENT ON VIEW public.v_communication_event_timeline IS
  'Chronological immutable event timeline across communication threads.';

INSERT INTO public.communication_routes (
  department,
  workflow,
  trigger_action,
  channel_type,
  target_agent,
  target_channel_id,
  target_email,
  priority,
  active,
  metadata
)
VALUES
  (
    'accounting',
    'invoice-audit',
    'accept-neg',
    'slack',
    '@ob-accounting',
    null,
    null,
    10,
    true,
    '{"intent":"internal-approval-mirror"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'accept-neg',
    'email',
    '@ob-accounting',
    null,
    'lucinda@proexteriorsus.com',
    10,
    true,
    '{"intent":"internal-approval-email"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'accept-tbn',
    'slack',
    '@ob-accounting',
    null,
    null,
    10,
    true,
    '{"intent":"internal-approval-mirror"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'accept-tbn',
    'email',
    '@ob-accounting',
    null,
    'lucinda@proexteriorsus.com',
    10,
    true,
    '{"intent":"internal-approval-email"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'accept-30d',
    'slack',
    '@ob-accounting',
    null,
    null,
    10,
    true,
    '{"intent":"internal-approval-mirror"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'accept-30d',
    'email',
    '@ob-accounting',
    null,
    'lucinda@proexteriorsus.com',
    10,
    true,
    '{"intent":"internal-approval-email"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'accept-nochallenge',
    'slack',
    '@ob-accounting',
    null,
    null,
    10,
    true,
    '{"intent":"internal-approval-mirror"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'accept-nochallenge',
    'email',
    '@ob-accounting',
    null,
    'lucinda@proexteriorsus.com',
    10,
    true,
    '{"intent":"internal-approval-email"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'credit-flag',
    'slack',
    '@ob-accounting',
    null,
    null,
    10,
    true,
    '{"intent":"credit-memo-internal-approval"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'credit-flag',
    'email',
    '@ob-accounting',
    null,
    'lucinda@proexteriorsus.com',
    10,
    true,
    '{"intent":"credit-memo-internal-approval-email"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'credit-noflag',
    'slack',
    '@ob-accounting',
    null,
    null,
    10,
    true,
    '{"intent":"credit-memo-internal-approval"}'::jsonb
  ),
  (
    'accounting',
    'invoice-audit',
    'credit-noflag',
    'email',
    '@ob-accounting',
    null,
    'lucinda@proexteriorsus.com',
    10,
    true,
    '{"intent":"credit-memo-internal-approval-email"}'::jsonb
  )
ON CONFLICT (department, workflow, trigger_action, channel_type, priority) DO UPDATE
SET
  target_agent = EXCLUDED.target_agent,
  target_channel_id = EXCLUDED.target_channel_id,
  target_email = EXCLUDED.target_email,
  active = EXCLUDED.active,
  metadata = EXCLUDED.metadata,
  updated_at = now();

ALTER TABLE public.communication_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_delivery_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.communication_routes, public.communication_threads,
  public.communication_messages, public.communication_events,
  public.communication_delivery_attempts FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.communication_routes,
  public.communication_threads, public.communication_messages,
  public.communication_delivery_attempts TO service_role;
GRANT SELECT, INSERT ON TABLE public.communication_events TO service_role;

GRANT SELECT ON public.v_communication_preview_queue,
  public.v_communication_event_timeline TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
