# 99 — Credit-memo money truth: settle, write back, cite (2026-08-20)

Three migrations that make the invoice-audit money columns say what they mean.
Phase 2 of the UI/UX upgrade (Phase 1 = `b7e8410`).

## 246 — a received credit memo must settle its claim lines

`mark-received` updated `credit_memo_requests.status` and `invoice_pipeline_status`
and never touched `invoice_line_audit`. Claim lines stayed `disputed` forever, so two
numbers broke in opposite directions:

| column | rule | effect |
|---|---|---|
| `at_risk` | counts every non-`passed` line | kept counting money already recovered |
| `credit_memo_amount` | needs `passed` + a credit-* decision | a pair nothing ever wrote → **$0.00 on every invoice** |

Measured: `0049707508-001` (SRS, $793.05) and `2010007036-001` (ABC, $204.00), both
received 2026-08-19 — **$997.05 of recovered money reported as still owed**, growing
with every future credit.

**The obvious repair was wrong.** Repointing `credit_memo_amount` at `disputed`
(worth $253.19) would have made it a strict *subset* of `at_risk`, double-counting the
same dollars in two money columns. 233 already defined the model correctly —
`at_risk` = not yet accepted, `credit_memo_amount` = accepted and claimed. Only the
lifecycle step was missing.

Fix: terminal decision **`credit-received`** — line becomes `passed` (leaves at-risk)
and carries a credit-* decision (enters recovered). `decision` has no CHECK; `passed`
and `credit-memo-reconcile` were already permitted. Writer added to
`api/credit-memos/disposition.ts`; 9 lines backfilled, append-only.

| | before | after |
|---|---:|---:|
| at_risk (all) | $4,676.63 | **$3,679.58** |
| credit_memo_amount | $0.00 | **$997.05** |
| at_risk (actionable) | $3,485.13 | **$2,692.08** |

**Patch the live view, never restate it.** The first draft rebuilt the view from 233's
file — which would have silently reverted 238 (vendor-scoped display branch) and 244
(branch FK). 246.1 patches `pg_get_viewdef()` in place and raises unless it finds
exactly 2 sites.

## 247 — docs/93 written back to prod

The three-model re-audit verdict (unanimous 3/3) lived only in markdown; prod showed
pre-rework figures since 2026-08-09.

- **2 withdrawals applied** — `2009034778-001` ($62.15) and `2009557754-001` ($22.30)
  → `cancelled`, $84.45. Re-verified live first: the 2026-08-19 handoff flagged the
  verdict as possibly stale because mig 234 accepted Wichita quote `0049828559`. That
  quote is **SRS**; both invoices are **ABC** — an SRS document cannot price an ABC
  invoice (vendor silo), and item `0150080102` still resolves `negotiated_price = NULL`
  on both. The withdrawals stand.
- **The 1 adjust deliberately NOT applied.** docs/93 called for `2010007036-001`
  $204.00 → $203.99. That request was marked received the same day against vendor
  credit memo `2012910224-001`, which credited **−$209.65** — more than either figure.
  Rewriting `expected_credit` now would move no money and would put the ledger at odds
  with the document it settled against.

## 248 — SRS re-audit provenance recovered

Run `srs_2026-08-05` recorded office + agreement on its `valid`, `uom_review` and
`engine_resolved` rows and dropped both on its **`discrepancy`** rows — the only rows
that become money. 11 lines / $2,879.55 uncited; ABC's 128 all fine.

All 11 re-derived unambiguously (one in-force office-scoped SRS agreement each, whose
item price equals the stored `office_price`) → `0049345641` (Denver) ×6,
`0049828559` (Wichita) ×5. New nullable column **`provenance`** marks them
`'rederived'`: a reconstructed citation must never display as the auditor's own
(hard rule 4).

**Why no CHECK constraint.** The instinct was to make an uncited discrepancy row
impossible — the quarantine/fail-closed pattern. Wrong tool here: the live
"add line to claim" path inserts `agreement_id: … ?? null`, and **65 priced lines in
prod genuinely have no agreement id today**. A CHECK would fail the human's click
rather than the bad data. *Fail closed against data you control; detect on data you
don't.*

**Recurrence is not yet guarded.** The SRS run was ad-hoc SQL, never committed
(`scripts/invoice-audit-v2/wave-b-reaudit.sql` is ABC-only — it joins `abc_invoices` /
`abc_price_agreements`). There is no writer to fix. Whoever commits a real SRS
re-audit engine must carry office + agreement on discrepancy rows. The Layer 2 daily
sweep (docs/92) is HTTP/static-only and has no DB access, so it cannot detect this
today — adding a DB tier to it is the open follow-up.

## Open

- SRS re-audit engine: uncommitted; provenance recurrence unguarded.
- Layer 2 sweep has no DB tier.
- `creditMemoRequested` rolls up at invoice/branch/office/totals and is rendered
  nowhere — Phase 4 decides whether to surface it or retire the rollup.
