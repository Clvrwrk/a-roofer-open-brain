---
phase: 04-sandbox-write-capability-exploration-red-team
plan: 02
subsystem: api
tags: [acculynx, supabase, deno, edge-function, postgres, sandbox, red-team, write-capability, http-client]

# Dependency graph
requires:
  - phase: 04-01
    provides: acculynx-write-sweep pure core (assertSandbox, redactSample, pathParams, shouldStopProbing, buildContactAddress/buildJobAddress), acculynx_write_catalog/probe evidence tables, acculynx_write_checklist 38-endpoint target list (all applied live to prod)
  - phase: 01-acculynx-read-sweep
    provides: acculynx-read-sweep/index.ts structural analog (hard-gate handler top, acculynxGet 429/backoff helper, probe-insert/catalog-upsert persistence block, json() helper)
provides:
  - acculynx-write-sweep Edge Function entrypoint (index.ts) — hard sandbox gate, generalized acculynxCall(method,url,body), 8-endpoint reference-data pre-fetch, contact→job→financialsId dependency walk, tiered deep/smoke red-team loop, DELETE lifecycle idempotency chain, verdict classification, persistence to acculynx_write_probe/catalog
  - deployed acculynx-write-sweep function (Supabase, ACTIVE version 1, verify_jwt=true)
affects: [04-03, 04-04, phase-05-write-action-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generalized acculynxCall(method,url,body) — read-sweep's acculynxGet 429/backoff logic verbatim, extended with Content-Type + JSON body for POST/PUT/DELETE"
    - "Per-operation buildRequestBody() switch: happy-path + bad-input variant per endpoint, encoding the RESEARCH dimension recipes (invalid enum, empty required array, wrong address shape, missing field, foreign id)"
    - "Tiered walk: deep tier iterates red_team_dimensions to shouldStopProbing; smoke tier runs happy-path + 1 bad-input; DELETE endpoints get a second-delete idempotency probe"
    - "Dependency-root seeded once (contact→job→financials), IDs reused across all dependent write probes (D-04 reuse-parents)"

key-files:
  created:
    - supabase/functions/acculynx-write-sweep/index.ts
  modified:
    - app/command-center/src/lib/version.ts

key-decisions:
  - "Raised RUNTIME_BUDGET_MS to 150s (from read-sweep's 110s) — the contact→job→financials dependency chain plus per-endpoint red-team loops need more headroom than a flat GET walk"
  - "Seeded the contact/job dependency roots directly at the top of the handler (their own probe rows) and skip re-probing postContact/postJob inside the checklist walk — avoids double-creating the shared parent entities the rest of the sweep depends on"
  - "bad-input probes encode the RESEARCH recipes concretely per operation (priority='Urgent' → 404, contactTypeIds:[] → 400, contact-shape address on a job endpoint, missing projectId on external-references, foreign UUID for authz/scope)"
  - "Task 3 deploy performed by the orchestrator via supabase functions deploy (executor has no authenticated Supabase CLI) — the deploy is a checkpoint, not a self-run"

patterns-established:
  - "Pattern 1: generalized write HTTP helper reusing the read-sweep rate-limit loop verbatim (Don't-Hand-Roll)"
  - "Pattern 2: tiered red-team walk (deep→stop-rule, smoke→happy+bad) driving persistence into the Wave 0 evidence tables"

requirements-completed: [REQ-06]

# Metrics
duration: ~15min
completed: 2026-07-01
---

# Phase 4 Plan 02: acculynx-write-sweep Edge Function Entrypoint Summary

**A sandbox-gated `acculynx-write-sweep` Edge Function (index.ts, 609 lines) that seeds a contact→job→financials dependency chain, then red-teams all 38 AccuLynx write endpoints — deep tier to the D-05 stop rule, smoke tier happy-path+bad-input, DELETE endpoints with a second-delete idempotency probe — importing the Wave 0 pure core and persisting redacted evidence to acculynx_write_probe/catalog; deployed ACTIVE version 1.**

## Performance

- **Duration:** ~15 min (Tasks 1–2 build + orchestrator-performed deploy checkpoint)
- **Started:** 2026-07-01T09:24:00Z (approx, first task commit)
- **Completed:** 2026-07-01 (Task 3 deploy confirmed by orchestrator)
- **Tasks:** 3 (2 executor-built + 1 blocking human-action deploy)
- **Files modified:** 1 created (`index.ts`) + version.ts auto-bump per task commit

## Accomplishments

- **Task 1 — harness skeleton:** hard sandbox gate (`assertSandbox` before any AccuLynx fetch; POST-only 405; missing-key 500); generalized `acculynxCall(method, url, body)` with the read-sweep 429/Retry-After/exponential-backoff loop verbatim plus `Content-Type: application/json` + JSON body; 8-endpoint reference-data pre-fetch (`Promise.all` of contact-types, job-categories, trade-types, lead-sources, states, custom-field defs, document-folders, account-types); contact→job→financialsId dependency-root seed with a short retry on empty financials (Open Question 1); `run_tag` stamped on every probe row (D-04); zero acculynx-sync fan-out (D-01).
- **Task 2 — tiered red-team loop:** per-operation `buildRequestBody()` producing a happy-path and a bad-input variant for all 38 checklist operations (invalid strict enum, empty required array, wrong address shape, missing required field, foreign UUID); deep tier iterates `red_team_dimensions` to `shouldStopProbing`, smoke tier runs happy-path + 1 bad-input; the 4 DELETE endpoints get a create→delete→second-delete idempotency chain; verdict classification into the 6-value catalog enum (writable / write-only / unsupported / fragile-with-guardrail / blocked-by-dependency / read-shaped); `redactSample` applied to BOTH `payload_sample` (response) and `request_body_sample` (outbound body); persistence inserts probe rows into `acculynx_write_probe` and upserts verdicts into `acculynx_write_catalog` on `(endpoint_pattern, method)`; returns a JSON summary (`batch_id`, `calls_made`, `probe_rows`, `verdicts` histogram).
- **Task 3 — deploy (orchestrator):** `supabase functions deploy acculynx-write-sweep --project-ref rnhmvcpsvtqjlffpsayu` uploaded index.ts + sweep.ts (test file excluded); function shows **ACTIVE, version 1, verify_jwt=true** (same posture as acculynx-read-sweep). Boot check: unauthenticated GET → HTTP 401 (platform JWT gate rejects before function code — confirms deployed + reachable). No new Edge secret needed (`PE_CC_SANDBOX_ACCULYNX_API_KEY` pre-exists). The sweep itself is NOT run here — Wave 3 (Plan 03) owns execution.

## Task Commits

Each task was committed atomically:

1. **Task 1: index.ts — hard gate, acculynxCall, reference-data prefetch, dependency walk** — `09e430d` (feat)
2. **Task 2: tiered red-team loop, verdict classification, persistence** — `5754790` (feat)
3. **Task 3: deploy acculynx-write-sweep** — performed by the orchestrator via `supabase functions deploy` (not a repo commit; the function source is already committed in Tasks 1–2). Deploy confirmed: ACTIVE v1, verify_jwt=true, GET→401 boot check.

**Plan metadata:** committed with this SUMMARY.

_TDD note: both tasks carry `tdd="true"`. The plan's test surface for `index.ts` is `deno check` + re-running the existing `sweep.test.ts` suite (mirroring the read-sweep analog, which has no `index.test.ts`); the pure red-team/redaction/address-builder logic was already RED→GREEN unit-tested in Wave 0 (12/12 green). No new failing-first test file was warranted for the controller wiring — this matches the read-sweep precedent exactly._

## Files Created/Modified

- `supabase/functions/acculynx-write-sweep/index.ts` (created, 609 lines) — the Edge Function entrypoint. Imports the Wave 0 pure core (`assertSandbox`, `buildContactAddress`, `buildJobAddress`, `pathParams`, `redactSample`, `shouldStopProbing`, `SANDBOX_SECRET_NAME`, `ProbeSignal`) from `./sweep.ts`; no re-implementation of gate/redaction/stop-rule/address logic. Deployed ACTIVE v1.
- `app/command-center/src/lib/version.ts` — auto-bumped by the commit hook on each task commit (expected repo behavior).

## Decisions Made

- **RUNTIME_BUDGET_MS = 150s** (up from read-sweep's 110s) — the dependency chain plus per-endpoint red-team loops make more round trips than a flat GET walk. Within Claude's Discretion per the plan's action text.
- **Seed roots once, skip in-loop re-probe** — `postContact`/`postJob` are seeded at the top of the handler (with their own probe rows) and skipped inside the checklist walk, so the shared parent entities the whole sweep depends on aren't double-created.
- **bad-input recipes encoded per operation** — the RESEARCH dimension recipes are made concrete in `buildRequestBody` (e.g. `priority:"Urgent"` → expect 404 Pitfall 2; `contactTypeIds:[]` → 400; contact-shape address on `PUT /jobs/{id}/address` → type-conversion 4xx; missing `projectId` on external-references → 400; foreign UUID for authz/scope → 404).
- **Deploy is a checkpoint, not a self-run** — the executor has no authenticated Supabase CLI, so Task 3 was returned as a blocking human-action checkpoint and performed by the orchestrator; no deploy was fabricated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a dead-code no-op comparison in the financials retry loop**
- **Found during:** Task 1 (dependency-root seed)
- **Issue:** An initial draft of the `GET .../financials` retry contained `if (financialsId || f.status === 404 === false && f.status >= 500) { /* fallthrough */ }` — a confusing, effect-free condition (`x === 404 === false` evaluates a boolean against a number).
- **Fix:** Replaced with a clean `if (financialsId) break; if (attempt === 0) await sleep(1500);` retry (one short provisioning-delay retry per Open Question 1).
- **Files modified:** supabase/functions/acculynx-write-sweep/index.ts
- **Verification:** `deno check` clean; logic now unambiguous.
- **Committed in:** `09e430d` (Task 1 commit)

**2. [Rule 1 - Bug] Collapsed a redundant if/else that pushed the same value in both branches**
- **Found during:** Task 2 (red-team loop)
- **Issue:** `if (dimension) history.push(signal); else history.push(signal);` — both branches identical, obscuring intent.
- **Fix:** Collapsed to a single `history.push(signal)` with a clarifying comment (happy-path and red-team probes both count toward the stop-rule history).
- **Files modified:** supabase/functions/acculynx-write-sweep/index.ts
- **Verification:** `deno check` clean; `deno test` 12/12 green.
- **Committed in:** `5754790` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs, both self-introduced during drafting and fixed before commit)
**Impact on plan:** Both were cosmetic/correctness cleanups of the executor's own draft code caught before committing; no scope change, no plan divergence.

## Issues Encountered

None blocking. The `no-explicit-any` deno lint warnings present in `index.ts` mirror the same pre-existing pattern in the `acculynx-read-sweep/index.ts` analog and are not a repo-enforced gate (the plan's verification is `deno check` + `deno test`, both green); left consistent with the analog rather than diverging stylistically.

## User Setup Required

None — no new external service configuration. `PE_CC_SANDBOX_ACCULYNX_API_KEY` and the prod Supabase project were already provisioned by prior phases; the function is deployed and reachable.

## Next Phase Readiness

- The `acculynx-write-sweep` harness is deployed and ACTIVE (version 1). **Wave 3 (Plan 03)** can now invoke it with a service-token-authenticated POST to execute the actual sweep and produce evidence rows in `acculynx_write_probe`/`acculynx_write_catalog`, then run `scripts/acculynx-write-sweep-reconcile.sql` as the phase gate.
- **Wave 4 (Plan 04)** regenerates `docs/37` + `docs/knowledge-base/acculynx/api/write-capability.md` from the resulting catalog verdicts (D-03).
- No blockers. The sweep was intentionally NOT run in this plan (execution is Wave 3's boundary).

## Self-Check: PASSED

`supabase/functions/acculynx-write-sweep/index.ts` exists on disk (609 lines). Both task commits (`09e430d`, `5754790`) exist in git history. `deno check supabase/functions/acculynx-write-sweep/index.ts` exits 0; `deno test supabase/functions/acculynx-write-sweep/` — 12/12 green. Function confirmed deployed ACTIVE version 1 (verify_jwt=true) by the orchestrator.

---
*Phase: 04-sandbox-write-capability-exploration-red-team*
*Completed: 2026-07-01*
