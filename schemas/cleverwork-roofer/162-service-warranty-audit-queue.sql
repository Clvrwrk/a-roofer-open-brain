-- 162 — Service/Warranty Audit queue + candidates view (Phase 1)
-- Commercial-ship-to invoices are routed OUT of the pricing Invoice Audit into a parallel
-- Service/Warranty Audit (Phase 2 mirrors the invoice-audit screens/SOPs/variance via an
-- audit_type discriminator on the shared views; Phase 1 = transfer + queue + Slack only).
--
-- Detection is API-primary: abc_invoices.raw->'shipTo'->>'name' ~ 'Commercial' (the same
-- field the PDF Ship-To "Commercial" prints from). OCR of the PDF ship-to becomes a SECOND
-- confirmation ("double positive") once an invoice-OCR pipeline exists — modeled here via
-- confirmation_source / ocr_confirmed so the validation layer can flag any API/OCR mismatch.
-- Human-in-the-loop for S/W = Chris (not Lucinda). Additive + idempotent (hard rule 1).

create table if not exists service_warranty_audit_queue (
  id                  uuid primary key default gen_random_uuid(),
  invoice_number      text not null unique,
  ship_to_number      text,
  ship_to_name        text,
  invoice_date        date,
  detection_signal    text not null default 'ship_to_commercial',
  confirmation_source text not null default 'api',       -- 'api' | 'api+ocr'
  ocr_confirmed       boolean,                            -- null until invoice-OCR pipeline exists
  validation_status   text not null default 'passed',     -- adversarial validation layer
  validation_note     text,
  status              text not null default 'transferred',-- transferred | in_review | resolved
  source_audit        text not null default 'invoice_audit',
  transferred_by      text not null default 'alex-rivers',
  transferred_at      timestamptz not null default now()
);

comment on table service_warranty_audit_queue is
  'Invoices routed from the pricing Invoice Audit to the Service/Warranty Audit (Commercial ship-to). Append-only ledger; status advances, rows are never deleted.';

create index if not exists idx_swaq_status on service_warranty_audit_queue(status);

-- Candidates = OPEN (ABC AR not paid), Commercial ship-to, not already queued.
-- Reused by the one-time backfill AND by the future Alex SOP step (morning_abc_sync §0).
create or replace view v_service_warranty_candidates as
select i.invoice_number,
       i.raw->'shipTo'->>'number'                          as ship_to_number,
       i.raw->'shipTo'->>'name'                            as ship_to_name,
       i.invoice_date::date                                as invoice_date,
       coalesce((i.raw->>'isCreditMemo')::boolean, false)  as is_credit_memo
from abc_invoices i
where i.raw->'shipTo'->>'name' ilike 'commercial'
  and coalesce(i.ar_status, '') <> 'paid'
  and not exists (
    select 1 from service_warranty_audit_queue q where q.invoice_number = i.invoice_number
  );
