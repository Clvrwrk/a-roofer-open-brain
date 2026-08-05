-- 206 — re-open legacy agent/system passes on variance lines (docs/83 decision 4).
-- Applied to prod 2026-08-05.
--
-- Chris 2026-08-05: agents may only pass lines at-or-under the agreement price;
-- positive-variance and UOM-mismatch lines require a human. Historically, backfill
-- and agent runs "passed" 288 such lines (System 195 + Alex 93), masking ~$10.4k of
-- variance from the audit. Human decisions (Lucinda, accounting@) are untouched.
--
-- Append-only (hard rule 1): each affected line gets a NEW 'pending' row in the
-- invoice_line_audit history — nothing is updated or deleted. Idempotent: skips
-- lines whose CURRENT status is already pending.
INSERT INTO public.invoice_line_audit
  (invoice_line_id, invoice_number, item_number, audit_status, decision,
   approved_by, approval_note, source, decided_by)
SELECT c.invoice_line_id, c.invoice_number, c.item_number, 'pending', 'reopened',
       'System',
       'Reopened 2026-08-05: agent/system pass on an over-agreement or UOM-mismatch line — human review required (docs/83 decision 4)',
       'pipeline_v2', 'System'
FROM public.v_invoice_line_audit_current c
JOIN public.v_invoice_audit_line l ON l.line_id = c.invoice_line_id
WHERE c.audit_status = 'passed'
  AND c.decided_by IN ('System', 'Alex')
  AND (l.uom_mismatch OR (l.negotiated_price IS NOT NULL AND l.variance_ext > 0.05));
