-- 342 — Friday board attention flags are re-derived from scratch on every rebuild.
--
-- Chris, 2026-11-06, asking why MC-68 and MC-63 still showed the "?" popout
-- saying invoices were outstanding when both jobs are paid in full.
--
-- ── The bug (migration 263) ───────────────────────────────────────────────
--
-- diagnose_wip_ar_attention() ran three passes and never reset a flag first:
--
--   1. balance_contradiction — only touches rows that STILL have an open
--      invoice, so a row whose invoices were since paid keeps its old flag
--      and its old note word for word.
--   2. stale_closeout — skipped any row already flagged
--      (attention_flag IS DISTINCT FROM 'balance_contradiction'), so a paid
--      job carrying an old contradiction flag could never be re-flagged.
--   3. clear — only cleared rows that qualify for NEITHER flag. A paid,
--      never-closed job qualifies for stale_closeout, so it was not cleared.
--
-- A job that went "open invoice" → "paid, never closed" fell through all
-- three and kept a stale "$X still outstanding" note on the working board.
-- 2026-11-06: seven rows stuck this way — CO-357, KS-207, KS-69, MC-63,
-- MC-68, TX-455, TX-459 (all $0 billed AR, $0 open invoices in the mirror).
-- An eighth, KS-263 (credit balance, no open invoices), was stuck because the
-- clear pass tested only the row's numbers, not whether an open invoice exists.
--
-- ── The fix ───────────────────────────────────────────────────────────────
--
-- Reset every flag, then derive both from the current data, contradiction
-- first (real AR outranks housekeeping, unchanged from 263). The flag and the
-- note are pure functions of today's numbers, so nothing can stick. The
-- function runs inside refresh_wip_ar_master()'s transaction, so no reader
-- ever sees the reset state. Note text, flag names, the CHECK constraint and
-- every KPI on the board are unchanged.
--
-- Predicted and verified against the live DB before applying: 7 rows move
-- balance_contradiction → stale_closeout, KS-263 clears, every other flag is
-- unchanged (7 contradiction, 231 stale, 123 ordinary). No dollar KPI moves:
-- the 7 rows carry $0 billed AR and $0 balance due.
--
-- Rollback: re-run the CREATE OR REPLACE FUNCTION block from migration 263.
-- Additive and idempotent (CREATE OR REPLACE only; no table change).

begin;

create or replace function public.diagnose_wip_ar_attention()
returns table (stale_closeout integer, balance_contradiction integer)
language plpgsql security definer set search_path to 'public'
as $function$
declare v_stale integer := 0; v_contra integer := 0;
begin
  -- Start clean: a flag describes the row as it is today, never as it was.
  update wip_ar_master m
  set attention_flag = null, attention_note = null
  where m.attention_flag is not null or m.attention_note is not null;

  -- Open invoices per job, for the contradiction note. Draft is excluded here
  -- for the same reason it is excluded from billed AR: it was never issued.
  with open_inv as (
    select job_id,
           count(*)                                                   as open_count,
           round(sum(balance_due::numeric), 2)                        as open_balance,
           min(coalesce(invoice_date::date, created_date::date))       as oldest_open,
           string_agg(invoice_number, ', ' order by invoice_date)      as invoice_list
    from acculynx_invoices
    where job_id is not null
      and lower(coalesce(current_invoice_state,'')) not in ('void','draft')
      and coalesce(balance_due::numeric, 0) > 0.004
    group by job_id
  )
  update wip_ar_master m
  set attention_flag = 'balance_contradiction',
      attention_note =
        'Our best guess: AccuLynx reports Balance Due $0 on this job, but '
        || oi.open_count || ' invoice' || case when oi.open_count = 1 then '' else 's' end
        || ' (' || oi.invoice_list || ') still show'
        || case when oi.open_count = 1 then 's' else '' end || ' $'
        || to_char(oi.open_balance, 'FM999,999,999.00') || ' outstanding'
        || case when oi.oldest_open is not null then ', the oldest dated ' || to_char(oi.oldest_open, 'Mon DD YYYY') else '' end
        || '. The invoice was almost certainly raised after the job''s financial worksheet was last recalculated, so the job-level balance never picked it up — the two numbers come from different places in AccuLynx.'
        || case when coalesce(m.contract_amount,0) <= 1
             then ' This job also has no approved job value, so it was invoiced before its estimate was approved.'
             else '' end
        || ' Action: open the job''s Financials tab in AccuLynx and re-save so the balance recalculates, then confirm the invoice is genuinely still owed.'
  from open_inv oi
  where oi.job_id = m.acculynx_job_id
    and m.in_ar_population
    and m.billed_ar - m.outstanding_ar > 0.004;
  get diagnostics v_contra = row_count;

  -- Finished and fully collected, but never advanced to Closed. These are not
  -- work in progress and not receivables; they are an AccuLynx housekeeping
  -- list. A contradiction set above outranks this (real AR beats housekeeping).
  update wip_ar_master m
  set attention_flag = 'stale_closeout',
      attention_note =
        'Our best guess: this job is finished. It was contracted at $'
        || to_char(m.contract_amount, 'FM999,999,999.00')
        || ', invoiced $' || to_char(m.billed_total, 'FM999,999,999.00')
        || ' and collected in full, with nothing outstanding — but it is still sitting at "'
        || m.milestone || '" in AccuLynx'
        || case when m.days_in_status is not null then ', ' || m.days_in_status || ' days now' else '' end
        || '. The close-out step was skipped once the payment landed, so it keeps appearing as live work.'
        || case when coalesce(m.days_in_status,0) > 365
             then ' At over a year, this is almost certainly abandoned rather than pending.'
             else '' end
        || ' Action: advance the job to Closed in AccuLynx and it will drop off this board on the next rebuild.'
  where m.in_ar_population
    and m.attention_flag is null
    and coalesce(m.contract_amount,0) > 1
    and coalesce(m.outstanding_ar,0) <= 0.004
    and coalesce(m.billed_ar,0) <= 0.004
    and m.collected_revenue + 0.005 >= m.contract_amount
    and m.milestone <> 'closed';
  get diagnostics v_stale = row_count;

  return query select v_stale, v_contra;
end $function$;

comment on function public.diagnose_wip_ar_attention() is
  'Resets, then re-derives, the Friday board attention flags and their "Our Best Guess" notes from the current numbers on every rebuild (migration 342; 263 let a flag outlive the condition it described). balance_contradiction outranks stale_closeout.';

commit;
