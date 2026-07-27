-- PEC-78 installed-disabled foundation. Additive only: no credential, active grant,
-- enabled schedule, production effect, provider call, or backfill is created here.
begin;

create schema runtime_auth;
revoke all on schema runtime_auth from public, anon, authenticated;

create table runtime_auth.principals (
  id uuid primary key default gen_random_uuid(), contract_version text not null check (contract_version='pec78-runtime-authorization-v1'),
  persona_id text not null check (persona_id='maya-chen'), subject text not null check (subject='named-agent:maya-chen'),
  runtime_owner_id text not null check (runtime_owner_id='runtime:maya-chen'), registry_version text not null,
  state text not null default 'disabled' check (state in ('disabled','active','suspended','revoked')), fence_epoch bigint not null default 0 check(fence_epoch>=0),
  created_at timestamptz not null default clock_timestamp(), unique(contract_version,persona_id)
);
create table runtime_auth.credentials (
  id uuid primary key default gen_random_uuid(), principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  credential_id uuid not null unique, issuer text not null, key_thumbprint text not null unique, runtime_instance_id uuid not null,
  provider_refs jsonb not null default '{}'::jsonb, state text not null default 'disabled' check(state in ('disabled','active','revoked','expired')),
  not_before timestamptz, expires_at timestamptz, created_at timestamptz not null default clock_timestamp()
);
create table runtime_auth.capability_grants (
  id uuid primary key default gen_random_uuid(), principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  capability text not null check(capability in ('mailbox.read','mailbox.classify','command_center.record_decision','slack.send.christopher','email.send.admin')),
  state text not null default 'disabled' check(state in ('disabled','active','revoked')), valid_from timestamptz, valid_until timestamptz, unique(principal_id,capability)
);
create table runtime_auth.destination_grants (
  id uuid primary key default gen_random_uuid(), capability_grant_id uuid not null references runtime_auth.capability_grants(id) on delete restrict,
  provider text not null check(provider in ('google','slack')), account_digest text not null, destination_digest text not null, thread_digest text,
  destination_ref text not null, state text not null default 'disabled' check(state in ('disabled','active','revoked')), valid_until timestamptz
);
create table runtime_auth.schedules (
  id text primary key check(id='maya-mailbox-30m-v1'), principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  contract_version text not null check(contract_version='pec78-runtime-authorization-v1'), cron_utc text not null check(cron_utc='*/30 * * * *'),
  runtime_owner_id text not null check(runtime_owner_id='runtime:maya-chen'), state text not null default 'disabled' check(state in ('disabled','active','revoked')),
  catch_up_seconds integer not null default 1800 check(catch_up_seconds between 0 and 1800), lease_seconds integer not null default 300 check(lease_seconds between 1 and 300), fence_epoch bigint not null default 0
);
create table runtime_auth.occurrences (
  id uuid primary key default gen_random_uuid(), contract_version text not null, principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  schedule_id text not null references runtime_auth.schedules(id) on delete restrict, scheduled_for timestamptz not null,
  state text not null check(state in ('scheduled','claimable','leased','completed','failed','expired','cancelled')), lease_epoch bigint not null default 0, mailbox_cursor text,
  unique(contract_version,principal_id,schedule_id,scheduled_for), check(extract(second from scheduled_for)=0 and extract(minute from scheduled_for) in (0,30))
);
create table runtime_auth.leases (
  id uuid primary key default gen_random_uuid(), occurrence_id uuid not null references runtime_auth.occurrences(id) on delete restrict,
  credential_id uuid not null references runtime_auth.credentials(id) on delete restrict, runtime_owner_id text not null, runtime_instance_id uuid not null,
  epoch bigint not null, state text not null check(state in ('active','completed','failed','expired','cancelled','fenced')), acquired_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null
);
create unique index pec78_one_active_lease on runtime_auth.leases(occurrence_id) where state='active';
create table runtime_auth.replay_claims (
  id uuid primary key default gen_random_uuid(), credential_id uuid not null references runtime_auth.credentials(id) on delete restrict,
  access_jti_hash text not null unique, proof_jti_hash text not null unique, expires_at timestamptz not null, created_at timestamptz not null default clock_timestamp()
);
create table runtime_auth.request_claims (
  id uuid primary key default gen_random_uuid(), credential_id uuid not null references runtime_auth.credentials(id) on delete restrict,
  route_id text not null, idempotency_key text not null, request_digest text not null, response_status integer, response_body jsonb,
  created_at timestamptz not null default clock_timestamp(), unique(credential_id,route_id,idempotency_key)
);
create table runtime_auth.work_items (
  id uuid primary key default gen_random_uuid(), occurrence_id uuid not null references runtime_auth.occurrences(id) on delete restrict,
  persona_id text not null check(persona_id='maya-chen'), source_kind text not null check(source_kind='gmail'), provider_message_id text not null,
  evidence_digest text not null, classification text not null, model_route_id text not null, state text not null check(state in ('received','classified','proposed','escalated','completed','quarantined','cancelled')),
  state_version bigint not null default 0, created_at timestamptz not null default clock_timestamp(), unique(persona_id,source_kind,provider_message_id)
);
create table runtime_auth.effects (
  id uuid primary key default gen_random_uuid(), work_id uuid not null references runtime_auth.work_items(id) on delete restrict,
  occurrence_id uuid not null references runtime_auth.occurrences(id) on delete restrict, principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  capability text not null check(capability in ('slack.send.christopher','email.send.admin')), destination_grant_id uuid not null references runtime_auth.destination_grants(id) on delete restrict,
  intent_digest text not null, payload_digest text not null, model_route_id text not null, effect_idempotency_key text not null,
  state text not null check(state in ('proposed','awaiting_approval','approved','reserved','executing','succeeded','rejected','expired','revoked','failed_unknown','failed_final','reconciled_succeeded','retry_authorized','duplicate_detected')),
  provider_message_id text, expires_at timestamptz not null, created_at timestamptz not null default clock_timestamp(), unique(principal_id,capability,effect_idempotency_key)
);
create table runtime_auth.approvals (
  id uuid primary key default gen_random_uuid(), effect_id uuid not null references runtime_auth.effects(id) on delete restrict,
  intent_digest text not null, approver_user_id text not null, approver_org_id text not null, nonce_hash text not null unique,
  decision text not null check(decision in ('approve','reject')), issued_at timestamptz not null, expires_at timestamptz not null, consumed_at timestamptz
);
create table runtime_auth.receipts (
  id uuid primary key default gen_random_uuid(), trace_id uuid not null, contract_version text not null, registry_version text not null, build_version text not null,
  event_type text not null, principal_id uuid, credential_id uuid, occurrence_id uuid, work_id uuid, lease_id uuid, lease_epoch bigint,
  capability text, destination_class text, destination_digest text, request_digest text, intent_digest text, idempotency_digest text,
  result text not null, code text not null, previous_receipt_hash text, receipt_hash text not null unique, created_at timestamptz not null default clock_timestamp()
);
create table runtime_auth.kill_switches (
  id uuid primary key default gen_random_uuid(), scope text not null check(scope in ('global','contract','principal','credential','capability','destination','schedule','effect')),
  target text not null, active boolean not null default true, reason text not null, actor_subject text not null, created_at timestamptz not null default clock_timestamp(), cleared_at timestamptz
);
create unique index pec78_one_active_kill on runtime_auth.kill_switches(scope,target) where active;
create table runtime_auth.production_gates (
  id uuid primary key default gen_random_uuid(), contract_version text not null, principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  build_version text not null, registry_version text not null, migration_version text not null, credential_id uuid,
  review_packet_digest text not null, approver_user_id text not null, approver_org_id text not null,
  state text not null default 'disabled' check(state in ('disabled','active','expired','revoked')), issued_at timestamptz not null, expires_at timestamptz not null
);

do $$ declare t text; begin
  foreach t in array array['principals','credentials','capability_grants','destination_grants','schedules','occurrences','leases','replay_claims','request_claims','work_items','effects','approvals','receipts','kill_switches','production_gates'] loop
    execute format('alter table runtime_auth.%I enable row level security',t);
    execute format('alter table runtime_auth.%I force row level security',t);
    execute format('revoke all on table runtime_auth.%I from public, anon, authenticated',t);
  end loop;
end $$;

create function runtime_auth.deny_receipt_mutation() returns trigger language plpgsql
set search_path = pg_catalog, runtime_auth as $$ begin raise exception 'runtime_receipts_are_append_only'; end $$;
revoke all on function runtime_auth.deny_receipt_mutation() from public, anon, authenticated;
create trigger pec78_receipts_no_update before update or delete on runtime_auth.receipts
for each row execute function runtime_auth.deny_receipt_mutation();

insert into runtime_auth.principals(id,contract_version,persona_id,subject,runtime_owner_id,registry_version,state)
values ('78000000-0000-4000-8000-000000000001','pec78-runtime-authorization-v1','maya-chen','named-agent:maya-chen','runtime:maya-chen','sha256:a9ea72a26888ce76f893394034e6a73be5dfb08443aff929b77c9d6753d8d7ad','disabled');
insert into runtime_auth.capability_grants(id,principal_id,capability,state) values
('78000000-0000-4000-8000-000000000011','78000000-0000-4000-8000-000000000001','mailbox.read','disabled'),
('78000000-0000-4000-8000-000000000012','78000000-0000-4000-8000-000000000001','mailbox.classify','disabled'),
('78000000-0000-4000-8000-000000000013','78000000-0000-4000-8000-000000000001','command_center.record_decision','disabled'),
('78000000-0000-4000-8000-000000000014','78000000-0000-4000-8000-000000000001','slack.send.christopher','disabled'),
('78000000-0000-4000-8000-000000000015','78000000-0000-4000-8000-000000000001','email.send.admin','disabled');
insert into runtime_auth.schedules(id,principal_id,contract_version,cron_utc,runtime_owner_id,state)
values ('maya-mailbox-30m-v1','78000000-0000-4000-8000-000000000001','pec78-runtime-authorization-v1','*/30 * * * *','runtime:maya-chen','disabled');
commit;
