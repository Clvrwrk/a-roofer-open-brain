-- 290 — reopen the six June lines mig 289 deliberately left closed.
--
-- mig 289 reopened the over-agreement lines that Alex's triage had stamped No-Price
-- against a stale office matview, but skipped six June lines because the invoices
-- they sit on had credit-memo requests a human cancelled (KS-173/174/176/177/167).
-- Chris, 2026-09-15: "please put the six lines back in line for another audit pass."
-- The cancelled requests stay cancelled (a human cancellation is a decision); only
-- the LINES go back to pending so the audit pass can judge them on their merits.
--
-- Idempotent: inserts only while the line's current row is still the stale Alex stamp
-- and the audit view still prices the line over agreement. History, not deletion.
-- Rollback: a human "Go back" / valid decision on each line.
INSERT INTO public.invoice_line_audit
  (invoice_line_id, invoice_number, vendor_slug, item_number, audit_status, decision, approved_by,
   approval_note, source, decided_at, decided_by)
SELECT a.invoice_line_id, a.invoice_number, 'abc-supply', a.item_number, 'pending', 'reopened', 'System',
       'Reopened 2026-09-15 (mig 290, Chris): the Alex No-Price stamp was written before the office pricing matview knew this invoice; the audit now prices this line over agreement — another audit pass requested',
       'pipeline_v2', now(), 'System'
FROM public.v_invoice_line_audit_current a
JOIN public.mv_invoice_audit_line m ON m.line_id = a.invoice_line_id
WHERE a.invoice_line_id IN (
  'ec3c2a64-6d15-4af1-8b7d-0e3598c2cf77',  -- 2011009179-001 17LO750GSB  $20.00
  '76213a5f-04ac-40e6-ba33-6a5890d58b16',  -- 2011010454-001 17LO750GSZ  $30.00
  '82512274-60f5-45a9-9165-2d6a2e10c56f',  -- 2011010454-001 GAFNR441TB  $9.00
  'a54879f1-d8a5-48a1-9493-41ffd44c2851',  -- 2011012396-001 17LO750GSK  $30.00
  'afbfa3ce-2717-492c-bcd0-dd864a196581',  -- 2011014809-001 17LO750GSZ  $40.00
  '68d8fa65-4311-4e8e-9af4-dd0d123b0bd6'   -- 2011017518-001 17AVVG55FB  $48.00
)
  AND a.decided_by = 'Alex' AND a.approval_note LIKE 'No-Price reviewed by Alex%'
  AND m.negotiated_price IS NOT NULL AND m.variance_pct > 0;
