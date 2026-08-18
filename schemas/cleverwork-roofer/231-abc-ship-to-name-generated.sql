-- 231 — abc_invoices.ship_to_name as a STORED generated column (PEC-214).
-- Applied to prod 2026-08-18.
--
-- The QB bank export needs to recognise Commercial invoices to source their
-- Check No from the invoice's Customer PO# (Chris, 2026-08-18). The ship-to
-- name already rides in the ABC payload at raw->'shipTo'->>'name' — structured
-- source before OCR — but reading it in the API would mean selecting the whole
-- `raw` blob (which carries every invoice line) for thousands of invoices.
--
-- A STORED generated column gives the API a cheap scalar to select and keeps
-- the rule expressed by MEANING ('Commercial') rather than by the magic ship-to
-- number 2036874-17, which would silently miss a second Commercial ship-to if
-- ABC ever adds one. jsonb operators are immutable, so the expression is legal
-- in a generated column and can never drift from raw.
--
-- Additive + idempotent. Backfills automatically for all existing rows.

ALTER TABLE public.abc_invoices
  ADD COLUMN IF NOT EXISTS ship_to_name text
  GENERATED ALWAYS AS (raw->'shipTo'->>'name') STORED;

CREATE INDEX IF NOT EXISTS abc_invoices_ship_to_name_idx
  ON public.abc_invoices (ship_to_name);
