-- 291 — ABC branch 326 (Topeka, KS): re-key the vendor_branches row, resolve its invoice, add aliases.
--
-- The Topeka row came from the 2026-05-27 location import keyed 'topeka-KS-66618-1445'.
-- Isochrone containment had already assigned it to Kansas City, MO (pricing_status =
-- covered) — the drive-time rule worked. What did not work is identity:
--   · Since mig 243, an ABC invoice resolves its branch AT INGEST through
--     vendor_branch_alias (alias_key → vendor_branch_id) into abc_invoices.vendor_branch_id,
--     and v_invoice_pricing_office joins on that FK. mig 243 seeded aliases only for rows
--     whose branch_number was numeric; the slug-keyed Topeka row got none. So invoice
--     2014501859-001 (PO KS-218, 2026-09-14) ingested with vendor_branch_id NULL, resolved
--     to no office, and every line read No-Price.
--   · The map page looks the branch up by the bare number, found no row, and showed
--     "Kansas City · suggested / Not yet assigned"; its Save button would have stamped the
--     slug row and left the FK NULL. (docs/109 F42)
-- Chris 2026-09-15: "ship it as migration 291".
--
-- Applied to prod in three statements (291, 291b, 291c) with the matview refresh between the
-- FK backfill and the reopen, because REFRESH ... CONCURRENTLY cannot run inside a transaction.
-- Additive + idempotent throughout. Rollback: none needed — the row keeps its id, office and
-- history; the aliases are ON CONFLICT DO NOTHING; the reopen rows are audit history.

-- 1 · re-key the row to the bare ABC branch number (mig 239 convention)
UPDATE public.vendor_branches vb
SET branch_number = '326',
    notes = COALESCE(vb.notes || ' · ', '') || 'mig 291 (2026-09-15): re-keyed from topeka-KS-66618-1445 to the bare ABC branch number so the pricing join resolves it',
    updated_at = now()
FROM public.vendors v
WHERE v.id = vb.vendor_id AND v.slug = 'abc-supply'
  AND vb.branch_number = 'topeka-KS-66618-1445';

-- 2 · resolve the invoice(s) that ingested before the row had a usable key
UPDATE public.abc_invoices i
SET vendor_branch_id = vb.id
FROM public.vendor_branches vb
JOIN public.vendors v ON v.id = vb.vendor_id AND v.slug = 'abc-supply'
WHERE vb.branch_number = '326'
  AND i.vendor_branch_id IS NULL
  AND ltrim(i.branch_number_extracted, '0') = '326';

-- 3 · aliases in both spellings the sources use (mig 243 §3), so the NEXT 326 invoice
--     resolves at ingest without anyone touching it
INSERT INTO public.vendor_branch_alias (vendor_id, alias_key, alias_raw, vendor_branch_id, status, source, decided_by)
SELECT vb.vendor_id, public.vendor_branch_alias_key(s.spelling), s.spelling, vb.id,
       'resolved', 'migration-291 branch 326 re-keyed (Topeka, KS)', 'agent'
  FROM public.vendor_branches vb
  JOIN public.vendors ven ON ven.id = vb.vendor_id AND ven.slug = 'abc-supply'
  CROSS JOIN (VALUES ('326'), ('0326')) AS s(spelling)
 WHERE vb.branch_number = '326'
ON CONFLICT (vendor_id, alias_key) DO NOTHING;

-- 4 · refresh the pricing chain (served by pg_cron job 15 within a minute; run outside a txn)
SELECT public.request_matview_refresh('mv_invoice_audit_line', 'mig 291 — branch 326 re-keyed');

-- 5 · after the refresh: the five lines Alex stamped No-Price at 07:30 this morning — before
--     mig 289 existed — go back to pending where the Kansas City list now prices them over
--     agreement (05ABCPG20 $0.79, 06MHSAB $20.16, GRV20ML $10.70 via the fuzzy arm). Same guard as migs 289/290.
INSERT INTO public.invoice_line_audit
  (invoice_line_id, invoice_number, vendor_slug, item_number, audit_status, decision, approved_by,
   approval_note, source, decided_at, decided_by)
SELECT a.invoice_line_id, a.invoice_number, 'abc-supply', a.item_number, 'pending', 'reopened', 'System',
       'Reopened 2026-09-15 (mig 291): branch 326 was re-keyed so the Kansas City list now prices this line over agreement; the earlier No-Price stamp was written with no office resolved',
       'pipeline_v2', now(), 'System'
FROM public.v_invoice_line_audit_current a
JOIN public.mv_invoice_audit_line m ON m.line_id = a.invoice_line_id
WHERE a.invoice_number = '2014501859-001'
  AND a.decided_by = 'Alex' AND a.approval_note LIKE 'No-Price reviewed by Alex%'
  AND m.negotiated_price IS NOT NULL AND m.variance_pct > 0;

-- Follow-up (not in this migration): 685 of 761 ABC vendor_branches rows still carry slug keys
-- from the May import and 25 numeric rows have a same-city slug twin from mig 239's inserts.
-- Any of them that starts invoicing will hit this same gap until it is re-keyed or aliased.
