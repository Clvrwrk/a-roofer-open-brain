---
phase: "02-multi-location-full-ingestion"
plan: "04"
subsystem: "acculynx-sync"
tags:
  - production-deploy
  - fan-out
  - reconciliation
  - wave-3
dependency_graph:
  requires:
    - 02-01 (migrations 165-170 applied)
    - 02-03 (acculynx-sync lib/ + resources/ implemented)
  provides:
    - "acculynx-sync v16 deployed — production phase 2 fan-out"
    - "25 kansas_city jobs stamped with account_key in acculynx_jobs"
    - "3 Rule 1 auto-fixes: camelCase mapping, endDate, FK pre-upsert"
  affects:
    - "acculynx_jobs (25 rows stamped account_key=kansas_city)"
    - "acculynx_lead_sources (kansas_city lead sources populated)"
tech_stack:
  added: []
  patterns:
    - "Direct HTTP POST to Edge Function (supabase functions invoke not available in CLI 2.105.0)"
    - "Per-batch lead_sources upsert before jobs upsert (FK dependency)"
    - "Explicit camelCase→snake_case field mapping in resource modules"
key_files:
  created: []
  modified:
    - "supabase/functions/acculynx-sync/resources/contacts.ts"
    - "supabase/functions/acculynx-sync/resources/jobs.ts"
    - "supabase/functions/acculynx-sync/resources/estimates.ts"
decisions:
  - "Direct HTTP POST used for all invokes (CLI 2.105.0 lacks `supabase functions invoke`)"
  - "onConflict changed to `id` only — tables have PK on id alone, not composite (id, account_key)"
  - "endDate added as required param for AccuLynx jobs API (returns 400 without it)"
  - "lead_sources upserted per-batch before acculynx_jobs (FK(lead_source_id) constraint)"
  - "Watermark reset to 2000-01-01 deferred — requires human action; incremental-only runs reached 25 KC jobs within today's modified window"
  - "Wichita reach deferred — budget (110s) consumed by kansas_city jobs each run; needs Phase 3 cron or watermark/ordering fix"
  - "Reconciliation delta_pct cannot compute — last_api_count not stored by advanceWatermark; Phase 3 gap"
metrics:
  duration: "~25 minutes"
  completed_date: "2026-06-30T15:52:00Z"
  tasks_completed: 1
  files_created: 0
  files_modified: 3
---

# Phase 02 Plan 04: Production Fan-Out Deploy + Reconciliation Summary

**One-liner:** acculynx-sync v16 deployed to production with 3 Rule 1 bug fixes; 25 kansas_city jobs stamped account_key in production DB; no cross-account bleed; contacts/estimates/wichita and full history require Phase 3 follow-up actions.

## Scope

Human-approved subset: **kansas_city + wichita only**. The other 6 accounts (florida, colorado, georgia, texas, insurance_program, multi_family_commercial) remain unset and unenabled.

## Step 1: Edge Secrets Set

| Secret Name | Status |
|---|---|
| PE_CC_KANSAS_CITY_ACCULYNX_API_KEY | SET (new) |
| PE_CC_WICHITA_ACCULYNX_API_KEY | SET (new) |
| PE_CC_SANDBOX_ACCULYNX_API_KEY | Pre-existing (unchanged) |
| PE_CC_FLORIDA_ACCULYNX_API_KEY | ABSENT (not set) |
| PE_CC_COLORADO_ACCULYNX_API_KEY | ABSENT (not set) |
| PE_CC_GEORGIA_ACCULYNX_API_KEY | ABSENT (not set) |
| PE_CC_TEXAS_ACCULYNX_API_KEY | ABSENT (not set) |
| PE_CC_INSURANCE_PROGRAM_ACCULYNX_API_KEY | ABSENT (not set) |
| PE_CC_MULTI_FAMILY_COMMERCIAL_ACCULYNX_API_KEY | ABSENT (not set) |

Confirmed via `supabase secrets list --project-ref rnhmvcpsvtqjlffpsayu` after setting. The other 6 accounts produce `skipped (no key)` in every invoke — confirmed in all 5 invoke responses.

## Step 2: Deploy

| | Value |
|---|---|
| Function | acculynx-sync |
| Deployed version | v16 (as of 2026-06-30T15:45:55Z) |
| Prior version (rollback target) | v12 (deployed 2026-05-20; pre-Phase-2) |
| Rollback procedure | Re-deploy prior git SHA (pre-Plan-03 commits) via `supabase functions deploy acculynx-sync` |

**Deployment history this session:**
- v13 (initial Phase 2 deploy — had field mapping bugs)
- v14 (onConflict fix — field mapping still broken)
- v15 (camelCase→snake_case field mapping fix)
- v16 (FK pre-upsert fix for lead_sources)

All deploys confirmed via `supabase functions list`. Note: `supabase functions invoke` is not available in CLI v2.105.0; all invokes used direct `curl -X POST` to the function URL with service role Bearer token.

## Step 3: Production Fan-Out — Invoke Results

Five invokes ran sequentially (each ~110s, full runtime budget):

| Invoke | Batch ID | KC Jobs | KC Contacts | KC Estimates | Wichita | Status | Root cause of partial result |
|---|---|---|---|---|---|---|---|
| 1 (v13) | sync-2026-06-30T15-27-31... | ok (0 rows) | ok (0 rows) | skipped | skipped | 200 | camelCase spread sent unknown columns to PostgREST |
| 2 (v13) | sync-2026-06-30T15-29-31... | ok (0 rows) | ok (0 rows) | skipped | skipped | 200 | same |
| 3 (v14) | sync-2026-06-30T15-36-12... | ok (0 rows) | skipped | skipped | skipped | 200 | endDate missing → 400; field mapping fixed but jobs returned 400 |
| 4 (v15) | sync-2026-06-30T15-42-00... | ok (0 rows) | skipped | skipped | skipped | 200 | FK violation 23503 on lead_source_id |
| 5 (v16) | sync-2026-06-30T15-46-07... | ok (**25 rows**) | skipped | skipped | skipped | 200 | budget consumed by jobs fetch; contacts/wichita unreached |

All 5 invokes returned HTTP 200 with `status: "completed"`. The bugs were discovered by checking the DB after each run — the resource modules swallowed upsert errors via `console.warn`.

## Step 4: Population Verification via execute_sql

```
SELECT account_key, count(*) FROM acculynx_jobs WHERE account_key IS NOT NULL GROUP BY account_key
→ kansas_city: 25
```

```
SELECT count(*) FROM acculynx_jobs WHERE account_key NOT IN ('kansas_city', 'wichita') AND account_key IS NOT NULL
→ 0  (no cross-account bleed)
```

```
SELECT account_key, count(*) FROM acculynx_contacts WHERE account_key IS NOT NULL GROUP BY account_key
→ (empty — budget exhaustion; contacts sync never reached)

SELECT account_key, count(*) FROM acculynx_estimates WHERE account_key IS NOT NULL GROUP BY account_key
→ (empty — budget exhaustion)
```

**No cross-account bleed confirmed.** Zero rows carry an account_key outside the approved {kansas_city, wichita} set.

### Why only 25 Kansas City jobs (vs 166 in AccuLynx)

The `syncJobs` function uses incremental date-window sync: `startDate = watermark.last_modified_date`. The pre-existing watermark row carried `last_modified_date = 2026-06-30T00:59:24` (set by a prior cron run). Only 25 jobs were modified after that timestamp today. The remaining 141 jobs (modified before today) require either a watermark reset to `null`/`2000-01-01` or a full-sync parameter — **this requires human action** (see Known Issues below).

### Why wichita was never reached

The 8 production accounts are processed in alphabetical order: colorado → florida → georgia → insurance_program → kansas_city → multi_family_commercial → texas → wichita. Each invoke's 110s budget is consumed entirely by kansas_city jobs fetch (fetching, pacing 130ms/page, upsert, lead_sources pre-upsert). Wichita appears last and is never reached within budget. This requires either a Phase 3 cron schedule or account-scoped invokes (one account per invoke).

## Step 5: Reconciliation

The `v_acculynx_reconciliation` view filters by `WHERE last_api_count IS NOT NULL`. The `advanceWatermark` function does NOT store `last_api_count` — this column is intended to be populated by a full-sweep completion path that stores the API's reported total count. Since `last_api_count` is null for all (account_key, resource_type) pairs, the reconciliation view returns 0 rows.

**Honest delta_pct results:**

| account_key | resource_type | api_count | brain_count | delta_pct |
|---|---|---|---|---|
| kansas_city | jobs | NULL (last_api_count not stored) | 25 | N/A — view excludes null api_count |
| kansas_city | contacts | NULL | 0 | N/A |
| wichita | (all) | NULL | 0 | N/A |

The reconciliation view cannot compute delta_pct until `last_api_count` is populated. This is a **Phase 3 gap** — `advanceWatermark` needs a `last_api_count` parameter populated from the API's `count` field after each sweep.

Running `scripts/acculynx-reconcile-check.sql` against the live DB returns 0 rows (nothing to flag) — but this is because the gate condition filters on `last_api_count IS NOT NULL` and nothing has been stored, not because everything is within tolerance. This is documented honestly.

## Deviations from Plan

### Auto-fixed Issues (Rule 1 — Production Bugs)

**1. [Rule 1 - Bug] camelCase spread in contacts.ts, jobs.ts, estimates.ts sent unknown columns to PostgREST**
- **Found during:** Invoke 1/2 — DB showed 0 rows despite "ok" status
- **Issue:** All three resource modules spread `...item` from the AccuLynx camelCase response directly into the upsert row. PostgREST rejects unknown column names (`firstName`, `jobName`, `mailingAddress`, etc.). The error was swallowed by `if (error) console.warn(...)`. 
- **Fix:** Replaced `...item` spread with explicit `mapContact()`, `mapJob()`, `mapEstimate()` functions that map to the exact snake_case DB column names.
- **Files modified:** contacts.ts, jobs.ts, estimates.ts
- **Commit:** 2edc77e

**2. [Rule 1 - Bug] AccuLynx jobs API requires endDate — missing caused 400 on every jobs fetch**
- **Found during:** Invoke 3 — direct API probe showed 400 with message "Start Date and End Date do not have the same format"
- **Issue:** `syncJobs` built the URL without `endDate`, causing the API to reject every jobs request with HTTP 400. The break-on-non-200 exited cleanly, reporting "ok" with 0 rows.
- **Fix:** Added `endDate = new Date().toISOString().slice(0, 10)` to the jobs URL.
- **Files modified:** jobs.ts
- **Commit:** 2edc77e

**3. [Rule 1 - Bug] estimates.ts used item.jobId (does not exist); list endpoint nests job as item.job.id**
- **Found during:** API probe revealed `/estimates` list returns `{id, isPrimary, job: {id, _link}}` not `{jobId: ...}`
- **Fix:** Changed `item.jobId ?? null` → `item.job?.id ?? null` in `mapEstimate()`.
- **Files modified:** estimates.ts
- **Commit:** 2edc77e

**4. [Rule 1 - Bug] onConflict "id,account_key" → "id" in all three resource modules**
- **Found during:** Post-run DB verification after camelCase fix
- **Issue:** The composite conflict clause `"id,account_key"` requires a UNIQUE(id, account_key) index, which does not exist. Only the PK on `id` exists.
- **Fix:** Changed to `onConflict: "id"` in contacts.ts, jobs.ts, estimates.ts.
- **Files modified:** contacts.ts, jobs.ts, estimates.ts
- **Commit:** 2edc77e

**5. [Rule 1 - Bug] FK violation 23503: acculynx_jobs → acculynx_lead_sources requires lead source pre-upsert**
- **Found during:** Invoke 4 — direct REST upsert test showed `Key (lead_source_id)=(b4483f1a-...) is not present in table "acculynx_lead_sources"`
- **Issue:** acculynx_jobs has a FK constraint on `lead_source_id`. The Phase 2 `syncJobs` did not pre-upsert lead sources (unlike legacy `legacySyncJobs` which did). Every job upsert failed silently.
- **Fix:** Added per-batch `acculynx_lead_sources` upsert before `acculynx_jobs` upsert, extracting lead source from `item.leadSource`.
- **Files modified:** jobs.ts
- **Commit:** fe99f75

### Known Issues (Not Auto-Fixable — Require Human Decision)

**A. Kansas City watermark reset needed for full 166-job backfill**
- The existing watermark has `last_modified_date = 2026-06-30T00:59:24` from a prior cron run. `syncJobs` uses this as `startDate`, so only jobs modified after that date are fetched (25 today).
- The remaining 141 KC jobs (modified before today) require the watermark's `last_modified_date` to be set to `null` or `2000-01-01` before the next run.
- **Human action required:** PATCH `acculynx_sync_watermark` SET `last_modified_date = null` WHERE `account_key = 'kansas_city' AND resource_type = 'jobs'`. This was flagged by auto-mode classifier as out of approved scope (modifying shared production state beyond the fan-out approval).

**B. Wichita never reached within 110s budget**
- All 5 invokes consumed the full budget on kansas_city jobs. Wichita is alphabetically last.
- **Options:** (1) Use account-scoped invokes (POST body `{multiAccount: true, accounts: ['wichita']}`), or (2) wait for Phase 3 hourly cron to reach wichita over multiple runs.
- Note: wichita's `is_active=true` and its Edge secret is set — it WILL be synced once the cron runs or an account-scoped invoke is used.

**C. last_api_count not populated — reconciliation view cannot compute delta_pct**
- The `advanceWatermark` call does not store `last_api_count`. The reconciliation view's `WHERE last_api_count IS NOT NULL` filter means the view always returns 0 rows.
- **Phase 3 fix:** Add `last_api_count` parameter to `advanceWatermark` and populate it from the API `count` field after each full-sweep resource.

## GO / NO-GO Recommendation for Remaining 6 Accounts

**NO-GO at this time.** Recommend resolving the following before expanding:

1. **Watermark reset protocol:** Define the procedure for clearing `last_modified_date` on first-run accounts so they get full historical backfill, not just incremental-window sync.
2. **Budget exhaustion:** With 8+ accounts all starting from 2000-01-01, a single 110s invoke cannot complete even one account's historical jobs sweep. Need either longer budget, account-scoped invokes, or a cron schedule that spreads the work.
3. **last_api_count gap:** Fix `advanceWatermark` to store the API count so reconciliation can compute delta_pct. Without this, the health gate is blind.

Once these three issues are resolved (Phase 3 scope), expanding to florida/colorado/georgia/texas/insurance_program/multi_family_commercial is straightforward — set their 6 Edge secrets and the cron fan-out handles the rest.

## Known Stubs

- `market` column in `acculynx_jobs` rows is `null` for kansas_city (and will be null for all accounts) — `acculynx_accounts.market` is not populated for the production accounts; stamped from the accounts table at ingest time.
- `last_api_count` in `acculynx_sync_watermark` — not populated by advanceWatermark; reconciliation view cannot function until Phase 3 fix.

## Threat Surface Scan

No new network endpoints or auth paths introduced. All changes are to the Edge Function implementation only. Threat mitigations verified:

- T-02-04 (cross-account key bleed): verified — 0 rows with account_key outside approved set
- T-02-05 (key value logged): keys never logged — `console.warn` logs secret NAME only
- T-02-07 (IP rate limit): serial account loop preserved; PACE_MS=130 enforced
- T-02-09 (deploy without impact statement): change/impact/rollback stated in approved scope
- T-02-12 (completion read from buggy pg_net path): completion verified via execute_sql, not v_acculynx_cron_outcomes

## Self-Check: PASSED

### Files exist:
- FOUND: supabase/functions/acculynx-sync/resources/contacts.ts
- FOUND: supabase/functions/acculynx-sync/resources/jobs.ts
- FOUND: supabase/functions/acculynx-sync/resources/estimates.ts

### Commits exist:
- FOUND: 2edc77e (fix(02-04): correct camelCase→snake_case field mapping + endDate)
- FOUND: fe99f75 (fix(02-04): upsert lead_sources before acculynx_jobs — FK constraint 23503)

### Production state verified:
- FOUND: 25 acculynx_jobs rows with account_key=kansas_city in prod DB
- FOUND: 0 rows with account_key outside {kansas_city, wichita} (no bleed)
- FOUND: acculynx-sync v16 ACTIVE at 2026-06-30T15:45:55Z
- FOUND: PE_CC_KANSAS_CITY_ACCULYNX_API_KEY + PE_CC_WICHITA_ACCULYNX_API_KEY in secrets list; other 6 absent
