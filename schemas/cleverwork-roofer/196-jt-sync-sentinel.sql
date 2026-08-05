/*
  196 — JT Sync Sentinel (docs/80, proposals/2026-08-05-jt-sync-sentinel.md)

  Ongoing JobTread ⇄ Supabase alignment on top of the jt_mirror pipeline
  built by the 2026-07-28 AccuLynx→JobTread migration (r2-schema/schema.sql).

  Additive and idempotent only. No existing object is modified destructively.

  Conflict policy (approved 2026-08-05):
    - Operational fields (milestones, daily logs, documents, tasks) flow
      JobTread → Supabase (the sweep upserts the jt_mirror echo tables).
    - Identity / catalog / pricing flow Supabase → JobTread through
      jt_mirror.pending_write (human-gated; nothing auto-approved in v1).
    - Disagreements land in jt_mirror.conflict_review — never auto-overwritten.
*/

-- Run ledger: one row per sentinel invocation (same pattern as abc_api_sync_runs).
CREATE TABLE IF NOT EXISTS jt_mirror.sync_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_kind text NOT NULL DEFAULT 'daily',      -- daily | smoke | manual
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',      -- running | ok | failed
  entities jsonb NOT NULL DEFAULT '{}'::jsonb, -- per-entity {seen, changed, jt_only, errors}
  drift jsonb NOT NULL DEFAULT '{}'::jsonb,    -- recon/drift summary snapshot
  staged_outbound integer NOT NULL DEFAULT 0,
  error text,
  loader_version text,
  CONSTRAINT sync_runs_status_allowed CHECK (status IN ('running','ok','failed'))
);

CREATE INDEX IF NOT EXISTS sync_runs_started_idx
  ON jt_mirror.sync_runs (started_at DESC);

-- Per-entity sweep watermarks (the columns r2 specced but never wired).
CREATE TABLE IF NOT EXISTS jt_mirror.sync_watermarks (
  entity text PRIMARY KEY,                     -- accounts | locations | jobs | ...
  last_swept_at timestamptz,
  last_run_id bigint,
  rows_seen integer NOT NULL DEFAULT 0,
  rows_changed integer NOT NULL DEFAULT 0,
  rows_jt_only integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Conflict queue: field-level disagreements between the SOT and JobTread.
CREATE TABLE IF NOT EXISTS jt_mirror.conflict_review (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity text NOT NULL,
  jt_id text,
  source_ref text,                             -- <source_table>:<id> when known
  field text NOT NULL,
  jt_value text,
  sot_value text,
  classification text NOT NULL DEFAULT 'conflict', -- conflict | jt_only | sot_only
  detected_at timestamptz NOT NULL DEFAULT now(),
  run_id bigint,
  status text NOT NULL DEFAULT 'open',         -- open | resolved | dismissed
  resolution text,
  resolved_by text,
  resolved_at timestamptz,
  CONSTRAINT conflict_review_status_allowed CHECK (status IN ('open','resolved','dismissed'))
);

CREATE INDEX IF NOT EXISTS conflict_review_open_idx
  ON jt_mirror.conflict_review (status, entity, detected_at DESC);

-- Idempotent conflict upserts: one open row per (entity, jt_id, field).
CREATE UNIQUE INDEX IF NOT EXISTS conflict_review_open_unique
  ON jt_mirror.conflict_review (entity, coalesce(jt_id,''), field)
  WHERE status = 'open';

-- Phase 2 landing zone: JT webhook deliveries (createWebhook, 43 event types).
CREATE TABLE IF NOT EXISTS jt_mirror.webhook_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text,
  jt_type text,
  jt_id text,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received',     -- received | processed | error
  error text
);

CREATE INDEX IF NOT EXISTS webhook_events_pending_idx
  ON jt_mirror.webhook_events (status, received_at);

-- Daily-logs echo table (6,466 were written in B3 but no read-back table was built).
CREATE TABLE IF NOT EXISTS jt_mirror.daily_logs (
  jt_id text PRIMARY KEY,
  jt_organization_id text,
  job_jt_id text,
  log_date date,
  notes text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Change-gating fingerprints on every echo table (sha256 of the normalized node).
ALTER TABLE jt_mirror.accounts      ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE jt_mirror.locations     ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE jt_mirror.jobs          ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE jt_mirror.documents     ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE jt_mirror.cost_items    ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE jt_mirror.cost_codes    ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE jt_mirror.custom_fields ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE jt_mirror.daily_logs    ADD COLUMN IF NOT EXISTS content_hash text;

-- Jobs carry the milestone / branch / rep custom-field values for drift checks.
ALTER TABLE jt_mirror.jobs ADD COLUMN IF NOT EXISTS custom_field_values jsonb;
ALTER TABLE jt_mirror.jobs ADD COLUMN IF NOT EXISTS closed_on date;

-- First-seen tracking for JT-native records (born in JobTread, not migrated).
ALTER TABLE jt_mirror.accounts      ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now();
ALTER TABLE jt_mirror.locations     ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now();
ALTER TABLE jt_mirror.jobs          ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now();
ALTER TABLE jt_mirror.documents     ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now();
ALTER TABLE jt_mirror.daily_logs    ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now();
