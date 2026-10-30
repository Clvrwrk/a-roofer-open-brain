-- 254 — vendor_invoices.po_number becomes the canonical AccuLynx job number
-- (Chris, 2026-08-21: "review and pull acculynx job# and replace the PO Number").
-- Additive + idempotent.
--
-- Vendors type the PE job code by hand, so the printed PO drifts: "co-356", "CO357",
-- "KS 147", "KS189", "TX-455-2". v_vendor_invoice_acculynx_match already tolerates that
-- (it tokenizes on ^[A-Za-z]{2}\s*-?\s*[0-9]+), but every OTHER reader of po_number sees
-- the raw string, so the job key is only as good as the vendor's typing. This normalizes
-- the column to the job number AccuLynx actually holds.
--
-- The vendor's printed PO is PRESERVED at raw.po_number_as_printed, never discarded — it
-- is what you cite back to the vendor in a dispute, and hard rule 1 is archive-never-delete.
-- COALESCE means a re-run cannot overwrite the original with an already-normalized value.
--
-- Matching survives the rewrite: 'KS-208' tokenizes to KS208, which is exactly the token
-- derived from job_name 'KS-208: Elaine Suderman'. Rows where po_number already equals the
-- job number (28 of them) are untouched by the WHERE clause.

-- ── 1 · the 7 drifted-but-already-matched rows ────────────────────────────────
UPDATE public.vendor_invoices vi
SET raw = COALESCE(vi.raw, '{}'::jsonb)
          || jsonb_build_object('po_number_as_printed',
               COALESCE(vi.raw->>'po_number_as_printed', vi.po_number))
          || jsonb_build_object('po_number_source', 'acculynx_job_number (migration 254)'),
    po_number = m.pe_job_number,
    updated_at = now()
FROM public.v_vendor_invoice_acculynx_match m
WHERE m.invoice_number = vi.invoice_number
  AND m.matched
  AND m.pe_job_number IS NOT NULL
  AND vi.po_number IS DISTINCT FROM m.pe_job_number;

-- ── 2 · 0050471744-001 -> KS-208, on address evidence ─────────────────────────
-- The PDF truncates PO NUMBER at 16 chars ("216 SOUTH MADISO") and its JOB NUMBER column
-- carries the street rather than a code, so the token matcher had nothing to bite on.
-- AccuLynx KS-208 (Elaine Suderman) is at 216 South Madison Street, Hillsboro, KS 67063 —
-- an exact street/city/state match to this invoice's SHIP TO. Wichita, KS office; the job
-- is at milestone Approved.
UPDATE public.vendor_invoices
SET raw = COALESCE(raw, '{}'::jsonb)
          || jsonb_build_object('po_number_as_printed', COALESCE(raw->>'po_number_as_printed', po_number))
          || jsonb_build_object('po_number_source',
               'acculynx_job_number (migration 254) — resolved from SHIP TO 216 South Madison Street, Hillsboro KS 67063 = AccuLynx KS-208 (Elaine Suderman); PDF had truncated the PO to 16 chars'),
    po_number = 'KS-208',
    updated_at = now()
WHERE invoice_number = '0050471744-001'
  AND po_number = '216 SOUTH MADISO';

-- ── 3 · 0050708886-001 -> TX-455, on Chris's instruction ──────────────────────
-- Printed PO reads "tx-4555"; no TX-4555 job exists, and TX-455 (Debra Moore) is referenced
-- by the other two documents in the same delivery batch. Chris confirmed the assignment on
-- 2026-08-21 — recorded as a human decision, not an inferred one.
UPDATE public.vendor_invoices
SET raw = COALESCE(raw, '{}'::jsonb)
          || jsonb_build_object('po_number_as_printed', COALESCE(raw->>'po_number_as_printed', po_number))
          || jsonb_build_object('po_number_source',
               'acculynx_job_number (migration 254) — vendor typed "tx-4555"; no such job. Chris assigned TX-455 (Debra Moore) on 2026-08-21.'),
    po_number = 'TX-455',
    updated_at = now()
WHERE invoice_number = '0050708886-001'
  AND po_number = 'tx-4555';

-- ── 4 · assert ────────────────────────────────────────────────────────────────
DO $$
DECLARE drift int; unmatched_with_po int; lost int;
BEGIN
  SELECT count(*) INTO drift
  FROM public.v_vendor_invoice_acculynx_match
  WHERE matched AND purchase_order_number IS DISTINCT FROM pe_job_number;
  IF drift <> 0 THEN
    RAISE EXCEPTION '254 % matched invoice(s) still carry a PO that differs from the job number', drift;
  END IF;

  SELECT count(*) INTO unmatched_with_po
  FROM public.v_vendor_invoice_acculynx_match
  WHERE NOT matched AND purchase_order_number IS NOT NULL;
  IF unmatched_with_po <> 0 THEN
    RAISE EXCEPTION '254 % invoice(s) carry a PO but still match no AccuLynx job', unmatched_with_po;
  END IF;

  SELECT count(*) INTO lost
  FROM public.vendor_invoices
  WHERE raw ? 'po_number_source' AND COALESCE(raw->>'po_number_as_printed','') = '';
  IF lost <> 0 THEN
    RAISE EXCEPTION '254 % row(s) lost the vendor-printed PO', lost;
  END IF;

  RAISE NOTICE '254 ok — po_number is the canonical AccuLynx job number; printed PO preserved';
END $$;
