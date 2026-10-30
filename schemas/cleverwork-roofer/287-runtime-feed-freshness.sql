-- 287 — v_runtime_feed_freshness: "is the data the surfaces read actually current?"
-- (docs/109 D2, D5 — the Data feeds group of the /agents runtime board).
--
-- One row per feed: newest row time, rows in the last 24h (green-but-empty guard —
-- the 2026-08-26..09-01 ABC outage returned HTTP 200 with zero rows for 7 nights),
-- and for the audit matview the number of recent invoices it does NOT contain
-- (the 2026-09-02..09-11 freeze signature: 16 invoices ingested, 0 audit rows).
--
-- Additive + idempotent. Service-role only.

create or replace view public.v_runtime_feed_freshness as
with lagging as (
  select count(*)::int as n
  from public.abc_invoices a
  where a.created_at > now() - interval '7 days'
    and not exists (select 1 from public.mv_invoice_audit_line m where m.invoice_number = a.invoice_number)
)
select 'abc_invoices'::text as feed_key,
       max(i.created_at) as last_row_at,
       count(*) filter (where i.created_at > now() - interval '24 hours')::int as rows_24h,
       null::int as lagging_rows
from public.abc_invoices i
union all
select 'mv_invoice_audit_line',
       (select s.last_success_end from public.v_runtime_pg_cron_status s where s.jobname = 'refresh-office-pricing-matviews'),
       null::int,
       (select n from lagging)
union all
select 'acculynx_watermark', max(w.last_successful_sync_at), null::int, null::int
from public.acculynx_sync_watermark w
union all
select 'vendor_invoices', max(v.created_at),
       count(*) filter (where v.created_at > now() - interval '24 hours')::int, null::int
from public.vendor_invoices v
union all
select 'wip_ar_master', max(x.computed_at), null::int, null::int
from public.wip_ar_master x
union all
select 'credit_memo_receipts', max(r.created_at),
       count(*) filter (where r.created_at > now() - interval '24 hours')::int, null::int
from public.credit_memo_receipts r
union all
select 'qbo_mirror', max(q.finished_at), null::int, null::int
from public.qbo_sync_runs q;

revoke all on public.v_runtime_feed_freshness from anon, authenticated;
grant select on public.v_runtime_feed_freshness to service_role;
