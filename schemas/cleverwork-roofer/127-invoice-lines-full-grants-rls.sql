-- 127-invoice-lines-full-grants-rls.sql
-- Security posture for the Phase-2 completion objects (migs 124-126). Additive, idempotent.
-- RLS on abc_invoice_lines_full mirrors the ABC mirror tables (service_role full, authenticated read).
-- SELECT grants let the same read paths reach the new table + complete-line view as abc_invoice_lines.

ALTER TABLE public.abc_invoice_lines_full ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS abc_invoice_lines_full_service ON public.abc_invoice_lines_full;
CREATE POLICY abc_invoice_lines_full_service ON public.abc_invoice_lines_full FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS abc_invoice_lines_full_read ON public.abc_invoice_lines_full;
CREATE POLICY abc_invoice_lines_full_read ON public.abc_invoice_lines_full FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.abc_invoice_lines_full TO authenticated, service_role;
GRANT SELECT ON public.v_invoice_lines_complete TO anon, authenticated, service_role;
