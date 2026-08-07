-- 218 — vendor payment memos: raw ledger + paid-verified driver (Chris 2026-08-06).
-- Applied to prod 2026-08-06.
--
-- Monthly vendor payment memos (ABC's Billtrust "payment details" PDF today)
-- list every invoice paid in full in that cycle. Design per Chris: a RAW,
-- VENDOR-AGNOSTIC table pair captures the memo exactly as received, keyed by
-- (vendor_slug, invoice_number); the working table (invoice_payment_processed)
-- is then populated FROM the raw rows — never directly from a parse.
--
-- Flow (docs/86): memo PDF → Maya (or human) extracts rows → POST
-- /api/accounting/payment-memos/process → inserts memo + lines →
-- vendor_payment_memo_apply() transitions invoice_payment_processed to
-- paid_verified and stamps a per-line outcome. Idempotent: same confirmation
-- number re-processes without duplication; a re-run yields 'already_verified'.
--
-- Outcomes: verified · verified_inserted (no prior pipeline row — memo is the
-- first payment evidence) · already_verified · credit_applied (negative rows =
-- credit-memo documents used in the payment; recorded raw, no working-table
-- write yet) · skipped_returned / skipped_void (never resurrect those) ·
-- not_in_mirror (unknown document — human attention) · vendor_not_supported
-- (non-ABC until the generic vendor_invoices pipeline lands, docs/79).

CREATE TABLE IF NOT EXISTS public.vendor_payment_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_slug text NOT NULL,
  confirmation_number text NOT NULL,
  account_number text,
  payment_method text,
  payment_date date,
  subtotal_amount numeric,
  discount_applied numeric,
  credit_memo_amount numeric,
  processing_fee numeric,
  total_payment_amount numeric,
  source_file text,
  linear_issue text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_summary jsonb,
  UNIQUE (vendor_slug, confirmation_number)
);

CREATE TABLE IF NOT EXISTS public.vendor_payment_memo_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  memo_id uuid NOT NULL REFERENCES public.vendor_payment_memos(id),
  vendor_slug text NOT NULL,
  invoice_number text NOT NULL,
  po_number text,
  document_date date,
  payment_amount numeric,
  outcome text,
  outcome_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memo_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_vpml_vendor_invoice
  ON public.vendor_payment_memo_lines (vendor_slug, invoice_number);

CREATE OR REPLACE FUNCTION public.vendor_payment_memo_apply(
  p_vendor text, p_confirmation text, p_actor text
) RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
  v_memo record;
  v_line record;
  v_row record;
  v_outcome text;
  v_now timestamptz := now();
  v_counts jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_memo FROM public.vendor_payment_memos
  WHERE vendor_slug = p_vendor AND confirmation_number = p_confirmation;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'memo_not_found');
  END IF;

  FOR v_line IN
    SELECT * FROM public.vendor_payment_memo_lines
    WHERE memo_id = v_memo.id ORDER BY id
  LOOP
    IF p_vendor <> 'abc-supply' THEN
      v_outcome := 'vendor_not_supported';
    ELSIF v_line.payment_amount < 0 THEN
      v_outcome := 'credit_applied';
    ELSIF NOT EXISTS (SELECT 1 FROM public.abc_invoices i WHERE i.invoice_number = v_line.invoice_number) THEN
      v_outcome := 'not_in_mirror';
    ELSE
      SELECT * INTO v_row FROM public.invoice_payment_processed
      WHERE invoice_number = v_line.invoice_number
      ORDER BY created_at DESC LIMIT 1;
      IF NOT FOUND THEN
        INSERT INTO public.invoice_payment_processed
          (batch_id, vendor, invoice_number, status, csv_file_name, csv_row,
           processed_by, paid_at, paid_source, verified_at, verified_by)
        VALUES
          (v_memo.id, 'ABC Supply', v_line.invoice_number, 'paid_verified',
           COALESCE(v_memo.source_file, 'vendor_payment_memo/' || v_memo.confirmation_number),
           jsonb_build_object('payment_memo', v_memo.confirmation_number,
                              'payment_amount', v_line.payment_amount,
                              'po_number', v_line.po_number),
           p_actor, v_memo.payment_date, 'vendor_payment_memo', v_now, p_actor);
        v_outcome := 'verified_inserted';
      ELSIF v_row.status = 'paid_verified' THEN
        v_outcome := 'already_verified';
      ELSIF v_row.status IN ('returned', 'void') THEN
        v_outcome := 'skipped_' || v_row.status;
      ELSE
        UPDATE public.invoice_payment_processed
        SET status = 'paid_verified',
            paid_at = COALESCE(paid_at, v_memo.payment_date),
            paid_source = COALESCE(paid_source, 'vendor_payment_memo'),
            verified_at = v_now, verified_by = p_actor, updated_at = v_now
        WHERE id = v_row.id;
        v_outcome := 'verified';
      END IF;
    END IF;

    UPDATE public.vendor_payment_memo_lines
    SET outcome = v_outcome, outcome_at = v_now
    WHERE id = v_line.id;
    v_counts := jsonb_set(v_counts, ARRAY[v_outcome],
      to_jsonb(COALESCE((v_counts->>v_outcome)::int, 0) + 1));
  END LOOP;

  UPDATE public.vendor_payment_memos
  SET processed_at = v_now, processing_summary = v_counts
  WHERE id = v_memo.id;

  INSERT INTO public.dashboard_action_log
    (work_key, action_type, actor_display_name, actor_id, actor_type, decision,
     department, payload, source_pk, source_table, workflow)
  VALUES
    ('payment-memo:' || p_vendor || ':' || p_confirmation,
     'vendor_payment_memo_applied', p_actor, p_actor, 'agent', 'mark_done',
     'accounting',
     jsonb_build_object('vendor', p_vendor, 'confirmation', p_confirmation,
                        'summary', v_counts),
     v_memo.id::text, 'vendor_payment_memos', 'payment-memo');

  RETURN jsonb_build_object('ok', true, 'memo_id', v_memo.id, 'summary', v_counts);
END $function$;
