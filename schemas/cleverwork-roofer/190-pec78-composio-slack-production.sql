-- PEC-78 Maya Composio Slack production path. Installed disabled: this migration
-- creates no active source, credential, gate, authorization, grant, or runtime.
begin;

alter table runtime_auth.capability_grants
  drop constraint capability_grants_capability_check;
alter table runtime_auth.capability_grants
  add constraint capability_grants_capability_check check(capability in (
    'slack.receive.christopher','mailbox.read','mailbox.classify',
    'command_center.record_decision','slack.send.christopher','email.send.admin'
  )) not valid;
alter table runtime_auth.capability_grants validate constraint capability_grants_capability_check;

create table runtime_auth.ingress_sources (
  id text primary key check(id='maya-composio-slack-v1'),
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  provider text not null check(provider='composio'),
  event_type text not null check(event_type='composio.trigger.message'),
  trigger_slug text not null check(trigger_slug='SLACKBOT_CHANNEL_MESSAGE_RECEIVED'),
  trigger_id text not null,
  connected_account_id text not null,
  composio_user_id text not null check(composio_user_id='maya-chen'),
  slack_team_id text not null check(slack_team_id='T0B8QEGPVQW'),
  slack_channel_id text not null check(slack_channel_id='C0BD7L43PC2'),
  slack_bot_user_id text not null check(slack_bot_user_id='U0BD0Q0H55G'),
  owner_user_id text not null check(owner_user_id='U0B8SGJJZLJ'),
  mode text not null default 'disabled' check(mode in ('disabled','validation','enabled','revoked')),
  valid_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check(trigger_id='unbound' or trigger_id ~ '^ti_[A-Za-z0-9_-]{6,128}$'),
  check(connected_account_id='unbound' or connected_account_id ~ '^ca_[A-Za-z0-9_-]{6,128}$')
);

create table runtime_auth.activation_authorizations (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  source_id text not null references runtime_auth.ingress_sources(id) on delete restrict,
  approver_user_id text not null check(approver_user_id='U0B8SGJJZLJ'),
  build_version text not null,
  registry_version text not null,
  runtime_instance_id uuid not null,
  fence_epoch bigint not null check(fence_epoch>=0),
  trigger_id text not null,
  channel_id text not null check(channel_id='C0BD7L43PC2'),
  max_events integer not null default 1 check(max_events=1),
  consumed_events integer not null default 0 check(consumed_events between 0 and 1),
  state text not null default 'disabled' check(state in ('disabled','active','consumed','expired','revoked')),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check(expires_at>issued_at)
);
create unique index pec78_one_active_slack_validation
  on runtime_auth.activation_authorizations(principal_id,source_id) where state='active';

create table runtime_auth.inbound_events (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  source_id text not null references runtime_auth.ingress_sources(id) on delete restrict,
  provider_event_id text not null,
  delivery_digest text not null unique check(delivery_digest ~ '^sha256:[0-9a-f]{64}$'),
  message_digest text not null unique check(message_digest ~ '^sha256:[0-9a-f]{64}$'),
  payload_digest text not null check(payload_digest ~ '^sha256:[0-9a-f]{64}$'),
  channel_digest text not null check(channel_digest ~ '^sha256:[0-9a-f]{64}$'),
  thread_digest text not null check(thread_digest ~ '^sha256:[0-9a-f]{64}$'),
  encryption_algorithm text not null check(encryption_algorithm='aes-256-gcm'),
  encryption_key_version text not null check(encryption_key_version ~ '^[A-Za-z0-9._-]{1,64}$'),
  nonce text not null check(octet_length(decode(nonce,'base64'))=12),
  auth_tag text not null check(octet_length(decode(auth_tag,'base64'))=16),
  ciphertext text not null check(octet_length(decode(ciphertext,'base64')) between 1 and 16384),
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  state text not null default 'received' check(state in ('received','leased','completed','quarantined','cancelled')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 2),
  lease_epoch bigint not null default 0 check(lease_epoch>=0),
  completed_at timestamptz,
  terminal_code text
);
create index pec78_inbound_claim_order on runtime_auth.inbound_events(state,received_at,id);

create table runtime_auth.event_leases (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references runtime_auth.inbound_events(id) on delete restrict,
  credential_id uuid not null references runtime_auth.credentials(id) on delete restrict,
  runtime_instance_id uuid not null,
  runtime_owner_id text not null check(runtime_owner_id='runtime:maya-chen'),
  fence_epoch bigint not null check(fence_epoch>=0),
  lease_epoch bigint not null check(lease_epoch>0),
  state text not null check(state in ('active','completed','expired','failed','fenced','cancelled')),
  acquired_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  check(expires_at>acquired_at)
);
create unique index pec78_one_active_event_lease on runtime_auth.event_leases(event_id) where state='active';

create table runtime_auth.slack_effects (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references runtime_auth.inbound_events(id) on delete restrict,
  lease_id uuid not null references runtime_auth.event_leases(id) on delete restrict,
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  credential_id uuid not null references runtime_auth.credentials(id) on delete restrict,
  runtime_instance_id uuid not null,
  fence_epoch bigint not null check(fence_epoch>=0),
  lease_epoch bigint not null check(lease_epoch>0),
  capability text not null check(capability='slack.send.christopher'),
  destination_grant_id uuid not null references runtime_auth.destination_grants(id) on delete restrict,
  channel_digest text not null,
  thread_digest text not null,
  payload_digest text not null check(payload_digest ~ '^sha256:[0-9a-f]{64}$'),
  model_route_id text not null,
  effect_idempotency_key text not null,
  state text not null check(state in ('reserved','executing','succeeded','failed_unknown','failed_final','quarantined')),
  provider_message_id text,
  reserved_at timestamptz not null default clock_timestamp(),
  executing_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  unique(principal_id,capability,effect_idempotency_key),
  check(expires_at>reserved_at)
);

create table runtime_auth.event_receipts (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null,
  event_type text not null,
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  event_id uuid references runtime_auth.inbound_events(id) on delete restrict,
  lease_id uuid references runtime_auth.event_leases(id) on delete restrict,
  effect_id uuid references runtime_auth.slack_effects(id) on delete restrict,
  credential_id uuid references runtime_auth.credentials(id) on delete restrict,
  fence_epoch bigint,
  lease_epoch bigint,
  capability text,
  result text not null,
  code text not null,
  build_version text not null,
  previous_receipt_hash text,
  receipt_hash text not null unique,
  created_at timestamptz not null default clock_timestamp()
);

do $$ declare t text; begin
  foreach t in array array['ingress_sources','activation_authorizations','inbound_events','event_leases','slack_effects','event_receipts'] loop
    execute format('alter table runtime_auth.%I enable row level security',t);
    execute format('alter table runtime_auth.%I force row level security',t);
    execute format('revoke all on table runtime_auth.%I from public,anon,authenticated,service_role',t);
  end loop;
end $$;

create trigger pec78_event_receipts_no_update before update or delete on runtime_auth.event_receipts
for each row execute function runtime_auth.deny_receipt_mutation();

insert into runtime_auth.capability_grants(id,principal_id,capability,state)
values('78000000-0000-4000-8000-000000000016','78000000-0000-4000-8000-000000000001','slack.receive.christopher','disabled');
insert into runtime_auth.ingress_sources(
  id,principal_id,provider,event_type,trigger_slug,trigger_id,connected_account_id,
  composio_user_id,slack_team_id,slack_channel_id,slack_bot_user_id,owner_user_id,mode
) values(
  'maya-composio-slack-v1','78000000-0000-4000-8000-000000000001','composio','composio.trigger.message',
  'SLACKBOT_CHANNEL_MESSAGE_RECEIVED','unbound','unbound','maya-chen','T0B8QEGPVQW','C0BD7L43PC2',
  'U0BD0Q0H55G','U0B8SGJJZLJ','disabled'
);

create or replace function runtime_auth.append_event_receipt(
  p_trace_id uuid,p_event_type text,p_principal_id uuid,p_event_id uuid,p_lease_id uuid,p_effect_id uuid,
  p_credential_id uuid,p_fence_epoch bigint,p_lease_epoch bigint,p_capability text,p_result text,p_code text,p_build_version text
) returns uuid language plpgsql security definer
set search_path=pg_catalog,runtime_auth,extensions as $$
declare v_id uuid:=gen_random_uuid(); v_previous text; v_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended('pec78_event_receipt_chain',0));
  select receipt_hash into v_previous from runtime_auth.event_receipts order by created_at desc,id desc limit 1 for update;
  v_hash:=encode(extensions.digest(concat_ws('|',v_previous,v_id::text,p_trace_id::text,p_event_type,p_principal_id::text,
    p_event_id::text,p_lease_id::text,p_effect_id::text,p_credential_id::text,p_fence_epoch::text,p_lease_epoch::text,
    p_capability,p_result,p_code,p_build_version),'sha256'),'hex');
  insert into runtime_auth.event_receipts(id,trace_id,event_type,principal_id,event_id,lease_id,effect_id,credential_id,
    fence_epoch,lease_epoch,capability,result,code,build_version,previous_receipt_hash,receipt_hash)
  values(v_id,p_trace_id,p_event_type,p_principal_id,p_event_id,p_lease_id,p_effect_id,p_credential_id,
    p_fence_epoch,p_lease_epoch,p_capability,p_result,p_code,p_build_version,v_previous,v_hash);
  return v_id;
end $$;

-- Replace the shadow request authorizer so Slack authorization is bound to the
-- approved owner-validation channel. Operation RPCs still enforce the event's
-- exact thread digest before any provider I/O.
create or replace function public.pec78_authorize_request(
  p_credential_id uuid,p_runtime_instance_id uuid,p_capability text,
  p_access_jti_hash text,p_proof_jti_hash text,p_replay_expires_at timestamptz,
  p_route_id text,p_idempotency_key text,p_request_digest text,p_destination_ref text default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth as $$
declare v_credential runtime_auth.credentials%rowtype; v_principal runtime_auth.principals%rowtype;
  v_grant runtime_auth.capability_grants%rowtype; v_destination runtime_auth.destination_grants%rowtype;
  v_existing runtime_auth.request_claims%rowtype; v_now timestamptz:=clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('pec78_maya_runtime_transition',0));
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found or v_credential.state<>'active' or v_credential.runtime_instance_id<>p_runtime_instance_id or
     coalesce(v_credential.not_before,'-infinity')>v_now or coalesce(v_credential.expires_at,'infinity')<=v_now then
    return jsonb_build_object('ok',false,'code','credential_denied'); end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if v_principal.state<>'active' or exists(select 1 from runtime_auth.kill_switches k where k.active and
     (k.scope='global' or (k.scope='contract' and k.target=v_principal.contract_version) or
      (k.scope='principal' and k.target=v_principal.id::text) or (k.scope='credential' and k.target=v_credential.id::text) or
      (k.scope='capability' and k.target=p_capability))) then return jsonb_build_object('ok',false,'code','authority_denied'); end if;
  if not exists(select 1 from runtime_auth.production_gates g where g.principal_id=v_principal.id and g.credential_id=v_credential.id
     and g.state='active' and g.issued_at<=v_now and g.expires_at>v_now) then return jsonb_build_object('ok',false,'code','production_gate_denied'); end if;
  select * into v_grant from runtime_auth.capability_grants where principal_id=v_principal.id and capability=p_capability
    and state='active' and coalesce(valid_from,'-infinity')<=v_now and coalesce(valid_until,'infinity')>v_now for update;
  if not found then return jsonb_build_object('ok',false,'code','capability_denied'); end if;
  if p_capability in ('slack.send.christopher','email.send.admin') then
    select * into v_destination from runtime_auth.destination_grants where capability_grant_id=v_grant.id and state='active'
      and destination_ref=case p_capability when 'slack.send.christopher' then 'C0BD7L43PC2' else 'admin@cc.proexteriorsus.net' end
      and p_destination_ref=case p_capability when 'slack.send.christopher' then 'C0BD7L43PC2' else 'admin@cc.proexteriorsus.net' end
      and coalesce(valid_until,'infinity')>v_now for update;
    if not found or exists(select 1 from runtime_auth.kill_switches k where k.active and k.scope='destination' and k.target=v_destination.id::text)
      then return jsonb_build_object('ok',false,'code','destination_denied'); end if;
  end if;
  begin
    insert into runtime_auth.replay_claims(credential_id,access_jti_hash,proof_jti_hash,expires_at)
    values(v_credential.id,p_access_jti_hash,p_proof_jti_hash,p_replay_expires_at);
  exception when unique_violation then return jsonb_build_object('ok',false,'code','replay_denied'); end;
  select * into v_existing from runtime_auth.request_claims where credential_id=v_credential.id and route_id=p_route_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_digest<>p_request_digest then return jsonb_build_object('ok',false,'code','idempotency_conflict'); end if;
    return jsonb_build_object('ok',true,'replayed',true,'response_status',v_existing.response_status,'response_body',v_existing.response_body);
  end if;
  insert into runtime_auth.request_claims(credential_id,route_id,idempotency_key,request_digest)
  values(v_credential.id,p_route_id,p_idempotency_key,p_request_digest);
  return jsonb_build_object('ok',true,'replayed',false,'principal_id',v_principal.id,'credential_row_id',v_credential.id,'fence_epoch',v_principal.fence_epoch);
end $$;

create or replace function public.pec78_ingest_composio_slack_event(
  p_provider_event_id text,p_delivery_digest text,p_message_digest text,p_payload_digest text,p_channel_digest text,p_thread_digest text,
  p_trigger_id text,p_connected_account_id text,p_composio_user_id text,p_team_id text,p_channel_id text,p_owner_user_id text,
  p_occurred_at timestamptz,p_encryption_algorithm text,p_encryption_key_version text,p_nonce text,p_auth_tag text,p_ciphertext text,
  p_validation_mode boolean,p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth,extensions as $$
declare v_source runtime_auth.ingress_sources%rowtype; v_principal runtime_auth.principals%rowtype;
  v_existing runtime_auth.inbound_events%rowtype; v_event runtime_auth.inbound_events%rowtype;
  v_auth runtime_auth.activation_authorizations%rowtype; v_now timestamptz:=clock_timestamp();
begin
  select * into v_source from runtime_auth.ingress_sources where id='maya-composio-slack-v1' for update;
  if not found or v_source.mode not in ('validation','enabled') or coalesce(v_source.valid_until,'infinity')<=v_now or
     v_source.trigger_id<>p_trigger_id or v_source.connected_account_id<>p_connected_account_id or
     v_source.composio_user_id<>p_composio_user_id or v_source.slack_team_id<>p_team_id or
     v_source.slack_channel_id<>p_channel_id or v_source.owner_user_id<>p_owner_user_id then
    return jsonb_build_object('ok',false,'code','ingress_source_denied');
  end if;
  if (p_validation_mode and v_source.mode<>'validation') or (not p_validation_mode and v_source.mode<>'enabled') then
    return jsonb_build_object('ok',false,'code','ingress_mode_denied');
  end if;
  select * into v_principal from runtime_auth.principals where id=v_source.principal_id for update;
  if v_principal.state<>'active' or exists(select 1 from runtime_auth.kill_switches k where k.active and
     (k.scope='global' or (k.scope='principal' and k.target=v_principal.id::text) or (k.scope='capability' and k.target='slack.receive.christopher'))) then
    return jsonb_build_object('ok',false,'code','authority_denied');
  end if;
  select * into v_existing from runtime_auth.inbound_events
    where delivery_digest=p_delivery_digest or message_digest=p_message_digest order by received_at limit 1 for update;
  if found then return jsonb_build_object('ok',true,'replayed',true,'event_digest',encode(extensions.digest(v_existing.id::text,'sha256'),'hex')); end if;
  if p_validation_mode then
    select * into v_auth from runtime_auth.activation_authorizations where principal_id=v_principal.id and source_id=v_source.id
      and state='active' and trigger_id=p_trigger_id and channel_id=p_channel_id and fence_epoch=v_principal.fence_epoch
      and issued_at<=v_now and expires_at>v_now for update;
    if not found or v_auth.consumed_events>=v_auth.max_events then
      return jsonb_build_object('ok',false,'code','activation_authorization_denied');
    end if;
    update runtime_auth.activation_authorizations set consumed_events=consumed_events+1,state='consumed',consumed_at=v_now where id=v_auth.id;
  end if;
  begin
    insert into runtime_auth.inbound_events(principal_id,source_id,provider_event_id,delivery_digest,message_digest,payload_digest,
      channel_digest,thread_digest,encryption_algorithm,encryption_key_version,nonce,auth_tag,ciphertext,occurred_at)
    values(v_principal.id,v_source.id,p_provider_event_id,p_delivery_digest,p_message_digest,p_payload_digest,
      p_channel_digest,p_thread_digest,
      p_encryption_algorithm,p_encryption_key_version,p_nonce,p_auth_tag,p_ciphertext,p_occurred_at) returning * into v_event;
  exception when unique_violation then
    select * into v_event from runtime_auth.inbound_events where delivery_digest=p_delivery_digest or message_digest=p_message_digest order by received_at limit 1;
    return jsonb_build_object('ok',true,'replayed',true,'event_digest',encode(extensions.digest(v_event.id::text,'sha256'),'hex'));
  end;
  perform runtime_auth.append_event_receipt(p_trace_id,'event_ingested',v_principal.id,v_event.id,null,null,null,
    v_principal.fence_epoch,null,'slack.receive.christopher','accepted','ciphertext_stored',p_build_version);
  return jsonb_build_object('ok',true,'replayed',false,'event_digest',encode(extensions.digest(v_event.id::text,'sha256'),'hex'));
end $$;

create or replace function public.pec78_claim_composio_slack_event(
  p_credential_id uuid,p_runtime_instance_id uuid,p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth,extensions as $$
declare v_credential runtime_auth.credentials%rowtype; v_principal runtime_auth.principals%rowtype;
  v_event runtime_auth.inbound_events%rowtype; v_lease runtime_auth.event_leases%rowtype; v_now timestamptz:=clock_timestamp();
begin
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found or v_credential.state<>'active' or v_credential.runtime_instance_id<>p_runtime_instance_id or
     coalesce(v_credential.not_before,'-infinity')>v_now or coalesce(v_credential.expires_at,'infinity')<=v_now then
    return jsonb_build_object('ok',false,'code','credential_denied'); end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if v_principal.state<>'active' or not exists(select 1 from runtime_auth.capability_grants g where g.principal_id=v_principal.id
     and g.capability='slack.receive.christopher' and g.state='active' and coalesce(g.valid_from,'-infinity')<=v_now and coalesce(g.valid_until,'infinity')>v_now)
     or not exists(select 1 from runtime_auth.production_gates g where g.principal_id=v_principal.id and g.credential_id=v_credential.id
       and g.state='active' and g.issued_at<=v_now and g.expires_at>v_now)
     or not exists(select 1 from runtime_auth.ingress_sources s where s.principal_id=v_principal.id and s.mode in ('validation','enabled') and coalesce(s.valid_until,'infinity')>v_now)
     or exists(select 1 from runtime_auth.kill_switches k where k.active and (k.scope='global' or
       (k.scope='principal' and k.target=v_principal.id::text) or (k.scope='credential' and k.target=v_credential.id::text) or
       (k.scope='capability' and k.target='slack.receive.christopher'))) then
    return jsonb_build_object('ok',false,'code','authority_denied'); end if;
  update runtime_auth.event_leases l set state='expired',completed_at=v_now where l.state='active' and l.expires_at<=v_now
    and not exists(select 1 from runtime_auth.slack_effects e where e.event_id=l.event_id and e.state in ('reserved','executing','failed_unknown'));
  update runtime_auth.inbound_events e set state=case when e.attempt_count<2 then 'received' else 'quarantined' end,
    terminal_code=case when e.attempt_count<2 then null else 'attempt_limit' end
    where e.state='leased' and not exists(select 1 from runtime_auth.event_leases l where l.event_id=e.id and l.state='active');
  select * into v_event from runtime_auth.inbound_events e where e.principal_id=v_principal.id and e.state='received'
    and e.attempt_count<2 and e.received_at>v_now-interval '15 minutes' order by e.received_at,e.id for update skip locked limit 1;
  if not found then return jsonb_build_object('ok',true,'empty',true); end if;
  update runtime_auth.inbound_events set state='leased',attempt_count=attempt_count+1,lease_epoch=lease_epoch+1 where id=v_event.id returning * into v_event;
  insert into runtime_auth.event_leases(event_id,credential_id,runtime_instance_id,runtime_owner_id,fence_epoch,lease_epoch,state,expires_at)
  values(v_event.id,v_credential.id,p_runtime_instance_id,'runtime:maya-chen',v_principal.fence_epoch,v_event.lease_epoch,'active',v_now+interval '3 minutes') returning * into v_lease;
  perform runtime_auth.append_event_receipt(p_trace_id,'event_claimed',v_principal.id,v_event.id,v_lease.id,null,v_credential.id,
    v_principal.fence_epoch,v_lease.lease_epoch,'slack.receive.christopher','leased','lease_180_seconds',p_build_version);
  return jsonb_build_object('ok',true,'empty',false,'event_id',v_event.id,'lease_id',v_lease.id,'lease_epoch',v_lease.lease_epoch,
    'provider_event_id',v_event.provider_event_id,'payload_digest',v_event.payload_digest,'channel_digest',v_event.channel_digest,
    'thread_digest',v_event.thread_digest,'encryption_algorithm',v_event.encryption_algorithm,
    'encryption_key_version',v_event.encryption_key_version,'nonce',v_event.nonce,'auth_tag',v_event.auth_tag,'ciphertext',v_event.ciphertext,
    'lease_expires_at',v_lease.expires_at);
end $$;

create or replace function public.pec78_reserve_composio_slack_effect(
  p_credential_id uuid,p_runtime_instance_id uuid,p_event_id uuid,p_lease_id uuid,p_lease_epoch bigint,
  p_channel_digest text,p_thread_digest text,p_payload_digest text,p_model_route_id text,p_idempotency_key text,
  p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth,extensions as $$
declare v_credential runtime_auth.credentials%rowtype; v_principal runtime_auth.principals%rowtype;
  v_event runtime_auth.inbound_events%rowtype; v_lease runtime_auth.event_leases%rowtype; v_source runtime_auth.ingress_sources%rowtype;
  v_grant runtime_auth.capability_grants%rowtype; v_dest runtime_auth.destination_grants%rowtype; v_effect runtime_auth.slack_effects%rowtype;
  v_budget runtime_auth.activation_budgets%rowtype; v_now timestamptz:=clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('pec78_maya_runtime_transition',0));
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found then return jsonb_build_object('ok',false,'code','credential_denied'); end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if not found then return jsonb_build_object('ok',false,'code','principal_denied'); end if;
  select * into v_event from runtime_auth.inbound_events where id=p_event_id for update;
  if not found then return jsonb_build_object('ok',false,'code','event_not_found'); end if;
  select * into v_lease from runtime_auth.event_leases where id=p_lease_id and event_id=p_event_id for update;
  if not found then return jsonb_build_object('ok',false,'code','lease_not_found'); end if;
  if v_credential.state<>'active' or v_credential.runtime_instance_id<>p_runtime_instance_id or v_principal.state<>'active' or
     v_event.state<>'leased' or v_lease.state<>'active' or v_lease.expires_at<=v_now or v_lease.credential_id<>v_credential.id or
     v_lease.runtime_instance_id<>p_runtime_instance_id or v_lease.fence_epoch<>v_principal.fence_epoch or v_lease.lease_epoch<>p_lease_epoch or
     v_event.lease_epoch<>p_lease_epoch or v_event.channel_digest<>p_channel_digest or v_event.thread_digest<>p_thread_digest then
    return jsonb_build_object('ok',false,'code','lease_or_binding_denied'); end if;
  if not exists(select 1 from runtime_auth.production_gates g where g.principal_id=v_principal.id and g.credential_id=v_credential.id and g.state='active' and g.issued_at<=v_now and g.expires_at>v_now)
     or exists(select 1 from runtime_auth.kill_switches k where k.active and (k.scope='global' or (k.scope='principal' and k.target=v_principal.id::text) or
       (k.scope='credential' and k.target=v_credential.id::text) or (k.scope='capability' and k.target='slack.send.christopher'))) then
    return jsonb_build_object('ok',false,'code','authority_denied'); end if;
  select * into v_source from runtime_auth.ingress_sources where id=v_event.source_id and mode in ('validation','enabled') for update;
  if not found then return jsonb_build_object('ok',false,'code','source_denied'); end if;
  select * into v_grant from runtime_auth.capability_grants where principal_id=v_principal.id and capability='slack.send.christopher'
    and state='active' and coalesce(valid_from,'-infinity')<=v_now and coalesce(valid_until,'infinity')>v_now for update;
  if not found then return jsonb_build_object('ok',false,'code','capability_denied'); end if;
  select * into v_dest from runtime_auth.destination_grants where capability_grant_id=v_grant.id and provider='slack'
    and destination_ref=v_source.slack_channel_id and state='active' and coalesce(valid_until,'infinity')>v_now for update;
  if not found then return jsonb_build_object('ok',false,'code','destination_denied'); end if;
  select * into v_budget from runtime_auth.activation_budgets where id='pec78-maya-shadow-2026-07-26' and principal_id=v_principal.id
    and state='active' and expires_at>v_now and model_route_id=p_model_route_id for update;
  if not found or v_budget.slack_reserved>=v_budget.slack_limit then return jsonb_build_object('ok',false,'code','budget_denied'); end if;
  select * into v_effect from runtime_auth.slack_effects where event_id=v_event.id for update;
  if found then
    if v_effect.payload_digest<>p_payload_digest or v_effect.effect_idempotency_key<>p_idempotency_key then return jsonb_build_object('ok',false,'code','idempotency_conflict'); end if;
    return jsonb_build_object('ok',true,'replayed',true,'effect_id',v_effect.id,'state',v_effect.state);
  end if;
  insert into runtime_auth.slack_effects(event_id,lease_id,principal_id,credential_id,runtime_instance_id,fence_epoch,lease_epoch,
    capability,destination_grant_id,channel_digest,thread_digest,payload_digest,model_route_id,effect_idempotency_key,state,expires_at)
  values(v_event.id,v_lease.id,v_principal.id,v_credential.id,p_runtime_instance_id,v_principal.fence_epoch,p_lease_epoch,
    'slack.send.christopher',v_dest.id,p_channel_digest,p_thread_digest,p_payload_digest,p_model_route_id,p_idempotency_key,'reserved',v_now+interval '2 minutes') returning * into v_effect;
  update runtime_auth.activation_budgets set slack_reserved=slack_reserved+1 where id=v_budget.id;
  perform runtime_auth.append_event_receipt(p_trace_id,'effect_reserved',v_principal.id,v_event.id,v_lease.id,v_effect.id,v_credential.id,
    v_principal.fence_epoch,p_lease_epoch,'slack.send.christopher','reserved','provider_io_not_started',p_build_version);
  return jsonb_build_object('ok',true,'replayed',false,'effect_id',v_effect.id,'state','reserved','expires_at',v_effect.expires_at);
end $$;

create or replace function public.pec78_mark_composio_slack_effect_executing(
  p_credential_id uuid,p_runtime_instance_id uuid,p_effect_id uuid,p_lease_id uuid,p_lease_epoch bigint,p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth as $$
declare v_effect runtime_auth.slack_effects%rowtype; v_lease runtime_auth.event_leases%rowtype; v_credential runtime_auth.credentials%rowtype; v_principal runtime_auth.principals%rowtype;
begin
  select * into v_effect from runtime_auth.slack_effects where id=p_effect_id for update;
  if not found then return jsonb_build_object('ok',false,'code','effect_not_found'); end if;
  select * into v_lease from runtime_auth.event_leases where id=p_lease_id for update;
  if not found then return jsonb_build_object('ok',false,'code','lease_not_found'); end if;
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found then return jsonb_build_object('ok',false,'code','credential_denied'); end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if not found then return jsonb_build_object('ok',false,'code','principal_denied'); end if;
  if v_effect.state='executing' then return jsonb_build_object('ok',true,'replayed',true); end if;
  if v_effect.state<>'reserved' or v_effect.lease_id<>v_lease.id or v_effect.credential_id<>v_credential.id or
     v_effect.runtime_instance_id<>p_runtime_instance_id or v_effect.lease_epoch<>p_lease_epoch or v_effect.fence_epoch<>v_principal.fence_epoch or
     v_lease.state<>'active' or v_lease.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'code','effect_execution_denied'); end if;
  update runtime_auth.slack_effects set state='executing',executing_at=clock_timestamp() where id=v_effect.id;
  perform runtime_auth.append_event_receipt(p_trace_id,'effect_executing',v_principal.id,v_effect.event_id,v_lease.id,v_effect.id,v_credential.id,
    v_principal.fence_epoch,p_lease_epoch,'slack.send.christopher','executing','provider_io_authorized',p_build_version);
  return jsonb_build_object('ok',true,'replayed',false);
end $$;

create or replace function public.pec78_reconcile_composio_slack_effect(
  p_credential_id uuid,p_runtime_instance_id uuid,p_effect_id uuid,p_lease_id uuid,p_lease_epoch bigint,
  p_outcome text,p_provider_message_id text,p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth as $$
declare v_effect runtime_auth.slack_effects%rowtype; v_lease runtime_auth.event_leases%rowtype; v_credential runtime_auth.credentials%rowtype; v_principal runtime_auth.principals%rowtype; v_state text;
begin
  select * into v_effect from runtime_auth.slack_effects where id=p_effect_id for update;
  if not found then return jsonb_build_object('ok',false,'code','effect_not_found'); end if;
  select * into v_lease from runtime_auth.event_leases where id=p_lease_id for update;
  if not found then return jsonb_build_object('ok',false,'code','lease_not_found'); end if;
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found then return jsonb_build_object('ok',false,'code','credential_denied'); end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if not found then return jsonb_build_object('ok',false,'code','principal_denied'); end if;
  if v_effect.state in ('succeeded','failed_unknown','failed_final') then return jsonb_build_object('ok',true,'replayed',true,'state',v_effect.state); end if;
  if v_effect.state<>'executing' or v_effect.lease_id<>v_lease.id or v_effect.credential_id<>v_credential.id or
     v_effect.runtime_instance_id<>p_runtime_instance_id or v_effect.lease_epoch<>p_lease_epoch or v_effect.fence_epoch<>v_principal.fence_epoch then
    return jsonb_build_object('ok',false,'code','effect_reconcile_denied'); end if;
  if p_outcome='succeeded' and p_provider_message_id ~ '^\d{10}\.\d{6}$' then v_state:='succeeded';
  elsif p_outcome='unknown' and p_provider_message_id is null then v_state:='failed_unknown';
  elsif p_outcome='failed' and p_provider_message_id is null then v_state:='failed_final';
  else return jsonb_build_object('ok',false,'code','provider_outcome_invalid'); end if;
  update runtime_auth.slack_effects set state=v_state,provider_message_id=p_provider_message_id,completed_at=clock_timestamp() where id=v_effect.id;
  perform runtime_auth.append_event_receipt(p_trace_id,'effect_reconciled',v_principal.id,v_effect.event_id,v_lease.id,v_effect.id,v_credential.id,
    v_principal.fence_epoch,p_lease_epoch,'slack.send.christopher',v_state,case when v_state='succeeded' then 'provider_id_recorded' else 'manual_reconciliation_required' end,p_build_version);
  return jsonb_build_object('ok',true,'replayed',false,'state',v_state);
end $$;

create or replace function public.pec78_complete_composio_slack_event(
  p_credential_id uuid,p_runtime_instance_id uuid,p_event_id uuid,p_lease_id uuid,p_lease_epoch bigint,
  p_outcome text,p_code text,p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth as $$
declare v_event runtime_auth.inbound_events%rowtype; v_lease runtime_auth.event_leases%rowtype; v_effect runtime_auth.slack_effects%rowtype;
  v_credential runtime_auth.credentials%rowtype; v_principal runtime_auth.principals%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('pec78_maya_runtime_transition',0));
  select * into v_event from runtime_auth.inbound_events where id=p_event_id for update;
  if not found then return jsonb_build_object('ok',false,'code','event_not_found'); end if;
  select * into v_lease from runtime_auth.event_leases where id=p_lease_id and event_id=p_event_id for update;
  if not found then return jsonb_build_object('ok',false,'code','lease_not_found'); end if;
  select * into v_effect from runtime_auth.slack_effects where event_id=p_event_id for update;
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found then return jsonb_build_object('ok',false,'code','credential_denied'); end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if not found then return jsonb_build_object('ok',false,'code','principal_denied'); end if;
  if v_event.state in ('completed','quarantined') then return jsonb_build_object('ok',true,'replayed',true,'state',v_event.state); end if;
  if v_event.state<>'leased' or v_lease.state<>'active' or v_lease.credential_id<>v_credential.id or
     v_lease.runtime_instance_id<>p_runtime_instance_id or v_lease.lease_epoch<>p_lease_epoch or v_lease.fence_epoch<>v_principal.fence_epoch then
    return jsonb_build_object('ok',false,'code','event_complete_denied'); end if;
  if p_outcome='completed' and v_effect.state='succeeded' then
    update runtime_auth.inbound_events set state='completed',completed_at=clock_timestamp(),terminal_code=p_code where id=v_event.id;
  elsif p_outcome='quarantined' and (v_effect.id is null or v_effect.state in ('failed_unknown','failed_final','quarantined')) then
    update runtime_auth.inbound_events set state='quarantined',completed_at=clock_timestamp(),terminal_code=p_code where id=v_event.id;
  else return jsonb_build_object('ok',false,'code','event_outcome_denied'); end if;
  update runtime_auth.event_leases set state=case when p_outcome='completed' then 'completed' else 'failed' end,completed_at=clock_timestamp() where id=v_lease.id;
  perform runtime_auth.append_event_receipt(p_trace_id,'event_completed',v_principal.id,v_event.id,v_lease.id,v_effect.id,v_credential.id,
    v_principal.fence_epoch,p_lease_epoch,'slack.receive.christopher',p_outcome,p_code,p_build_version);
  return jsonb_build_object('ok',true,'replayed',false,'state',p_outcome);
end $$;

create or replace function public.pec78_composio_production_readiness() returns jsonb language sql security definer
set search_path=pg_catalog,runtime_auth as $$
select jsonb_build_object(
  'ok',true,
  'principal_active',exists(select 1 from runtime_auth.principals where persona_id='maya-chen' and state='active'),
  'source_bound',exists(select 1 from runtime_auth.ingress_sources where id='maya-composio-slack-v1' and trigger_id<>'unbound' and connected_account_id<>'unbound'),
  'source_active',exists(select 1 from runtime_auth.ingress_sources where id='maya-composio-slack-v1' and mode in ('validation','enabled') and coalesce(valid_until,'infinity')>clock_timestamp()),
  'receive_capability_active',exists(select 1 from runtime_auth.capability_grants where capability='slack.receive.christopher' and state='active'),
  'send_capability_active',exists(select 1 from runtime_auth.capability_grants where capability='slack.send.christopher' and state='active'),
  'validation_authorization_active',exists(select 1 from runtime_auth.activation_authorizations where state='active' and expires_at>clock_timestamp()),
  'active_event_leases',(select count(*) from runtime_auth.event_leases where state='active' and expires_at>clock_timestamp()),
  'unknown_effects',(select count(*) from runtime_auth.slack_effects where state='failed_unknown'),
  'pending_events',(select count(*) from runtime_auth.inbound_events where state in ('received','leased'))
) $$;

revoke all on function runtime_auth.append_event_receipt(uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.pec78_ingest_composio_slack_event(text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text,text,text,text,text,boolean,uuid,text) from public,anon,authenticated;
revoke all on function public.pec78_claim_composio_slack_event(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.pec78_reserve_composio_slack_effect(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.pec78_mark_composio_slack_effect_executing(uuid,uuid,uuid,uuid,bigint,uuid,text) from public,anon,authenticated;
revoke all on function public.pec78_reconcile_composio_slack_effect(uuid,uuid,uuid,uuid,bigint,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.pec78_complete_composio_slack_event(uuid,uuid,uuid,uuid,bigint,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.pec78_composio_production_readiness() from public,anon,authenticated;
grant execute on function public.pec78_ingest_composio_slack_event(text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text,text,text,text,text,boolean,uuid,text) to service_role;
grant execute on function public.pec78_claim_composio_slack_event(uuid,uuid,uuid,text) to service_role;
grant execute on function public.pec78_reserve_composio_slack_effect(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,uuid,text) to service_role;
grant execute on function public.pec78_mark_composio_slack_effect_executing(uuid,uuid,uuid,uuid,bigint,uuid,text) to service_role;
grant execute on function public.pec78_reconcile_composio_slack_effect(uuid,uuid,uuid,uuid,bigint,text,text,uuid,text) to service_role;
grant execute on function public.pec78_complete_composio_slack_event(uuid,uuid,uuid,uuid,bigint,text,text,uuid,text) to service_role;
grant execute on function public.pec78_composio_production_readiness() to service_role;

commit;
