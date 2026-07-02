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
  event_id            text, -- AccuLynx webhookEvent.eventId — the replay-defense key (unique when present)
  topic               text not null,
  job_id              text,
  account_key         text,
  received_at         timestamptz not null default now(),
  signature_verified  boolean not null default false,
  payload             jsonb not null,
  enqueued_action     text,
  processed_at        timestamptz
);
-- Idempotent add for pre-existing deployments of this table (additive only):
alter table public.acculynx_webhook_events add column if not exists event_id text;
comment on table public.acculynx_webhook_events is
  'D-17 webhook trigger event log: one row per inbound acculynx-webhook POST (verified or not), for audit and for driving the D-15/D-16 pull-enqueue routing. signature_verified=false rows were rejected (401) and never enqueued a pull.';
comment on column public.acculynx_webhook_events.payload is
  'UNTRUSTED external input (D-10/REQ-09 boundary): the raw webhook body as delivered by AccuLynx, stored verbatim for audit only. Never executed, never interpreted as instructions — fields are read positionally by the receiver before this row is written.';
comment on column public.acculynx_webhook_events.enqueued_action is
  'The pull action this event triggered, e.g. first_sight_full_pull (D-15, job-created topics) or targeted_repull:financials / targeted_repull:representatives (D-16, field-changed topics). Null when the request was unverified or the topic was unrecognized.';

create index if not exists idx_acculynx_webhook_events_topic_received
  on public.acculynx_webhook_events(topic, received_at);

-- Replay defense (Task 0 decision, item 3): a VERIFIED event's eventId may land exactly once.
-- Partial unique index — unverified/rejected rows (signature_verified=false) and legacy rows
-- without an eventId are exempt so audit logging is never blocked by the constraint.
create unique index if not exists uq_acculynx_webhook_events_event_id_verified
  on public.acculynx_webhook_events(event_id)
  where event_id is not null and signature_verified;
comment on column public.acculynx_webhook_events.event_id is
  'webhookEvent.eventId from the delivered payload — replay-defense key. Unique among verified rows (partial index); the receiver treats a conflict as a replay: 200-ack, no re-processing.';

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- RLS + GRANT: deny-by-default posture, matching migrations 177 and 186
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.acculynx_webhook_events enable row level security;
revoke all on public.acculynx_webhook_events from anon, authenticated;
grant all on public.acculynx_webhook_events to service_role;

-- Additive; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).
