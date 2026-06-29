-- 164 — QuickBooks register export ledger (docs/63 Change 1b)
--
-- The Register CSV loads EVERY fully-processed invoice — including do-not-pay holds
-- (credit-flag) and Service/Warranty (Commercial) transfers — into QuickBooks/AccuLynx as
-- an incurred expense, within ~2 weeks of purchase, regardless of the pay decision. It is
-- SEPARATE from invoice_payment_processed (the approved-to-pay PAYMENT export): an invoice
-- register-exports exactly once here, then pays once there when it's approved/released.
--
-- Load-once: register_exported_at stamps the single register load so QuickBooks never
-- double-enters. approved_to_pay / disposition carry the pay decision into the register row.
-- Append-only ledger; rows are never deleted. Additive + idempotent (hard rule 1).

create table if not exists invoice_register_export (
  invoice_number       text primary key,
  register_exported_at timestamptz not null default now(),
  batch_id             uuid not null,
  vendor               text,
  csv_file_name        text,
  csv_row              jsonb not null,
  disposition          text,
  approved_to_pay      boolean not null default true,
  exported_by          text,
  exported_by_actor    jsonb
);

comment on table invoice_register_export is
  'QuickBooks register export ledger (docs/63 Change 1b). One row per invoice loaded to the accounting register (incl. held / Service-Warranty transfers). Load-once via register_exported_at; pay decision in approved_to_pay/disposition; never deleted.';

create index if not exists idx_invoice_register_export_batch on invoice_register_export(batch_id);
