-- 229: Alex No-Price triage (PEC-195, A3 approved 2026-08-09).
-- Rule (Chris): ALL No-Price audits are Alex's job. An item purchased 2+ times in
-- the calendar year for the same (vendor, PE office) is an agreement-gap candidate —
-- it enters the Agreement Builder queue as an item to consider for the GLOBAL
-- PRODUCT FILE (the base standard for all negotiated price lists). Everything else
-- auto-approves as Alex. Additive + idempotent.

-- Calendar-year purchase aggregates over No-Price lines, per (vendor, office, item).
CREATE OR REPLACE VIEW public.v_no_price_repeats AS
SELECT
  vv.vendor_slug,
  i.office,
  l.item_number,
  max(l.item_description) AS item_description,
  count(*)::integer AS purchases_ytd,
  round(sum(l.extended_price)::numeric, 2) AS spend_ytd,
  max(i.invoice_date)::date AS last_purchase
FROM public.v_invoice_audit_line l
JOIN public.v_invoice_audit_invoice i ON i.invoice_number = l.invoice_number
JOIN public.v_invoice_audit_invoice_vendor vv ON vv.invoice_number = l.invoice_number
WHERE l.negotiated_price IS NULL
  AND l.is_auditable IS NOT FALSE
  AND COALESCE(i.is_credit_memo, false) = false
  AND i.invoice_date >= date_trunc('year', now())
  AND COALESCE(i.office, '') <> ''
  AND COALESCE(l.item_number, '') <> ''
GROUP BY 1, 2, 3;

-- The Agreement Builder review queue: one row per (vendor, office, item) candidate.
-- Lifecycle: candidate -> in_review -> agreement_created | dismissed. Counts refresh
-- on every Alex pass; status transitions are the only human writes.
CREATE TABLE IF NOT EXISTS public.agreement_gap_queue (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vendor_slug       text NOT NULL,
  office            text NOT NULL,
  item_number       text NOT NULL,
  item_description  text,
  purchases_ytd     integer NOT NULL,
  spend_ytd         numeric(14,2),
  last_purchase     date,
  status            text NOT NULL DEFAULT 'candidate'
                    CHECK (status IN ('candidate','in_review','agreement_created','dismissed')),
  status_by         text,
  status_note       text,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_slug, office, item_number)
);

CREATE INDEX IF NOT EXISTS agreement_gap_queue_status_idx
  ON public.agreement_gap_queue (status, vendor_slug, office);
