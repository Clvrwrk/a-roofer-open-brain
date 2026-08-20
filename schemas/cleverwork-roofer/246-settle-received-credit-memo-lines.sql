-- 246 — a received credit memo must settle its claim lines.
-- Additive + idempotent. Append-only ledger inserts + CREATE OR REPLACE VIEW.
-- No UPDATE, no DELETE; every prior decision stays in invoice_line_audit history.
--
-- Defect (found 2026-08-20, follow-on to 233):
--   Marking a credit memo RECEIVED updates credit_memo_requests.status and
--   invoice_pipeline_status — and never touches invoice_line_audit. The claim lines
--   stay 'disputed' forever, so:
--
--     at_risk            counts every non-'passed' line  -> keeps counting money that
--                        has already come back
--     credit_memo_amount requires 'passed' + credit-flag/credit-noflag -> a pair the
--                        workflow never writes, so it reads $0.00 on every invoice
--
--   Two numbers broken in opposite directions by one missing step. Measured in prod:
--     0049707508-001  SRS  received 2026-08-19, $793.05 recovered, still at_risk $793.05
--     2010007036-001  ABC  received 2026-08-19, $204.00 recovered, still at_risk $204.00
--   $997.05 of recovered money reported as still owed. This GROWS with every credit
--   received, so it is not a static error.
--
-- This is NOT a mis-written predicate. 233 defined the intended model —
--   at_risk            = overcharge not yet accepted as correct
--   credit_memo_amount = overcharge accepted and turned into a credit claim
-- — and the predicate matches it. The lifecycle step was simply never built.
-- Repointing credit_memo_amount at 'disputed' would have made it a strict SUBSET of
-- at_risk, double-counting the same dollars in two money columns.
--
-- Fix: an explicit terminal decision, 'credit-received' (invoice_line_audit.decision
-- carries no CHECK, so no constraint change is needed), written when the credit lands.
-- The line becomes 'passed' (leaves at_risk) and carries 'credit-received' (enters
-- credit_memo_amount). The two stay disjoint, exactly as 233 intended.
--
-- The matching writer lives in src/pages/api/credit-memos/disposition.ts so future
-- receipts settle themselves; section 2 backfills the receipts that predate it.

-- ── 1 · credit_memo_amount also counts the new terminal decision ────────────────
-- Patches the LIVE view definition in place rather than restating it. Restating a
-- copy is how you silently revert whatever landed in between: this view has changed
-- under 238 (vendor-scoped display branch) and 244 (branch FK) since 233, and pasting
-- 233's body would have rolled both back. Only the two credit_memo_amount CASE arms
-- are touched; everything else is by construction byte-identical to what is live.

DO $$
DECLARE
  def   text := pg_get_viewdef('public.v_invoice_audit_invoice'::regclass, true);
  patched text;
  hits  int;
BEGIN
  IF position('''credit-received''' in def) > 0 THEN
    RAISE NOTICE '246.1 already applied — credit-received already in the view';
    RETURN;
  END IF;

  patched := replace(
    def,
    'decision = ANY (ARRAY[''credit-flag''::text, ''credit-noflag''::text])',
    'decision = ANY (ARRAY[''credit-flag''::text, ''credit-noflag''::text, ''credit-received''::text])'
  );

  -- both UNION branches (ABC + vendor_invoices) must have been patched
  hits := (length(patched) - length(def)) / length(', ''credit-received''::text');
  IF hits <> 2 THEN
    RAISE EXCEPTION '246.1 expected 2 patch sites, patched %; view drifted — fix by hand', hits;
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_invoice_audit_invoice AS ' || patched;
  RAISE NOTICE '246.1 applied — credit_memo_amount now counts credit-received';
END $$;

-- ── 2 · backfill: settle the claim lines of already-received credit memos ───────
-- Idempotent: re-running inserts nothing, because a line that already carries a
-- 'credit-received' row is excluded. Append-only — the original 'disputed' rows stay.
--
-- Scope is deliberately "currently-disputed lines on an invoice whose request is
-- received". Verified in prod before writing: for both affected invoices the disputed
-- lines sum to exactly the request's expected_credit ($793.05 and $204.00), so the
-- disputed set IS the claim set. Section 3 re-asserts that rather than trusting it.

INSERT INTO invoice_line_audit (
  invoice_line_id, invoice_number, item_number, audit_status, decision,
  approved_by, approval_note, source, decided_at, created_at, vendor_slug
)
SELECT
  cur.invoice_line_id,
  cur.invoice_number,
  cur.item_number,
  'passed',
  'credit-received',
  COALESCE(NULLIF(r.received_by, ''), 'Chris Hussey'),
  'Credit received ' || to_char(r.received_at, 'YYYY-MM-DD') ||
    ' — claim settled, line leaves at-risk (migration 246 backfill)',
  'credit-memo-reconcile',
  COALESCE(r.received_at, now()) + interval '1 second',  -- must win DISTINCT ON (decided_at DESC)
  now(),
  ila.vendor_slug
FROM credit_memo_requests r
JOIN v_invoice_line_audit_current cur ON cur.invoice_number = r.invoice_number
JOIN invoice_line_audit ila           ON ila.id = cur.id
WHERE r.status = 'received'
  AND cur.audit_status = 'disputed'
  AND NOT EXISTS (
    SELECT 1 FROM invoice_line_audit prior
    WHERE prior.invoice_line_id = cur.invoice_line_id
      AND prior.decision = 'credit-received'
  );

-- ── 3 · fail closed if the money did not move as intended ──────────────────────
DO $$
DECLARE
  stranded numeric;
  recovered numeric;
BEGIN
  -- no received request may still carry at-risk money
  SELECT COALESCE(sum(v.at_risk), 0) INTO stranded
  FROM credit_memo_requests r
  JOIN v_invoice_audit_invoice v ON v.invoice_number = r.invoice_number
  WHERE r.status = 'received';

  SELECT COALESCE(sum(v.credit_memo_amount), 0) INTO recovered
  FROM credit_memo_requests r
  JOIN v_invoice_audit_invoice v ON v.invoice_number = r.invoice_number
  WHERE r.status = 'received';

  IF stranded <> 0 THEN
    RAISE EXCEPTION '246.3 % still at risk on received credit memos — expected 0', stranded;
  END IF;
  RAISE NOTICE '246.3 ok — received credit memos: $0 still at risk, $% recorded recovered', recovered;
END $$;
