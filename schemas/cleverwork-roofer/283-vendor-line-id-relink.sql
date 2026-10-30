-- 283 — re-link audit history orphaned by vendor-line re-ingests (2026-09-01).
--
-- The SRS/QXO CSV ingest replaces an invoice's lines on re-parse (delete+insert,
-- docs/80). Until today the fresh rows took RANDOM uuids, so every weekly
-- re-ingest of the open-invoice export orphaned the audit ledger rows keyed to
-- the old line ids — 33 SRS invoices / 211 invoice_line_audit decisions and 228
-- invoice_line_reaudit rows re-presented as brand-new work (Chris caught
-- 0050033288-003: audited 2026-08-09, "new" again 2026-09-01).
--
-- Fix has two halves:
--   1. The ingest script now derives each line id deterministically from
--      (invoice_id, line_number) — future re-parses keep their ids
--      (integrations/bridges/ingest-vendor-invoice-csv.mjs).
--   2. This migration: vendor_line_relink() re-points orphaned ledger rows at
--      the current line ids. Pairing is conservative: within one
--      (vendor, invoice, item_number) group, the k-th DISTINCT old line id
--      (by first appearance) maps to the k-th current line (by line_number);
--      rows sharing an old id move together (a line's decision history stays
--      one line's history). Anything that cannot be paired 1:1 is left alone —
--      visible as still-pending is safer than silently mislinked.
--
-- Idempotent and additive (hard rule 1): re-running finds no orphans and
-- changes nothing. Safe to call after any future backfill.

create or replace function public.vendor_line_relink()
returns jsonb
language plpgsql
as $function$
DECLARE
  v_audit int := 0; v_reaudit int := 0; v_threads int := 0;
BEGIN
  -- ── invoice_line_audit ────────────────────────────────────────────────────
  WITH cur AS (
    SELECT ven.slug AS vendor_slug, vi.invoice_number, l.id AS line_id, l.item_number,
           row_number() OVER (PARTITION BY ven.slug, vi.invoice_number, l.item_number
                              ORDER BY l.line_number) AS rn
    FROM public.vendor_invoice_lines l
    JOIN public.vendor_invoices vi ON vi.id = l.invoice_id
    JOIN public.vendors ven ON ven.id = vi.vendor_id
  ), old_ids AS (
    SELECT a.vendor_slug, a.invoice_number, a.item_number, a.invoice_line_id AS old_id,
           row_number() OVER (PARTITION BY a.vendor_slug, a.invoice_number, a.item_number
                              ORDER BY min(a.created_at), a.invoice_line_id) AS rn
    FROM public.invoice_line_audit a
    WHERE EXISTS (SELECT 1 FROM public.vendor_invoices vi
                  JOIN public.vendors ven ON ven.id = vi.vendor_id
                  WHERE vi.invoice_number = a.invoice_number AND ven.slug = a.vendor_slug)
      AND NOT EXISTS (SELECT 1 FROM public.vendor_invoice_lines l
                      WHERE l.id::text = a.invoice_line_id)
    GROUP BY a.vendor_slug, a.invoice_number, a.item_number, a.invoice_line_id
  ), mapping AS (
    SELECT o.old_id, c.line_id AS new_id
    FROM old_ids o
    JOIN cur c ON c.vendor_slug = o.vendor_slug
              AND c.invoice_number = o.invoice_number
              AND c.item_number IS NOT DISTINCT FROM o.item_number
              AND c.rn = o.rn
  )
  UPDATE public.invoice_line_audit a
  SET invoice_line_id = m.new_id::text
  FROM mapping m
  WHERE a.invoice_line_id = m.old_id;
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  -- ── invoice_line_reaudit ──────────────────────────────────────────────────
  WITH cur AS (
    SELECT ven.slug AS vendor_slug, vi.invoice_number, l.id AS line_id, l.item_number,
           row_number() OVER (PARTITION BY ven.slug, vi.invoice_number, l.item_number
                              ORDER BY l.line_number) AS rn
    FROM public.vendor_invoice_lines l
    JOIN public.vendor_invoices vi ON vi.id = l.invoice_id
    JOIN public.vendors ven ON ven.id = vi.vendor_id
  ), old_ids AS (
    SELECT r.vendor_slug, r.invoice_number, r.item_number, r.line_id AS old_id,
           row_number() OVER (PARTITION BY r.vendor_slug, r.invoice_number, r.item_number
                              ORDER BY min(r.created_at), r.line_id::text) AS rn
    FROM public.invoice_line_reaudit r
    WHERE EXISTS (SELECT 1 FROM public.vendor_invoices vi
                  JOIN public.vendors ven ON ven.id = vi.vendor_id
                  WHERE vi.invoice_number = r.invoice_number AND ven.slug = r.vendor_slug)
      AND NOT EXISTS (SELECT 1 FROM public.vendor_invoice_lines l
                      WHERE l.id::text = r.line_id::text)
    GROUP BY r.vendor_slug, r.invoice_number, r.item_number, r.line_id
  ), mapping AS (
    SELECT o.old_id, c.line_id AS new_id
    FROM old_ids o
    JOIN cur c ON c.vendor_slug = o.vendor_slug
              AND c.invoice_number = o.invoice_number
              AND c.item_number IS NOT DISTINCT FROM o.item_number
              AND c.rn = o.rn
  )
  UPDATE public.invoice_line_reaudit r
  SET line_id = m.new_id
  FROM mapping m
  WHERE r.line_id = m.old_id;
  GET DIAGNOSTICS v_reaudit = ROW_COUNT;

  -- ── communication_threads (rare; ride the audit table's authoritative link) ─
  UPDATE public.communication_threads c
  SET invoice_line_id = a.invoice_line_id
  FROM public.invoice_line_audit a
  WHERE c.invoice_number = a.invoice_number
    AND c.invoice_line_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.vendor_invoice_lines l
                    WHERE l.id::text = c.invoice_line_id)
    AND EXISTS (SELECT 1 FROM public.vendor_invoices vi
                WHERE vi.invoice_number = c.invoice_number)
    AND a.invoice_line_id IN (SELECT l.id::text FROM public.vendor_invoice_lines l
                              JOIN public.vendor_invoices vi ON vi.id = l.invoice_id
                              WHERE vi.invoice_number = c.invoice_number);
  GET DIAGNOSTICS v_threads = ROW_COUNT;

  RETURN jsonb_build_object('ok', true,
    'audit_relinked', v_audit, 'reaudit_relinked', v_reaudit, 'threads_relinked', v_threads);
END $function$;

select public.vendor_line_relink();
