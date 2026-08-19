# Credit-memo re-audit — 2026-08-19 (PEC-219)

Every open credit-memo request (47 ABC `sent`, 6 SRS `approved` — $4,738.22) was
re-derived from source **three times by three independent models**, then reconciled.

Engines (Chris's pick — one editor per pass): **grok-4.6** (Grok CLI),
**gpt-5.6-sol** (Codex CLI), **claude-opus-5** (OpenCode/OpenRouter).
Harness: Ringer, `run_name=credit-memo-reaudit`. Executed check:
`.cm-reaudit/validate-verdict.py` (rejects incomplete, duplicate, arithmetically
inconsistent, or rubber-stamped output — self-tested against both an empty file
and a synthetic all-uphold pass before use).

## Result — unanimous 3/3 on all 53 requests

| | count | |
|---|---|---|
| uphold | 50 | claim stands as sent |
| adjust | 1 | $204.00 → $203.99 (one-cent rounding, in the vendor's favour) |
| withdraw | 2 | $84.45 not supportable |

**Claimed $4,738.22 → verified $4,653.76.** ABC 47 requests / $1,835.96 ·
SRS 6 requests / $2,817.80. Zero splits between the three models.

The two withdrawals are invoices 2009034778-001 and 2009557754-001 — both
serviced by ABC branch 113 (Wichita, KS) but originally priced against the
Richardson, TX book. Item `0150080102` has **no in-force Wichita agreement
price**, so the claims fail closed. This is a direct consequence of the Wichita
coverage gap tracked in PEC-213.

> Note: an earlier hand analysis put invoice 2009557754-001 at $40.26 using
> Wichita **quote** 0049828559 ($19.75/BX). The verification used only in-force
> **agreements**, where that item is null at Wichita. The conservative
> fail-closed answer is the defensible one — a quote is not an agreement.

## Four defects found in the harness itself, all mine

The value of three passes was mostly in catching my own errors. Four runs were
needed; the first three produced numbers that looked clean and were wrong.

1. **Sandbox paths.** Deliverables pointed outside each worker's sandbox. All
   three workers did the analysis correctly and all three were failed by the
   manifest. Grok: *"The verdict is complete and validates PASS. The required
   output path is blocked by `--sandbox workspace`."* Fix: write inside the task dir.
2. **ABC-only join.** SRS invoices live in `vendor_invoices`, not `abc_invoices`,
   so all 6 SRS requests arrived as NULLs and were wrongly zeroed — **$2,817.80**
   written off by a join bug. Fix: vendor-aware invoice/office resolution.
3. **Wrong benchmark.** The dataset carried the *original claim's* price, so the
   models could only withdraw office-mismatched claims, never re-price them.
   Fix: added `CORRECT_office_price_now` from `v_invoice_audit_line` and a
   re-price-don't-withdraw rule.
4. **Duplicated claim lines.** `invoice_line_reaudit` holds a row per `run_label`
   and three invoices were re-audited across `wave_b`, `_r2` and `_r3`. Codex
   faithfully summed the triplicates ($37.62 → $109.58). Grok and opus returned
   the right number and looked correct — **only the disagreement exposed the
   duplication.** Fix: `DISTINCT ON (invoice_number, line_id)` by latest run.

A single-model run, or even two agreeing models, would have shipped a
clean-looking wrong answer at least twice here.

Also corrected: a `unit_match` rule that withdrew 48 valid lines. In this corpus
`unit_match` is `true` on 90 lines, **null on 48, and false on none** — null means
"not recorded", not "mismatched". The rule was redundant anyway, since
`v_invoice_audit_line` only populates a price when units already align.

## Drafts

`.cm-reaudit/drafts/credit-request-{abc-supply,srs}.txt` — supersede letters
following the precedent already in the request packets. Both were scrubbed of
internal field and rule names before being considered sendable.

**Not sent, and not written to `credit_memo_requests`.** Given four dataset
defects surfaced in one corpus, the numbers want human eyes before any money
record changes or anything reaches a vendor.

## Reproduce

```bash
cd "…/OpenEngine/repos/ringer"
./ringer.py lint  <repo>/.cm-reaudit/manifest-v5.json
./ringer.py run   <repo>/.cm-reaudit/manifest-v5.json --identity <you>
python3 <repo>/.cm-reaudit/validate-verdict.py <workdir>/<task>/verdict.json
```

`.cm-reaudit/` is gitignored — it holds vendor pricing data.
