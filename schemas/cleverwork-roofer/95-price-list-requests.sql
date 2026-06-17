-- 95-price-list-requests.sql
-- RECONCILED: extend the EXISTING public.price_refresh_request table (vendor/region-grained
-- price-list refresh email queue: awaiting_verification -> approved -> ready_to_send -> sent)
-- with the branch grain + weekly-follow-up cadence the Price List Audit needs.
-- Additive + idempotent per repo rules. PROPOSED / NOT YET APPLIED — apply on a Supabase
-- branch (staging) first, verify, then promote. Backs the "Price List Requests" tracker on
-- /accounting/vendor-regions. No email auto-sends without human approval.

-- --- branch grain (existing table is vendor/region only) ---
alter table public.price_refresh_request add column if not exists vendor_branch_id uuid;     -- -> vendor_branches.id
alter table public.price_refresh_request add column if not exists branch_number   text;      -- ABC branch number (display/join)
alter table public.price_refresh_request add column if not exists pe_office_id     uuid;      -- -> office.id (territory owner)

-- --- why it is in scope ---
alter table public.price_refresh_request add column if not exists in_drive_time      boolean default false;  -- branch_office_candidate.contains
alter table public.price_refresh_request add column if not exists triggered_by_order boolean default false;  -- ordered at a no-agreement branch
alter table public.price_refresh_request add column if not exists coverage_status    text;                   -- 'full' | 'partial' | 'none' at request time

-- --- recipients (existing table has a single recipient_name/email; add rep + branch mgr) ---
alter table public.price_refresh_request add column if not exists sales_rep_name        text;
alter table public.price_refresh_request add column if not exists sales_rep_email       text;
alter table public.price_refresh_request add column if not exists branch_manager_name   text;
alter table public.price_refresh_request add column if not exists branch_manager_email  text;
alter table public.price_refresh_request add column if not exists fyi_emails            text[] default array['lucinda','roberto'];

-- --- lifecycle + weekly follow-up cadence ---
alter table public.price_refresh_request add column if not exists drafted_at       timestamptz;  -- agent drafted (pre-approval)
alter table public.price_refresh_request add column if not exists approved_by      text;         -- human who approved the send
alter table public.price_refresh_request add column if not exists followups_sent   int not null default 0;
alter table public.price_refresh_request add column if not exists last_followup_at  timestamptz;
alter table public.price_refresh_request add column if not exists next_followup_at  timestamptz;  -- sent_at + 7d*(followups_sent+1) until resolved

-- one open request per (vendor_branch) — partial unique so historical/closed rows don't collide
create unique index if not exists price_refresh_request_open_branch_uidx
  on public.price_refresh_request (vendor_branch_id)
  where vendor_branch_id is not null and status in ('awaiting_verification','approved','ready_to_send');

create index if not exists price_refresh_request_followup_idx
  on public.price_refresh_request (next_followup_at)
  where next_followup_at is not null;

-- aging view: "days to date" + weekly-follow-up due flag for the tracker
create or replace view public.v_price_refresh_request_aging as
select
  r.*,
  case when coalesce(r.sent_at, r.created_at) is not null
       then floor(extract(epoch from (now() - coalesce(r.sent_at, r.created_at))) / 86400)::int
       else null end as days_open,
  (r.next_followup_at is not null and r.next_followup_at <= now()
     and r.status in ('approved','ready_to_send')) as followup_due
from public.price_refresh_request r;

-- NOTE (go-live): the weekly follow-up is a scheduled job selecting followup_due rows,
-- drafting a follow-up for human approval, then bumping followups_sent + next_followup_at on send.
-- Recipient emails (vendor_branches.manager_email / sales_rep_email) are currently EMPTY (0/756)
-- and must be populated before any request can draft recipients — see go-live task list.
