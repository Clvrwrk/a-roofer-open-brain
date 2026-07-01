---
phase: 04-sandbox-write-capability-exploration-red-team
plan: 01
subsystem: api
tags: [acculynx, supabase, deno, edge-function, postgres, sandbox, red-team, write-capability]

# Dependency graph
requires:
  - phase: 01-acculynx-read-sweep
    provides: acculynx-read-sweep Edge Function (assertSandbox/redactSample/pathParams pattern), acculynx_api_catalog/probe DDL shape, acculynx_get_checklist seed pattern, read-sweep reconcile SQL
provides:
  - acculynx_write_catalog + acculynx_write_probe evidence tables (DDL 182, applied to prod)
  - acculynx_write_checklist 38-endpoint target list (seed 183, applied to prod)
  - acculynx-write-sweep pure core (assertSandbox hard gate, redactSample, pathParams, shouldStopProbing, buildContactAddress/buildJobAddress)
  - failing-first-then-green Deno unit tests for the sweep core
  - write-sweep reconciliation gate SQL (coverage + 2xx-shape + sandbox-only + blocked-dep-evidence assertions)
affects: [04-02, 04-03, 04-04, phase-05-write-action-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Interface-first Wave 0: evidence tables + checklist seed + pure sweep core defined before any sweep-execution plan"
    - "Two-distinct-builder rule for AccuLynx address asymmetry (contact=objects, job=strings) — never share one builder"
    - "Pure shouldStopProbing(history) so D-05's red-team stop rule is unit-testable without a live sandbox call"

key-files:
  created:
    - schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql
    - schemas/cleverwork-roofer/183-acculynx-write-checklist-seed.sql
    - supabase/functions/acculynx-write-sweep/sweep.ts
    - supabase/functions/acculynx-write-sweep/sweep.test.ts
    - scripts/acculynx-write-sweep-reconcile.sql
  modified:
    - app/command-center/src/lib/version.ts

key-decisions:
  - "Added a 6th verdict value `read-shaped` to acculynx_write_catalog.verdict (per RESEARCH Open Question 3) for the two search-shaped POSTs (postJobsSearch, postContactsSearch), rather than folding them into `writable` + a notes hint"
  - "Migration 183's acculynx_write_checklist is a table distinct from 182's acculynx_write_catalog: checklist = INPUT target list, catalog = evidence OUTPUT"
  - "Reconcile SQL added an optional 4th assertion (blocked_dep_missing_evidence) enforcing that any blocked-by-dependency verdict carries notes/guardrail_notes evidence, not a bare verdict"

patterns-established:
  - "Pattern 1: additive/idempotent write-evidence DDL mirroring the read-side, extended for method + red-team dimension + side-effect + tag+leave traceability"
  - "Pattern 2: address-shape asymmetry encoded as two separate pure builders with unit tests asserting object-vs-string state/country"

requirements-completed: [REQ-06]

# Metrics
duration: ~10min
completed: 2026-07-01
---

# Phase 4 Plan 01: Write-Sweep Wave 0 Foundation Summary

**Sandbox write-capability evidence tables (acculynx_write_catalog/probe), a 38-endpoint checklist seed (19 POST / 15 PUT / 4 DELETE), and the pure `acculynx-write-sweep` core (hard sandbox gate, PII redaction, D-05 stop-rule, contact-vs-job address builders) with green Deno tests — all migrations applied and verified live in prod `rnhmvcpsvtqjlffpsayu`.**

## Performance

- **Duration:** ~10 min (executor tasks 1–4) + orchestrator-applied checkpoint
- **Started:** 2026-07-01T09:11:00Z (approx, first task commit)
- **Completed:** 2026-07-01 (Task 5 applied + verified by orchestrator)
- **Tasks:** 5 (4 executor-built + 1 blocking human-action apply)
- **Files modified:** 5 created (+ version.ts auto-bump per task commit)

## Accomplishments

- **DDL 182** — two new additive/idempotent tables (`acculynx_write_catalog`, `acculynx_write_probe`) mirroring the read-side shape, extended per D-02 for verdict, tier, red-team dimension, side-effect, and D-04 tag+leave traceability (`run_tag`, `created_entity_id`); deny-by-default RLS + grants; unique index on `(endpoint_pattern, method)`.
- **Seed 183** — `acculynx_write_checklist` seeded with exactly 38 write endpoints (14 deep-tier with the full 5-dimension red-team list, 24 smoke-tier), matching the locked 19/15/4 method split.
- **sweep.ts** — pure, unit-tested core: `assertSandbox` hard gate (copied verbatim from read-sweep, rejects all 8 prod key names), `redactSample`, `pathParams`, new `shouldStopProbing` (D-05 2-consecutive-no-new-signal rule), and the two distinct address builders encoding the object-vs-string asymmetry.
- **sweep.test.ts** — 12 Deno tests, written failing-first (RED) then green (GREEN).
- **reconcile SQL** — 4-assertion gate mirroring the read-sweep reconcile, retargeted to the write tables, 2xx-generalized shape check, plus a blocked-dependency-evidence assertion.
- **Migrations 182 + 183 applied to prod** `rnhmvcpsvtqjlffpsayu` via Supabase MCP `apply_migration` (by the orchestrator at the blocking checkpoint) and **verified live**: all 3 tables present in `information_schema`, `acculynx_write_checklist` count = 38, method breakdown POST:19 / PUT:15 / DELETE:4, tier breakdown deep:14 / smoke:24.

## Task Commits

Each task was committed atomically:

1. **Task 1: DDL 182 (write catalog + probe)** — `3aed3cf` (feat)
2. **Task 2: Checklist seed 183 (38 rows)** — `b4a922d` (feat)
3. **Task 3 RED: failing sweep tests** — `32dc5d6` (test)
4. **Task 3 GREEN: sweep.ts core** — `a82e092` (feat)
5. **Task 4: reconcile gate SQL** — `40939f3` (feat)
6. **Task 5: apply 182 + 183 to prod** — applied by the orchestrator via Supabase MCP `apply_migration` (not a repo commit; the SQL files are already committed in Tasks 1–2). Live verification passed (3 tables, 38 checklist rows).

**Plan metadata:** committed with this SUMMARY.

_TDD note: Task 3 has the RED (`test`) → GREEN (`feat`) commit pair; no refactor was needed._

## Files Created/Modified

- `schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql` — `acculynx_write_catalog` (evidence verdict per endpoint, 6-value verdict CHECK including `read-shaped`) + `acculynx_write_probe` (per-attempt evidence, red-team dimension, tag+leave columns); RLS + grants + indexes.
- `schemas/cleverwork-roofer/183-acculynx-write-checklist-seed.sql` — `acculynx_write_checklist` table + 38-row idempotent seed (`on conflict (operation_id) do nothing`).
- `supabase/functions/acculynx-write-sweep/sweep.ts` — pure sweep core (hard gate, redaction, stop-rule, address builders); no `paginationParam` (writes don't paginate); no literal secret value.
- `supabase/functions/acculynx-write-sweep/sweep.test.ts` — 12 Deno unit tests covering all five behaviors.
- `scripts/acculynx-write-sweep-reconcile.sql` — 4-assertion phase gate.
- `app/command-center/src/lib/version.ts` — auto-bumped by the commit hook on each task commit (expected repo behavior).

## Decisions Made

- **`read-shaped` 6th verdict value** added to `acculynx_write_catalog.verdict` (RESEARCH Open Question 3) for `postJobsSearch`/`postContactsSearch`, which carry no side effect and don't fit the other five verdicts cleanly. Documented in a column comment.
- **Checklist vs catalog as two tables** — kept distinct per the RESEARCH architecture diagram: 183's `acculynx_write_checklist` is the input target list; 182's `acculynx_write_catalog` is the evidence output.
- **Optional 4th reconcile assertion** (`blocked_dep_missing_evidence`) added per RESEARCH Anti-Patterns to prevent a bare `blocked-by-dependency` verdict without evidence.

## Deviations from Plan

None — plan executed exactly as written. Task 5 was applied by the orchestrator at the blocking human-action checkpoint (the executor has no Supabase MCP access, exactly as the plan anticipated); no self-apply was fabricated.

## Issues Encountered

None. The executor stopped cleanly at the Task 5 blocking checkpoint (no MCP access), returned the structured human-action checkpoint with the exact SQL file paths and verification query, and the orchestrator applied + verified the migrations before resume.

## User Setup Required

None — no new external service configuration. The sandbox Edge secret (`PE_CC_SANDBOX_ACCULYNX_API_KEY`) and prod Supabase project were already provisioned by prior phases. The `acculynx-write-sweep` Edge Function will need `supabase functions deploy` in a later plan (Wave 2/3), not this Wave 0 plan.

## Next Phase Readiness

- Wave 0 contracts are live: downstream plans (04-02 index implementation, 04-03 sweep execution, 04-04 matrix generation) can now read `acculynx_write_checklist`, import the pure `sweep.ts` functions, and write into `acculynx_write_catalog`/`acculynx_write_probe`.
- No blockers. The `index.ts` Edge Function entrypoint (checklist walk, dependency-ordered creation, persistence) is the next build target and is intentionally out of scope for this interface-first Wave 0 plan.

## Self-Check: PASSED

All 5 created files exist on disk; all 5 task commits (`3aed3cf`, `b4a922d`, `32dc5d6`, `a82e092`, `40939f3`) exist in git history. `deno test supabase/functions/acculynx-write-sweep/` — 12/12 green. Migrations 182/183 verified live in prod (3 tables, 38 checklist rows).

---
*Phase: 04-sandbox-write-capability-exploration-red-team*
*Completed: 2026-07-01*
