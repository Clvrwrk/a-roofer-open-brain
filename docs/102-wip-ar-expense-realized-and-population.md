# 102 — the Friday WIP/AR board: why Expense Realized was wrong, and what the board now covers

**Date:** 2026-08-21 · **Reported by:** Chris Hussey · **Migrations:** 257, 258
**Related:** docs/85 (the board), migration 215/216 (`wip_ar_master`), PEC-226 / docs/101

Chris: *"we are seeing a large discrepancy [in Expenses Realized] and it does not look like
we are getting this AR/WIP workspace updated nightly with QBO/API's for both ABC &
AccuLynx."*

The premise turned out to be wrong in an instructive way. **Every feed was running.** The
number was wrong for a reason that no amount of sync monitoring would have caught.

---

## 1 · The sync audit — all green

Verified 2026-08-21, 8-day window:

| feed | where | cadence | result |
|---|---|---|---|
| `acculynx-hourly-sync` | pg_cron job 5 | hourly | **192/192 succeeded**, last 17:01 UTC |
| `acculynx-reconcile` | pg_cron job 6 | every 10 min | **1152/1152 succeeded** |
| `acculynx-alert-check` | pg_cron job 7 | every 15 min | **768/768 succeeded** |
| ABC mirror (`mirror-backfill.mjs`) | **Hetzner agent host** | daily 07:30 UTC (3:30a ET) | **8/8 `completed`, zero errors** |
| QBO mirror | **Hetzner agent host** | daily 01:00 UTC | **8/8 `status: ok`**, last 01:07 UTC |
| `wip-ar-master-nightly` | pg_cron job 11 | daily 10:45 UTC | **8/8 succeeded** |
| `wip-ar-week-roll-thursday` | pg_cron job 12 | Thursdays | 1/1 succeeded |
| `refresh-office-pricing-matviews` | pg_cron job 13 | every 15 min | **768/768 succeeded** |

Two things that *look* like problems and are not:

- **`wip_ar_master` holds rows with a `computed_at` as old as 2026-08-07.** By design.
  A job that leaves the ledger is marked `in_ar_population = false` and keeps its last
  `computed_at` as a tombstone. All 122 in-population rows were recomputed that morning.
- **The QBO run key says `thursday`.** Historical naming — `mode: "thursday"` runs
  **every day**. Worth renaming; it is why the board's footer used to imply a weekly QBO.

---

## 2 · The actual bug: the job-cost key required a colon

`v_qbo_job_cost_lines` derived the job number from the QBO `CustomerRef` name as

```sql
substring(customer_ref_name, ':([^:]+)$')
```

That regex **only matches when the name contains a colon**. It was written for QBO's
`Customer:Job` convention — `Elaine Suderman:KS-208`. But most job-tagged expense lines in
this file carry the **bare job number** as the CustomerRef name, with no parent and no
colon. Those produced `NULL`, and `v_qbo_job_costs` then dropped them on its own
`WHERE job_number IS NOT NULL`.

Measured before the fix — 17,489 job-cost lines, $24,378,521.74 total:

| CustomerRef shape | lines | amount | names a real AccuLynx job? |
|---|---:|---:|---|
| `has colon` — `Elaine Suderman:KS-208` | 3,421 | $8,028,640.16 | 815 of 847 |
| **bare prefixed** — `KS-208`, `MC-59`, `GA-42` | **10,362** | **$12,448,277.28** | **815 of 815** |
| **bare numeric** — `41`, `81`, `185` | **3,451** | **$3,745,315.52** | **183 of 183** |
| other, no colon — `EECU Loan` | 255 | $156,288.78 | 0 of 135 |

**998 of 998** bare names shaped like a job number matched a real
`crm_pipeline.client_job_number`. **0 of 135** other bare names did. So the two bare shapes
are safe to accept and the remainder is correctly excluded — the data drew the line, not a
guess.

Migration 257 adds the bare-name branch and **leaves the colon branch byte-identical**.
32 colon-derived job numbers ($53,259.00) match no AccuLynx job; they attach to nothing
downstream either way, and narrowing that branch would risk dropping cost that currently
counts. The bug was the missing branch, so that is all that changed.

**Attributed job cost: $8,028,640 → $24,222,233.**

### The guard rail

`v_qbo_job_cost_unattributed` now reports every CustomerRef that yields no job number,
flagged with `names_a_real_acculynx_job`. **Any `true` row is a bug** — cost being dropped
on the floor. It currently returns 135 rows, all `false`. This is the check that would have
caught the original defect in a day instead of never: a silent `NULL` is invisible, an empty
view that stops being empty is not.

---

## 3 · The board only admitted jobs that already had AR

`refresh_wip_ar_master()` built its ledger from one gate:

```sql
abs(outstanding_ar) > 0.004 OR abs(billed_ar) > 0.004
```

A signed contract with costs incurred and nothing yet invoiced was **off the board
entirely**. That is defensible for an AR meeting and wrong for a WIP board — work in
progress with money going out and none coming in is precisely what WIP means, and it is the
population the "Tier 2 — delivered, never invoiced" KPI is supposed to be measured against.

Chris: *"expand the workspace to include all acculynx jobID's that are in the Prospect,
Approved, Completed, Invoiced stage with an estimate value greater than $1 which signifies
as signed contract."*

Migration 258 makes the gate a union — a job earns its place by carrying money **or** by
being a signed contract:

```sql
   (abs(outstanding_ar) > 0.004 OR abs(billed_ar) > 0.004)
OR (milestone IN ('prospect','approved','completed','invoiced') AND contract_amount > 1)
```

`population_reason` (`ar_balance` / `signed_contract` / `both`) records which arm admitted
each row, so the AR meeting can still filter to its own population without shrinking the WIP
view. The existing exclusions are unchanged: cancelled / dead / unknown never enter, and a
closed job with no AR still drops off.

### Result

| population_reason | jobs | billed AR | expense realized |
|---|---:|---:|---:|
| `both` | 120 | $1,000,293.73 | $2,549,959.51 |
| `ar_balance` | 2 | $87,525.03 | — |
| `signed_contract` | **225** | **$0.00** | **$6,350,129.45** |
| **total** | **347** | $1,087,818.76 | **$8,900,088.96** |

**Board Expense Realized: $875,957.04 → $8,900,088.96** across both migrations.

**Billed AR, Unbilled, Critical AR Tier 1 and the 3-week cash map are unchanged** — the 225
added jobs carry $0 AR by construction. What moves is the ledger count, Total job balance,
and Expense Realized.

> ⚠ **The CPA accrual snapshot moved too.** `wip_accrual_snapshot()` reads the same
> population, so `/api/accounting/friday-wip/accrual.csv` now returns **347 rows,
> $12,694,792.12 billed and $8,900,088.96 of costs** where it previously returned 122 rows
> against a tenth of the cost. This is the intended consequence of the expansion, but it
> changes a figure that goes to an outside accountant — Lucinda and the CPA should be told
> before the next period close rather than discovering it.

---

## 4 · KPI pills are filters

Every pill and cash-map cell now filters the board to the rows its number was summed from.

The implementation choice worth keeping: the **loader tags each job with its KPI keys in the
same pass that accumulates the totals** (`mark()` beside every `+=`). The alternative —
re-deriving each pill's predicate in the browser — would have created two definitions of
"Tier 1" that could silently disagree after any future edit. One decision, one source.

Twelve filters: six original pills, the new signed-contract pill, four cash weeks, and
"Billed AR, no date". "Dated share" stays inert — a ratio is not a set of rows. Rep and KPI
filters resolve in one pass so they compose; clicking an active pill toggles it off; "Total
job balance" selects everything and doubles as clear.

Verified in the browser against production data: 347 rows, all twelve pills filter to the
right count, and both "Total job balance" (347 rows) and "Expense realized" (331 rows) sum
to $8,900,085 across their row sets — matching the pill to within per-row rounding.

---

## 5 · Still open

1. **`est_total_costs` is populated on 0 of 347 rows**, so **Expense Outstanding renders `—`
   for every job**. This is the docs/85 gap — it needs AccuLynx worksheet costs — and it is
   now the only column on the board with no data behind it. Untouched here.
2. **Rename the QBO `thursday` mode** to `daily`. Cosmetic, but the run key actively
   misleads anyone auditing cadence.
3. **16 of 347 jobs still show no expense** — genuinely no QBO job-tagged cost, not a
   join failure. Confirmed against `v_qbo_job_cost_unattributed`.
4. A stale git worktree sits at `.claude/worktrees/jolly-bell-f2a86a` with its own copy of
   `schemas/`. Harmless but it makes repo-wide greps ambiguous.

---

## Key invariants this adds

- **Never derive a foreign key with a pattern that can silently return NULL without a
  companion view that counts the NULLs.** $16.2M hid behind one `substring()` for months
  because nothing ever asked how many rows it failed on.
- **A sync that reports success proves the bytes arrived, not that they were read
  correctly.** Every feed here was green throughout.
- **`population_reason` must be carried by anything that widens a board's population**, so
  a KPI can always be restricted to the population it was defined against.
