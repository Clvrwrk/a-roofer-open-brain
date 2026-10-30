-- 247 — write the docs/93 re-audit verdict back to prod.
-- Additive + idempotent. Status transitions + a packet provenance key. No deletes.
--
-- docs/93 (PEC-219) re-derived all 53 open credit-memo requests three times with three
-- independent models, unanimous 3/3: 50 uphold, 1 adjust, 2 withdraw. The verdict lived
-- only in the markdown. Prod still showed the pre-rework figures, so the dashboard has
-- been reporting numbers three models unanimously rejected since 2026-08-09.
--
-- ── Both withdrawals RE-VERIFIED live 2026-08-20 before writing ─────────────────
-- The 2026-08-19 handoff flagged this verdict as possibly stale: migration 234 accepted
-- Wichita quote 0049828559 as a governing price agreement, and docs/93 had withdrawn
-- these two *because* a quote is not an agreement. Checked rather than assumed:
--
--   quote 0049828559  ->  vendor = SRS Distribution, office = Wichita, KS
--   2009034778-001    ->  vendor = ABC Supply, ABC branch 113 Wichita, KS
--   2009557754-001    ->  vendor = ABC Supply, ABC branch 113 Wichita, KS
--
-- An SRS document cannot price an ABC invoice — vendor-silo doctrine, independent of
-- the quote question. And item 0150080102 still resolves negotiated_price = NULL on
-- both invoices today, so the claims fail closed on their own terms. The withdrawals
-- stand; migration 234 does not revive them.
--
-- ── The 'adjust' is deliberately NOT applied ───────────────────────────────────
-- docs/93 called for 2010007036-001 $204.00 -> $203.99 (one-cent rounding in the
-- vendor's favour). That request was still open when docs/93 was written; it was
-- marked received the same day at 20:22 against vendor credit memo 2012910224-001,
-- which credited -$209.65 — MORE than either figure. The claim is closed and the money
-- is in. Rewriting expected_credit to $203.99 now would move no money and would make
-- the ledger disagree with the credit memo document it settled against. Recorded here
-- instead of silently skipped.

-- ── 1 · withdraw the two unsupportable claims ──────────────────────────────────
-- 'cancelled' is the established terminal value for a withdrawn request (36 ABC rows
-- already carry it) and is permitted by the status CHECK.

UPDATE credit_memo_requests r
SET status     = 'cancelled',
    updated_at = now(),
    packet     = COALESCE(r.packet, '{}'::jsonb) || jsonb_build_object(
      'withdrawal', jsonb_build_object(
        'source',      'docs/93 re-audit (PEC-219), unanimous 3/3',
        'reason',      'No in-force ABC agreement price for item 0150080102 at Wichita, KS — claim fails closed',
        'reverified',  '2026-08-20',
        'reverify_note','mig 234 accepted SRS quote 0049828559 for Wichita; SRS cannot price an ABC invoice (vendor silo), and negotiated_price is still NULL on both lines',
        'withdrawn_amount', r.expected_credit,
        'migration',   246 + 1
      ))
WHERE r.invoice_number IN ('2009034778-001', '2009557754-001')
  AND r.vendor_slug   = 'abc-supply'
  AND r.request_kind  = 'requested'
  AND r.status        = 'sent';          -- idempotent: a second run matches nothing

-- ── 2 · assert the intended end state ─────────────────────────────────────────
DO $$
DECLARE still_sent int; cancelled_total numeric;
BEGIN
  SELECT count(*) INTO still_sent
  FROM credit_memo_requests
  WHERE invoice_number IN ('2009034778-001','2009557754-001') AND status = 'sent';
  IF still_sent <> 0 THEN
    RAISE EXCEPTION '247.1 % withdrawal(s) did not apply', still_sent;
  END IF;

  SELECT COALESCE(sum(expected_credit),0) INTO cancelled_total
  FROM credit_memo_requests
  WHERE invoice_number IN ('2009034778-001','2009557754-001');
  IF cancelled_total <> 84.45 THEN
    RAISE EXCEPTION '247.1 expected $84.45 withdrawn, found $%', cancelled_total;
  END IF;
  RAISE NOTICE '247 ok — $84.45 withdrawn across 2 requests; adjust deliberately not applied';
END $$;
