# Pipeline Review — "Year‑to‑Date Sold Value" Investigation

**Question:** Filtered to Year‑to‑Date, the pipeline shows **$45,683,303** in sold value. Is that really 2026, or is it every job on record?

**Answer:** You're right to be suspicious. The number is inflated. It is *not* filtered to 2026 in any meaningful sense — roughly **58% of it ($26.4M) is sold jobs that have no real date at all** and get swept into 2026 by a fallback rule. The honest 2026 figure is closer to **$19.3M**.

---

## What the $45,683,303 is actually made of

I reproduced the dashboard's exact number against the live database (1,385 jobs, $45,683,303 — an exact match). Breaking that figure apart by the job's best real date:

| Component | Jobs | Value | Legitimate for YTD? |
|---|---|---|---|
| Sold jobs with a real 2026 date | 566 | **$19,293,361** | ✅ Yes |
| Sold jobs with **no date at all** (defaulted to sync date) | 819 | **$26,389,942** | ❌ No — spurious |
| **Displayed YTD total** | **1,385** | **$45,683,303** | — |

For context, total sold value *ever recorded* (all years, deduped, dead/cancelled removed) is **$59,477,728 across 1,784 jobs**. So the YTD figure isn't literally "everything" — it excludes ~$13.8M of jobs that carry real 2022–2025 dates. But it does pull in 819 undated jobs worth $26.4M that have no business being in a 2026 view.

## Why this happens (root cause)

The dashboard decides *when* a job was "sold" using this fallback chain:

> `approved_date` → else `milestone_date` → else **`updated_at`**

The problem is coverage of the real dates:

- Only **95 of 1,784** sold jobs (~5%) have an `approved_date` at all.
- **819 sold jobs (46%)** have **neither** `approved_date` **nor** `milestone_date`.

Those 819 jobs fall through to `updated_at` — which is simply the last time the sync touched the row. Every row was re-synced this year, so `updated_at` is always a current-year date. All 819 undated jobs share an `updated_at` of **2026‑04‑20**, which lands inside the Year‑to‑Date window (Jan 1 → today). Result: $26.4M of undated, could-be-any-year work is counted as "sold in 2026."

A revealing side effect: because those 819 jobs are stamped 2026‑04‑20, they inflate **YTD** but would *not* show up in a **Month‑to‑Date (July)** or **Quarter‑to‑Date (Q3)** view. That's why YTD looks wildly larger than the shorter windows — the gap is mostly this artifact, not real seasonality.

## What the real numbers look like

- **Genuinely dated in 2026** (approved or milestone date in 2026): **566 jobs, $19,293,361** — the most defensible "YTD sold" figure today.
- **Strictly by `approved_date`** (the cleanest signal, but only 5% coverage): **74 jobs, $3,272,565** — understated because the field is almost never populated.

The truth sits at/above ~$19.3M, but it can't be pinned precisely until the 819 undated jobs get real sold dates.

## Recommended fixes

1. **Stop falling back to `updated_at` for sold-date windowing.** Use `approved_date → milestone_date` only. Jobs with neither are "date‑unknown" and should be excluded from the windowed sold value (or shown in a separate "undated" bucket), not silently dated to the last sync. This alone brings YTD to the honest ~$19.3M.
2. **Add a coverage caption**, the same way the margin KPIs already do — e.g. "566 of X sold jobs have a confirmed sold date." Makes the gap visible instead of hidden.
3. **Backfill `approved_date` / `milestone_date`** from AccuLynx (the milestone‑history walk) to raise coverage above 5% so the windowed number can be trusted going forward.

The relevant logic lives in `computeCloseRate` in `app/command-center/src/lib/executive-pipeline.ts` (the `approved_date ?? milestone_date ?? updated_at` sold-date line).

---

*Figures pulled live from `crm_pipeline` (prod) on 2026‑07‑06, applying the dashboard's own dedupe (api_sync wins) and dead/cancelled exclusion. Sold = approved/completed/invoiced/closed; value = greatest(contract_amount, primary_estimate_amount).*
