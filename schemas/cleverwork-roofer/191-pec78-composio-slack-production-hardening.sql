-- PEC-78 Composio production state-machine hardening. Additive forward fix for
-- migration 190; installs no active authority and performs no provider effect.
begin;

create unique index if not exists pec78_one_active_runtime_credential
  on runtime_auth.credentials(principal_id,runtime_instance_id)
  where state='active';

-- The v1 intake signature is permanently fenced. It cannot prove the exact
-- build, registry, runtime, credential, gate, and receive-grant tuple.
revoke all on function public.pec78_ingest_composio_slack_event(
  text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,
  text,text,text,text,text,boolean,uuid,text
) from public,anon,authenticated,service_role;

create or replace function public.pec78_ingest_composio_slack_event_v2(
  p_provider_event_id text,p_delivery_digest text,p_message_digest text,p_payload_digest text,
  p_channel_digest text,p_thread_digest text,p_trigger_id text,p_connected_account_id text,
  p_composio_user_id text,p_team_id text,p_channel_id text,p_owner_user_id text,
  p_occurred_at timestamptz,p_encryption_algorithm text,p_encryption_key_version text,
  p_nonce text,p_auth_tag text,p_ciphertext text,p_validation_mode boolean,
  p_runtime_instance_id uuid,p_registry_version text,p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth,extensions as $$
declare
  v_source runtime_auth.ingress_sources%rowtype;
  v_principal runtime_auth.principals%rowtype;
  v_credential runtime_auth.credentials%rowtype;
  v_receive runtime_auth.capability_grants%rowtype;
  v_gate runtime_auth.production_gates%rowtype;
  v_existing runtime_auth.inbound_events%rowtype;
  v_event runtime_auth.inbound_events%rowtype;
  v_auth runtime_auth.activation_authorizations%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('pec78_maya_runtime_transition',0));
  select * into v_source from runtime_auth.ingress_sources
    where id='maya-composio-slack-v1' for update;
  if not found or v_source.mode not in ('validation','enabled') or
     coalesce(v_source.valid_until,'infinity')<=v_now or
     v_source.trigger_id<>p_trigger_id or v_source.connected_account_id<>p_connected_account_id or
     v_source.composio_user_id<>p_composio_user_id or v_source.slack_team_id<>p_team_id or
     v_source.slack_channel_id<>p_channel_id or v_source.owner_user_id<>p_owner_user_id then
    return jsonb_build_object('ok',false,'code','ingress_source_denied');
  end if;
  if (p_validation_mode and v_source.mode<>'validation') or
     (not p_validation_mode and v_source.mode<>'enabled') then
    return jsonb_build_object('ok',false,'code','ingress_mode_denied');
  end if;
  if p_occurred_at<v_now-interval '5 minutes' or p_occurred_at>v_now+interval '1 minute' then
    return jsonb_build_object('ok',false,'code','event_freshness_denied');
  end if;

  select * into v_principal from runtime_auth.principals
    where id=v_source.principal_id for update;
  if not found or v_principal.state<>'active' or v_principal.registry_version<>p_registry_version then
    return jsonb_build_object('ok',false,'code','principal_or_registry_denied');
  end if;
  select * into v_credential from runtime_auth.credentials
    where principal_id=v_principal.id and runtime_instance_id=p_runtime_instance_id
      and state='active' and coalesce(not_before,'-infinity')<=v_now
      and coalesce(expires_at,'infinity')>v_now
    order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok',false,'code','credential_denied'); end if;
  select * into v_receive from runtime_auth.capability_grants
    where principal_id=v_principal.id and capability='slack.receive.christopher'
      and state='active' and coalesce(valid_from,'-infinity')<=v_now
      and coalesce(valid_until,'infinity')>v_now for update;
  if not found then return jsonb_build_object('ok',false,'code','receive_capability_denied'); end if;
  select * into v_gate from runtime_auth.production_gates
    where principal_id=v_principal.id and credential_id=v_credential.id
      and state='active' and issued_at<=v_now and expires_at>v_now
      and build_version=p_build_version and registry_version=p_registry_version
      and migration_version='191-pec78-composio-slack-production-hardening'
    for update;
  if not found then return jsonb_build_object('ok',false,'code','production_gate_denied'); end if;
  if exists(select 1 from runtime_auth.kill_switches k where k.active and
    (k.scope='global' or (k.scope='contract' and k.target=v_principal.contract_version) or
     (k.scope='principal' and k.target=v_principal.id::text) or
     (k.scope='credential' and k.target=v_credential.id::text) or
     (k.scope='capability' and k.target='slack.receive.christopher'))) then
    return jsonb_build_object('ok',false,'code','authority_killed');
  end if;

  select * into v_existing from runtime_auth.inbound_events
    where delivery_digest=p_delivery_digest or message_digest=p_message_digest
    order by received_at limit 1 for update;
  if found then
    return jsonb_build_object('ok',true,'replayed',true,
      'event_digest',encode(extensions.digest(v_existing.id::text,'sha256'),'hex'));
  end if;
  if p_validation_mode then
    select * into v_auth from runtime_auth.activation_authorizations
      where principal_id=v_principal.id and source_id=v_source.id and state='active'
        and trigger_id=p_trigger_id and channel_id=p_channel_id
        and fence_epoch=v_principal.fence_epoch and build_version=p_build_version
        and registry_version=p_registry_version and runtime_instance_id=p_runtime_instance_id
        and issued_at<=v_now and expires_at>v_now for update;
    if not found or v_auth.consumed_events>=v_auth.max_events then
      return jsonb_build_object('ok',false,'code','activation_authorization_denied');
    end if;
    update runtime_auth.activation_authorizations
      set consumed_events=consumed_events+1,state='consumed',consumed_at=v_now
      where id=v_auth.id;
  end if;
  begin
    insert into runtime_auth.inbound_events(
      principal_id,source_id,provider_event_id,delivery_digest,message_digest,payload_digest,
      channel_digest,thread_digest,encryption_algorithm,encryption_key_version,nonce,auth_tag,
      ciphertext,occurred_at
    ) values(
      v_principal.id,v_source.id,p_provider_event_id,p_delivery_digest,p_message_digest,p_payload_digest,
      p_channel_digest,p_thread_digest,p_encryption_algorithm,p_encryption_key_version,p_nonce,p_auth_tag,
      p_ciphertext,p_occurred_at
    ) returning * into v_event;
  exception when unique_violation then
    select * into v_existing from runtime_auth.inbound_events
      where delivery_digest=p_delivery_digest or message_digest=p_message_digest
      order by received_at limit 1;
    return jsonb_build_object('ok',true,'replayed',true,
      'event_digest',encode(extensions.digest(v_existing.id::text,'sha256'),'hex'));
  end;
  perform runtime_auth.append_event_receipt(
    p_trace_id,'event_ingested',v_principal.id,v_event.id,null,null,v_credential.id,
    v_principal.fence_epoch,0,'slack.receive.christopher','received','ciphertext_only',p_build_version
  );
  return jsonb_build_object('ok',true,'replayed',false,
    'event_digest',encode(extensions.digest(v_event.id::text,'sha256'),'hex'));
end $$;

create or replace function public.pec78_claim_composio_slack_event(
  p_credential_id uuid,p_runtime_instance_id uuid,p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth,extensions as $$
declare
  v_credential runtime_auth.credentials%rowtype;
  v_principal runtime_auth.principals%rowtype;
  v_event runtime_auth.inbound_events%rowtype;
  v_lease runtime_auth.event_leases%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('pec78_maya_runtime_transition',0));
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found or v_credential.state<>'active' or v_credential.runtime_instance_id<>p_runtime_instance_id or
     coalesce(v_credential.not_before,'-infinity')>v_now or coalesce(v_credential.expires_at,'infinity')<=v_now then
    return jsonb_build_object('ok',false,'code','credential_denied');
  end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if not found or v_principal.state<>'active' or
     not exists(select 1 from runtime_auth.capability_grants g where g.principal_id=v_principal.id
       and g.capability='slack.receive.christopher' and g.state='active'
       and coalesce(g.valid_from,'-infinity')<=v_now and coalesce(g.valid_until,'infinity')>v_now) or
     not exists(select 1 from runtime_auth.production_gates g where g.principal_id=v_principal.id
       and g.credential_id=v_credential.id and g.state='active' and g.issued_at<=v_now
       and g.expires_at>v_now and g.build_version=p_build_version
       and g.registry_version=v_principal.registry_version
       and g.migration_version='191-pec78-composio-slack-production-hardening') or
     not exists(select 1 from runtime_auth.ingress_sources s where s.principal_id=v_principal.id
       and s.mode in ('validation','enabled') and coalesce(s.valid_until,'infinity')>v_now) or
     exists(select 1 from runtime_auth.kill_switches k where k.active and
       (k.scope='global' or (k.scope='contract' and k.target=v_principal.contract_version) or
        (k.scope='principal' and k.target=v_principal.id::text) or
        (k.scope='credential' and k.target=v_credential.id::text) or
        (k.scope='capability' and k.target='slack.receive.christopher'))) then
    return jsonb_build_object('ok',false,'code','authority_denied');
  end if;
  update runtime_auth.event_leases l set state='expired',completed_at=v_now
    where l.state='active' and l.expires_at<=v_now
      and not exists(select 1 from runtime_auth.slack_effects e where e.event_id=l.event_id);
  update runtime_auth.inbound_events e
    set state=case when e.attempt_count<2 then 'received' else 'quarantined' end,
        terminal_code=case when e.attempt_count<2 then null else 'attempt_limit' end
    where e.state='leased'
      and not exists(select 1 from runtime_auth.event_leases l where l.event_id=e.id and l.state='active')
      and not exists(select 1 from runtime_auth.slack_effects x where x.event_id=e.id);
  select * into v_event from runtime_auth.inbound_events e
    where e.principal_id=v_principal.id and e.state='received' and e.attempt_count<2
      and e.received_at>v_now-interval '15 minutes'
    order by e.received_at,e.id for update skip locked limit 1;
  if not found then return jsonb_build_object('ok',true,'empty',true); end if;
  update runtime_auth.inbound_events
    set state='leased',attempt_count=attempt_count+1,lease_epoch=lease_epoch+1
    where id=v_event.id returning * into v_event;
  insert into runtime_auth.event_leases(
    event_id,credential_id,runtime_instance_id,runtime_owner_id,fence_epoch,lease_epoch,state,expires_at
  ) values(
    v_event.id,v_credential.id,p_runtime_instance_id,'runtime:maya-chen',
    v_principal.fence_epoch,v_event.lease_epoch,'active',v_now+interval '3 minutes'
  ) returning * into v_lease;
  perform runtime_auth.append_event_receipt(
    p_trace_id,'event_claimed',v_principal.id,v_event.id,v_lease.id,null,v_credential.id,
    v_principal.fence_epoch,v_lease.lease_epoch,'slack.receive.christopher','leased','lease_180_seconds',p_build_version
  );
  return jsonb_build_object(
    'ok',true,'empty',false,'event_id',v_event.id,'lease_id',v_lease.id,
    'lease_epoch',v_lease.lease_epoch,'provider_event_id',v_event.provider_event_id,
    'payload_digest',v_event.payload_digest,'channel_digest',v_event.channel_digest,
    'thread_digest',v_event.thread_digest,'encryption_algorithm',v_event.encryption_algorithm,
    'encryption_key_version',v_event.encryption_key_version,'nonce',v_event.nonce,
    'auth_tag',v_event.auth_tag,'ciphertext',v_event.ciphertext,'lease_expires_at',v_lease.expires_at
  );
end $$;

create or replace function public.pec78_mark_composio_slack_effect_executing(
  p_credential_id uuid,p_runtime_instance_id uuid,p_effect_id uuid,p_lease_id uuid,
  p_lease_epoch bigint,p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth as $$
declare
  v_credential runtime_auth.credentials%rowtype;
  v_principal runtime_auth.principals%rowtype;
  v_effect runtime_auth.slack_effects%rowtype;
  v_lease runtime_auth.event_leases%rowtype;
  v_event runtime_auth.inbound_events%rowtype;
  v_source runtime_auth.ingress_sources%rowtype;
  v_grant runtime_auth.capability_grants%rowtype;
  v_dest runtime_auth.destination_grants%rowtype;
  v_budget runtime_auth.activation_budgets%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  -- The provider-I/O authorization edge and operator rollback share one
  -- transaction-scoped lock. Whichever commits first defines the only valid
  -- ordering; a rollback that wins makes this re-read the fenced authority.
  perform pg_advisory_xact_lock(hashtextextended('pec78_maya_runtime_transition',0));
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found or v_credential.state<>'active' or v_credential.runtime_instance_id<>p_runtime_instance_id or
     coalesce(v_credential.not_before,'-infinity')>v_now or coalesce(v_credential.expires_at,'infinity')<=v_now then
    return jsonb_build_object('ok',false,'code','credential_denied');
  end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if not found or v_principal.state<>'active' then return jsonb_build_object('ok',false,'code','principal_denied'); end if;
  select * into v_effect from runtime_auth.slack_effects where id=p_effect_id for update;
  if not found then return jsonb_build_object('ok',false,'code','effect_not_found'); end if;
  select * into v_lease from runtime_auth.event_leases where id=p_lease_id for update;
  if not found then return jsonb_build_object('ok',false,'code','lease_not_found'); end if;
  select * into v_event from runtime_auth.inbound_events where id=v_effect.event_id for update;
  if not found then return jsonb_build_object('ok',false,'code','event_not_found'); end if;
  if v_effect.state='executing' then
    return jsonb_build_object('ok',false,'code','effect_execution_ambiguous','provider_io_authorized',false);
  end if;
  if v_effect.state<>'reserved' or v_effect.expires_at<=v_now or v_effect.lease_id<>v_lease.id or
     v_effect.credential_id<>v_credential.id or v_effect.runtime_instance_id<>p_runtime_instance_id or
     v_effect.lease_epoch<>p_lease_epoch or v_effect.fence_epoch<>v_principal.fence_epoch or
     v_lease.event_id<>v_event.id or v_lease.state<>'active' or v_lease.expires_at<=v_now or
     v_lease.credential_id<>v_credential.id or v_lease.runtime_instance_id<>p_runtime_instance_id or
     v_lease.lease_epoch<>p_lease_epoch or v_lease.fence_epoch<>v_principal.fence_epoch or
     v_event.state<>'leased' or v_event.lease_epoch<>p_lease_epoch then
    return jsonb_build_object('ok',false,'code','effect_execution_denied','provider_io_authorized',false);
  end if;
  if not exists(select 1 from runtime_auth.production_gates g where g.principal_id=v_principal.id
    and g.credential_id=v_credential.id and g.state='active' and g.issued_at<=v_now and g.expires_at>v_now
    and g.build_version=p_build_version and g.registry_version=v_principal.registry_version
    and g.migration_version='191-pec78-composio-slack-production-hardening') then
    return jsonb_build_object('ok',false,'code','production_gate_denied','provider_io_authorized',false);
  end if;
  select * into v_source from runtime_auth.ingress_sources
    where id=v_event.source_id and principal_id=v_principal.id and mode in ('validation','enabled')
      and coalesce(valid_until,'infinity')>v_now for update;
  if not found then return jsonb_build_object('ok',false,'code','source_denied','provider_io_authorized',false); end if;
  select * into v_grant from runtime_auth.capability_grants
    where principal_id=v_principal.id and capability='slack.send.christopher'
      and state='active' and coalesce(valid_from,'-infinity')<=v_now
      and coalesce(valid_until,'infinity')>v_now for update;
  if not found then return jsonb_build_object('ok',false,'code','capability_denied','provider_io_authorized',false); end if;
  select * into v_dest from runtime_auth.destination_grants
    where id=v_effect.destination_grant_id and capability_grant_id=v_grant.id and provider='slack'
      and destination_ref=v_source.slack_channel_id and state='active'
      and coalesce(valid_until,'infinity')>v_now for update;
  if not found then return jsonb_build_object('ok',false,'code','destination_denied','provider_io_authorized',false); end if;
  select * into v_budget from runtime_auth.activation_budgets
    where id='pec78-maya-shadow-2026-07-26' and principal_id=v_principal.id
      and state='active' and expires_at>v_now and model_route_id=v_effect.model_route_id for update;
  if not found or v_budget.slack_reserved<1 or v_budget.slack_reserved>v_budget.slack_limit then
    return jsonb_build_object('ok',false,'code','budget_denied','provider_io_authorized',false);
  end if;
  if exists(select 1 from runtime_auth.kill_switches k where k.active and
    (k.scope='global' or (k.scope='contract' and k.target=v_principal.contract_version) or
     (k.scope='principal' and k.target=v_principal.id::text) or
     (k.scope='credential' and k.target=v_credential.id::text) or
     (k.scope='capability' and k.target='slack.send.christopher') or
     (k.scope='destination' and k.target=v_dest.id::text) or
     (k.scope='effect' and k.target=v_effect.id::text))) then
    return jsonb_build_object('ok',false,'code','authority_killed','provider_io_authorized',false);
  end if;
  update runtime_auth.slack_effects set state='executing',executing_at=v_now where id=v_effect.id;
  perform runtime_auth.append_event_receipt(
    p_trace_id,'effect_executing',v_principal.id,v_effect.event_id,v_lease.id,v_effect.id,v_credential.id,
    v_principal.fence_epoch,p_lease_epoch,'slack.send.christopher','executing','provider_io_authorized',p_build_version
  );
  return jsonb_build_object('ok',true,'replayed',false,'provider_io_authorized',true);
end $$;

create or replace function public.pec78_reconcile_composio_slack_effect(
  p_credential_id uuid,p_runtime_instance_id uuid,p_effect_id uuid,p_lease_id uuid,
  p_lease_epoch bigint,p_outcome text,p_provider_message_id text,p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth as $$
declare
  v_effect runtime_auth.slack_effects%rowtype;
  v_lease runtime_auth.event_leases%rowtype;
  v_event runtime_auth.inbound_events%rowtype;
  v_credential runtime_auth.credentials%rowtype;
  v_principal runtime_auth.principals%rowtype;
  v_state text;
  v_event_state text;
  v_now timestamptz:=clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('pec78_maya_runtime_transition',0));
  select * into v_effect from runtime_auth.slack_effects where id=p_effect_id for update;
  if not found then return jsonb_build_object('ok',false,'code','effect_not_found'); end if;
  select * into v_lease from runtime_auth.event_leases where id=p_lease_id for update;
  if not found then return jsonb_build_object('ok',false,'code','lease_not_found'); end if;
  select * into v_event from runtime_auth.inbound_events where id=v_effect.event_id for update;
  if not found then return jsonb_build_object('ok',false,'code','event_not_found'); end if;
  select * into v_credential from runtime_auth.credentials where credential_id=p_credential_id for update;
  if not found then return jsonb_build_object('ok',false,'code','credential_denied'); end if;
  select * into v_principal from runtime_auth.principals where id=v_credential.principal_id for update;
  if not found then return jsonb_build_object('ok',false,'code','principal_denied'); end if;
  if v_effect.state in ('succeeded','failed_unknown','failed_final') and
     v_event.state in ('completed','quarantined') then
    return jsonb_build_object('ok',true,'replayed',true,'state',v_effect.state,'event_state',v_event.state);
  end if;
  if v_effect.state<>'executing' or v_effect.lease_id<>v_lease.id or
     v_effect.credential_id<>v_credential.id or v_effect.runtime_instance_id<>p_runtime_instance_id or
     v_effect.lease_epoch<>p_lease_epoch or v_lease.event_id<>v_event.id or
     v_lease.credential_id<>v_credential.id or v_lease.runtime_instance_id<>p_runtime_instance_id or
     v_lease.lease_epoch<>p_lease_epoch then
    return jsonb_build_object('ok',false,'code','effect_reconcile_denied');
  end if;
  if p_outcome='succeeded' and p_provider_message_id ~ '^\d{10}\.\d{6}$' then
    v_state:='succeeded'; v_event_state:='completed';
  elsif p_outcome='unknown' and p_provider_message_id is null then
    v_state:='failed_unknown'; v_event_state:='quarantined';
  elsif p_outcome='failed' and p_provider_message_id is null then
    v_state:='failed_final'; v_event_state:='quarantined';
  else
    return jsonb_build_object('ok',false,'code','provider_outcome_invalid');
  end if;
  update runtime_auth.slack_effects
    set state=v_state,provider_message_id=p_provider_message_id,completed_at=v_now
    where id=v_effect.id;
  update runtime_auth.inbound_events
    set state=v_event_state,completed_at=v_now,
        terminal_code=case when v_state='succeeded' then 'slack_reply_confirmed'
                           when v_state='failed_unknown' then 'provider_outcome_unknown'
                           else 'provider_send_failed' end
    where id=v_event.id;
  update runtime_auth.event_leases
    set state=case when v_state='succeeded' then 'completed' else 'failed' end,completed_at=v_now
    where id=v_lease.id;
  perform runtime_auth.append_event_receipt(
    p_trace_id,'effect_reconciled',v_principal.id,v_event.id,v_lease.id,v_effect.id,v_credential.id,
    v_principal.fence_epoch,p_lease_epoch,'slack.send.christopher',v_state,
    case when v_state='succeeded' then 'provider_id_recorded' else 'manual_reconciliation_required' end,
    p_build_version
  );
  perform runtime_auth.append_event_receipt(
    p_trace_id,'event_completed',v_principal.id,v_event.id,v_lease.id,v_effect.id,v_credential.id,
    v_principal.fence_epoch,p_lease_epoch,'slack.receive.christopher',v_event_state,
    case when v_state='succeeded' then 'atomic_with_effect_success' else 'atomic_with_effect_quarantine' end,
    p_build_version
  );
  return jsonb_build_object('ok',true,'replayed',false,'state',v_state,'event_state',v_event_state);
end $$;

create or replace function public.pec78_composio_production_readiness(
  p_runtime_instance_id uuid,p_registry_version text,p_build_version text,p_trigger_id text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth as $$
declare
  v_tuple_ready boolean;
  v_no_kill boolean;
  v_receipts_healthy boolean;
  v_active_leases bigint;
  v_unknown_effects bigint;
  v_pending_events bigint;
  v_ok boolean;
begin
  select exists(
    select 1
    from runtime_auth.principals p
    join runtime_auth.credentials c on c.principal_id=p.id
    join runtime_auth.production_gates pg on pg.principal_id=p.id and pg.credential_id=c.id
    join runtime_auth.ingress_sources s on s.principal_id=p.id
    join runtime_auth.capability_grants r on r.principal_id=p.id and r.capability='slack.receive.christopher'
    join runtime_auth.capability_grants w on w.principal_id=p.id and w.capability='slack.send.christopher'
    join runtime_auth.destination_grants d on d.capability_grant_id=w.id
    join runtime_auth.activation_budgets b on b.principal_id=p.id
    join runtime_auth.activation_authorizations a on a.principal_id=p.id and a.source_id=s.id
    where p.persona_id='maya-chen' and p.state='active' and p.registry_version=p_registry_version
      and c.runtime_instance_id=p_runtime_instance_id and c.state='active'
      and coalesce(c.not_before,'-infinity')<=clock_timestamp()
      and coalesce(c.expires_at,'infinity')>clock_timestamp()
      and pg.state='active' and pg.issued_at<=clock_timestamp() and pg.expires_at>clock_timestamp()
      and pg.build_version=p_build_version and pg.registry_version=p_registry_version
      and pg.migration_version='191-pec78-composio-slack-production-hardening'
      and s.id='maya-composio-slack-v1' and s.mode='validation'
      and s.trigger_id=p_trigger_id and s.connected_account_id<>'unbound'
      and coalesce(s.valid_until,'infinity')>clock_timestamp()
      and r.state='active' and coalesce(r.valid_from,'-infinity')<=clock_timestamp()
      and coalesce(r.valid_until,'infinity')>clock_timestamp()
      and w.state='active' and coalesce(w.valid_from,'-infinity')<=clock_timestamp()
      and coalesce(w.valid_until,'infinity')>clock_timestamp()
      and d.provider='slack' and d.destination_ref=s.slack_channel_id and d.state='active'
      and coalesce(d.valid_until,'infinity')>clock_timestamp()
      and b.id='pec78-maya-shadow-2026-07-26' and b.state='active'
      and b.expires_at>clock_timestamp() and b.slack_reserved<b.slack_limit
      and a.state='active' and a.consumed_events=0 and a.issued_at<=clock_timestamp()
      and a.expires_at>clock_timestamp() and a.build_version=p_build_version
      and a.registry_version=p_registry_version and a.runtime_instance_id=p_runtime_instance_id
      and a.fence_epoch=p.fence_epoch and a.trigger_id=s.trigger_id and a.channel_id=s.slack_channel_id
  ) into v_tuple_ready;
  select not exists(
    select 1 from runtime_auth.kill_switches k
    join runtime_auth.principals p on p.persona_id='maya-chen'
    left join runtime_auth.credentials c on c.principal_id=p.id and c.runtime_instance_id=p_runtime_instance_id
    left join runtime_auth.capability_grants w on w.principal_id=p.id and w.capability='slack.send.christopher'
    left join runtime_auth.destination_grants d on d.capability_grant_id=w.id
      and d.provider='slack' and d.destination_ref='C0BD7L43PC2'
    where k.active and (k.scope='global' or (k.scope='contract' and k.target=p.contract_version) or
      (k.scope='principal' and k.target=p.id::text) or
      (k.scope='credential' and k.target=c.id::text) or
      (k.scope='capability' and k.target in ('slack.receive.christopher','slack.send.christopher')) or
      (k.scope='destination' and k.target=d.id::text))
  ) into v_no_kill;
  select not exists(
    select 1 from (
      select previous_receipt_hash,receipt_hash,
        lag(receipt_hash) over(order by created_at,id) as expected_previous,
        row_number() over(order by created_at,id) as sequence_no
      from runtime_auth.event_receipts
    ) x where x.receipt_hash !~ '^[0-9a-f]{64}$'
      or (x.sequence_no=1 and x.previous_receipt_hash is not null)
      or (x.sequence_no>1 and x.previous_receipt_hash is distinct from x.expected_previous)
  ) into v_receipts_healthy;
  select count(*) into v_active_leases from runtime_auth.event_leases
    where state='active' and expires_at>clock_timestamp();
  select count(*) into v_unknown_effects from runtime_auth.slack_effects
    where state in ('executing','failed_unknown');
  select count(*) into v_pending_events from runtime_auth.inbound_events
    where state in ('received','leased');
  v_ok:=v_tuple_ready and v_no_kill and v_receipts_healthy and
    v_active_leases=0 and v_unknown_effects=0 and v_pending_events=0;
  return jsonb_build_object(
    'ok',v_ok,'authority_tuple_ready',v_tuple_ready,'principal_active',v_tuple_ready,
    'credential_active',v_tuple_ready,'source_bound',v_tuple_ready,'source_active',v_tuple_ready,
    'receive_capability_active',v_tuple_ready,'send_capability_active',v_tuple_ready,
    'destination_active',v_tuple_ready,'gate_active',v_tuple_ready,'budget_active',v_tuple_ready,
    'validation_authorization_active',v_tuple_ready,'activation_binding_exact',v_tuple_ready,
    'migration_current',v_tuple_ready,'no_kill_switch',v_no_kill,
    'receipt_chain_healthy',v_receipts_healthy,'active_event_leases',v_active_leases,
    'unknown_effects',v_unknown_effects,'pending_events',v_pending_events
  );
end $$;

create or replace function public.pec78_rollback_composio_runtime(
  p_actor_subject text,p_reason text,p_trace_id uuid,p_build_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,runtime_auth as $$
declare
  v_principal runtime_auth.principals%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if length(trim(p_actor_subject))<3 or length(trim(p_actor_subject))>160 or
     length(trim(p_reason))<3 or length(trim(p_reason))>500 then
    return jsonb_build_object('ok',false,'code','rollback_input_denied');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pec78_maya_runtime_transition',0));
  select * into v_principal from runtime_auth.principals
    where persona_id='maya-chen' for update;
  if not found then return jsonb_build_object('ok',false,'code','principal_not_found'); end if;
  insert into runtime_auth.kill_switches(scope,target,active,reason,actor_subject)
    values('principal',v_principal.id::text,true,p_reason,p_actor_subject)
    on conflict(scope,target) where active do update
      set reason=excluded.reason,actor_subject=excluded.actor_subject,created_at=v_now,cleared_at=null;
  update runtime_auth.ingress_sources set mode='revoked',valid_until=v_now,updated_at=v_now
    where principal_id=v_principal.id and mode<>'revoked';
  update runtime_auth.activation_authorizations set state='revoked'
    where principal_id=v_principal.id and state in ('disabled','active');
  update runtime_auth.production_gates set state='revoked'
    where principal_id=v_principal.id and state in ('disabled','active');
  update runtime_auth.capability_grants set state='revoked'
    where principal_id=v_principal.id and capability in ('slack.receive.christopher','slack.send.christopher')
      and state<>'revoked';
  update runtime_auth.destination_grants d set state='revoked'
    from runtime_auth.capability_grants g
    where d.capability_grant_id=g.id and g.principal_id=v_principal.id and d.state<>'revoked';
  update runtime_auth.activation_budgets set state='revoked'
    where principal_id=v_principal.id and state<>'revoked';
  update runtime_auth.credentials set state='revoked'
    where principal_id=v_principal.id and state<>'revoked';
  update runtime_auth.event_leases set state='fenced',completed_at=v_now
    where state='active' and event_id in (
      select id from runtime_auth.inbound_events where principal_id=v_principal.id
    );
  update runtime_auth.inbound_events set state='quarantined',completed_at=v_now,
      terminal_code='operator_rollback_reconciliation_required'
    where principal_id=v_principal.id and state in ('received','leased');
  update runtime_auth.principals set state='suspended',fence_epoch=fence_epoch+1
    where id=v_principal.id returning * into v_principal;
  perform runtime_auth.append_event_receipt(
    p_trace_id,'runtime_rolled_back',v_principal.id,null,null,null,null,v_principal.fence_epoch,
    null,null,'fenced','operator_rollback_reconciliation_required',p_build_version
  );
  return jsonb_build_object('ok',true,'state','fenced','fence_epoch',v_principal.fence_epoch,
    'reconciliation_required',exists(select 1 from runtime_auth.slack_effects e
      where e.principal_id=v_principal.id and e.state in ('reserved','executing','failed_unknown')));
end $$;

revoke all on function public.pec78_ingest_composio_slack_event_v2(
  text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text,text,text,text,text,
  boolean,uuid,text,uuid,text
) from public,anon,authenticated;
revoke all on function public.pec78_composio_production_readiness(uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function public.pec78_composio_production_readiness()
  from public,anon,authenticated,service_role;
revoke all on function public.pec78_rollback_composio_runtime(text,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.pec78_ingest_composio_slack_event_v2(
  text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text,text,text,text,text,
  boolean,uuid,text,uuid,text
) to service_role;
grant execute on function public.pec78_composio_production_readiness(uuid,text,text,text) to service_role;
grant execute on function public.pec78_rollback_composio_runtime(text,text,uuid,text) to service_role;

commit;
