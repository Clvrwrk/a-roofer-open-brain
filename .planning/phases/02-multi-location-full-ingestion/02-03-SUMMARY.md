---
phase: "02-multi-location-full-ingestion"
plan: "03"
subsystem: "acculynx-sync"
tags:
  - tdd
  - wave-2-green
  - edge-function
  - acculynx
  - multi-account
  - serial-fan-out
dependency_graph:
  requires:
    - 02-01 (migrations 168-170; resource_type column; diff columns on 12 tables)
    - 02-02 (Wave 0 RED test suite; lib stubs; resource stubs)
  provides:
    - "acculynx-sync lib/ fully implemented (accounts, watermark, diff)"
    - "acculynx-sync resources/ fully implemented (jobs, contacts, estimates, job-walk)"
    - "index.ts serial multi-account fan-out wiring all resources"
    - "37/37 Wave 0 tests GREEN"
  affects:
    - "02-04-PLAN.md (production fan-out deploy + reconciliation gate)"
tech_stack:
  added: []
  patterns:
    - "Deno unit tests with injected mock Supabase client (no live DB)"
    - "Serial account fan-out (for...of, never Promise.all) — 30 req/s IP limit"
    - "429 retry helper (acculynxGet) with explicit apiKey param per call"
    - "budget-stop: Date.now() >= deadline before each fetch; watermark advanced first"
    - "mark-not-seen diff: .update() only, never .delete() (hard rule 1)"
    - "pageStartIndex (contacts/estimates) vs recordStartIndex (jobs) per resource"
    - "two-level invoice walk: /jobs/{id}/invoices → /invoices/{invoiceId}"
key_files:
  created:
    - "supabase/functions/acculynx-sync/resources/estimates.ts"
  modified:
    - "supabase/functions/acculynx-sync/lib/accounts.ts"
    - "supabase/functions/acculynx-sync/lib/watermark.ts"
    - "supabase/functions/acculynx-sync/lib/watermark.test.ts"
    - "supabase/functions/acculynx-sync/lib/diff.ts"
    - "supabase/functions/acculynx-sync/resources/jobs.ts"
    - "supabase/functions/acculynx-sync/resources/contacts.ts"
    - "supabase/functions/acculynx-sync/resources/job-walk.ts"
    - "supabase/functions/acculynx-sync/index.ts"
decisions:
  - "WatermarkRow uses resource_type field (not resource) to match live column; watermark.test.ts updated to assert onConflict 'account_key,resource_type'"
  - "resolveLeadMilestones refactored from Promise.all batch to sequential loop — T-02-07 IP limit applies to all outbound fetches including legacy helpers"
  - "syncJobWalk accepts jobIds as explicit parameter (caller loads from DB) — keeps function pure/testable without live DB dependency"
  - "index.ts preserves all v10 legacy behavior (users, crm_pipeline, resolveLeads) under the non-multiAccount code path for backward compat"
metrics:
  duration: "~40 minutes"
  completed_date: "2026-06-30T15:45:00Z"
  tasks_completed: 3
  files_created: 1
  files_modified: 8
---

# Phase 02 Plan 03: Implement lib/ + resources/ to GREEN Summary

**One-liner:** lib/ and resources/ modules implemented with serial account fan-out, resource_type watermark, mark-not-delete diff, per-resource pagination split, and invoice two-level walk — 37/37 Wave 0 tests GREEN.

## What Was Built

### Task 1: lib/ — accounts, watermark, diff (22 tests GREEN)

**`lib/accounts.ts`**
- `loadProductionAccounts(sb)`: `.eq("environment","production").eq("is_active",true).order("account_key")` — filters sandbox, returns sorted list, throws on error.
- `resolveKey(acct)`: `Deno.env.get(acct.env_secret_name)` — returns `undefined` on missing (caller warns with NAME only, hard rule 2).

**`lib/watermark.ts`**
- `readWatermark(sb, accountKey, resource)`: `.eq("account_key",...).eq("resource_type",...).maybeSingle()` — uses live column name `resource_type`.
- `advanceWatermark(sb, row)`: `upsert(row, { onConflict: "account_key,resource_type" })` — non-fatal on error.

**`lib/diff.ts`**
- `markNotSeen(sb, table, accountKey, sweepStartedAt)`: `.update({archived_at,archive_reason}).eq("account_key").is("archived_at",null).lt("last_seen_by_api",sweepStartedAt)` — `.delete()` never called (hard rule 1).

### Task 2: resources/ — jobs, contacts, estimates (11 tests GREEN)

**`resources/jobs.ts` (`syncJobs`)**
- Endpoint: `GET /jobs?dateFilterType=ModifiedDate&startDate={wm}&recordStartIndex={offset}`
- Stamps `account_key`, `market`, `last_seen_by_api` on every upserted row.
- Upsert `onConflict: "id,account_key"`.
- Budget-stop check before each fetch; loop terminates on empty page.

**`resources/contacts.ts` (`syncContacts`)**
- Endpoint: `GET /contacts?pageSize=50&pageStartIndex={idx}`
- Full sweep; terminates on empty `items[]`.
- Stamps `account_key`, `market`, `last_seen_by_api` on every upserted row.
- `fetchFn` injectable for test isolation.

**`resources/estimates.ts` (`syncEstimates`)**
- Identical shape to contacts but endpoint `/estimates`, table `acculynx_estimates`.
- Additionally stamps `job_id` from `item.jobId`.

All three: `apiKey` explicit parameter (T-02-04), `acculynxGet` with 429 retry, `PACE_MS=130`, `deno check` clean.

### Task 3: job-walk + index.ts serial fan-out (4 + 0 net-new tests GREEN)

**`resources/job-walk.ts` (`syncJobWalk`)**
- Accepts `jobIds[]` from caller (avoids DB dependency in tests).
- Resumes from `watermark.last_walked_job_id` (skips already-walked jobs).
- Per job (serial): contacts, financials, insurance, milestone-history sub-resources.
- **Invoice two-level walk:** Level 1: `GET /jobs/{jobId}/invoices` → header upsert to `acculynx_invoices`; Level 2: `GET /invoices/{encodeURIComponent(invoiceId)}` → line items upsert to `acculynx_invoice_lines`.
- Advances `last_walked_job_id` via `sb.from("acculynx_sync_watermark").update(...)` AFTER each job, before budget break (Pitfall 5 — clean resumption).
- All GUID path params URL-encoded (T-02-08 / ASVS V5).

**`index.ts`** — replaced v10 single-account body with:
- `Deno.serve` POST-guard.
- `loadProductionAccounts(sb)` — production-only, sandbox excluded.
- Serial `for...of` account loop (never `Promise.all` — T-02-07).
- Per account: `resolveKey(acct)` → if undefined, `console.warn` the NAME only (T-02-05), `continue`.
- `runAccountSync(acct, apiKey, deadline)`: runs jobs → contacts → estimates → job-walk under shared deadline; calls `markNotSeen` after each full-sweep resource; calls `advanceWatermark` after each resource.
- Legacy v10 helpers (users, crm_pipeline, resolveLeads) preserved under `!multiAccount` path for backward compatibility.
- `multiAccount: true` in POST body enables the Phase 2 fan-out.

## Verification Passed

```
deno test supabase/functions/acculynx-sync/ --allow-env --allow-net=localhost
ok | 37 passed | 0 failed (6s)
```

| Acceptance Check | Result |
|-----------------|--------|
| lib tests 22/22 GREEN | PASS |
| contacts.test.ts + jobs.test.ts 11/11 GREEN | PASS |
| job-walk.test.ts 4/4 GREEN | PASS |
| `grep "ModifiedDate" resources/jobs.ts` | PASS |
| `grep "recordStartIndex" resources/jobs.ts` | PASS |
| `grep "pageStartIndex" resources/contacts.ts` | PASS |
| `grep "pageStartIndex" resources/estimates.ts` | PASS |
| `grep -E "\.update\(" lib/diff.ts` | PASS |
| `grep -E "\.delete\(" lib/diff.ts` | nothing (hard rule 1) |
| `grep "account_key,resource_type" lib/watermark.ts` | PASS |
| `grep -E "environment.*production" lib/accounts.ts` | PASS |
| `grep -E "invoices/\$\{" resources/job-walk.ts` | PASS |
| `grep "last_walked_job_id" resources/job-walk.ts` | PASS |
| `grep "loadProductionAccounts" index.ts` | PASS |
| `grep -E "Promise\.all" index.ts` | nothing (serial fan-out) |
| `deno check index.ts` | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] watermark.test.ts updated to use `resource_type` (live column name)**
- **Found during:** Task 1 implementation
- **Issue:** Wave 0 test was written with `resource` as the field name and asserted `onConflict: "account_key,resource"`. The live DB column (per 02-01-SUMMARY critical deviation) is `resource_type`. The `WatermarkRow` interface and all DB queries must use `resource_type` to match the actual UNIQUE constraint.
- **Fix:** Updated `WatermarkRow.resource` → `resource_type`, updated `watermark.test.ts` assertions from `"account_key,resource"` → `"account_key,resource_type"` and from `.eq("resource",...)` → `.eq("resource_type",...)`. This is a correction, not a weakening — the test now asserts the correct live column name.
- **Files modified:** `lib/watermark.ts`, `lib/watermark.test.ts`
- **Commit:** aad0067

**2. [Rule 1 - Bug] `resolveLeadMilestones` refactored from `Promise.all` to sequential loop**
- **Found during:** Task 3 acceptance criterion check
- **Issue:** The v10 `resolveLeadMilestones` used `Promise.all` over batches of 8 leads. The acceptance criterion requires `grep -E "Promise.all" index.ts` returns nothing. More importantly, T-02-07 requires serial execution across all outbound network calls to avoid the 30 req/s IP limit.
- **Fix:** Replaced the `Promise.all` batch with a sequential `for` loop with `BATCH_PACE_MS=150` inter-request pacing. Functionally equivalent — slightly slower for resolveLeads but correct under the IP rate limit.
- **Files modified:** `index.ts`
- **Commit:** d951c37

### Design Decisions Made During Implementation

**3. `syncJobWalk` accepts `jobIds` as explicit parameter**
- The plan said "iterate acculynx_jobs for the account sorted by created_date ASC". Examining the test mock, `syncJobWalk` receives `jobIds: string[]` directly from the caller. The `index.ts` caller queries `acculynx_jobs` and passes the IDs in. This keeps the function pure/testable without needing a live DB in tests.

**4. `index.ts` `multiAccount` flag for Phase 2 fan-out**
- A `multiAccount: true` POST body flag enables the Phase 2 fan-out path. When false (default), v10 behavior is preserved exactly. This allows gradual rollout without breaking existing consumers of the function.

## Known Stubs

None — all Wave 0 stubs have been replaced with real implementations.

## Threat Surface Scan

No new network endpoints or auth paths introduced. The `acculynx-sync` function already existed. Changes are:
- Serial account loop replaces single-account key — mitigates T-02-04 (explicit apiKey param, no module-level key per account iteration).
- `resolveKey` warns the secret NAME only on skip — mitigates T-02-05.
- `markNotSeen` uses `.update()` only — mitigates T-02-06.
- Serial loop, PACE_MS=130 — mitigates T-02-07.
- `encodeURIComponent` on all GUID path params — mitigates T-02-08.

## Self-Check: PASSED

### Created/modified files exist:
- FOUND: supabase/functions/acculynx-sync/lib/accounts.ts
- FOUND: supabase/functions/acculynx-sync/lib/watermark.ts
- FOUND: supabase/functions/acculynx-sync/lib/watermark.test.ts
- FOUND: supabase/functions/acculynx-sync/lib/diff.ts
- FOUND: supabase/functions/acculynx-sync/resources/jobs.ts
- FOUND: supabase/functions/acculynx-sync/resources/contacts.ts
- FOUND: supabase/functions/acculynx-sync/resources/estimates.ts
- FOUND: supabase/functions/acculynx-sync/resources/job-walk.ts
- FOUND: supabase/functions/acculynx-sync/index.ts

### Commits exist:
- FOUND: aad0067 (feat(02-03): implement lib/ — accounts, watermark, diff — lib tests GREEN)
- FOUND: 562677c (feat(02-03): implement resources/ — jobs, contacts, estimates)
- FOUND: d951c37 (feat(02-03): implement job-walk + index.ts serial fan-out — full suite 37/37 GREEN)
