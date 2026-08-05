-- 198 — Re-audit results table (docs/81 §6 Wave B; reusable for future re-audit runs)
-- Each run re-prices invoice lines against the invoice office's inherited,
-- invoice-date-effective agreement set (newest version per agreement_number with
-- effective_date <= invoice_date; evergreen — expiry never disqualifies; lowest
-- price wins across in-force agreements; unit-matched prices preferred).
-- Additive + idempotent. Applied to prod 2026-08-05.

CREATE TABLE IF NOT EXISTS public.invoice_line_reaudit (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_label           text NOT NULL,
  invoice_number      text NOT NULL,
  line_id             text,
  item_number         text,
  item_description    text,
  quantity            numeric,
  uom                 text,
  invoiced_price      numeric(12,4),
  office_id           uuid,
  office_name         text,
  agreement_id        text,
  agreement_number    text,
  agreement_effective date,
  agreement_expiry    date,
  match_method        text,            -- item_number | description | none
  unit_match          boolean,
  office_price        numeric(12,4),
  variance_ext        numeric(14,2),   -- (invoiced - office_price) * qty, when claimable
  classification      text NOT NULL
                      CHECK (classification IN ('discrepancy','valid','no_price','uom_review')),
  paexp_tag           text,            -- PAEXP-[expiry] when the relied-on version was lapsed at invoice date
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_label, invoice_number, line_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_reaudit_run
  ON public.invoice_line_reaudit (run_label, classification);
