-- 184 — AccuLynx pending-write state table (Phase 5, REQ-08)
--
-- acculynx_pending_write holds the lifecycle state (enqueue -> preview -> approve ->
-- execute -> audit) for every agent-authored AccuLynx write. This is AccuLynx-specific
-- state (target account, lane/endpoint, request payload, dry-run render, status,
-- approver, exec result, idempotency key) that must NOT live on the generic
-- dashboard_work_items row shape (RQ-4) and must NOT be conflated with the cross-client
-- consent-domain atom_access_log (hard rule 6, schema 50) — see 185 for the separate
-- immutable write-action audit log.
--
-- Mirrors 182's idempotent DDL + CHECK-enum shape. Schema numbering continues past the
-- latest applied migration (183); this pair is 184/185.
--
-- Applied via the Supabase MCP apply_migration/execute_sql path against the shared prod
-- project rnhmvcpsvtqjlffpsayu — this repo does NOT use `supabase db push` (the same path
-- 182/183 were applied in Phase 4).
--
-- Additive + idempotent only; nothing destructive, no retype, no data touch (hard rule 1).

create table if not exists public.acculynx_pending_write (
  id                integer generated always as identity primary key,
  work_key          text not null,
  lane              text not null
                      check (lane in (
                        'postContact',
                        'postJob',
                        'postJobPaymentReceived',
                        'postJobPaymentExpense',
                        'putJobAddress',
                        'putJobInitialAppointment',
                        'putJobInsurance',
                        'putJobInsuranceCompany',
                        'putJobLeadSource',
                        'putJobPriority',
                        'deleteJobArOwner',
                        'deleteJobSalesOwner',
                        'postWorksheetItem',
                        'postJobMessage',
                        'postJobPhotosVideos',
                        'postJobRepresentativeCompany',
                        'postJobExternalReference'
                      )),
  target_env        text not null default 'sandbox' check (target_env in ('sandbox', 'prod')),
  account_key       text not null,
  endpoint          text not null,
  payload           jsonb not null,
  dry_run_render    jsonb,
  idempotency_key   text not null,
  status            text not null default 'pending_review'
                      check (status in ('pending_review', 'approved', 'executed', 'rejected', 'failed')),
  approver          text,
  exec_result       jsonb,
  department        text,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.acculynx_pending_write is
  'Phase 5 (REQ-08) pending-write lifecycle: enqueue -> preview -> approve -> execute -> audit. '
  'AccuLynx-specific write state kept OUT of dashboard_work_items (RQ-4) and OUT of the consent-domain '
  'atom_access_log (hard rule 6). Join key back to dashboard_work_items / LiveWorkItem.workKey is work_key.';
comment on column public.acculynx_pending_write.lane is
  'One of the 17 proven-safe lanes (D-06) exported as WriteLane in supabase/functions/acculynx-write-action/action.ts — kept in sync with that enum.';
comment on column public.acculynx_pending_write.idempotency_key is
  'sha256(lane|accountKey|targetEnv|canonicalized-payload) per action.ts computeIdempotencyKey. UNIQUE below — checked by the edge function before execute to prevent a double-fire (T-05-07).';
comment on column public.acculynx_pending_write.work_key is
  'Join key back to dashboard_work_items / LiveWorkItem.workKey, consumed by the Wave 2 live-work.ts loader.';

-- Idempotency-key and work_key uniqueness (double-fire prevention + dashboard join key).
create unique index if not exists idx_acculynx_pending_write_idempotency
  on public.acculynx_pending_write (idempotency_key);

create unique index if not exists idx_acculynx_pending_write_work_key
  on public.acculynx_pending_write (work_key);

create index if not exists idx_acculynx_pending_write_status
  on public.acculynx_pending_write (status);

-- Deny-by-default RLS posture, matching schema 166/177/182.
alter table public.acculynx_pending_write enable row level security;

-- service_role is the sole writer: the Astro service-role client (Command Center tier)
-- enqueues/reads pending-write rows, and the acculynx-write-action Edge Function updates
-- status/exec_result on execute (D-02 sole-code-path boundary). No blanket authenticated
-- or anon grant. If the dashboard later needs to read this table directly via an
-- authenticated (non-service-role) client, add `grant select ... to authenticated` at
-- that time — per D-02/D-07 the dashboard reads via the service-role client in
-- live-work.ts today, so this is intentionally omitted for now.
grant select, insert, update on public.acculynx_pending_write to service_role;
