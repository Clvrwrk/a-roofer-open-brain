-- 263 — three fixes to the Friday board, and a cleanup list it can act on.
--
-- Chris, 2026-08-21, after asking why 230 of 346 jobs showed $0 Balance Due.
-- The answer was two unrelated causes, so this migration addresses both and
-- gives the meeting a way to work the backlog.
--
-- ── 1 · Draft invoices are not receivables ────────────────────────────────
--
-- The invoice filter (migration 215, preserved byte-identical through 258/260)
-- excluded only 'void':
--     lower(coalesce(current_invoice_state,'')) <> 'void'
-- A DRAFT invoice has not been issued to anyone, so it cannot be AR. One draft
-- existed in the population — MC-76, Bureau of Indian Affairs, $36,000 — and
-- it was counting toward Billed AR. Now excluded.
-- With the draft gone MC-76 has no contract and no issued invoice, so it
-- correctly leaves the board entirely.
--
-- ── 2 · Finished work comes off the working board ─────────────────────────
--
-- 225 jobs were contracted, invoiced and collected IN FULL, yet still sat on
-- the board because the signed-contract gate (mig 258) says nothing about
-- whether money is outstanding, and the existing drop rule only fires on
-- milestone = 'closed'. These jobs were never advanced to Closed in AccuLynx.
-- The oldest, job 10 (Neomie Vincent, TX), has been at 'invoiced' for 1,576
-- days — over four years — fully paid.
--
-- They are flagged 'stale_closeout' rather than deleted: they are an AccuLynx
-- housekeeping list the Friday meeting wants to work through, so the board
-- keeps the rows, excludes them from every money KPI and from the default
-- view, and surfaces them behind their own pill.
--
-- ── 3 · Where AccuLynx contradicts itself ─────────────────────────────────
--
-- 5 jobs carry open invoices their own job-level Balance Due does not reflect
-- — $195,098.53 invoiced but absent from column N. Job 5 is the
-- clearest: invoices 5-1/5-2/5-3 Paid and totalling exactly the contract, then
-- 5-4 Unpaid at $136,892.90 dated 2026-07-03, with the job balance still $0.
-- Flagged 'balance_contradiction'. These rows STAY in the money KPIs — the AR
-- is real — they just also need someone to look at them.
--
-- ── The note ──────────────────────────────────────────────────────────────
--
-- Every flagged row carries a plain-language "Our Best Guess" at what
-- happened, DERIVED FROM THE ROW'S OWN NUMBERS on every rebuild, so the
-- explanation can never drift from the data it describes. The board pops it
-- out from the CLIENT NAME — the job number is already the AccuLynx deep link.

begin;

alter table public.wip_ar_master add column if not exists attention_flag text;
alter table public.wip_ar_master add column if not exists attention_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='wip_ar_attention_flag_chk') then
    alter table public.wip_ar_master add constraint wip_ar_attention_flag_chk
      check (attention_flag is null or attention_flag in ('stale_closeout','balance_contradiction'));
  end if;
end $$;

comment on column public.wip_ar_master.attention_flag is
  'Why this row needs an AccuLynx cleanup rather than a collections conversation. stale_closeout = contracted, invoiced and collected in full but never advanced to Closed, so it sits on the board as if in flight. balance_contradiction = the job-level Balance Due disagrees with the job''s own open invoices. NULL = an ordinary active row.';
comment on column public.wip_ar_master.attention_note is
  'Plain-language "Our Best Guess" at what happened, generated from the row''s own numbers. Shown as a popout on the client name in the Friday board - the job number is already spoken for by the AccuLynx deep link.';

create index if not exists wip_ar_attention_idx on public.wip_ar_master (attention_flag) where attention_flag is not null;

create or replace function public.diagnose_wip_ar_attention()
returns table (stale_closeout integer, balance_contradiction integer)
language plpgsql security definer set search_path to 'public'
as $function$
declare v_stale integer := 0; v_contra integer := 0;
begin
  with open_inv as (
    select job_id,
           count(*)                                              as open_count,
           round(sum(balance_due::numeric), 2)                    as open_balance,
           min(coalesce(invoice_date::date, created_date::date))  as oldest_open,
           string_agg(invoice_number, ', ' order by invoice_date) as invoice_list
    from acculynx_invoices
    where job_id is not null
      -- Draft excluded for the same reason it is excluded from billed AR.
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
    -- A contradiction outranks a stale close-out: real AR beats housekeeping.
    and m.attention_flag is distinct from 'balance_contradiction'
    and coalesce(m.contract_amount,0) > 1
    and coalesce(m.outstanding_ar,0) <= 0.004
    and coalesce(m.billed_ar,0) <= 0.004
    and m.collected_revenue + 0.005 >= m.contract_amount
    and m.milestone <> 'closed';
  get diagnostics v_stale = row_count;

  -- A row that no longer qualifies goes back to being ordinary, so a fixed
  -- job clears itself on the next rebuild without anyone editing the flag.
  update wip_ar_master m
  set attention_flag = null, attention_note = null
  where m.in_ar_population
    and m.attention_flag is not null
    and not (m.billed_ar - m.outstanding_ar > 0.004)
    and not (coalesce(m.contract_amount,0) > 1
             and coalesce(m.outstanding_ar,0) <= 0.004
             and coalesce(m.billed_ar,0) <= 0.004
             and m.collected_revenue + 0.005 >= m.contract_amount
             and m.milestone <> 'closed');

  return query select v_stale, v_contra;
end $function$;

comment on function public.diagnose_wip_ar_attention() is
  'Flags rows that need an AccuLynx cleanup rather than a collections call, and writes the plain-language "Our Best Guess" note the Friday board pops out on the client name. Derived from the row''s own numbers on every rebuild, so the explanation cannot drift from the data.';

commit;

-- refresh_wip_ar_master() is amended in place by the DO block below rather
-- than retyped: it is a ~200-line function and the only changes are the
-- invoice-state predicate and one PERFORM before the RETURN. Retyping it to
-- change two lines is how transcription drift gets introduced into the ~198
-- lines that are NOT changing. The block fails loudly if either anchor moves.
do $do$
declare
  v_def text := pg_get_functiondef('public.refresh_wip_ar_master(date)'::regprocedure);
  a1 text := 'lower(coalesce(current_invoice_state, '''')) <> ''void''';
  b1 text := 'lower(coalesce(current_invoice_state, '''')) not in (''void'', ''draft'')';
  a2 text := '  RETURN QUERY SELECT v_upserted, v_dropped;';
  b2 text := '  -- Flag the rows that need an AccuLynx cleanup rather than a collections
  -- call, and write their "Our Best Guess" notes.
  PERFORM public.diagnose_wip_ar_attention();

  RETURN QUERY SELECT v_upserted, v_dropped;';
begin
  if position('diagnose_wip_ar_attention' in v_def) > 0 then
    raise notice 'already amended; nothing to do';
    return;
  end if;
  if position(a1 in v_def) = 0 then raise exception 'invoice-state anchor not found'; end if;
  if position(a2 in v_def) = 0 then raise exception 'return anchor not found'; end if;
  v_def := replace(v_def, a1, b1);
  v_def := replace(v_def, a2, b2);
  execute v_def;
end $do$;

-- 2026-08-21 after this migration: 345 jobs in wip_ar_master, of which
--   115 active            billed AR $853,954.39
--     5 balance_contradiction   billed AR $202,581.01  ($195,098.53 not in column N)
--   225 stale_closeout     $0 AR, $9,159,129 contracted, off the working board
-- Board totals: Billed AR $1,056,535 · 120 jobs on the ledger.
