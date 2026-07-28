-- PEC-78 Maya-only synthetic shadow boundary. This migration installs atomic
-- authorization/effect primitives but deliberately activates no credential,
-- grant, destination, gate, schedule, or provider.
begin;

alter table runtime_auth.credentials
  add constraint pec78_credential_time_order check (expires_at is null or not_before is null or expires_at > not_before),
  add constraint pec78_provider_refs_are_refs check (
    jsonb_typeof(provider_refs) = 'object'
    and not (provider_refs ?| array['token','secret','password','api_key','access_token','refresh_token'])
  );
alter table runtime_auth.capability_grants
  add constraint pec78_capability_time_order check (valid_until is null or valid_from is null or valid_until > valid_from);
alter table runtime_auth.production_gates
  add constraint pec78_gate_time_order check (expires_at > issued_at);

alter table runtime_auth.effects
  add column credential_id uuid references runtime_auth.credentials(id) on delete restrict,
  add column runtime_instance_id uuid,
  add column fence_epoch bigint not null default 0 check (fence_epoch >= 0),
  add column provider_account_digest text,
  add column reserved_at timestamptz,
  add column completed_at timestamptz;

create unique index pec78_one_active_gate
  on runtime_auth.production_gates(principal_id)
  where state = 'active';
create unique index pec78_one_active_destination
  on runtime_auth.destination_grants(capability_grant_id, provider, destination_digest)
  where state = 'active';

create table runtime_auth.activation_budgets (
  id text primary key check (id = 'pec78-maya-shadow-2026-07-26'),
  principal_id uuid not null references runtime_auth.principals(id) on delete restrict,
  slack_limit integer not null check (slack_limit = 1),
  email_limit integer not null check (email_limit = 1),
  slack_reserved integer not null default 0 check (slack_reserved between 0 and 1),
  email_reserved integer not null default 0 check (email_reserved between 0 and 1),
  model_route_id text not null,
  max_input_tokens integer not null check (max_input_tokens between 1 and 4000),
  max_output_tokens integer not null check (max_output_tokens between 1 and 2000),
  max_tool_steps integer not null check (max_tool_steps between 1 and 20),
  max_runtime_seconds integer not null check (max_runtime_seconds between 1 and 300),
  max_gate_cost_usd numeric(8,4) not null check (max_gate_cost_usd > 0 and max_gate_cost_usd <= 1),
  spent_usd numeric(8,4) not null default 0 check (spent_usd >= 0),
  state text not null default 'disabled' check (state in ('disabled','active','exhausted','revoked')),
  expires_at timestamptz not null
);
create table runtime_auth.token_issue_claims (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references runtime_auth.credentials(id) on delete restrict,
  proof_jti_hash text not null unique,
  capability text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table runtime_auth.activation_budgets enable row level security;
alter table runtime_auth.activation_budgets force row level security;
revoke all on table runtime_auth.activation_budgets from public, anon, authenticated;
alter table runtime_auth.token_issue_claims enable row level security;
alter table runtime_auth.token_issue_claims force row level security;
revoke all on table runtime_auth.token_issue_claims from public, anon, authenticated;

create or replace function public.pec78_authorize_token(
  p_credential_id uuid, p_runtime_instance_id uuid, p_capability text,
  p_proof_jti_hash text, p_expires_at timestamptz
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, runtime_auth, public as $$
declare v_credential runtime_auth.credentials%rowtype; v_principal runtime_auth.principals%rowtype; v_now timestamptz:=clock_timestamp();
begin
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found or v_credential.state<>'active' or v_credential.runtime_instance_id<>p_runtime_instance_id
    or coalesce(v_credential.not_before,'-infinity')>v_now or coalesce(v_credential.expires_at,'infinity')<=v_now
    then return jsonb_build_object('ok',false,'code','credential_denied'); end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if v_principal.state<>'active' or not exists(select 1 from runtime_auth.capability_grants g where g.principal_id=v_principal.id
    and g.capability=p_capability and g.state='active' and coalesce(g.valid_from,'-infinity')<=v_now and coalesce(g.valid_until,'infinity')>v_now)
    or not exists(select 1 from runtime_auth.production_gates g where g.principal_id=v_principal.id and g.credential_id=v_credential.id
      and g.state='active' and g.issued_at<=v_now and g.expires_at>v_now)
    or exists(select 1 from runtime_auth.kill_switches k where k.active and (k.scope='global' or
      (k.scope='principal' and k.target=v_principal.id::text) or (k.scope='credential' and k.target=v_credential.id::text) or
      (k.scope='capability' and k.target=p_capability)))
    then return jsonb_build_object('ok',false,'code','authority_denied'); end if;
  begin
    insert into runtime_auth.token_issue_claims(credential_id,proof_jti_hash,capability,expires_at)
    values(v_credential.id,p_proof_jti_hash,p_capability,p_expires_at);
  exception when unique_violation then return jsonb_build_object('ok',false,'code','replay_denied'); end;
  return jsonb_build_object('ok',true,'fence_epoch',v_principal.fence_epoch);
end $$;

create or replace function runtime_auth.append_receipt(
  p_trace_id uuid, p_event_type text, p_principal_id uuid, p_credential_id uuid,
  p_capability text, p_destination_digest text, p_request_digest text,
  p_intent_digest text, p_idempotency_digest text, p_result text, p_code text,
  p_build_version text
) returns uuid language plpgsql security definer
set search_path = pg_catalog, runtime_auth as $$
declare v_id uuid := gen_random_uuid(); v_previous text; v_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended('pec78_receipt_chain',0));
  select receipt_hash into v_previous from runtime_auth.receipts order by created_at desc, id desc limit 1 for update;
  v_hash := encode(digest(concat_ws('|', v_previous, v_id::text, p_trace_id::text, p_event_type,
    p_principal_id::text, p_credential_id::text, p_capability, p_destination_digest,
    p_request_digest, p_intent_digest, p_idempotency_digest, p_result, p_code), 'sha256'), 'hex');
  insert into runtime_auth.receipts(id,trace_id,contract_version,registry_version,build_version,event_type,
    principal_id,credential_id,capability,destination_digest,request_digest,intent_digest,idempotency_digest,
    result,code,previous_receipt_hash,receipt_hash)
  select v_id,p_trace_id,p.contract_version,p.registry_version,p_build_version,p_event_type,
    p_principal_id,p_credential_id,p_capability,p_destination_digest,p_request_digest,p_intent_digest,
    p_idempotency_digest,p_result,p_code,v_previous,v_hash
  from runtime_auth.principals p where p.id=p_principal_id;
  return v_id;
end $$;

create or replace function public.pec78_authorize_request(
  p_credential_id uuid, p_runtime_instance_id uuid, p_capability text,
  p_access_jti_hash text, p_proof_jti_hash text, p_replay_expires_at timestamptz,
  p_route_id text, p_idempotency_key text, p_request_digest text,
  p_destination_ref text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, runtime_auth, public as $$
declare v_credential runtime_auth.credentials%rowtype; v_principal runtime_auth.principals%rowtype;
  v_grant runtime_auth.capability_grants%rowtype; v_destination runtime_auth.destination_grants%rowtype;
  v_existing runtime_auth.request_claims%rowtype; v_now timestamptz := clock_timestamp();
begin
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found or v_credential.state <> 'active' or v_credential.runtime_instance_id <> p_runtime_instance_id
     or coalesce(v_credential.not_before,'-infinity') > v_now or coalesce(v_credential.expires_at,'infinity') <= v_now then
    return jsonb_build_object('ok',false,'code','credential_denied');
  end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if v_principal.state <> 'active' or exists(select 1 from runtime_auth.kill_switches k where k.active and
     ((k.scope='global') or (k.scope='contract' and k.target=v_principal.contract_version) or
      (k.scope='principal' and k.target=v_principal.id::text) or (k.scope='credential' and k.target=v_credential.id::text) or
      (k.scope='capability' and k.target=p_capability))) then
    return jsonb_build_object('ok',false,'code','authority_denied');
  end if;
  if not exists(select 1 from runtime_auth.production_gates g where g.principal_id=v_principal.id and g.credential_id=v_credential.id
      and g.state='active' and g.issued_at<=v_now and g.expires_at>v_now) then
    return jsonb_build_object('ok',false,'code','production_gate_denied');
  end if;
  select * into v_grant from runtime_auth.capability_grants where principal_id=v_principal.id and capability=p_capability
    and state='active' and coalesce(valid_from,'-infinity')<=v_now and coalesce(valid_until,'infinity')>v_now for update;
  if not found then return jsonb_build_object('ok',false,'code','capability_denied'); end if;
  if p_capability in ('slack.send.christopher','email.send.admin') then
    select * into v_destination from runtime_auth.destination_grants where capability_grant_id=v_grant.id and state='active'
      and destination_ref=case p_capability when 'slack.send.christopher' then 'D0B8B2NHP39' else 'admin@cc.proexteriorsus.net' end
      and p_destination_ref=case p_capability when 'slack.send.christopher' then 'D0B8B2NHP39' else 'admin@cc.proexteriorsus.net' end
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
    if v_existing.request_digest <> p_request_digest then return jsonb_build_object('ok',false,'code','idempotency_conflict'); end if;
    return jsonb_build_object('ok',true,'replayed',true,'response_status',v_existing.response_status,'response_body',v_existing.response_body);
  end if;
  insert into runtime_auth.request_claims(credential_id,route_id,idempotency_key,request_digest)
  values(v_credential.id,p_route_id,p_idempotency_key,p_request_digest);
  return jsonb_build_object('ok',true,'replayed',false,'principal_id',v_principal.id,'credential_row_id',v_credential.id,
    'fence_epoch',v_principal.fence_epoch,'destination_grant_id',v_destination.id,'destination_digest',v_destination.destination_digest,
    'provider',v_destination.provider,'provider_account_digest',v_destination.account_digest);
end $$;

create or replace function public.pec78_reserve_shadow_effect(
  p_credential_id uuid, p_runtime_instance_id uuid, p_capability text, p_idempotency_key text,
  p_request_digest text, p_intent_digest text, p_payload_digest text, p_destination_ref text,
  p_model_route_id text, p_trace_id uuid, p_build_version text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, runtime_auth, public as $$
declare v_principal runtime_auth.principals%rowtype; v_credential runtime_auth.credentials%rowtype;
  v_grant runtime_auth.capability_grants%rowtype; v_dest runtime_auth.destination_grants%rowtype;
  v_budget runtime_auth.activation_budgets%rowtype; v_occ uuid; v_work uuid; v_effect runtime_auth.effects%rowtype;
begin
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id and state='active' for update;
  if not found or v_credential.runtime_instance_id<>p_runtime_instance_id then return jsonb_build_object('ok',false,'code','credential_denied'); end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id and state='active' for update;
  if not found or coalesce(v_credential.not_before,'-infinity')>clock_timestamp() or coalesce(v_credential.expires_at,'infinity')<=clock_timestamp()
    or not exists(select 1 from runtime_auth.production_gates g where g.principal_id=v_principal.id and g.credential_id=v_credential.id and g.state='active' and g.issued_at<=clock_timestamp() and g.expires_at>clock_timestamp())
    or exists(select 1 from runtime_auth.kill_switches k where k.active and (k.scope='global' or (k.scope='principal' and k.target=v_principal.id::text) or (k.scope='credential' and k.target=v_credential.id::text) or (k.scope='capability' and k.target=p_capability)))
    then return jsonb_build_object('ok',false,'code','authority_denied'); end if;
  select * into v_grant from runtime_auth.capability_grants where principal_id=v_principal.id and capability=p_capability and state='active'
    and coalesce(valid_from,'-infinity')<=clock_timestamp() and coalesce(valid_until,'infinity')>clock_timestamp() for update;
  select * into v_dest from runtime_auth.destination_grants where capability_grant_id=v_grant.id and state='active'
    and destination_ref=case p_capability when 'slack.send.christopher' then 'D0B8B2NHP39' when 'email.send.admin' then 'admin@cc.proexteriorsus.net' else '__denied__' end
    and p_destination_ref=case p_capability when 'slack.send.christopher' then 'D0B8B2NHP39' when 'email.send.admin' then 'admin@cc.proexteriorsus.net' else '__denied__' end
    and coalesce(valid_until,'infinity')>clock_timestamp() for update;
  if not found or exists(select 1 from runtime_auth.kill_switches k where k.active and k.scope='destination' and k.target=v_dest.id::text)
    then return jsonb_build_object('ok',false,'code','destination_denied'); end if;
  select * into v_budget from runtime_auth.activation_budgets where id='pec78-maya-shadow-2026-07-26' and principal_id=v_principal.id and state='active' and expires_at>clock_timestamp() for update;
  if not found or v_budget.model_route_id<>p_model_route_id then return jsonb_build_object('ok',false,'code','budget_denied'); end if;
  if (p_capability='slack.send.christopher' and v_budget.slack_reserved>=v_budget.slack_limit) or
     (p_capability='email.send.admin' and v_budget.email_reserved>=v_budget.email_limit) then
    return jsonb_build_object('ok',false,'code','effect_budget_exhausted');
  end if;
  select * into v_effect from runtime_auth.effects where principal_id=v_principal.id and capability=p_capability and effect_idempotency_key=p_idempotency_key for update;
  if found then
    if v_effect.payload_digest<>p_payload_digest or v_effect.destination_grant_id<>v_dest.id then return jsonb_build_object('ok',false,'code','idempotency_conflict'); end if;
    return jsonb_build_object('ok',true,'replayed',true,'effect_id',v_effect.id,'state',v_effect.state,'destination_ref',p_destination_ref);
  end if;
  insert into runtime_auth.occurrences(contract_version,principal_id,schedule_id,scheduled_for,state)
  values(v_principal.contract_version,v_principal.id,'maya-mailbox-30m-v1',date_trunc('hour',clock_timestamp()),'leased')
  on conflict(contract_version,principal_id,schedule_id,scheduled_for) do update set state=runtime_auth.occurrences.state
  returning id into v_occ;
  insert into runtime_auth.work_items(occurrence_id,persona_id,source_kind,provider_message_id,evidence_digest,classification,model_route_id,state)
  values(v_occ,'maya-chen','gmail','synthetic:'||p_idempotency_key,p_request_digest,'pec78-shadow-synthetic',p_model_route_id,'proposed') returning id into v_work;
  insert into runtime_auth.effects(work_id,occurrence_id,principal_id,credential_id,runtime_instance_id,fence_epoch,capability,destination_grant_id,
    intent_digest,payload_digest,model_route_id,effect_idempotency_key,state,provider_account_digest,expires_at,reserved_at)
  values(v_work,v_occ,v_principal.id,v_credential.id,p_runtime_instance_id,v_principal.fence_epoch,p_capability,v_dest.id,
    p_intent_digest,p_payload_digest,p_model_route_id,p_idempotency_key,'reserved',v_dest.account_digest,clock_timestamp()+interval '5 minutes',clock_timestamp()) returning * into v_effect;
  if p_capability='slack.send.christopher' then update runtime_auth.activation_budgets set slack_reserved=slack_reserved+1 where id=v_budget.id;
  else update runtime_auth.activation_budgets set email_reserved=email_reserved+1 where id=v_budget.id; end if;
  perform runtime_auth.append_receipt(p_trace_id,'effect_reserved',v_principal.id,v_credential.id,p_capability,v_dest.destination_digest,
    p_request_digest,p_intent_digest,encode(digest(p_idempotency_key,'sha256'),'hex'),'reserved','provider_io_authorized',p_build_version);
  return jsonb_build_object('ok',true,'replayed',false,'effect_id',v_effect.id,'state','reserved','destination_ref',p_destination_ref,
    'expires_at',v_effect.expires_at,'fence_epoch',v_principal.fence_epoch,'provider',v_dest.provider);
end $$;

create or replace function public.pec78_reconcile_shadow_effect(
  p_effect_id uuid, p_provider_message_id text, p_outcome text, p_trace_id uuid, p_build_version text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, runtime_auth, public as $$
declare v_effect runtime_auth.effects%rowtype; v_principal runtime_auth.principals%rowtype; v_code text;
begin
  select * into v_effect from runtime_auth.effects where id=p_effect_id for update;
  if not found then return jsonb_build_object('ok',false,'code','effect_not_found'); end if;
  if v_effect.state in ('succeeded','failed_unknown','failed_final','reconciled_succeeded') then
    return jsonb_build_object('ok',true,'replayed',true,'state',v_effect.state);
  end if;
  select * into v_principal from runtime_auth.principals where id=v_effect.principal_id for update;
  if v_effect.fence_epoch<>v_principal.fence_epoch then return jsonb_build_object('ok',false,'code','stale_fence'); end if;
  if p_outcome='succeeded' and coalesce(p_provider_message_id,'')<>'' then v_code:='succeeded';
  elsif p_outcome='unknown' then v_code:='failed_unknown';
  else v_code:='failed_final'; end if;
  update runtime_auth.effects set state=v_code,provider_message_id=p_provider_message_id,completed_at=clock_timestamp() where id=v_effect.id;
  perform runtime_auth.append_receipt(p_trace_id,'effect_reconciled',v_effect.principal_id,v_effect.credential_id,v_effect.capability,null,
    null,v_effect.intent_digest,encode(digest(v_effect.effect_idempotency_key,'sha256'),'hex'),v_code,
    case when v_code='succeeded' then 'provider_id_recorded' else 'provider_outcome_not_succeeded' end,p_build_version);
  return jsonb_build_object('ok',true,'replayed',false,'state',v_code);
end $$;

create or replace function public.pec78_rollback_shadow(p_reason text, p_actor_subject text, p_trace_id uuid, p_build_version text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,runtime_auth,public as $$
declare v_principal runtime_auth.principals%rowtype;
begin
  select * into v_principal from runtime_auth.principals where persona_id='maya-chen' for update;
  update runtime_auth.principals set state='disabled',fence_epoch=fence_epoch+1 where id=v_principal.id;
  update runtime_auth.credentials set state='revoked' where principal_id=v_principal.id and state<>'revoked';
  update runtime_auth.capability_grants set state='revoked' where principal_id=v_principal.id and state<>'revoked';
  update runtime_auth.destination_grants d set state='revoked' from runtime_auth.capability_grants g where d.capability_grant_id=g.id and g.principal_id=v_principal.id and d.state<>'revoked';
  update runtime_auth.production_gates set state='revoked' where principal_id=v_principal.id and state<>'revoked';
  update runtime_auth.activation_budgets set state='revoked' where principal_id=v_principal.id and state<>'revoked';
  update runtime_auth.schedules set state='disabled',fence_epoch=fence_epoch+1 where principal_id=v_principal.id;
  update runtime_auth.leases l set state='fenced' from runtime_auth.occurrences o where l.occurrence_id=o.id and o.principal_id=v_principal.id and l.state='active';
  update runtime_auth.effects set state='revoked' where principal_id=v_principal.id and state in ('proposed','awaiting_approval','approved','reserved','executing','retry_authorized');
  insert into runtime_auth.kill_switches(scope,target,reason,actor_subject) values('principal',v_principal.id::text,p_reason,p_actor_subject)
    on conflict do nothing;
  perform runtime_auth.append_receipt(p_trace_id,'shadow_rollback',v_principal.id,null,null,null,null,null,null,'revoked','atomic_rollback',p_build_version);
  return jsonb_build_object('ok',true,'state','disabled','fence_epoch',v_principal.fence_epoch+1);
end $$;

create or replace function public.pec78_shadow_readiness() returns jsonb language sql security definer
set search_path=pg_catalog,runtime_auth,public as $$
  select jsonb_build_object(
    'principal_active', (select count(*)=1 from runtime_auth.principals where persona_id='maya-chen' and state='active'),
    'credential_active', (select count(*)=1 from runtime_auth.credentials c join runtime_auth.principals p on p.id=c.principal_id where p.persona_id='maya-chen' and c.state='active' and coalesce(c.not_before,'-infinity')<=clock_timestamp() and coalesce(c.expires_at,'infinity')>clock_timestamp()),
    'capabilities_active', (select count(*)=5 from runtime_auth.capability_grants g join runtime_auth.principals p on p.id=g.principal_id where p.persona_id='maya-chen' and g.state='active'),
    'destinations_active', (select count(*)=2 from runtime_auth.destination_grants d join runtime_auth.capability_grants g on g.id=d.capability_grant_id join runtime_auth.principals p on p.id=g.principal_id where p.persona_id='maya-chen' and d.state='active'),
    'schedule_disabled', (select count(*)=1 from runtime_auth.schedules where id='maya-mailbox-30m-v1' and state='disabled'),
    'gate_active', (select count(*)=1 from runtime_auth.production_gates g join runtime_auth.principals p on p.id=g.principal_id where p.persona_id='maya-chen' and g.state='active' and g.issued_at<=clock_timestamp() and g.expires_at>clock_timestamp()),
    'budget_active', (select count(*)=1 from runtime_auth.activation_budgets where id='pec78-maya-shadow-2026-07-26' and state='active' and expires_at>clock_timestamp() and spent_usd<=max_gate_cost_usd),
    'no_kill_switch', (select count(*)=0 from runtime_auth.kill_switches where active),
    'no_active_lease', (select count(*)=0 from runtime_auth.leases where state='active'),
    'no_unreconciled_effect', (select count(*)=0 from runtime_auth.effects where state in ('reserved','executing','failed_unknown'))
  )
$$;

revoke all on function runtime_auth.append_receipt(uuid,text,uuid,uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.pec78_authorize_token(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.pec78_authorize_request(uuid,uuid,text,text,text,timestamptz,text,text,text,text) from public,anon,authenticated;
revoke all on function public.pec78_reserve_shadow_effect(uuid,uuid,text,text,text,text,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.pec78_reconcile_shadow_effect(uuid,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.pec78_rollback_shadow(text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.pec78_shadow_readiness() from public,anon,authenticated;
grant execute on function public.pec78_authorize_request(uuid,uuid,text,text,text,timestamptz,text,text,text,text) to service_role;
grant execute on function public.pec78_authorize_token(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.pec78_reserve_shadow_effect(uuid,uuid,text,text,text,text,text,text,text,uuid,text) to service_role;
grant execute on function public.pec78_reconcile_shadow_effect(uuid,text,text,uuid,text) to service_role;
grant execute on function public.pec78_rollback_shadow(text,text,uuid,text) to service_role;
grant execute on function public.pec78_shadow_readiness() to service_role;

commit;
