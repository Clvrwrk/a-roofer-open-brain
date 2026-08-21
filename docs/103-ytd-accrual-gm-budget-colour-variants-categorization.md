# 103 — YTD accrual, GM%-driven Expense Outstanding, uniform colour variants, and the categorization worksurface

**Date:** 2026-08-21 · **Requested by:** Chris Hussey · **Migrations:** 259–262
**Related:** docs/102 (the WIP/AR expense audit), docs/101 / PEC-226, docs/46 (UOM)

Four requests in one pass. Two were straightforward; two turned out to rest on
assumptions the data did not support, and those are the parts worth reading.

---

## 1 · The CPA accrual snapshot is YTD (migration 259)

> "CPA Accrual snapshot should be current YTD nothing older."

`wip_accrual_snapshot()` summed every non-void invoice and every job-cost line
**from the beginning of time** up to the cutoff, then labelled the result with
that cutoff. The CPA was receiving lifetime figures under a period heading.
Widening the population in migration 258 made the error larger, which is what
surfaced it.

| | billed | costs |
|---|---:|---:|
| lifetime (before) | $12,694,792.12 | $8,900,088.96 |
| **YTD 2026 (after)** | **$5,699,551.72** | **$3,490,948.94** |

`p_period_start` overrides the window for a prior-period restatement; it
defaults to 1 January of the cutoff's year. The output and the CSV filename now
both carry `period_start`, so a saved file states the window it covers.

---

## 2 · Colour variants, uniformly — but not by copying ABC's rule (migration 261)

> "please handle color variants the same for all vendors (review ABC to acquire
> this rule)"

**ABC's rule is a trigram fallback:** `similarity(description_normalized,
lower(item_description)) >= 0.45` (migrations 201/217/233). It works on ABC
because ABC price lists carry item numbers on 1,292 of 1,690 rows — the exact
arm does the work and trigram only mops up.

**Applied verbatim to SRS, where there is no exact arm to carry the load, it
was measured on real invoice lines and produced this:**

| sheet line | priced off | variance |
|---|---|---:|
| TOP SHIELD STEEL **FLASHING SHINGLES** BLACK | TOP SHIELD STEEL **A ROOF EDGE** BLACK, $7.80 | **+1,630.8%** |
| TOP SHIELD STEEL **GUTTER APRON** TERITONE | TOP SHIELD STEEL **SR ROOF EDGE** TERITONE | +22.9% |
| TOP SHIELD 750-G VENT **BLACK** | 750-G VENT **WEATHERED BRONZE** | +58.6% |

Different products. That variance feeds a credit-memo claim sent to a vendor.

### What was installed instead

Two descriptions are colour variants when they are **the same product with the
colour removed**:

```sql
vendor_desc_color_key(a) = vendor_desc_color_key(b)
```

The key is the product head (first pipe-delimited segment — SRS invoice
descriptions are `<PRODUCT + COLOUR> | <attributes> | <pack>`; text with no
pipe passes through whole, so ABC-shaped descriptions work identically), minus
grade/pack qualifiers, minus colour terms.

**The colour vocabulary is read from the PE product file** —
`product_color_variants.color_name` split into words, plus base colour words —
not hardcoded, so it grows with the catalog. This is the same product file
item 4 below categorizes against; the two requests turned out to share a spine.

| description | colour key | |
|---|---|---|
| `IKO CAMBRIDGE AR` | `CAMBRIDGE IKO` | |
| `IKO CAMBRIDGE CHARCOAL GRAY CLASS 3 IMPACT RESISTANT` | `CAMBRIDGE IKO` | ✅ match |
| `IKO CAMBRIDGE WEATHERWOOD \| CLASS 3 IMPACT RESISTANT…` | `CAMBRIDGE IKO` | ✅ match |
| `TOP SHIELD STEEL FLASHING SHINGLES BLACK` | `FLASHING SHIELD SHINGLES STEEL TOP` | |
| `TOP SHIELD STEEL A ROOF EDGE BLACK GALVANIZED KLAUER` | `A EDGE GALVANIZED KLAUER ROOF…` | ❌ correctly rejected |

`IMPACT` and `RESISTANT` had to join the qualifier strip: SRS **quotes** carry
them inline in the product name, **invoices** carry them after the pipe, so
leaving them in makes the two sides of the same product look different.

**It is a fallback, never a substitute.** `match_rank` orders exact item number
> exact description > colour variant, and with `LIMIT 1` a colour-variant price
is used only when the office's governing book has no exact match.

**Result:** SRS priced lines 78 → **93**, unpriced value $87,394 → **$56,701**.
The colour arm matched exactly one family — five colours of IKO Cambridge
(IKOCACHGN / IKOCADBKN / IKOCADBRN / IKOCADGN / IKOCAWWN) across 15 lines — and
the worst variance on the board is back to a genuine 128% coil-nail finding.

> ⚠ **ABC still runs its own 0.45 trigram arm.** Making the two genuinely
> identical means moving ABC onto this colour rule too. ABC has 2,263 priced
> lines and changing its matcher moves live claim numbers, so that is a
> deliberate decision, not a side effect of this migration. **Needs Chris.**

---

## 3 · Expense Outstanding from a per-office gross margin (migration 260)

> "pull a historical GM% per PE office and then make the total expense an
> estimated total based on that GM% … then subtract the expenses realized …
> This is all for budgeting so it should not impact any QBO or Acculynx
> worksurface just our Weekly AR/WIP report."

```
est_total_costs     = contract_amount × (1 − effective_gm_pct/100)
expense_outstanding = est_total_costs − costs_incurred_to_date,  floored at 0
```

Before this, `est_total_costs` was populated on **0 of 347 rows** and Expense
Outstanding rendered as an em-dash on every job.

**Rate basis (Chris's choice): trailing 12 months, completed jobs only** —
milestone invoiced/closed *with real billing*. A job at the `completed`
milestone has not been invoiced, so its cost is not final either. Computed from
source history rather than from `wip_ar_master`, so jobs that have since left
the board still inform the rate.

### Three guards, each earned from the data

1. **Change orders are not added.** `contract_amount` already includes them —
   `approved_job_value` equals `billed_total` on every job carrying a change
   order (MC-4: 174,000 contract / 64,000 CO / 174,000 billed). Adding
   `change_order_total` would double-count.
2. **Thin samples are refused.** Georgia read **56.61% off ONE completed job**;
   the insurance program read **−18.43% off five**. An office rate is used only
   when the sample clears **5 jobs AND $250k billed**; otherwise the company
   trailing-12-month rate (31.55%) applies. `gm_basis` records which, and the
   board prints the sample size beside the control, so a rate carried by 1 job
   never looks like one carried by 107.
3. **The rate is clamped 0..75.** A negative margin would make estimated cost
   exceed the contract and turn Expense Outstanding into fiction.

| office | sample | office rate | basis used | effective |
|---|---:|---:|---|---:|
| wichita | 107 jobs / $2.33M | 27.60% | office | 27.60% |
| multi_family_commercial | 35 / $2.06M | 39.34% | office | 39.34% |
| colorado | 45 / $1.95M | 28.11% | office | 28.11% |
| texas | 50 / $1.08M | 27.63% | office | 27.63% |
| georgia | **1** / $255k | 56.61% | **company** | 31.55% |
| kansas_city | 6 / $124k | 30.89% | **company** | 31.55% |
| insurance_program | 5 / $44k | **−18.43%** | **company** | 31.55% |
| florida | none | — | **company** | 31.55% |

**Result: Expense Outstanding $2,382,336** against an estimated total cost of
$10,359,340, on 344 of 346 rows (the 2 without have a $0 contract).

Colorado and Texas already show realized expense **above** their estimated
total — those offices are running under their historical margin. That is the
signal this column exists to give.

### The override

`wip_office_margin`, set from the board's new Office filter bar, **persisted for
everyone** (Chris's choice) so two people never quote different remaining-expense
figures. Bounded −50..90 at the API and again by a CHECK; saving recomputes
immediately rather than waiting for the nightly rebuild. Clearing it restores
the computed rate.

Round-trip verified against prod and then cleared: Florida at 45% produced
$35,700 × 0.55 = $19,635 with `est_costs_source = gm:override:45.00`; reset
restored `gm:company_trailing_12mo:31.55`. Zero overrides left set.

**Nothing here writes to QBO or AccuLynx**, per the instruction. It reads the
mirrors and populates two `wip_ar_master` columns that already existed.

---

## 4 · The categorization worksurface (migration 262)

> "scrub all uncategorized lines and make a determination or add another
> worksurface within the price agreement workflow to make sure all lines are
> properly categorized against the main PE product file."

**Chosen end state:** the line is **bound to a `products` row** and inherits
that product's taxonomy.

### Why binding rather than tagging

`abc_price_list_items.category_key` is a **GENERATED column** —
`classify_roof_system(description, item_number)`, a keyword classifier. 440 of
1,690 lines came out `uncategorized` because it had no keyword to go on.

A category therefore **cannot** be written by hand — Postgres rejects the write
— and writing one would be wrong anyway: it would be a second, drifting copy of
something the product already knows. So the line gets `product_id`, and its
category is read through `products.taxonomy_id`. One place, no drift. The
generated classifier stays as the fallback for lines nobody binds.

### What auto-applied

Exact manufacturer SKU resolving to exactly one active product — identity, not
inference. **748 of 1,690 ABC lines** bound on the first run.

The rest is queued: **956 proposals across 427 lines**, tiered
`manufacturer_sku` > `colour_key` > `description`, ranked by the invoiced
dollars behind each line (**$40,279** in the queue; **224 lines** have exactly
one candidate). SRS and QXO agreement items match almost nothing by SKU — the
PE product file is ABC-centric — so those arrive on description.

### The surface

`/accounting/price-agreement/categorize`: triage filters (everything / only
unambiguous / only lines with invoiced spend), tier badges with the similarity
score, **the inherited taxonomy path shown before you bind**, and Bind /
Not-this per candidate. Binding a line rejects its other candidates — a line is
one product, and leaving siblings pending would let two reviewers bind the same
line twice.

Round-trip verified against prod then reverted: line 138
(`Tamko Titan XT (3bu/sq)`, $10,153 invoiced) bound to
`Tamko Titan XT Rustic Black 3/SQ` and showed
`Steep Slope Products › Steep Slope Roofing › Fiberglass Laminated Shingles`,
then cleared — the determination is Chris's, not mine.

---

## The performance trap worth keeping

`vendor_desc_color_key()` is a **STABLE SQL function**, so the planner
**inlines it back into the join predicate** and evaluates it per PAIR — 873
lines × 750 products. It times out, and rearranging the query into CTEs does
not help, because inlining happens after that. Only materialising does.

Hence the stored `color_key` columns on `products`, `abc_price_list_items` and
`price_agreement_items`, refreshed by `refresh_color_keys()`. **A stale key
silently stops matching colour variants**, so that function must run after
`refresh_product_color_terms()` and after any price-list import.

Bootstrap order: colour terms → colour keys → candidates.

---

## Still open

1. **ABC's trigram arm vs this colour rule** — §2 above. Needs Chris.
2. **PEC-226 review queue** — 24 high-signal candidates still pending.
3. **`product_taxonomy` carries mangled entities**: categories read
   `Steep Slope Roofing (<gt/>2:12 Pitch)` where `<gt/>` should be `>`. An
   import artefact in the reference data, visible on the new surface. Not
   touched here — it is a reference-table text correction across 172 rows and
   other surfaces may match on the exact string.
4. **The colour vocabulary is additive only.** `refresh_product_color_terms()`
   never removes a term, because dropping one silently un-matches colour
   variants that were previously priced. Removing one is a deliberate act.

## Key invariants this adds

- **A vendor's matching rule is not portable just because it is the same
  company's code.** ABC's trigram works because ABC has item numbers; the same
  threshold on description-only sheets invents claims.
- **Category is read through the product, never stored beside it.** Two copies
  of a classification drift, and the drift is silent.
- **Never put a STABLE SQL function in a join predicate over large inputs** —
  it will be inlined and evaluated per pair. Materialise it.

---

## 5 · Why 230 jobs showed $0 Balance Due — and the three fixes (migration 263)

Chris asked the question; the answer was **two unrelated causes**, which is why
it needed three fixes rather than one.

### Cause A — 225 jobs of finished work (self-inflicted, migration 258)

The signed-contract gate admits any prospect/approved/completed/invoiced job
with a contract over $1. It says **nothing about whether money is outstanding**,
so jobs that were contracted, invoiced and **paid in full** still qualified. The
existing drop rule only fires on `milestone = 'closed'` — and these were never
advanced to Closed in AccuLynx.

| milestone | jobs | contract | avg days | over a year |
|---|---:|---:|---:|---:|
| invoiced | 189 | $8,102,097 | 161 | **26** |
| completed | 31 | $902,520 | 116 | 3 |
| approved | 5 | $154,512 | 436 | 3 |

Oldest: **job 10, Neomie Vincent (TX) — 1,576 days at `invoiced`**, $14,500
contracted, billed and collected. Also TX-253 at 841 days, TX-296 at 667.

So the real finding was AccuLynx hygiene: **$9.16M of completed, fully-collected
work sitting in stages that say it is still in flight.**

### Cause B — 5 jobs where AccuLynx contradicts itself

$195,098.53 of open invoice balance absent from the job-level Balance Due.

| job | client | open invoice | job balance |
|---|---|---:|---:|
| **5** | Brian Buege (CO) | **$136,892.90** (inv 5-4) | $0 |
| MC-74 | JPMC #143923 | $51,525.03 | $0 |
| KS-188 | Rhonda & John Riekenberg | $7,982.48 | $7,482.48 |
| KC-12 | Bryce Gonzalez | $5,785.62 | $0 |
| CO-357 | Charli Ramer | $394.98 | $0 |

Job 5 is the clearest: invoices 5-1/5-2/5-3 are Paid and total $61,894.89 —
**exactly** the contract — then 5-4 is Unpaid at $136,892.90 dated 2026-07-03
and the job balance never moved.

> KS-188 only became visible once Draft invoices were excluded. It is not a
> zero-balance job, so it never appeared in the original "why is Balance Due
> $0" list — but it is the same defect.

### The three fixes

1. **Draft invoices excluded from AR.** The filter — from migration 215, and
   preserved byte-identical through 258 and 260 — excluded only `void`. A draft
   has not been issued, so it cannot be a receivable. MC-76's $36,000 was the
   only one; with it excluded that job has no contract and no issued invoice, so
   it correctly leaves the board entirely.
2. **Finished work off the working board.** 225 jobs flagged `stale_closeout`:
   excluded from every money KPI, hidden from the default view, and reachable
   only through their own pill. **Not deleted** — they are the AccuLynx
   housekeeping list the Friday meeting wants to work.
3. **Contradictions flagged, not hidden.** `balance_contradiction` rows **stay
   in the money KPIs** — that AR is real — they just also need a look.

### The two new pills, and the "Our Best Guess" popout

- **Stale — close in AccuLynx** · 225 · $9,159,129 contracted
- **Balance contradiction** · 5 · $195,099 invoiced but not in job balance

Every flagged row carries a plain-language note **generated from its own numbers
on each rebuild**, so the explanation cannot drift from the data it describes.
A row that gets fixed clears its own flag on the next rebuild — nobody has to
un-flag anything.

The board pops the note out from the **client name**, deliberately: the job
number is already the AccuLynx deep link, and overloading it would make the
cleanup action fight the navigation.

> Job 10: *"Our best guess: this job is finished. It was contracted at
> $14,500.00, invoiced $14,500.00 and collected in full … but it is still
> sitting at "invoiced" in AccuLynx, 1576 days now. The close-out step was
> skipped once the payment landed … At over a year, this is almost certainly
> abandoned rather than pending. Action: advance the job to Closed in AccuLynx
> and it will drop off this board on the next rebuild."*

### What moved

| | before | after |
|---|---:|---:|
| jobs on the ledger | 346 | **120** |
| Billed AR | $1,087,819 | **$1,056,535** |
| Expense realized | $8,900,089 | **$2,549,960** |
| Expense outstanding | $2,382,336 | **$1,865,515** |

Expense Realized falls because $6.35M of it belonged to finished jobs. That
cost is real history, but it is not work in progress — it is still reachable
through the stale pill.

### Invariant this adds

- **A row that needs a system fix is not the same as a row that needs a phone
  call.** Mixing them makes the board look like it has 346 problems when it has
  120 — and buries a $136,892.90 invoice among 225 finished jobs.
