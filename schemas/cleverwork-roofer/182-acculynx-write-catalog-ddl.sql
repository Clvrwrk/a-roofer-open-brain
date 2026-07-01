-- 182 — AccuLynx write-capability catalog/probe DDL (Phase 4, REQ-06)
--
-- acculynx_write_catalog (per-endpoint evidence-based verdict) and acculynx_write_probe
-- (per-attempt evidence row) are NEW tables mirroring the read-side shape
-- (acculynx_api_catalog / acculynx_api_probe, schema 166), extended per CONTEXT.md D-02 for
-- method + red-team dimension + side-effect + disposable-entity (tag+leave) traceability.
--
-- Unlike 166 (which captured an existing live table), this pair does not exist yet anywhere —
-- both are defined here for the first time, so source_account_key is a plain NOT NULL DEFAULT
-- column rather than a follow-on ALTER. The write-sweep Edge Function (Wave 2/3) is the only
-- writer; this migration only creates schema.
--
-- verdict enum: writable / write-only / unsupported / fragile-with-guardrail /
-- blocked-by-dependency / read-shaped. The 6th value (read-shaped) covers the two
-- search-shaped POSTs (POST /jobs/search, POST /contacts/search) per RESEARCH.md Open
-- Question 3 — these carry no side effect and don't fit the other five verdicts cleanly.
--
-- Additive + idempotent; no DROP/TRUNCATE, no retype, no data touch (hard rule 1).

create table if not exists public.acculynx_write_catalog (
  id                         integer generated always as identity primary key,
  endpoint_pattern           text not null,
  method                     text not null,
  category                   text,  -- grouping label: contacts/jobs/financials/payments/documents/messages/representatives/subscriptions
  verdict                    text not null
                               check (verdict in ('writable','write-only','unsupported','fragile-with-guardrail','blocked-by-dependency','read-shaped')),
  tier                       text check (tier in ('deep','smoke')),
  red_team_dimensions_covered text[],
  side_effect                text,  -- e.g. creates_entity / mutates_entity / no_side_effect / fires_webhook
  guardrail_notes            text,
  source_account_key         text not null default 'sandbox',
  last_probe_status          integer,
  last_probed_at             timestamptz,
  notes                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

comment on column public.acculynx_write_catalog.verdict is
  'Evidence-based verdict per D-02. read-shaped covers POST /jobs/search + POST /contacts/search (search-shaped, no side effect) — see RESEARCH.md Open Question 3.';

create table if not exists public.acculynx_write_probe (
  id                     bigint generated always as identity primary key,
  probe_batch_id         text not null,
  probe_name             text not null,
  api_endpoint           text not null,
  method                 text not null,
  http_status            integer,
  response_ms            integer,
  result_summary         jsonb not null default '{}'::jsonb,
  payload_sample         jsonb,
  request_body_sample    jsonb,  -- redacted outbound request body (mirrors payload_sample for the response)
  error                  text,
  red_team_dimension     text check (red_team_dimension in ('bad_input','partial_failure','idempotency','ordering_dependency','authz_scope')),
  side_effect_observed   text,
  created_entity_id      text,   -- D-04 tag+leave traceability: id of any entity this probe created
  run_tag                text,   -- D-04 run-id marker stamped on every sandbox-created entity
  source_account_key     text not null default 'sandbox',
  probed_at              timestamptz not null default now()
);

comment on column public.acculynx_write_probe.source_account_key is
  'AccuLynx account this probe ran against (acculynx_accounts.account_key). Phase 4 write-sweep tags every row ''sandbox''; reconciliation asserts no non-sandbox rows.';
comment on column public.acculynx_write_probe.red_team_dimension is
  'One of D-05''s 5 dimensions (bad_input/partial_failure/idempotency/ordering_dependency/authz_scope); null for a plain happy-path smoke probe.';
comment on column public.acculynx_write_probe.run_tag is
  'D-04 disposable-entity marker: every sandbox-created entity is stamped with this run-id so test data stays identifiable (tag+leave lifecycle; sandbox is disposable, no bulk reset exists).';

create unique index if not exists idx_acculynx_write_catalog_endpoint_method
  on public.acculynx_write_catalog(endpoint_pattern, method);

create index if not exists idx_acculynx_write_probe_batch  on public.acculynx_write_probe(probe_batch_id);
create index if not exists idx_acculynx_write_probe_source on public.acculynx_write_probe(source_account_key);

-- Deny-by-default RLS posture, matching schema 166/177.
alter table public.acculynx_write_catalog enable row level security;
alter table public.acculynx_write_probe   enable row level security;
grant select on public.acculynx_write_catalog, public.acculynx_write_probe to authenticated, service_role;
