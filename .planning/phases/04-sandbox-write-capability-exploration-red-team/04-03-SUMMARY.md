---
phase: 04-sandbox-write-capability-exploration-red-team
plan: 03
subsystem: api
tags: [acculynx, supabase, deno, edge-function, postgres, sandbox, red-team, write-capability, evidence, verdict-classifier]

# Dependency graph
requires:
  - phase: 04-01
    provides: acculynx_write_catalog/probe evidence tables, acculynx_write_checklist 38-endpoint target list, reconcile SQL gate, pure sweep.ts core
  - phase: 04-02
    provides: deployed acculynx-write-sweep Edge Function (index.ts) — hard sandbox gate, acculynxCall, reference-data prefetch, contact→job→financials walk, tiered red-team loop, persistence
provides:
  - "Populated acculynx_write_probe / acculynx_write_catalog evidence (batch wsweep-2026-07-01T13-33-02-965Z): 38/38 endpoints probed against the sandbox with an evidence-based verdict each"
  - "A deepened, evidence-correct harness: classifyVerdict2 (unsupported reserved for genuinely-absent routes), 10-GET reference prefetch (adds userId + workTypeId), multipart file uploads, child-id dependency notes, jobCategory Int32 coercion"
  - "Passing reconcile gate (scripts/acculynx-write-sweep-reconcile.sql — zero rows across all 4 assertions)"
  - "Human-confirmed final verdict tally (38/38): writable 12 · write-only 5 · fragile-with-guardrail 2 · read-shaped 2 · blocked-by-dependency 17 · unsupported 0"
affects: [04-04, phase-05-write-action-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evidence-correct verdict classification: a reachable 4xx (AccuLynx ProblemDetails body) or 5xx is NOT 'unsupported' — that verdict is reserved for a route that produced zero reachable signal across all its probes (classifyVerdict2 in sweep.ts, pure + unit-tested)"
    - "Child-id dependency evidence: CHILD_ID_SEED_NAME maps each op → [seedKey, label] so every blocked-by-dependency verdict carries a concrete missing-id note (never a bare verdict)"
    - "Multipart file-upload probes: postJobDocument/postJobPhotoVideo send multipart/form-data (in-memory GIF fixture) matching the OpenAPI content-type, not JSON"
    - "Type-fidelity of harvested reference ids: GUID-string ids pass through as strings, but jobCategory.id is Int32 — coerce back to number via intId() at the two job-category send sites"

key-files:
  created:
    - .planning/phases/04-sandbox-write-capability-exploration-red-team/04-03-SUMMARY.md
  modified:
    - supabase/functions/acculynx-write-sweep/sweep.ts
    - supabase/functions/acculynx-write-sweep/sweep.test.ts
    - supabase/functions/acculynx-write-sweep/index.ts
    - app/command-center/src/lib/version.ts

key-decisions:
  - "Reserve 'unsupported' for genuinely-absent routes only — a reachable validation 4xx (ProblemDetails body) or a 5xx crash is evidence the route EXISTS; classify those as blocked-by-dependency or fragile-with-guardrail instead"
  - "postContact/postJob get real catalog rows from their seed-step evidence (they were provably writable but had no catalog row — the 36/38 gap), never fabricated"
  - "Don't fake unavailable child ids: when a reference GET returns nothing in the sandbox, the dependent endpoint stays blocked-by-dependency WITH an evidence note naming the missing id"
  - "jobCategory.id is Int32 (unlike the GUID-string ids elsewhere in the surface) — a durable AccuLynx quirk captured as a guardrail"
  - "DELETEs are not body-seeded by the harness — a documented finding: DELETE endpoints with a required body (e.g. DELETE /jobs/{id}/initial-appointment wants {note}) surface as fragile-with-guardrail, not unsupported"

patterns-established:
  - "Pattern 1: pure, unit-tested verdict classifier (classifyVerdict2) separates the reachability judgement from the live harness so it stays testable without a sandbox call"
  - "Pattern 2: evidence-carrying blocked-by-dependency — the missing child id is always named, satisfying the reconcile gate's 'no bare blocked verdict' assertion"

requirements-completed: [REQ-06]

# Metrics
duration: ~40min
completed: 2026-07-01
---

# Phase 4 Plan 03: Sandbox Write-Sweep Execution & Evidence-Based Verdicts Summary

**Deepened the acculynx-write-sweep harness (evidence-correct classifier, child-id harvesting, multipart uploads, jobCategory Int32 fix) and drove a clean sandbox run — batch `wsweep-2026-07-01T13-33-02-965Z` — that probed all 38 write endpoints, produced a human-confirmed evidence-based verdict for each, and passed the reconcile gate with zero rows and zero `unsupported` verdicts.**

## Performance

- **Duration:** ~40 min (executor code-deepening across 3 commits + orchestrator re-deploy/re-run/Int32-fix/human-verify)
- **Started:** 2026-07-01T09:39:00Z (approx — first sweep run inspected by the orchestrator)
- **Completed:** 2026-07-01 (human-verify checkpoint passed on batch `wsweep-2026-07-01T13-33-02-965Z`)
- **Tasks:** 3 (Task 1 coverage, Task 2 deep-lane red-team, Task 3 reconcile + human review — all complete, Task 3 human-verified)
- **Files modified:** 3 harness files (`sweep.ts`, `sweep.test.ts`, `index.ts`) + `version.ts` auto-bump per commit

## Accomplishments

- **38/38 coverage with evidence-based verdicts** — clean run batch `wsweep-2026-07-01T13-33-02-965Z`: `contactId`, `jobId`, `financialsId` all seeded; `acculynx_write_catalog` carries all 38 rows (the 36/38 gap from the first run is closed).
- **Reconcile gate PASS** — `scripts/acculynx-write-sweep-reconcile.sql` returns ZERO rows across all 4 assertions (no unreconciled op, no 2xx with null summary, no non-sandbox row, no blocked-by-dependency without evidence).
- **`unsupported` count driven to 0** — the first run's classifier over-assigned `unsupported` to 18 reachable endpoints; the evidence-correct `classifyVerdict2` plus the harness deepening reclassified them correctly, and human-verify corrected the last one in place (DELETE initial-appointment).
- **Human-confirmed final tally (38/38):** `writable` 12 · `write-only` 5 · `fragile-with-guardrail` 2 · `read-shaped` 2 · `blocked-by-dependency` 17 · `unsupported` 0.

## Final Verified Verdict Tally (batch `wsweep-2026-07-01T13-33-02-965Z`)

| Verdict | Count | Notes |
|---------|-------|-------|
| writable | 12 | includes postContact + postJob (the dependency-root seeds, now catalogued) |
| write-only | 5 | no read-back path (messages / logs / etc.) |
| fragile-with-guardrail | 2 | `PUT /jobs/{id}/trade-types` (empty body → 500); `DELETE /jobs/{id}/initial-appointment` (needs a `{note}` body — 404 "A non-empty request body is required") |
| read-shaped | 2 | `POST /jobs/search`, `POST /contacts/search` |
| blocked-by-dependency | 17 | all evidence-backed, at genuine diminishing returns (see below) |
| unsupported | 0 | no genuinely-absent route in the 38 |

**The 17 blocked-by-dependency are evidence-backed at genuine diminishing returns** — the sandbox company simply has no configured child resources to seed them:
- No account-types configured → `payments/paid`, and documents blocked.
- No document-folders configured → `POST /jobs/{id}/documents` blocked.
- Message POST returns no id → replies can't be seeded.
- Subscriptions need a real webhook consumer (412).
- AR/sales-owner POST need a role-specific `CompanyUserId`.
- Custom-fields need a `CustomFieldType`.

The phantom `POST /jobs/{id}/measurements` is **absent** (it was never in the 38-endpoint surface — no synthetic row was ever created for it).

## Task Commits

1. **Task 1 (coverage) + Task 2 (deep-lane verdicts) — evidence-correct classifier (pure core):** `e257398` (fix) — `looksLikeProblemDetails` / `isReachableRoute` / `classifyVerdict2` / `VerdictInput` in `sweep.ts` + 19 new tests (31/31 green).
2. **Task 1/2 — harness deepening:** `eeb5f45` (feat) — `index.ts`: postContact/postJob catalog rows, 10-GET reference prefetch (adds `userId` + `workTypeId`), multipart document/photo uploads, `putTradeTypesForJob` `{items:[{id}]}` + empty-body-500 guardrail, `classifyVerdictForRow` adapter, `CHILD_ID_SEED_NAME` evidence map, `reference_data_missing` in the JSON summary.
3. **Task 1/2 — Int32 fix (orchestrator):** `45363dc` (fix) — `jobCategory.id` is Int32; `intId()` coercion at the job-seed body + PUT job-categories happy body (the string `"2"` had cascaded a 404 across 34 endpoints on the first re-run).
4. **Task 3 (reconcile + human review):** performed by the orchestrator — re-deploy (`supabase functions deploy acculynx-write-sweep`), re-run against the sandbox in isolation, reconcile gate (zero rows), and human-verify (1 in-place catalog correction: DELETE initial-appointment `unsupported` → `fragile-with-guardrail` with an evidence note).

**Plan metadata:** committed with this SUMMARY.

## Files Created/Modified

- `supabase/functions/acculynx-write-sweep/sweep.ts` — added the pure, unit-tested reachability + verdict helpers (`looksLikeProblemDetails`, `isReachableRoute`, `classifyVerdict2`, `VerdictInput`). The classification logic lives here so it stays testable without a live sandbox.
- `supabase/functions/acculynx-write-sweep/sweep.test.ts` — 19 new tests for the classifier/reachability helpers (31/31 total green).
- `supabase/functions/acculynx-write-sweep/index.ts` — deepened harness: postContact/postJob catalog rows from seed evidence; `GET /users` + `GET .../work-types` added to the reference prefetch; multipart `FormData` bodies for the two file-upload endpoints; `putTradeTypesForJob` corrected shape + empty-body-500 guardrail; every verdict now routed through `classifyVerdict2`; `CHILD_ID_SEED_NAME` names the exact missing dependency in evidence notes; `jobCategory.id` Int32 coercion via `intId()`.
- `app/command-center/src/lib/version.ts` — auto-bumped by the commit hook on each task commit (expected repo behavior).

## Decisions Made

- **`unsupported` is for genuinely-absent routes only.** A reachable validation 4xx (an AccuLynx ProblemDetails body: `type`/`title`/`status`/`detail`/`traceId`) or a 5xx crash proves the route exists and was reached. Those classify as `blocked-by-dependency` (missing/unavailable child id) or `fragile-with-guardrail` (5xx / observed guardrail). This was the core correctness fix — the first run's classifier had over-assigned `unsupported` to 18 reachable endpoints.
- **postContact/postJob get real catalog rows.** They are the dependency-root seeds and are provably writable (their 2xx ids seeded the whole sweep) — but had no catalog row on the first run. Their rows are written from the actual seed-step evidence, never fabricated.
- **Never fake an unavailable child id.** When a reference GET returns nothing in the sandbox, the dependent endpoint stays `blocked-by-dependency` with a note naming the missing id — satisfying the reconcile gate's "no bare blocked verdict" assertion.
- **`jobCategory.id` is Int32 — a durable AccuLynx quirk (guardrail).** Unlike the GUID-string ids everywhere else in the write surface, `jobCategory.id` is an Int32; the harvested reference id must be coerced back to a number before it's sent, or AccuLynx returns 404 "could not be converted to System.Int32" and the whole dependency chain collapses. Captured via `intId()` at the two send sites.
- **DELETE-body harness limitation is a documented finding, not a bug to force away.** The sweep issues DELETEs without a request body; a DELETE endpoint that requires one (e.g. `DELETE /jobs/{id}/initial-appointment` wants `{note}`) correctly surfaces as `fragile-with-guardrail` with an evidence note, not `unsupported`. This is a real characteristic of the write surface that Plan 04's matrix should carry forward.

## Deviations from Plan

The plan's original tasks assumed the first deployed harness was already sound and only needed to be *run*. In practice the first run's evidence revealed the classifier was unsound and the write-lane seeding was too shallow, so the plan was executed as a **harness-deepening pass** before re-running — handled under the deviation rules.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Verdict classifier over-assigned `unsupported` to reachable endpoints**
- **Found during:** Task 1/2 (inspecting the first run's evidence)
- **Issue:** 18 endpoints returning reachable validation 4xx (ProblemDetails bodies) were marked `unsupported`, implying the route didn't exist.
- **Fix:** Added `classifyVerdict2` (+ `isReachableRoute` / `looksLikeProblemDetails`) reserving `unsupported` for zero-reachable-signal routes; routed all verdicts through it.
- **Files modified:** `sweep.ts`, `sweep.test.ts`, `index.ts`
- **Verification:** 31/31 `deno test`; final run's `unsupported` count = 0.
- **Committed in:** `e257398`, `eeb5f45`

**2. [Rule 2 - Missing Critical] Missing postContact/postJob catalog rows (36/38)**
- **Found during:** Task 1 (coverage check)
- **Issue:** The two dependency-root seeds were skipped from the checklist walk to avoid double-creating parents, so they never got a catalog verdict — the catalog had 36 rows, not 38.
- **Fix:** Write their catalog rows directly from the real seed-step evidence right after `seedDependencyRoot`.
- **Files modified:** `index.ts`
- **Verification:** Catalog now 38/38; reconcile assertion (1) zero rows.
- **Committed in:** `eeb5f45`

**3. [Rule 1 - Bug] File-upload endpoints sent JSON instead of multipart/form-data**
- **Found during:** Task 2 (deep-lane red-team)
- **Issue:** `postJobDocument`/`postJobPhotoVideo` are multipart per the OpenAPI index; the JSON-body probes mis-negotiated content-type and returned bare 404s that looked `unsupported`.
- **Fix:** Extended `acculynxCall` to accept a `FormData` body; build a multipart body (in-memory GIF fixture + `documentFolderId`) for these two ops.
- **Files modified:** `index.ts`
- **Verification:** `deno check` clean; the route is now reached correctly (its true `blocked-by-dependency` on missing document-folders is now visible instead of a false `unsupported`).
- **Committed in:** `eeb5f45`

**4. [Rule 1 - Bug] `jobCategory.id` stringified → 404 Int32 conversion (first re-run regression)**
- **Found during:** First re-run (orchestrator) — `jobId=false` cascaded 34 endpoints to blocked
- **Issue:** `pick()` stringifies every harvested reference id, but `jobCategory.id` is Int32; sending `{id:"2"}` produced a 404 "could not be converted to System.Int32" that broke the dependency chain.
- **Fix:** `intId()` coercion at the job-seed body + PUT job-categories happy body.
- **Files modified:** `index.ts`, `version.ts`
- **Verification:** Clean re-run seeded `jobId` true; `deno test` 31/31; `deno check` clean.
- **Committed in:** `45363dc` (orchestrator)

**5. [Rule 1 - Bug] `CHILD_ID_SEED_NAME` label used as the seeds-map lookup key**
- **Found during:** Executor self-review (Task 2)
- **Issue:** The map used display labels (e.g. `"customFieldDefinitionId"`) as the lookup key into `seeds`, which stores that value under `seeds.customFieldId` — so every custom-field-dependent endpoint would have silently mis-reported its missing-seed status.
- **Fix:** Split the map into `[seedKey, label]` tuples; lookups use `[0]`, evidence notes use `[1]`.
- **Files modified:** `index.ts`
- **Verification:** `deno check` clean; missing-id detection now matches the real seeds keys.
- **Committed in:** `eeb5f45`

---

**Total deviations:** 5 auto-fixed (4 bugs, 1 missing-critical). One (Int32) was performed by the orchestrator on a re-run regression; the rest by the executor before the clean run.
**Impact on plan:** All were necessary for evidence correctness — the plan's goal is an *evidence-based* verdict per endpoint, and each fix removed a false verdict. No scope creep; the reconcile gate and human review confirmed the result is sound.

## Issues Encountered

- **First run's classifier was unsound + seeding too shallow** — surfaced by the initial human-verify checkpoint; resolved by the harness-deepening pass above.
- **First re-run regressed** on the `jobCategory.id` Int32 quirk (a subtle type-fidelity issue that only appears once the reference id is actually used in the job seed) — fixed surgically and re-run cleanly.
- No unresolved issues. Reconcile gate green; human-verify passed.

## Known Stubs

None. Every verdict is backed by a real sandbox probe row; no hardcoded/placeholder verdicts. The 17 `blocked-by-dependency` rows are genuine (missing sandbox child resources, evidence-noted), not stubs.

## User Setup Required

None — no external service configuration. `PE_CC_SANDBOX_ACCULYNX_API_KEY` and the prod Supabase project were provisioned by prior phases; the function was re-deployed by the orchestrator.

## Next Phase Readiness

- **Plan 04-04 (Wave 4)** can now generate the write-capability matrix directly from `acculynx_write_catalog` (D-03): regenerate `docs/37` + `docs/knowledge-base/acculynx/api/write-capability.md` from the 38 evidence rows, carrying forward the guardrail recipes (jobCategory Int32, trade-types empty-body 500, DELETE-body requirement, the address-shape asymmetry) and confirming the phantom `measurements` endpoint stays absent.
- **Phase 5 (write/action layer)** inherits an evidence-based capability map: 12 writable + 5 write-only endpoints are the confirmed-actionable surface; the 17 blocked-by-dependency each name exactly what sandbox/config prerequisite they need; the 2 fragile endpoints carry explicit guardrail notes for wrapper design.
- No blockers.

## Self-Check: PASSED

`.planning/phases/04-sandbox-write-capability-exploration-red-team/04-03-SUMMARY.md` exists on disk. Task commits `e257398`, `eeb5f45`, `45363dc` all present in git history. `deno check` clean and `deno test supabase/functions/acculynx-write-sweep/` 31/31 green. Reconcile gate confirmed zero rows by the orchestrator; human-verify passed on batch `wsweep-2026-07-01T13-33-02-965Z` (final tally: writable 12 · write-only 5 · fragile-with-guardrail 2 · read-shaped 2 · blocked-by-dependency 17 · unsupported 0).

---
*Phase: 04-sandbox-write-capability-exploration-red-team*
*Completed: 2026-07-01*
