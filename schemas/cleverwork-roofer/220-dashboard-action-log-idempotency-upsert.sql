-- Migration 220 — make agent-intake audit upserts compatible with PostgREST ON CONFLICT.
--
-- A partial unique index cannot be inferred by the API's
-- `on_conflict=idempotency_key` upsert. PostgreSQL unique indexes already permit
-- multiple NULL values, so the predicate is unnecessary. This replacement makes
-- the audit append idempotent while retaining all legacy rows with NULL keys.

drop index if exists public.dashboard_action_log_idempotency_key_idx;

create unique index dashboard_action_log_idempotency_key_idx
  on public.dashboard_action_log(idempotency_key);
