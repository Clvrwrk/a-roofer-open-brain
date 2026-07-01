-- 185 — AccuLynx write-action immutable audit log (Phase 5, REQ-08)
--
-- acculynx_write_action_log records ONE immutable row per executed AccuLynx write
-- (SC2 audit trail) — actor, target, redacted request/response, outcome. This is a
-- NEW, distinct table: it is neither a reuse nor an extension of atom_access_log, which
-- is the cross-client CONSENT domain (schema 50, hard rule 6) and must stay untouched.
--
-- Column shape referenced from atom_access_log (requester identity, decision outcome,
-- timestamp) for consistency of audit-log conventions ONLY — the two tables serve
-- different domains and neither extends the other.
--
-- Column names below match the exact write contract already implemented in
-- supabase/functions/acculynx-write-action/index.ts's persistExecutionResult() (Plan
-- 05-01): lane, account_key, target_env, idempotency_key, request_method, request_path,
-- request_body_sample, response_body, http_status, status, created_at. pending_write_id,
-- work_key, and actor are additive columns beyond that contract for FK traceability back
-- to 184 and for recording who caused the execute.
--
-- Applied via the Supabase MCP apply_migration/execute_sql path against the shared prod
-- project rnhmvcpsvtqjlffpsayu — this repo does NOT use `supabase db push`.
--
-- Additive + idempotent only; nothing destructive, no retype, no data touch (hard rule 1).

create table if not exists public.acculynx_write_action_log (
  id                    integer generated always as identity primary key,
  pending_write_id      integer references public.acculynx_pending_write (id),
  work_key              text,
  lane                  text not null,
  target_env            text not null,
  account_key           text not null,
  idempotency_key       text not null,
  actor                 text,
  request_method        text,
  request_path          text,
  request_body_sample   jsonb,
  response_body         jsonb,
  http_status           integer,
  status                text not null check (status in ('success', 'failed')),
  created_at            timestamptz not null default now()
);

comment on table public.acculynx_write_action_log is
  'Phase 5 (REQ-08) immutable audit row per executed AccuLynx write (SC2). Distinct from the '
  'consent-domain atom_access_log (schema 50, hard rule 6) — never reused or extended for this purpose.';
comment on column public.acculynx_write_action_log.status is
  'Terminal outcome of the execute attempt: success or failed. Matches the status value written by '
  'supabase/functions/acculynx-write-action/index.ts persistExecutionResult().';
comment on column public.acculynx_write_action_log.request_body_sample is
  'Redacted outbound request body (redactSample() applied before persistence) — never raw secrets/PII.';
comment on column public.acculynx_write_action_log.response_body is
  'Redacted AccuLynx response body (redactSample() applied before persistence).';

create index if not exists idx_acculynx_write_action_log_idempotency
  on public.acculynx_write_action_log (idempotency_key);

create index if not exists idx_acculynx_write_action_log_pending_write
  on public.acculynx_write_action_log (pending_write_id);

create index if not exists idx_acculynx_write_action_log_work_key
  on public.acculynx_write_action_log (work_key);

-- Deny-by-default RLS posture, matching schema 166/177/182.
alter table public.acculynx_write_action_log enable row level security;

-- service_role-only: immutable audit trail, no authenticated write, no update/delete
-- grant at all (append-only by construction — nothing in this migration grants update
-- or delete to any role). Only the acculynx-write-action Edge Function inserts here.
grant select, insert on public.acculynx_write_action_log to service_role;
