# 95 — Credit-memo evidence panel + three Invoice-Audit corrections (2026-08-19)

Two pieces of work, both from a review of `/accounting/invoice-audit` and the
credit-memo detail page.

---

## Part 1 — three corrections to the Invoice Audit

### 1. `at_risk` was structurally dead (migration 233)

`v_invoice_audit_invoice.at_risk` read **$0.00 for every invoice in the database**
while claims were live. Cause: the rollup excluded any line whose `audit_status`
was `passed` **or** `disputed`. `disputed` means *a human looked and says we were
overcharged* — that is precisely the money still at risk, so excluding it drove
the headline to zero exactly when a claim existed.

Fix: exclude only `passed`. `credit_memo_amount` still tracks the accepted-and-claimed
slice separately, so the two numbers stay distinct.

Reconciliation after the fix — the invoice view and the line view now agree to the penny:

| | lines | amount |
|---|---:|---:|
| Gross overcharge (positive-qty lines) | 258 | $10,160.95 |
| `passed` — accepted as correctly priced | 150 | $5,484.32 |
| `disputed` — **still at risk** | 108 | **$4,676.63** |

`sum(at_risk)` after migration 233 = **$4,676.63**, of which **$3,485.13** is in the
actionable set (open, unpaid, non-credit-memo). The Claims pill now reads $3,485
at risk instead of $0.

**Trap found while measuring — do not repeat it.** `v_invoice_audit_line.variance_ext`
is **sign-unsafe on negative-quantity lines**. On credit/return documents the quantity
is negative, so an *under*charge multiplies out to a positive `variance_ext`. 27 lines
/ $4,614.35 of an apparent $14,775.30 "overcharge" are this artefact — every one of
them has `unit_price < negotiated_price`. Invoice `2004367179-001` is the worked
example: −89.39% variance, reported as +$2,659.48. Always filter `quantity > 0`
before summing `variance_ext`, or use `at_risk`, which already guards it.

### 2. "Process 0" read as a broken control

`invoice_pipeline_status` holds zero `invoice_audit_pending` rows (52 complete,
72 processed). That is the **normal resting state**: rows only enter that status
when the `invoice_audit_reset` RPC ("Go back") or a re-audit produces fresh claim
lines. The machinery is fine; the label was not — a greyed "Process 0" carrying
the tooltip *"No data available — report empty"* reads as a bug.

Now renders "Nothing to stamp" with a tooltip that says why the queue is empty.
The RPC and endpoint are untouched.

### 3. Unpaginated KPI reads

`kpi-pills.ts` read `credit_memo_requests` with `.limit(1000)` / `.limit(2000)`
and sliced the claim-line lookup to `cmInvoices.slice(0, 500)`. PostgREST returns
a truncated page **without an error**, so these would have silently under-reported
money numbers rather than failing. All list reads now page through 1,000 at a time,
and the `.in()` list is chunked at 200.

---

## Part 2 — the credit-memo evidence panel (the ask)

A credit request is an accusation: *"you charged $27.75 for an item our agreement
prices at $17.50."* Before a human sends that, they must be able to open both source
documents and read the chain that says the two belong together. The page showed
neither. It now leads with an **Evidence** panel:

- **Charged on** — invoice number, date, branch, vendor, and a link to the invoice
  PDF (`/api/invoice-audit/pdf/<invoice>`), or an explicit "No invoice PDF stored".
- **Priced against** — agreement number, version, effective → expiry window, PE office,
  source file, and a link to the agreement PDF (`/api/price-agreement/pdf/<id>`).
- **Seven checks**, each answering one thing a vendor could push back on:
  invoice → PE office · agreement → same PE office · in force on the invoice date ·
  document type (agreement vs quote) · item match method · UOM alignment ·
  citation provenance.

The worst check state drives the panel headline (*Evidence complete · Send with
caution · Do not send*) and its left border, so a lapsed or re-derived citation
cannot hide behind a wall of green ticks.

### Where the citation comes from

`invoice_line_reaudit` already carries `office_id`, `office_name`, `agreement_id`,
`agreement_number`, `agreement_effective`, `agreement_expiry`, `match_method` and
`unit_match` per line. The loader was throwing all of it away. It is now surfaced.

**Gap found:** every ABC discrepancy line (128) has that provenance populated.
**All 11 SRS discrepancy lines have `agreement_id` and `office_id` NULL** — the SRS
run recorded provenance on its `valid` and `no_price` rows but dropped it on the
`discrepancy` rows, the only rows that turn into money. Those fall through to a live
re-derivation against the same office-scoped price book the pricing views use, and are
labelled **"re-derived just now — verify before sending"** rather than passed off as
what the auditor actually cited. Fixing the SRS re-audit writer is follow-up work.

### What the panel catches on day one

Across the current claim set (`classification = 'discrepancy'`, variance ≥ $0.05):

| vendor | agreement citation | lines | claimed |
|---|---|---:|---:|
| ABC | in force at invoice date | 43 | $1,398.76 |
| ABC | **expired at invoice date** | 85 | $1,029.40 |
| SRS | **none recorded** | 11 | $2,879.55 |

Two worked examples, both live:

- **`0050033202-002`** (SRS, $92.25, currently *Approved*) → **Send with caution**.
  Its price basis re-derives to **quote `0049828559`**, flagged as a quote, not an
  agreement. This is the same document docs/93 ruled inadmissible when withdrawing
  an ABC claim ("a quote is not an agreement"). The panel surfaces on the page what
  previously took a three-model re-audit to find.
- **`2009557754-001`** (ABC, $22.30) → **Do not send**. The panel independently
  reproduces the docs/93 withdrawal reasoning: agreement priced for **Richardson, TX**
  while the invoice branch is **Wichita, KS** (office-match FAIL), agreement expired
  before the invoice date, and the item matched by description similarity rather than
  item number.

### Also changed

`/api/price-agreement/pdf/[agreementId]` accepted only ABC's integer ids; a uuid
(any other vendor, `price_agreements`) hit the integer column and 500'd. It now routes
uuids to `price_agreements.source_pdf_url` and returns an honest 404 naming the
source file when no copy is stored.

## Open follow-ups

1. **Write docs/93 back to prod.** The two withdrawals ($84.45) and the $204.00 →
   $203.99 adjustment still are not in `credit_memo_requests`; both withdrawn rows
   remain `status='sent'` at their original amounts.
2. **Fix the SRS re-audit writer** so `discrepancy` rows carry office + agreement.
3. **`credit_memo_amount` is dead too** — it requires `audit_status = 'passed'` AND a
   `credit-flag` decision, but credit-flagged lines are `disputed`, so it sums to $0.00
   everywhere. Not changed here: it feeds `creditMemoRequested`, and the money pills
   now source from `credit_memo_requests` instead. Decide whether to repair or retire it.
