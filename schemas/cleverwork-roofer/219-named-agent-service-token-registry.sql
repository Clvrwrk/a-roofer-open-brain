-- Server-only named-agent bearer registry. Raw tokens stay in the agent runtime;
-- the Command Center compares only SHA-256 digests through its service-role client.
begin;

create table public.agent_service_token_registry (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'active' check (state in ('active','revoked')),
  issued_by text not null,
  purpose text not null,
  not_before timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  check (expires_at is null or not_before is null or expires_at > not_before),
  check ((state = 'active' and revoked_at is null) or (state = 'revoked' and revoked_at is not null))
);

create unique index agent_service_token_registry_one_active_agent_idx
  on public.agent_service_token_registry(agent_id)
  where state = 'active';

alter table public.agent_service_token_registry enable row level security;
revoke all on table public.agent_service_token_registry from public, anon, authenticated;
grant select on table public.agent_service_token_registry to service_role;

comment on table public.agent_service_token_registry is
  'Server-only hash registry for named-agent bearer authentication; never stores raw tokens.';

commit;
