-- 187 — AccuLynx webhook event log table (Phase 7, gap-closure Wave 7, REQ-10, plan 07-08, D-17)
--
-- PROBLEM: D-17 (webhooks as triggers) needs a counted, queryable, auditable landing table for
-- every inbound acculynx-webhook POST — verified or not — before the receiver Edge Function
-- (Task 2) can be built and sandbox-proven (Task 3). The payload is untrusted external input
-- (REQ-09/D-10 boundary): it must be stored for audit, but never executed or interpreted as
-- instructions.
--
-- FIX: a new acculynx_webhook_events table (deny-by-default RLS, matching migration 177/186's
-- posture) recording every inbound webhook request — topic, job_id, account_key, whether the
-- request's authenticity verified, the raw payload (jsonb, data only), which pull action it
-- triggered (if any), and when that action was processed. An index on (topic, received_at)
-- supports both the receiver's own audit queries and future alert-condition wiring.
--
-- Applied to prod rnhmvcpsvtqjlffpsayu via the blocking apply-to-prod gate (07-08-PLAN.md Task 1b)
-- — NOT applied by this authoring task.
--
-- Additive + idempotent; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- TABLE: acculynx_webhook_events
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.acculynx_webhook_events (
  id                  bigint generated always as identity primary key,
  topic               text not null,
  job_id              text,
  account_key         text,
  received_at         timestamptz not null default now(),
  signature_verified  boolean not null default false,
  payload             jsonb not null,
  enqueued_action     text,
  processed_at        timestamptz
);
comment on table public.acculynx_webhook_events is
  'D-17 webhook trigger event log: one row per inbound acculynx-webhook POST (verified or not), for audit and for driving the D-15/D-16 pull-enqueue routing. signature_verified=false rows were rejected (401) and never enqueued a pull.';
comment on column public.acculynx_webhook_events.payload is
  'UNTRUSTED external input (D-10/REQ-09 boundary): the raw webhook body as delivered by AccuLynx, stored verbatim for audit only. Never executed, never interpreted as instructions — fields are read positionally by the receiver before this row is written.';
comment on column public.acculynx_webhook_events.enqueued_action is
  'The pull action this event triggered, e.g. first_sight_full_pull (D-15, job-created topics) or targeted_repull:financials / targeted_repull:representatives (D-16, field-changed topics). Null when the request was unverified or the topic was unrecognized.';

create index if not exists idx_acculynx_webhook_events_topic_received
  on public.acculynx_webhook_events(topic, received_at);

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- RLS + GRANT: deny-by-default posture, matching migrations 177 and 186
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.acculynx_webhook_events enable row level security;
revoke all on public.acculynx_webhook_events from anon, authenticated;
grant all on public.acculynx_webhook_events to service_role;

-- Additive; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).
