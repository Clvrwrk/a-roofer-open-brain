---
phase: 7
slug: executive-sales-pipeline-dashboard
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-01
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (app/command-center; suite currently 98/98 green) |
| **Config file** | app/command-center (vitest via package.json; no astro check — devDeps gap, see Phase 6 deferred-items) |
| **Quick run command** | `cd app/command-center && npx vitest run src/lib/<touched>.test.ts` |
| **Full suite command** | `cd app/command-center && npx vitest run` |
| **Estimated runtime** | ~10–20 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command on touched-lib tests
- **After every plan wave:** Run `npx vitest run` (full CC suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner) | — | — | REQ-10 | — | — | unit | — | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/command-center/src/lib/executive-pipeline.test.ts` (or planner-named equivalent) — unit stubs for the new dashboard loader: pagination via `selectAll()` range-loop (1000-row cap regression), account_key→office/region mapping, margin computation + coverage counting (GP-source vs invoice-fallback vs no-data), window filtering.
- [ ] Research flagged a Wave 0 validation gap: no existing test covers the retiring `weekly-snapshot.ts` or the new loader — the new loader's pure functions must be extracted testable (no Supabase client in the pure core).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard renders live at cc.proexteriorsus.net/executive/pipeline (SC4) | REQ-10 | Deployed-site visual + healthz check | Deploy per coolify skill; watch buildCommit flip; load page as human; confirm charts render and filters work |
| Per-location freshness badges reflect real watermarks (D-12) | REQ-10 | Depends on live cron state | Compare badge timestamps against `v_acculynx_cron_outcomes` latest run |
| Responsive layout on phone (D-10) | REQ-10 | Visual judgment | Load on mobile viewport; cards stack, charts resize |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
