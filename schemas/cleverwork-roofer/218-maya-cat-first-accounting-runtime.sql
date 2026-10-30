-- Maya accounting runtime v2: CAT-first orchestration, channel-neutral intake,
-- Linear work leases, recurring-loop registry, and append-only action receipts.
-- Additive and default-deny. Financial effects remain behind existing human gates.
begin;

alter table runtime_auth.capability_grants
  drop constraint if exists capability_grants_capability_check;
alter table runtime_auth.capability_grants
  add constraint capability_grants_capability_check check (capability in (
    'slack.receive.christopher',
    'mailbox.read', 'mailbox.classify',
    'linear.read', 'linear.create_cat_source', 'linear.create_accounting_child',
    'linear.claim_accounting_work', 'linear.comment', 'linear.update_state',
    'command_center.read_work_queue', 'command_center.read_price_agreements',
    'command_center.read_credit_memos', 'command_center.read_wip_ar',
    'command_center.record_decision',
    'slack.send.christopher', 'email.send.admin'
  ));

alter table runtime_auth.schedules drop constraint if exists schedules_id_check;
alter table runtime_auth.schedules drop constraint if exists schedules_cron_utc_check;
alter table runtime_auth.schedules
  add constraint schedules_id_check check (id ~ '^maya-[a-z0-9-]+-v[0-9]+$');
alter table runtime_auth.schedules
  add constraint schedules_cron_utc_check check (length(cron_utc) between 9 and 80);

alter table runtime_auth.work_items drop constraint if exists work_items_source_kind_check;
alter table runtime_auth.work_items
  add constraint work_items_source_kind_check check (source_kind in (
    'gmail', 'slack', 'signal', 'webhook', 'linear', 'recurring'
  ));

create table runtime_auth.intake_orchestrations (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  source_key text not null unique,
  source_channel text not null check (source_channel in ('gmail','slack','signal','webhook','linear','recurring')),
  source_event_digest text not null,
  source_thread_digest text,
  content_digest text not null,
  cat_source_issue_uuid uuid,
  cat_source_identifier text check (cat_source_identifier is null or cat_source_identifier ~ '^CAT-[0-9]+$'),
  accounting_issue_uuid uuid,
  accounting_identifier text check (accounting_identifier is null or accounting_identifier ~ '^PEC-[0-9]+$'),
  state text not null default 'received' check (state in (
    'received','cat_recorded','accounting_recorded','claimable','working','agent_review',
    'needs_input','completed','duplicate','ambiguous','cancelled'
  )),
  state_version bigint not null default 0 check (state_version >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (accounting_issue_uuid is null or cat_source_issue_uuid is not null)
);

create unique index maya_one_accounting_issue_per_cat_source
  on runtime_auth.intake_orchestrations(cat_source_issue_uuid)
  where cat_source_issue_uuid is not null;

create table runtime_auth.linear_work_claims (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  orchestration_id uuid not null references runtime_auth.intake_orchestrations(id) on delete restrict,
  issue_uuid uuid not null,
  lease_epoch bigint not null default 1 check (lease_epoch > 0),
  state text not null check (state in ('active','completed','needs_input','ambiguous','expired','fenced')),
  acquired_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  unique(principal_id, issue_uuid, lease_epoch)
);

create unique index maya_one_active_linear_work_claim
  on runtime_auth.linear_work_claims(issue_uuid)
  where state = 'active';

create table runtime_auth.channel_deliveries (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  channel text not null check (channel in ('gmail','slack','signal','webhook')),
  external_delivery_id text not null,
  payload_digest text not null,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  result text not null default 'received' check (result in ('received','accepted','duplicate','rejected','ambiguous')),
  unique(principal_id, channel, external_delivery_id)
);

create table runtime_auth.recurring_loops (
  id text primary key check (id ~ '^maya-[a-z0-9-]+-v[0-9]+$'),
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  cadence text not null check (cadence in ('daily','weekly','monthly','quarterly','annual')),
  cron_local text not null,
  time_zone text not null default 'America/Chicago' check (time_zone = 'America/Chicago'),
  work_type text not null,
  cat_parent_identifier text not null check (cat_parent_identifier ~ '^CAT-[0-9]+$'),
  state text not null default 'defined' check (state in ('defined','active','suspended','revoked')),
  spec_version text not null default 'maya-accounting-loops-v1',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table runtime_auth.linear_action_receipts (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  orchestration_id uuid references runtime_auth.intake_orchestrations(id) on delete restrict,
  sequence_no bigint not null check (sequence_no > 0),
  actor_subject text not null,
  action text not null,
  target_identifier text,
  request_digest text not null,
  result text not null check (result in ('confirmed','duplicate','rejected','ambiguous','reconciled')),
  provider_reference_digest text,
  previous_receipt_hash text,
  receipt_hash text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  unique(principal_id, sequence_no)
);

create index maya_orchestration_state_idx
  on runtime_auth.intake_orchestrations(state, updated_at);
create index maya_channel_delivery_received_idx
  on runtime_auth.channel_deliveries(channel, received_at desc);
create index maya_linear_receipts_orchestration_idx
  on runtime_auth.linear_action_receipts(orchestration_id, sequence_no);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'intake_orchestrations','linear_work_claims','channel_deliveries',
    'recurring_loops','linear_action_receipts'
  ] loop
    execute format('alter table runtime_auth.%I enable row level security', table_name);
    execute format('alter table runtime_auth.%I force row level security', table_name);
    execute format('revoke all on table runtime_auth.%I from public, anon, authenticated, service_role', table_name);
  end loop;
end $$;

create trigger maya_linear_receipts_no_update
  before update or delete on runtime_auth.linear_action_receipts
  for each row execute function runtime_auth.deny_receipt_mutation();

alter table public.dashboard_action_log
  add column if not exists idempotency_key text;
create unique index if not exists dashboard_action_log_idempotency_key_idx
  on public.dashboard_action_log(idempotency_key)
  where idempotency_key is not null;

insert into runtime_auth.capability_grants(id, principal_id, capability, state) values
  ('78000000-0000-4000-8000-000000000026','78000000-0000-4000-8000-000000000001','linear.read','disabled'),
  ('78000000-0000-4000-8000-000000000027','78000000-0000-4000-8000-000000000001','linear.create_cat_source','disabled'),
  ('78000000-0000-4000-8000-000000000028','78000000-0000-4000-8000-000000000001','linear.create_accounting_child','disabled'),
  ('78000000-0000-4000-8000-000000000029','78000000-0000-4000-8000-000000000001','linear.claim_accounting_work','disabled'),
  ('78000000-0000-4000-8000-000000000030','78000000-0000-4000-8000-000000000001','linear.comment','disabled'),
  ('78000000-0000-4000-8000-000000000031','78000000-0000-4000-8000-000000000001','linear.update_state','disabled'),
  ('78000000-0000-4000-8000-000000000032','78000000-0000-4000-8000-000000000001','command_center.read_work_queue','disabled'),
  ('78000000-0000-4000-8000-000000000033','78000000-0000-4000-8000-000000000001','command_center.read_price_agreements','disabled'),
  ('78000000-0000-4000-8000-000000000034','78000000-0000-4000-8000-000000000001','command_center.read_credit_memos','disabled'),
  ('78000000-0000-4000-8000-000000000035','78000000-0000-4000-8000-000000000001','command_center.read_wip_ar','disabled')
on conflict (principal_id, capability) do nothing;

insert into runtime_auth.recurring_loops
  (id, principal_id, cadence, cron_local, work_type, cat_parent_identifier)
values
  ('maya-morning-inbox-audit-v1','78000000-0000-4000-8000-000000000001','daily','0 7 * * 1-5','accounting_intake','CAT-20'),
  ('maya-daily-summary-v1','78000000-0000-4000-8000-000000000001','daily','0 17 * * 1-5','accounting_summary','CAT-20'),
  ('maya-vendor-aging-report-v1','78000000-0000-4000-8000-000000000001','weekly','0 8 * * 1','ap_aging','CAT-20'),
  ('maya-document-quality-audit-v1','78000000-0000-4000-8000-000000000001','weekly','0 9 * * 5','quality_audit','CAT-20'),
  ('maya-vendor-onboarding-review-v1','78000000-0000-4000-8000-000000000001','monthly','0 9 1 * *','vendor_review','CAT-20'),
  ('maya-extraction-accuracy-report-v1','78000000-0000-4000-8000-000000000001','monthly','0 10 1 * *','quality_report','CAT-20'),
  ('maya-vendor-relationship-audit-v1','78000000-0000-4000-8000-000000000001','quarterly','0 9 1 1,4,7,10 *','vendor_audit','CAT-20'),
  ('maya-intake-system-review-v1','78000000-0000-4000-8000-000000000001','annual','0 9 15 1 *','system_review','CAT-20')
on conflict (id) do update set
  cron_local = excluded.cron_local,
  work_type = excluded.work_type,
  cat_parent_identifier = excluded.cat_parent_identifier,
  spec_version = excluded.spec_version,
  updated_at = clock_timestamp();

comment on table runtime_auth.intake_orchestrations is
  'One channel/thread/content orchestration rooted in CODEX AGENT TEAM and optionally linked to one downstream accounting issue.';
comment on table runtime_auth.linear_action_receipts is
  'Append-only actor/action/result ledger for Maya Linear orchestration. Raw message bodies and PII are prohibited; retain only digests and stable issue identifiers.';
comment on table runtime_auth.recurring_loops is
  'Canonical daily-through-annual Maya accounting loop registry. Rows remain defined until an explicit production activation gate records the runtime owner.';

commit;
