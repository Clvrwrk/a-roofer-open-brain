# Pipeline Data-Integrity Diagnosis & Rebuild Plan

*Supersedes `pipeline-ytd-sold-value-review.md`. Live prod DB (`crm_pipeline`, `acculynx_jobs`, `acculynx_job_milestone_history`), 2026-07-06.*

## Bottom line

The Year-to-Date "sold value" of **$45,683,303** is wrong by roughly **6–9×**. Two defects stack on top of each other, and both trace to one bad layer of data: **819 legacy CSV rows that duplicate jobs already in the system.** Your instinct was right — we have a bad-data problem, not a display glitch. The good news: the real source of truth exists and is 98% complete, so this is fully fixable.

## What's actually wrong

**Defect 1 — Double counting (~$26.4M phantom).** The dashboard reads `crm_pipeline`, which contains two generations of data: a legacy `csv_initial` import and the live `api_sync` feed. There are 819 `csv_initial` "sold" rows with a **NULL AccuLynx JobID**. Every one of them matches — 100%, exactly on job number (`CO-328`, `KS-27`, …) — a real AccuLynx job that is **already counted** under its real JobID. The de-duplicator collapses rows that share a JobID, but these have none, so it can't catch them. Result: 819 jobs counted twice. The surviving API row carries the dollar value for 810 of the 819 (the other 9 are genuine $0 contracts), so removing the duplicates loses no real value.

**Defect 2 — Mis-dated into 2026.** Those same 819 duplicate rows carry no stage dates at all, so the windowing logic falls back to `updated_at` — the last sync timestamp, which is `2026-04-20` for all of them. That drops the entire phantom $26.4M squarely inside any Year-to-Date window. (It's also why YTD looks far bigger than MTD or QTD — the phantoms sit in April, inside YTD but outside the current month/quarter.)

**On cumulative counting (your specific concern).** The dashboard buckets each job by its *single* current milestone, so it does not sum one job across Approved→Invoiced→Closed. The cumulative trap is real, though, in two places: (a) the raw milestone history *is* cumulative — a Closed job also holds Approved/Invoiced rows — so any funnel built by summing history stages would multi-count; and (b) the NULL-JobID duplicates defeat de-duplication, which is a form of double counting. The correct rule is the one you stated: **one bucket per job = its latest milestone, value counted once.**

## The source of truth already exists

`acculynx_job_milestone_history` holds dated stage transitions — **Lead, Prospect, Approved, Completed, Invoiced, Closed, Cancelled** — for **6,357 of 6,463 jobs (98%)**. This is precisely the "date originated → lead → prospect → approved → invoiced → closed" spine you described. Status is verifiable from it: a job with Lead + Prospect dates but no Approved/Invoiced/Closed date *is* a prospect, and should carry value only in the Prospect bucket. The dashboard currently ignores this table and trusts a flattened `current_milestone` + a single generic date instead.

## Corrected numbers (each job once, real dates, no duplicates)

| Measure | Dashboard shows | Corrected |
|---|---|---|
| **YTD sold value** | **$45,683,303** | **~$5.3M** approved YTD (160 jobs) *or* **~$7.7M** closed YTD (239 jobs) — see note |
| All-time sold value | $59.5M (1,784 jobs) | **~$32.8M** (952 jobs) |
| Phantom duplicate value | — | $26.4M (819 jobs, removable) |

All-time "sold, counted once by true current status": Closed $18.1M (574) · Invoiced $7.8M (217) · Approved $3.8M (97) · Completed $3.0M (64). Prospect $0.19M (185) · Lead $0.8M (266) · Cancelled $2.6M (4,954).

**Note on "sold YTD":** it depends on which stage date defines a sale — jobs **approved** in 2026 (new contracts won: 160 jobs / $5.3M) or jobs **closed** in 2026 (7.7M / 239). That's the one modeling choice left to confirm.

## Rebuild plan (per your decisions)

You chose: rebuild off milestone history · re-match orphans first · exclusive buckets by current status. Re-matching is now done and shows the orphans are 100% duplicates, so the plan is:

1. **Make `acculynx_job_milestone_history` the truth spine.** Per job: current status = latest-dated milestone; capture each stage-entry date (lead/prospect/approved/invoiced/closed) as its own field.
2. **Retire the `updated_at` date fallback.** Window every KPI on real stage dates; jobs with no stage date are "undated," never dated to the sync time.
3. **Collapse the 819 `csv_initial` duplicates.** They match live jobs on job number and add no value the API rows don't already hold — quarantine them (flag as superseded, per the no-hard-delete rule) so they stop being counted.
4. **Enforce exclusive buckets.** Each job's value counts once, in its current-status bucket only (Prospect value only while still a prospect; Approved/Invoiced/Closed by contract value at current stage).
5. **Add a coverage caption** (like the margin KPIs) so any remaining gaps are visible, not hidden.
6. **Regenerate `crm_pipeline` from the truth layer** so existing dashboard code keeps working but reads correct data.

**One decision needed before I build:** should "sold YTD" be measured by **approval date** (contracts won this year) or **closed date** (jobs finished this year)? Everything else is specified.

*Method: all figures apply the dashboard's own dedupe (api_sync wins) and dead/cancelled exclusion; sold = approved/completed/invoiced/closed; value = greatest(contract_amount, primary_estimate_amount). Orphan match = exact on job number; double-count confirmed by presence of the matched real JobID as a separate crm_pipeline row.*
