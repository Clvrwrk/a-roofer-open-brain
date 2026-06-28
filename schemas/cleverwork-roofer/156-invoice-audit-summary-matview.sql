-- 156 — Materialized rollup cache for invoice audit summary (Supabase perf plan)
-- Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY after invoice sync jobs.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_invoice_audit_summary AS
SELECT
  ail.invoice_number,
  COUNT(*) AS line_count,
  COUNT(*) FILTER (WHERE ail.variance_pct IS NOT NULL AND ABS(ail.variance_pct) >= 0.06) AS lines_over_6pct,
  COUNT(*) FILTER (WHERE ail.variance_pct IS NOT NULL AND ABS(ail.variance_pct) >= 0.03 AND ABS(ail.variance_pct) < 0.06) AS lines_3_to_6pct
FROM public.v_invoice_audit_line ail
GROUP BY ail.invoice_number
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_invoice_audit_summary_invoice
  ON public.mv_invoice_audit_summary (invoice_number);

COMMENT ON MATERIALIZED VIEW public.mv_invoice_audit_summary IS
  'Cached invoice-level audit rollups; refresh after ABC invoice sync.';

GRANT SELECT ON public.mv_invoice_audit_summary TO service_role;
