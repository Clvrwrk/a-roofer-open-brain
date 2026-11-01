-- 341: F2 — mirror the AccuLynx financial worksheet (sections + line items) per job.
-- Written by acculynx-sync job-walk after the financials upsert (GET /financial/{id}/worksheet).
-- Copy-only: no LLM/OCR extraction. Additive, idempotent.

create table if not exists public.acculynx_job_worksheet_items (
  job_id           text        not null,
  financial_id     text        not null,
  worksheet_state  text,
  worksheet_total  numeric,
  section_id       text        not null,
  section_type     text,
  section_total    numeric,
  item_key         text        not null,  -- AccuLynx item id, or 'section' for a section with no lines
  item_name        text,
  price            numeric,
  total_price      numeric,
  parent_item_id   text,
  sort_order       integer,
  trade_id         text,
  account_key      text,
  market           text,
  synced_at        timestamptz not null default now(),
  primary key (job_id, section_id, item_key)
);

comment on table public.acculynx_job_worksheet_items is
  'F2: AccuLynx financial worksheet lines per job. Rows not refreshed by the latest walk are stale; read acculynx_job_worksheet_current.';

create index if not exists acculynx_job_worksheet_items_job_synced_idx
  on public.acculynx_job_worksheet_items (job_id, synced_at desc);

create or replace view public.acculynx_job_worksheet_current
with (security_invoker = true) as
select w.*
from public.acculynx_job_worksheet_items w
where w.synced_at = (select max(x.synced_at) from public.acculynx_job_worksheet_items x where x.job_id = w.job_id);

alter table public.acculynx_job_worksheet_items enable row level security;
revoke all on public.acculynx_job_worksheet_items from anon, authenticated;
revoke all on public.acculynx_job_worksheet_current from anon, authenticated;
