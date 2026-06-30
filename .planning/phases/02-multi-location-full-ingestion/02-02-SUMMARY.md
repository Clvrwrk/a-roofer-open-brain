---
phase: 02-multi-location-full-ingestion
plan: "02"
subsystem: acculynx-sync
tags:
  - edge-function
  - tdd
  - wave-0-red
  - acculynx
  - multi-account
dependency_graph:
  requires:
    - 02-01 (migrations 168-170; v_acculynx_reconciliation created by mig 170 — needed for SQL gate in Plan 04)
  provides:
    - acculynx-sync source in repo (located from live Supabase project)
    - Wave 0 RED test suite (6 failing test files encoding REQ-03/REQ-04 contracts)
    - scripts/acculynx-reconcile-check.sql (content verified; functional gate Plan 04 Task 3)
  affects:
    - supabase/functions/acculynx-sync/ (new directory in repo)
    - scripts/ (new SQL smoke script)
tech_stack:
  added: []
  patterns:
    - "Deno unit tests with injected mock Supabase client (no live DB)"
    - "Wave 0 RED / Wave 1 GREEN TDD gate (lib stubs throw, resource stubs throw)"
    - "Stub bodies throw 'not implemented'; signatures are real for deno check"
key_files:
  created:
    - supabase/functions/acculynx-sync/index.ts (v10 downloaded from Supabase project rnhmvcpsvtqjlffpsayu)
    - supabase/functions/acculynx-sync/lib/accounts.ts
    - supabase/functions/acculynx-sync/lib/watermark.ts
    - supabase/functions/acculynx-sync/lib/diff.ts
    - supabase/functions/acculynx-sync/lib/accounts.test.ts
    - supabase/functions/acculynx-sync/lib/watermark.test.ts
    - supabase/functions/acculynx-sync/lib/diff.test.ts
    - supabase/functions/acculynx-sync/resources/contacts.ts (stub)
    - supabase/functions/acculynx-sync/resources/contacts.test.ts
    - supabase/functions/acculynx-sync/resources/jobs.ts (stub)
    - supabase/functions/acculynx-sync/resources/jobs.test.ts
    - supabase/functions/acculynx-sync/resources/job-walk.ts (stub)
    - supabase/functions/acculynx-sync/resources/job-walk.test.ts
    - scripts/acculynx-reconcile-check.sql
  modified:
    - supabase/functions/acculynx-sync/index.ts (fixed pre-existing TS2551 type error)
decisions:
  - "v10 downloaded via `supabase functions download acculynx-sync` from project rnhmvcpsvtqjlffpsayu — source was not committed; assumption A6 confirmed"
  - "lib/ stubs use real signatures with throwing bodies so deno check passes but tests fail (correct RED pattern)"
  - "resource stubs (contacts.ts, jobs.ts, job-walk.ts) created as minimal throwing stubs so test files can import and fail at runtime — import-failure approach was abandoned because deno test exits 0 on module-not-found"
  - "Pre-existing TS2551 bug in v10 index.ts (.catch() on PostgrestFilterBuilder) fixed inline (Rule 1 auto-fix)"
metrics:
  duration: "~45 minutes"
  completed: "2026-06-30T14:51:46Z"
  tasks_completed: 2
  files_changed: 15
---

# Phase 2 Plan 02: acculynx-sync Skeleton + Wave 0 FAILING Tests Summary

acculynx-sync v10 located from live Supabase project and committed to repo; 6 Wave 0 RED test files encode REQ-03/REQ-04 contracts (production-only fan-out, per-account watermark, mark-not-delete, pagination param split, account_key/market stamping, budget-stop, invoice two-level walk).

## What Was Built

### Task 1: Locate and Scaffold acculynx-sync

`supabase functions download acculynx-sync` succeeded — the v10 source was downloaded from project `rnhmvcpsvtqjlffpsayu`. The function was not previously committed to the repo (assumption A6 confirmed). The downloaded source was committed as the starting point.

Three lib/ modules were created alongside the downloaded v10 index.ts:

- `lib/accounts.ts`: `loadProductionAccounts(sb)` with `.eq("environment", "production")` filter; `resolveKey(acct)` calling `Deno.env.get(acct.env_secret_name)` (secret NAME only — hard rule 2). Both have real signatures with stub bodies (throw "not implemented") so Wave 0 tests fail.
- `lib/watermark.ts`: `readWatermark(sb, accountKey, resource)` + `advanceWatermark(sb, row)` with `onConflict: "account_key,resource"`. Stub bodies.
- `lib/diff.ts`: `markNotSeen(sb, table, accountKey, sweepStartedAt)` using `.update()` only — never `.delete()` (hard rule 1). Stub body.

`deno check` clean on all four core files.

### Task 2: Wave 0 FAILING Tests (RED)

Six test files written, all failing:

**lib/ tests (22 tests, all FAIL — lib stubs throw "not implemented"):**
- `accounts.test.ts`: asserts `.eq("environment","production")`, `.eq("is_active",true)`, sandbox exclusion, `order("account_key")`, error throw, `Deno.env.get()` return/skip behavior
- `watermark.test.ts`: asserts `onConflict:"account_key,resource"`, both `.eq()` filters, independence of `("kansas_city","contacts")` vs `("florida","contacts")`
- `diff.test.ts`: asserts `.update()` called with `archive_reason="not_seen_in_api"`, scoped to `account_key`, `.is("archived_at",null)`, `.lt("last_seen_by_api",sweepStartedAt)`, `.delete()` spy never invoked

**resources/ tests (15 tests, all FAIL — resource stubs throw "not implemented"):**
- `contacts.test.ts`: URL must contain `pageStartIndex` (not `recordStartIndex`), `account_key` stamped, `market` stamped, `last_seen_by_api` stamped, budget-stop with past deadline
- `jobs.test.ts`: URL must contain `recordStartIndex` (not `pageStartIndex`), `dateFilterType=ModifiedDate` in URL, `account_key` + `market` + `last_seen_by_api` stamped, budget-stop
- `job-walk.test.ts`: `/jobs/{id}/invoices` level-1 URL fetched, `/invoices/{invoiceId}` level-2 URL fetched per invoice, both URL shapes requested, watermark advanced, budget-stop handled cleanly

**Reconciliation SQL:**
`scripts/acculynx-reconcile-check.sql` queries `v_acculynx_reconciliation WHERE delta_pct IS NULL OR delta_pct > 5`. Content-verified in this plan; functional gate is Plan 04 Task 3.

## RED State Confirmed

```
deno test supabase/functions/acculynx-sync/lib/ --allow-env → exit 1 (22 failed, 0 passed)
deno test supabase/functions/acculynx-sync/resources/ --allow-env --allow-net=localhost → exit 1 (15 failed, 0 passed)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TS2551 type error in downloaded v10 index.ts**
- **Found during:** Task 1, `deno check supabase/functions/acculynx-sync/index.ts`
- **Issue:** `.catch(() => {})` chained on `sb.from("acculynx_raw").insert(...)` — `PostgrestFilterBuilder` does not have a `.catch()` method (TS2551: did you mean `.match`?)
- **Fix:** Removed `.catch(() => {})` — the insert is non-fatal (inside a try/catch block), so the result is simply ignored. No behavior change.
- **Files modified:** `supabase/functions/acculynx-sync/index.ts` line 205
- **Commit:** c0d8899

**2. [Rule 3 - Blocking] Resource stub approach changed**
- **Found during:** Task 2 resources/ test verification
- **Issue:** Original approach was to import non-existent modules (using `@ts-ignore`) so import failure would cause exit non-zero. But `deno test` exits 0 on module-not-found (it treats it as "no tests ran").
- **Fix:** Created minimal throwing stubs (`resources/contacts.ts`, `resources/jobs.ts`, `resources/job-walk.ts`) so imports succeed but all tests fail at runtime on the "not implemented" throw.
- **Files added:** `supabase/functions/acculynx-sync/resources/contacts.ts`, `jobs.ts`, `job-walk.ts`
- **Commit:** 34069f9

## Known Stubs

These stubs are INTENTIONAL in Wave 0 RED — they are the gate for Plan 03 (GREEN):

| Stub | File | Lines | Reason |
|------|------|-------|--------|
| `loadProductionAccounts` | `lib/accounts.ts` | body throws | Plan 03 GREEN implements real query |
| `resolveKey` | `lib/accounts.ts` | body throws | Plan 03 GREEN implements real Deno.env.get logic |
| `readWatermark` | `lib/watermark.ts` | body throws | Plan 03 GREEN implements real DB query |
| `advanceWatermark` | `lib/watermark.ts` | body throws | Plan 03 GREEN implements real upsert |
| `markNotSeen` | `lib/diff.ts` | body throws | Plan 03 GREEN implements real UPDATE |
| `syncContacts` | `resources/contacts.ts` | body throws | Plan 03 GREEN implements full-sweep loop |
| `syncJobs` | `resources/jobs.ts` | body throws | Plan 03 GREEN implements date-windowed loop |
| `syncJobWalk` | `resources/job-walk.ts` | body throws | Plan 03 GREEN implements two-level invoice walk |

The v10 index.ts is also a stub for Phase 2 purposes — it still uses the single `ACCULYNX_KEY` module-level variable from v10 rather than the new per-account fan-out. Plan 03 replaces the entry point body.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: module-level-api-key | `supabase/functions/acculynx-sync/index.ts` (line 18) | v10 uses `ACCULYNX_KEY = Deno.env.get("ACCULYNX_API_KEY")` — a single module-level key. This is the pre-existing Kansas-only v10 behavior. Plan 03 replaces this with the per-account fan-out using `resolveKey(acct)` (explicit parameter, no module-level shared key — Pitfall 3 mitigation). Threat T-02-04 is NOT yet mitigated in the live deployed function; mitigation lands in Plan 03. |

## Source Download Record

**Download command:** `supabase functions download acculynx-sync`
**Project:** `rnhmvcpsvtqjlffpsayu`
**Result:** SUCCESS — `supabase/functions/acculynx-sync/index.ts` downloaded (v10, 602 lines)
**Note:** The function was deployed but had never been committed to the repo (assumption A6 confirmed). The downloaded source was committed verbatim (minus the TS2551 bug fix) as the Wave 0 starting point.

## Self-Check: PASSED

All 15 created/modified files confirmed present on disk. Both task commits (c0d8899, 34069f9) verified in git log.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | c0d8899 | feat(02-02): locate acculynx-sync v10 in repo + lib/ module stubs |
| Task 2 | 34069f9 | test(02-02): Wave 0 RED tests — 6 failing test files + reconciliation SQL |
