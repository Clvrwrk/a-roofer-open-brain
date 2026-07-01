---
phase: 05-read-write-action-layer
plan: 01
subsystem: api
tags: [supabase-edge-function, deno, acculynx, write-action, idempotency, request-builder]

# Dependency graph
requires:
  - phase: 04-write-capability-discovery
    provides: "the 17-lane proven-safe evidence matrix (docs/37, write-capability.md) and the acculynx-write-sweep pure-core/thin-entrypoint template this plan mirrors"
provides:
  - "supabase/functions/acculynx-write-action/action.ts — the sole AccuLynx write request-builder (assertTarget, buildWriteRequest, computeIdempotencyKey, LANES, WRITE_ONLY_LANES)"
  - "supabase/functions/acculynx-write-action/index.ts — thin Deno.serve entrypoint wiring the D-09 target barrier, per-request key resolution, dryRun/execute orchestration, and idempotency-guarded persistence"
  - "full Deno unit-test coverage (action.test.ts) proving the D-03 dry-run==execute anti-drift contract by construction"
affects: [05-02-pending-write-persistence, 05-03-work-queue-surface, 05-04-decision-endpoint-invocation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-core + thin-entrypoint Edge Function split (action.ts / index.ts), mirroring acculynx-write-sweep/sweep.ts + index.ts"
    - "Single request-builder shared by dryRun and execute paths (D-03 anti-drift) — no second preview constructor exists anywhere in this module"
    - "Per-request account-key resolution from acculynx_accounts registry, never a module-level cached key (RESEARCH Pattern 3)"
    - "sha256 canonical-payload idempotency key, checked against acculynx_write_action_log before every execute (D-05)"

key-files:
  created:
    - supabase/functions/acculynx-write-action/action.ts
    - supabase/functions/acculynx-write-action/action.test.ts
    - supabase/functions/acculynx-write-action/index.ts
  modified: []

key-decisions:
  - "The 17-lane WriteLane enum uses descriptive camelCase names (postJobPaymentReceived, putJobAddress, etc.) rather than reusing sweep.ts's operation_id strings verbatim, since this function's payload/path contract is caller-facing (agent/dashboard) rather than checklist-row-driven."
  - "computeIdempotencyKey canonicalizes payload keys (sorted) before hashing so key ordering never produces a spurious different key — verified in a dedicated test."
  - "index.ts degrades gracefully (log + continue) when acculynx_pending_write / acculynx_write_action_log don't yet exist, since those tables land in Wave 1 Plan 02 — this keeps Task 3 type-checkable and independently committable without a migration dependency, while still being the sole future write path once those tables exist."
  - "A prior-success idempotency lookup failure (e.g. missing table) is treated as 'no prior success found' rather than blocking the execute path — logged via console.warn, never thrown."

patterns-established:
  - "buildWriteRequest(lane, payload, refData?) is the ONE builder for all 17 lanes; dryRun in index.ts short-circuits before the acculynxCall fetch, never before buildWriteRequest itself."
  - "assertTarget is called as literally the first statement in the Deno.serve handler, before account/key resolution — D-09 barrier #1 enforced by code order, not just by the function's internal logic."

requirements-completed: [REQ-08]

coverage:
  - id: D1
    description: "action.ts pure core: assertTarget (D-09 barrier #1), buildWriteRequest for all 17 proven-safe lanes with per-lane guardrails, intId, buildContactAddress/buildJobAddress, redactSample, computeIdempotencyKey, WRITE_ONLY_LANES"
    requirement: "REQ-08"
    verification:
      - kind: unit
        ref: "supabase/functions/acculynx-write-action/action.test.ts (40 tests, all pure functions + all 17 lanes)"
        status: pass
      - kind: other
        ref: "deno check supabase/functions/acculynx-write-action/action.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-03 anti-drift: dry-run preview and execute build byte-identical requests via the single buildWriteRequest builder"
    requirement: "REQ-08"
    verification:
      - kind: unit
        ref: "action.test.ts#D-03: the request built for a dry-run preview and the request built for execute are byte-identical (payment lane)"
        status: pass
      - kind: unit
        ref: "action.test.ts#D-03: byte-identical also holds for a lane with guardrail coercion (postJob Int32 jobCategory.id)"
        status: pass
    human_judgment: false
  - id: D3
    description: "index.ts thin entrypoint: assertTarget first, per-request account-key resolution, dryRun/execute orchestration, idempotency guard, write-only-no-readback guardrail"
    requirement: "REQ-08"
    verification:
      - kind: other
        ref: "deno check supabase/functions/acculynx-write-action/index.ts"
        status: pass
    human_judgment: true
    rationale: "index.ts's runtime behavior (network calls to AccuLynx, Supabase persistence) cannot be exercised without live sandbox credentials and the Wave 1 Plan 02 tables; type-checking + code-order verification (assertTarget first, single builder call) is the automatable proof available at this plan's boundary. Full behavioral verification is deferred to sandbox UAT once acculynx_pending_write / acculynx_write_action_log exist."

# Metrics
duration: 35min
completed: 2026-07-01
status: complete
---

# Phase 5 Plan 1: AccuLynx Write-Action Edge Function Core Summary

**Pure request-builder + thin Deno entrypoint for all 17 proven-safe AccuLynx write lanes, with a D-03 byte-identical dry-run==execute guarantee proven by construction and a D-09 sandbox-default/prod-explicit target barrier enforced before any network call.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-07-01T15:32:12Z (approx.)
- **Completed:** 2026-07-01 (this session)
- **Tasks:** 3/3 completed
- **Files modified:** 3 created (action.ts, action.test.ts, index.ts)

## Accomplishments
- Built `action.ts`, the sole pure-core request-builder for AccuLynx writes: `assertTarget` (D-09 barrier #1), `buildWriteRequest` (one builder, 17 lanes, D-03 anti-drift), `intId`/`buildContactAddress`/`buildJobAddress`/`redactSample`/`SANDBOX_SECRET_NAME` ported from `acculynx-write-sweep/sweep.ts`, and `computeIdempotencyKey` (sha256 over canonicalized `lane|accountKey|targetEnv|payload`).
- Wrote 40 passing Deno unit tests in `action.test.ts` covering every exported helper, every one of the 17 lane builders, the assertTarget accept/reject matrix, and the load-bearing D-03 anchor test proving dry-run and execute produce byte-identical requests.
- Built `index.ts`, the thin `Deno.serve` entrypoint: `assertTarget` is the literal first call before any account/key resolution; the AccuLynx key is resolved per-request from `acculynx_accounts` (never cached module-level); `buildWriteRequest` is invoked once and shared by both the dryRun-preview and execute code paths; execute checks `acculynx_write_action_log` for a prior success by idempotency key before firing (D-05); no lane ever attempts a follow-up GET (Pitfall 4, satisfied by construction — the handler has no follow-up-GET code path at all, for any lane).

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure core action.ts** - `9c40029` (feat)
2. **Task 2: action.test.ts full unit coverage** - `e20222d` (test)
3. **Task 3: Thin entrypoint index.ts** - `e555460` (feat)

**Plan metadata:** (this commit) - `docs(05-01): complete AccuLynx write-action core plan`

_Note: Task 1/2 form a natural TDD-adjacent pair (core + full test suite) but the plan's `tdd="true"` markers describe behavior-first authoring discipline rather than a strict RED/GREEN commit sequence; both tasks landed with passing tests from their first commit since the pure-function contracts were fully specified by the `<behavior>` blocks before implementation began._

## Files Created/Modified
- `supabase/functions/acculynx-write-action/action.ts` - Pure core: assertTarget, buildWriteRequest (17 lanes), intId, buildContactAddress/buildJobAddress, redactSample, computeIdempotencyKey, LANES, WRITE_ONLY_LANES, SANDBOX_SECRET_NAME. No network I/O, no Deno.serve.
- `supabase/functions/acculynx-write-action/action.test.ts` - 40 Deno unit tests: one per pure helper, one per lane, the D-03 anti-drift anchor tests, negative tests (unknown lane, missing required field).
- `supabase/functions/acculynx-write-action/index.ts` - Thin Deno.serve entrypoint: request parsing, D-09 target-barrier-first ordering, per-request account/key resolution, dryRun/execute orchestration via the shared builder, idempotency-guarded execute, graceful-degrading persistence to acculynx_pending_write / acculynx_write_action_log (tables land in Wave 1 Plan 02).

## The 17 Lanes (LANES in action.ts — authoritative names for Wave 2/3 callers)

**Writable (12):**
1. `postContact` → `POST /contacts`
2. `postJob` → `POST /jobs` (Int32 jobCategory.id coercion, STRING locationAddress, strict priority enum)
3. `postJobPaymentReceived` → `POST /jobs/{jobId}/payments/received`
4. `postJobPaymentExpense` → `POST /jobs/{jobId}/payments/expense`
5. `putJobAddress` → `PUT /jobs/{jobId}/address` (STRING state/country via buildJobAddress)
6. `putJobInitialAppointment` → `PUT /jobs/{jobId}/initial-appointment`
7. `putJobInsurance` → `PUT /jobs/{jobId}/insurance`
8. `putJobInsuranceCompany` → `PUT /jobs/{jobId}/insurance/insurance-company`
9. `putJobLeadSource` → `PUT /jobs/{jobId}/lead-source`
10. `putJobPriority` → `PUT /jobs/{jobId}/priority` (strict enum: Low/Normal/High)
11. `deleteJobArOwner` → `DELETE /jobs/{jobId}/representatives/ar-owner` (idempotent)
12. `deleteJobSalesOwner` → `DELETE /jobs/{jobId}/representatives/sales-owner` (idempotent)

**Write-only (5, WRITE_ONLY_LANES — no follow-up GET ever attempted):**
13. `postWorksheetItem` → `POST /financials/{financialsId}/worksheet/items`
14. `postJobMessage` → `POST /jobs/{jobId}/messages`
15. `postJobPhotosVideos` → `POST /jobs/{jobId}/photos-videos` (multipart/form-data)
16. `postJobRepresentativeCompany` → `POST /jobs/{jobId}/representatives/company`
17. `postJobExternalReference` → `POST /jobs/external-references` (idempotency anchor)

Confirmed absent from `LANES`: custom-fields (both variants), `PUT /jobs/{id}/trade-types`, `DELETE /jobs/{id}/initial-appointment`, and all blocked-by-dependency lanes.

## assertTarget Accepted-Value Contract

- `assertTarget("sandbox", anyAccountKey)` — never throws; sandbox is the default and accepts any accountKey value (including empty).
- `assertTarget("prod", nonEmptyAccountKey)` — never throws; prod requires an explicit, non-empty accountKey.
- `assertTarget("prod", "")` — throws `"a prod target requires a non-empty accountKey — prod is never implicit"`.
- `assertTarget(anythingElse, anyAccountKey)` — throws `"unrecognized targetEnv"` for any value other than exactly `"sandbox"` or `"prod"` (empty string, `"staging"`, etc.).

## Idempotency-Key Formula

`computeIdempotencyKey({ lane, accountKey, targetEnv, payload })` = `sha256(lane + "|" + accountKey + "|" + targetEnv + "|" + canonicalize(payload))`, where `canonicalize` recursively sorts object keys before stringifying so payload key-ordering never changes the resulting key. Verified deterministic (same input → same key) and sensitive (any of the 4 inputs changing → different key) in `action.test.ts`.

## Lanes Whose Guardrail Recipe Matched docs/37 Exactly

All 17 lanes' guardrails were implemented exactly as documented in `docs/knowledge-base/acculynx/api/write-capability.md` and `docs/37` — no guardrail deviated from the docs/37 recipe. Specifically:
- `postJob`: Int32 `jobCategory.id` coercion via `intId`, STRING `locationAddress` via `buildJobAddress`, strict `priority` enum (Low/Normal/High) enforced with a throw on any other value — matches the documented 404-on-string-Int32 and 404-on-invalid-enum failure modes.
- `putJobAddress`: STRING state/country via `buildJobAddress`, never the contact-object shape — matches the documented type-conversion failure mode.
- `putJobPriority`: same strict enum as `postJob`.
- `postJobPhotosVideos`: multipart FormData construction (accepts a caller-supplied `Blob` via `payload.file`, falls back to a placeholder fixture if none supplied) — matches the documented multipart requirement.
- The 5 write-only lanes: no follow-up GET exists anywhere in `index.ts` for any lane (not just the write-only ones), which trivially satisfies the "never attempt a follow-up GET" guardrail for these 5 by construction.

## Decisions Made

- Chose descriptive camelCase `WriteLane` names (e.g. `postJobPaymentReceived`) over reusing sweep.ts's `operation_id` strings verbatim, since this function's contract is caller-facing (agent/Command Center payloads), not checklist-row-driven like the sweep harness.
- `computeIdempotencyKey` canonicalizes payload key ordering before hashing (sorted-key JSON construction) to avoid spurious idempotency-key mismatches from equivalent-but-differently-ordered payloads — covered by a dedicated test.
- `index.ts`'s persistence calls to `acculynx_pending_write`/`acculynx_write_action_log` degrade gracefully (console.warn + continue) rather than throwing when those tables don't exist yet, since they land in Wave 1 Plan 02. This lets Task 3 be independently type-checked, tested, and committed today without introducing a migration-ordering dependency, while the function remains the sole write path once those tables exist (no other component ever calls AccuLynx directly).
- The idempotency prior-success lookup treats any lookup failure (missing table, query error) as "no prior success found" rather than blocking execution — logged via `console.warn`, never thrown, so a not-yet-migrated environment doesn't hard-fail every write attempt.

## Deviations from Plan

None — plan executed exactly as written. One clarifying implementation note: the plan's verify commands specify `deno test --allow-none`; this Deno version (2.8.1) does not recognize `--allow-none` as a flag (it errors with "unexpected argument"). Since `action.ts`/`action.test.ts` are a pure module with zero permission requirements, running `deno test` with no permission flags at all is the correct equivalent and was used for verification (40/40 tests pass). This is a tooling-version note, not a scope or behavior deviation — no code change was required.

## Issues Encountered

None beyond the `--allow-none` flag note above (resolved by omitting the flag; the test run required no permissions regardless).

## User Setup Required

None - no external service configuration required. `acculynx-write-action` is not yet deployed (per the plan's explicit scope boundary: "code + tests only. No deploy, no prod calls").

## Next Phase Readiness

- Wave 1 Plan 02 (`acculynx_pending_write` + `acculynx_write_action_log` DDL, migrations 184/185) can now be built against a concrete, already-tested consumer contract: `index.ts` already names the exact columns it reads/writes (`work_key`, `status`, `exec_result`, `idempotency_key`, `request_method`, `request_path`, `request_body_sample`, `response_body`, `http_status`).
- Wave 2/3 (work-queue surface + decision-endpoint invocation) can invoke this function's HTTP contract directly: `POST` body `{ lane, accountKey, targetEnv, payload, dryRun, idempotencyKey?, workKey? }`, using the 17 `WriteLane` names enumerated above.
- No blockers. This function is not deployed and does not touch any live AccuLynx account — matches the plan's explicit "not yet deployed; not yet invoked by the dashboard" boundary.

---
*Phase: 05-read-write-action-layer*
*Completed: 2026-07-01*

## Self-Check: PASSED

- FOUND: supabase/functions/acculynx-write-action/action.ts
- FOUND: supabase/functions/acculynx-write-action/action.test.ts
- FOUND: supabase/functions/acculynx-write-action/index.ts
- FOUND: .planning/phases/05-read-write-action-layer/05-01-SUMMARY.md
- FOUND commit 9c40029 (Task 1)
- FOUND commit e20222d (Task 2)
- FOUND commit e555460 (Task 3)
