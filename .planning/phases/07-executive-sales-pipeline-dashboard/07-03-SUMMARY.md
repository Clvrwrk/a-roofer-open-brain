---
phase: 07-executive-sales-pipeline-dashboard
plan: 03
subsystem: ui
tags: [astro, routing, cutover, deletion, executive-dashboard]

# Dependency graph
requires:
  - phase: 07-01
    provides: loadExecutivePipelineDashboard pure-core loader over crm_pipeline
  - phase: 07-02
    provides: SSR page at /executive/pipeline (Invoice-Audit-derived layout), approved dashboard
provides:
  - "Weekly snapshot fully retired — /weekly-snapshot and all sub-routes 404; zero source files remain"
  - "Executive nav -> Sales Pipeline @ /executive/pipeline (D-01 cutover complete)"
  - "prewarm/AppShell/healthz/sw all reference /executive/pipeline, not the retired route"
affects: [07-04, any future executive/reporting dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Astro static routes (pipeline.astro) take precedence over dynamic [slug].astro matches for the same path segment — deleting the now-redundant stub was safe once the static route landed in Wave 2, confirmed via grep that no other executive sub-slug depended on it"

key-files:
  created: []
  modified:
    - app/command-center/src/lib/nav.ts (Executive item relabeled "Sales Pipeline" -> /executive/pipeline)
    - app/command-center/src/lib/prewarm.server.ts (weekly_snapshot warm target replaced with executive_pipeline)
    - app/command-center/src/layouts/AppShell.astro (prefetch/sw route list entry swapped)
    - app/command-center/src/pages/healthz.ts (requiredRoutes probes /executive/pipeline)
    - app/command-center/src/pages/sw.js.ts (precache list entry swapped)
    - app/command-center/src/lib/executive-pipeline.ts (2 provenance comments reworded to close the src/ grep gate)

decisions:
  - "Deleted executive/[slug].astro outright rather than gutting it: pipeline.astro (a static route, shipped in Wave 2) always wins Astro's route-resolution over the dynamic [slug] match for the same path, and grep confirmed no other executive sub-slug (live-work.ts only ever links /executive and /executive/pipeline) depends on the stub — so the ambiguity the plan flagged doesn't exist in practice, and deletion is strictly cleaner than a conditional guard"
  - "Reworded two doc-comments in executive-pipeline.ts that named the deleted weekly-snapshot.ts as provenance, rather than leaving them, so the plan's literal 'zero hits in src/' grep gate passes cleanly instead of needing a grep-gate exception for comments"

metrics:
  duration: ~15min
  completed: 2026-07-02
status: complete
---

# Phase 07 Plan 03: Weekly Snapshot Retirement + Executive Nav Cutover Summary

**Deleted the 7-file weekly-snapshot subsystem plus the executive/[slug].astro stub, rewired all five remaining references to /executive/pipeline, and proved zero dangling imports with a green build and full 171/171 vitest suite.**

## Performance

- **Duration:** ~15 minutes
- **Completed:** 2026-07-02
- **Tasks:** 2 (both auto, both green on first pass)
- **Files touched:** 8 deleted, 6 modified

## Accomplishments
- Deleted all 7 weekly-snapshot files named by CONTEXT.md/RESEARCH.md plus the 4 additional files 07-PATTERNS.md surfaced via grep (`weekly-snapshot-routes.ts` and the three `weekly-snapshot/*` sub-pages), and removed the now-empty `src/pages/weekly-snapshot/` directory tree
- Deleted the `executive/[slug].astro` stub after confirming via grep that no other executive sub-slug depends on it — the real `pipeline.astro` (shipped in Wave 2) already owns `/executive/pipeline` as a static route, which Astro resolves ahead of any dynamic `[slug]` match
- Rewired all five remaining reference points (`nav.ts`, `prewarm.server.ts`, `AppShell.astro`, `healthz.ts`, `sw.js.ts`) from `/weekly-snapshot` to `/executive/pipeline`
- Re-ran the reference grep myself after deletion per the execution notes (not trusting the plan's list blindly) — found and closed 2 additional hits (doc-comments in `executive-pipeline.ts`) that the plan's file list didn't anticipate
- Proved the cutover is clean: `npm run build` succeeds, full `npx vitest run` is 171/171 green, and `grep -rn "weekly-snapshot|weekly_snapshot|loadWeeklySnapshot" src/` returns zero hits

## Task Commits

1. **Task 1: Delete the 7 weekly-snapshot files + retire the [slug].astro stub** - `03bad53` (feat)
2. **Task 2: Rewire the five reference files + prove zero dangling imports** - `a02bd11` (feat)

## Files Deleted
- `app/command-center/src/pages/weekly-snapshot.astro`
- `app/command-center/src/scripts/weekly-snapshot.ts`
- `app/command-center/src/lib/weekly-snapshot.ts`
- `app/command-center/src/lib/weekly-snapshot-routes.ts`
- `app/command-center/src/pages/weekly-snapshot/[slice].astro`
- `app/command-center/src/pages/weekly-snapshot/records/[record].astro`
- `app/command-center/src/pages/weekly-snapshot/rep/[rep].astro`
- `app/command-center/src/pages/executive/[slug].astro` (stub retired, not gutted — see Decisions)

## Files Modified
- `app/command-center/src/lib/nav.ts` - Executive `{ label: "Weekly Snapshot", href: "/weekly-snapshot" }` replaced with `{ label: "Sales Pipeline", href: "/executive/pipeline" }`; `Overview -> /executive` untouched
- `app/command-center/src/lib/prewarm.server.ts` - `loadWeeklySnapshot` import + `weekly_snapshot` warm target replaced with `loadExecutivePipelineDashboard` + `executive_pipeline` warm target
- `app/command-center/src/layouts/AppShell.astro` - prefetch/sw route list `/weekly-snapshot` entry -> `/executive/pipeline`
- `app/command-center/src/pages/healthz.ts` - `requiredRoutes` `/weekly-snapshot` -> `/executive/pipeline`
- `app/command-center/src/pages/sw.js.ts` - precache list `/weekly-snapshot` -> `/executive/pipeline`
- `app/command-center/src/lib/executive-pipeline.ts` - 2 provenance comments reworded (no functional change) to remove the last `weekly-snapshot` string matches in `src/`

## Decisions Made
- `[slug].astro` stub deleted outright rather than edited to drop its "pipeline" default — grep-confirmed no other executive sub-slug depends on it, and Astro's static-route-wins-over-dynamic-route resolution means `pipeline.astro` already owns `/executive/pipeline` regardless of the stub's presence, so deletion is the cleaner path with identical runtime behavior
- The plan's literal `grep -rn ... src/` gate is honored exactly as written (not just "no functional dangling imports") — the two doc-comment hits found on re-grep were reworded rather than left as an accepted exception, keeping the gate a simple, unambiguous zero-hits check for future audits

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking verification gate] Two doc-comment references to weekly-snapshot.ts survived the planned edit list**
- **Found during:** Task 2, post-edit grep re-run (per execution notes: "re-run the reference grep yourself")
- **Issue:** `executive-pipeline.ts` had two provenance comments ("copied verbatim / adapted from weekly-snapshot.ts") that the plan's file list (nav/prewarm/AppShell/healthz/sw) didn't cover, since they're comments, not imports — but they still matched the plan's literal `grep -rn "weekly-snapshot|..." src/` verification command, which requires zero hits
- **Fix:** Reworded both comments to reference "the now-retired weekly snapshot loader" with a pointer to this SUMMARY, preserving the historical provenance note without the literal string match
- **Files modified:** `app/command-center/src/lib/executive-pipeline.ts`
- **Commit:** `a02bd11`

No other deviations — plan executed as written otherwise.

## Issues Encountered
None. Both tasks passed verification on the first attempt; no auth gates, no architectural questions, no checkpoint.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/weekly-snapshot` and every sub-route now 404 (route + files gone); `/executive/pipeline` is the sole Executive dashboard destination, reachable from the Executive nav item, `healthz` monitoring, the service-worker precache/prefetch list, and the boot-time prewarm cache
- Build and full test suite (171/171) are green on the current `main` HEAD — 07-04 (the human-gated production deploy) can proceed against a verified-clean tree
- Nothing was pushed to origin per this plan's explicit constraint; both commits are local-only on `main`, ready for 07-04's deploy step

---
*Phase: 07-executive-sales-pipeline-dashboard*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 8 deleted files confirmed absent (7 weekly-snapshot files + [slug].astro stub) and the
`src/pages/weekly-snapshot/` directory tree confirmed removed. Both task commits (`03bad53`,
`a02bd11`) confirmed present in `git log`. SUMMARY.md confirmed on disk.
