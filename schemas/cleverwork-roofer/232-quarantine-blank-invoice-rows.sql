-- 232 — quarantine blank-invoice-number rows out of abc_invoices (PEC-215).
-- Applied to prod 2026-08-18.
--
-- The abc_csv_history backfill ingested a CSV totals/footer line as if it were an
-- invoice: blank invoice_number AND invoice_id, NULL invoice_date, ZERO invoice
-- lines, total_amount $59,639.20, ar_status 'paid'. Damage measured 2026-08-18:
--   * ABC spend read $2,257,064.14 vs $2,197,424.94 real — a +2.7% overstatement
--     on every unfiltered sum of abc_invoices
--   * the row reached v_invoice_audit_invoice and v_invoice_acculynx_match, so
--     invoice-audit-tree.ts fired /api/invoice-audit/invoice?invoiceNumber=
--     (empty param) → a 404 on EVERY Invoice Audit page load
--   * migration 230 already had to work around it (invoice_number <> '')
--
-- Fixing this at the source rather than in the views is deliberate: every consumer
-- reads abc_invoices, so one move corrects sums, views, audit surfaces and exports
-- at once — versus editing several very large view definitions and still leaving
-- raw SUM() queries wrong.
--
-- The atom is PRESERVED, not destroyed (hard rule 1: archive, never delete). It
-- moves to abc_invoices_quarantine with its full `raw` payload, following the
-- existing crm_pipeline_orphan_quarantine pattern. Fully reversible — the restore
-- statement is in the rollback note at the bottom.
--
-- Additive + idempotent: safe to re-run (the move is a no-op once drained).

-- 1. Quarantine table. CTAS so the generated ship_to_name column (mig 231)
--    materializes as a plain column and stays insertable.
CREATE TABLE IF NOT EXISTS public.abc_invoices_quarantine AS
  SELECT * FROM public.abc_invoices WHERE false;

ALTER TABLE public.abc_invoices_quarantine
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS quarantine_reason text;

-- 2. Move every blank-invoice-number row (today: exactly one).
INSERT INTO public.abc_invoices_quarantine
SELECT i.*, now(), 'PEC-215: blank invoice_number/invoice_id, no lines — CSV totals row ingested via abc_csv_history'
FROM public.abc_invoices i
WHERE COALESCE(btrim(i.invoice_number), '') = '';

DELETE FROM public.abc_invoices
WHERE COALESCE(btrim(invoice_number), '') = '';

-- 3. Fail closed on recurrence. The nightly API sync always carries an invoice
--    number, so this only ever trips on another malformed CSV-history import —
--    where a loud failure is correct and silent money corruption is not.
ALTER TABLE public.abc_invoices
  DROP CONSTRAINT IF EXISTS abc_invoices_invoice_number_not_blank;
ALTER TABLE public.abc_invoices
  ADD CONSTRAINT abc_invoices_invoice_number_not_blank
  CHECK (COALESCE(btrim(invoice_number), '') <> '');

-- Rollback:
--   ALTER TABLE public.abc_invoices DROP CONSTRAINT abc_invoices_invoice_number_not_blank;
--   INSERT INTO public.abc_invoices
--     SELECT (q.*)::public.abc_invoices FROM public.abc_invoices_quarantine q;  -- drops the 2 metadata cols
