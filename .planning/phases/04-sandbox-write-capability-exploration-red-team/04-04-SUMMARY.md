---
phase: 04-sandbox-write-capability-exploration-red-team
plan: 04
subsystem: docs
tags: [acculynx, capability-matrix, write-capability, guardrails, documentation, red-team]

# Dependency graph
requires:
  - phase: 04-01
    provides: acculynx_write_catalog/probe evidence tables, acculynx_write_checklist 38-endpoint target list
  - phase: 04-02
    provides: deployed acculynx-write-sweep Edge Function
  - phase: 04-03
    provides: "Populated acculynx_write_catalog evidence (batch wsweep-2026-07-01T13-33-02-965Z): 38/38 endpoints, human-confirmed final tally (writable 12, write-only 5, fragile-with-guardrail 2, read-shaped 2, blocked-by-dependency 17, unsupported 0), reconcile gate PASS"
provides:
  - "Regenerated docs/37-acculynx-write-capability-matrix.md — evidence-based matrix superseding the 2026-06-10 structural-discovery version"
  - "Regenerated docs/knowledge-base/acculynx/api/write-capability.md — evidence-based matrix + guardrail recipes superseding the 2026-06-30 seed findings"
  - "New docs/knowledge-base/acculynx/ingestion/write-sweep.md — write-sweep harness design doc mirroring read-sweep.md"
  - "Phantom POST /jobs/{id}/measurements endpoint corrected (removed, noted as never-existed, photos-videos named as closest analog)"
affects: [phase-05-write-action-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Docs generated from evidence tables, not hand-maintained (D-03) — each doc carries a reproducibility header with the generating SQL and the batch date"
    - "Guardrail recipe format: it-just-works preconditions + failure modes (exact status/error shape) per writable/fragile-with-guardrail endpoint"

key-files:
  created:
    - docs/knowledge-base/acculynx/ingestion/write-sweep.md
    - .planning/phases/04-sandbox-write-capability-exploration-red-team/04-04-SUMMARY.md
  modified:
    - docs/37-acculynx-write-capability-matrix.md
    - docs/knowledge-base/acculynx/api/write-capability.md

key-decisions:
  - "Combined the Task 1 (matrix regeneration) and Task 2 (guardrail recipes) content for write-capability.md into a single coherent doc rather than a follow-up patch — the guardrail recipes read naturally as a continuation of the same evidence-based matrix, and the plan's two tasks both target the same file"
  - "No skill-file edit needed for the 'pointer note' requirement — skills/cleverwork-roofer/acculynx-api/SKILL.md already routes agents to docs/37 as the capability-matrix reference; the new cross-links from docs/37 reach write-capability.md and write-sweep.md transitively"
  - "Preserved docs/37's original prose structure (handoff-target framing, 'consequences for the pipeline', 'revisit triggers') while replacing the verdict content entirely with evidence-based tables, per the 04-CONTEXT.md instruction to read its structure before superseding it"

requirements-completed: [REQ-06]

# Metrics
duration: ~15min
completed: 2026-07-01
---

# Phase 4 Plan 04: Evidence-Based Write-Capability Matrix & Guardrail Recipes Summary

**Regenerated docs/37 and docs/knowledge-base/acculynx/api/write-capability.md from the 38-endpoint `acculynx_write_catalog` evidence tally (batch `wsweep-2026-07-01T13-33-02-965Z`, reconcile PASS), corrected the phantom `measurements` endpoint, added per-writable-path guardrail recipes, and wrote a new write-sweep.md design doc mirroring read-sweep.md.**

## Performance

- **Duration:** ~15 min (2 tasks, no checkpoints — fully autonomous)
- **Started:** 2026-07-01T13:44:55Z
- **Completed:** 2026-07-01
- **Tasks:** 2/2
- **Files modified:** 2 regenerated, 1 created

## Accomplishments

- **Task 1 — Evidence matrix regeneration:** `docs/37-acculynx-write-capability-matrix.md` and
  `docs/knowledge-base/acculynx/api/write-capability.md` rewritten entirely from the embedded evidence
  tally (38/38: writable 12, write-only 5, fragile-with-guardrail 2, read-shaped 2,
  blocked-by-dependency 17, unsupported 0). Both docs now carry a reproducibility header (generating SQL
  over `acculynx_write_catalog`, batch `wsweep-2026-07-01T13-33-02-965Z`, date 2026-07-01, reconcile gate
  PASS). The phantom `POST /jobs/{id}/measurements` (+ `/measurements/files`) entry from the 2026-06-10
  matrix is corrected: removed as a WRITE endpoint, replaced with an explicit "does not exist in the
  124-op surface" note naming `POST /jobs/{jobId}/photos-videos` as the closest existing analog.
- **Task 2 — Guardrail recipes + write-sweep.md:** every `writable` and `fragile-with-guardrail` endpoint
  in `write-capability.md` now has a documented "it just works" precondition set and known failure mode
  (exact status + error shape), sourced from the 04-03 evidence and the DURABLE QUIRKS list (jobCategory
  Int32, address-shape asymmetry, priority strict enum, unassigned-lead visibility, write-only
  no-read-back, AR/sales-owner role-scoped CompanyUserId, trade-types empty-body 500, DELETE
  initial-appointment non-empty-body requirement). A new `docs/knowledge-base/acculynx/ingestion/write-sweep.md`
  mirrors `read-sweep.md`'s structure (purpose, hard gate, dependency walk, tiered red-team + stop rule,
  evidence tables, reconcile gate, deploy path). All three docs (docs/37, write-capability.md,
  write-sweep.md) cross-link each other.

## Task Commits

Each task was committed atomically:

1. **Task 1: Regenerate docs/37 + write-capability.md from evidence** — `4b19cd3` (docs)
2. **Task 2: Add write-sweep.md design doc, guardrail recipes** — `5c9c208` (docs)

**Plan metadata:** committed with this SUMMARY.

## Files Created/Modified

- `docs/37-acculynx-write-capability-matrix.md` (regenerated) — evidence-based matrix, reproducibility
  header, phantom-endpoint correction, guardrail-recipe pointer, durable-quirks section, revisit triggers.
- `docs/knowledge-base/acculynx/api/write-capability.md` (regenerated) — evidence-based matrix + full
  per-endpoint guardrail recipes (preconditions + failure modes), phantom-endpoint correction.
- `docs/knowledge-base/acculynx/ingestion/write-sweep.md` (created) — write-sweep harness design doc
  mirroring `read-sweep.md`'s structure.
- `app/command-center/src/lib/version.ts` — auto-bumped by the commit hook on each task commit (expected
  repo behavior).

## Decisions Made

- **Combined Task 1 + Task 2 content into one coherent `write-capability.md`** rather than a two-pass
  patch — the guardrail recipes are a natural continuation of the same evidence-based matrix and both
  plan tasks target the same file.
- **No skill-file edit required.** `skills/cleverwork-roofer/acculynx-api/SKILL.md` already routes agents
  to `docs/37` as the capability-matrix reference; the new cross-links from docs/37 reach
  `write-capability.md` and `write-sweep.md` transitively, satisfying the plan's "pointer note if the
  skill indexes them" clause without touching the skill itself.
- **Preserved docs/37's original prose framing** (§4.10 handoff-target style headers, "Consequences for
  the pipeline," "Revisit triggers") while replacing all verdict content with the evidence-based tables —
  matches the CONTEXT.md instruction to read the superseded doc's structure first.

## Deviations from Plan

None — plan executed exactly as written. No DB access was available to this executor session; the
evidence tally was provided verbatim in the execution objective (sourced from the human-verified 04-03
reconcile-gate-passed batch) and used as-is per the objective's explicit instruction not to invent
verdicts. No architectural changes, no blocking issues, no auth gates.

## Issues Encountered

None.

## Known Stubs

None. All matrix content traces to the 04-03 evidence tally; no placeholder verdicts, no hardcoded empty
values, no "coming soon" text.

## User Setup Required

None — this plan is docs-only, no new external service configuration.

## Next Phase Readiness

- **REQ-06 is fully closed:** an exhaustive sandbox red-team of all 38 write endpoints, an evidence-based
  matrix superseding docs/37, and a documented guardrail recipe per writable path all exist.
- **Phase 5 (write/action layer, REQ-08)** now has its primary input: 12 writable + 5 write-only endpoints
  are the confirmed-actionable surface, each with a guardrail recipe; the 2 fragile endpoints have explicit
  wrapper-design guardrails (`trade-types` needs a non-empty `{items:[{id}]}` body, `DELETE
  initial-appointment` needs a non-empty `{note}` body); the 17 blocked-by-dependency rows each name the
  exact missing sandbox prerequisite for future deepening.
- No blockers. This is the final plan (4/4) of Phase 4 — phase execution is complete pending state/roadmap
  updates below.

## Self-Check: PASSED

All 3 files exist on disk (`docs/37-acculynx-write-capability-matrix.md`,
`docs/knowledge-base/acculynx/api/write-capability.md`,
`docs/knowledge-base/acculynx/ingestion/write-sweep.md`). Both task commits (`4b19cd3`, `5c9c208`) exist
in git history. Automated verification greps passed: 21 verdict-vocabulary matches and 6
correction-language matches in docs/37; `test -f` on write-sweep.md succeeded; 33 guardrail-language
matches in write-capability.md.

---
*Phase: 04-sandbox-write-capability-exploration-red-team*
*Completed: 2026-07-01*
