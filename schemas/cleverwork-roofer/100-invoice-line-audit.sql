-- 100-invoice-line-audit.sql
-- Line-level invoice audit history: every line gets an audit decision, recorded
-- forever (append-only). Latest row per line = current status. Additive +
-- idempotent. Applied live as migrations `invoice_line_audit` (DDL) + a one-time
-- backfill DML (recorded at the bottom as a comment — do not re-run blindly; the
-- INSERTs are NOT EXISTS-guarded so re-running is safe but unnecessary).
--
-- Auto-pass rule: a line whose invoice price exactly matches the negotiated price
-- of a price agreement COVERING the invoice date (effective→expiry window) is
-- audit-passed by System with note "Matched Negotiated Price" and the agreement
-- id + dates + current/inactive status. Expiration handling reuses the existing
-- staleness/expiry model (schema 71 + abc-price-gaps): agreement_current is false
-- once current_date passes expiry_date, and agreement_inactive_date records it.

CREATE TABLE IF NOT EXISTS public.invoice_line_audit (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_line_id         uuid REFERENCES public.abc_invoice_lines(id) ON DELETE CASCADE,
  invoice_number          text NOT NULL,
  item_number             text,
  audit_status            text NOT NULL DEFAULT 'passed' CHECK (audit_status IN ('passed','pending','disputed')),
  decision                text,
  approved_by             text NOT NULL,              -- 'System' | 'Lucinda' | operator
  approval_note           text,
  price_agreement_id      integer REFERENCES public.abc_price_agreements(id) ON DELETE SET NULL,
  agreement_effective_date date,
  agreement_expiry_date   date,
  agreement_current       boolean,
  agreement_inactive_date date,
  source                  text NOT NULL CHECK (source IN ('auto_match','manual','backfill')),
  decided_at              timestamptz NOT NULL DEFAULT now(),
  decided_by              text,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_line_audit_line ON public.invoice_line_audit(invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_audit_invoice ON public.invoice_line_audit(invoice_number);

ALTER TABLE public.invoice_line_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_line_audit_service ON public.invoice_line_audit;
CREATE POLICY invoice_line_audit_service ON public.invoice_line_audit FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS invoice_line_audit_read ON public.invoice_line_audit;
CREATE POLICY invoice_line_audit_read ON public.invoice_line_audit FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.v_invoice_line_audit_eval AS
WITH m AS (
  SELECT DISTINCT ON (l.id)
    l.id AS invoice_line_id, l.invoice_number, l.item_number,
    i.invoice_date,
    l.unit_price::numeric AS unit_price,
    pa.id AS agreement_id, pa.effective_date, pa.expiry_date,
    pli.unit_price::numeric AS negotiated_price,
    (current_date >= pa.effective_date AND (pa.expiry_date IS NULL OR current_date <= pa.expiry_date)) AS agreement_current
  FROM public.abc_invoice_lines l
  JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
  JOIN public.abc_price_agreement_branch_matches bm ON bm.ship_to_number = i.ship_to_number
  JOIN public.abc_price_agreements pa ON pa.id = bm.abc_price_agreement_id
  JOIN public.abc_price_list_items pli ON pli.agreement_id = pa.id AND pli.item_number = l.item_number
  WHERE i.invoice_date >= pa.effective_date AND (pa.expiry_date IS NULL OR i.invoice_date <= pa.expiry_date)
  ORDER BY l.id, bm.confidence_score DESC NULLS LAST, pli.unit_price ASC
)
SELECT m.*,
  round(abs(m.unit_price - m.negotiated_price), 2) AS price_diff,
  (round(m.unit_price, 2) = round(m.negotiated_price, 2)) AS price_matches
FROM m;

CREATE OR REPLACE VIEW public.v_invoice_line_audit_current AS
SELECT DISTINCT ON (invoice_line_id) *
FROM public.invoice_line_audit
ORDER BY invoice_line_id, decided_at DESC, created_at DESC;

-- One-time backfill (already run live; NOT EXISTS-guarded, safe to re-run):
--   1) Pre-2026 lines → 'passed' by Lucinda, source 'backfill', decided_at = invoice_date.
--   2) 2026 lines where v_invoice_line_audit_eval.price_matches → 'passed' by System,
--      'Matched Negotiated Price', with agreement id + dates + current/inactive.
-- See context/memory/2026-06-17.md Session 17 for the exact INSERTs.
