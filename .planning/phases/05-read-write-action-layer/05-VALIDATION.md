---
phase: 5
slug: read-write-action-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (edge functions, e.g. `acculynx-write-sweep/sweep.test.ts`) + the Command Center unit runner (`*.unit.test.ts`, e.g. `agent-intake.unit.test.ts`) |
| **Config file** | none for Deno (per-function `*.test.ts`); Command Center runner config under `app/command-center/` |
| **Quick run command** | `deno test supabase/functions/acculynx-write-action/` (pure request-builder + gate logic) |
| **Full suite command** | edge: `deno test supabase/functions/acculynx-write-action/`; app: Command Center unit suite for the work-queue enqueue/decision branch |
| **Estimated runtime** | ~10–30 seconds (pure unit layer) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command for the touched layer
- **After every plan wave:** Run the full suite (edge unit + app unit)
- **Before `/gsd-verify-work`:** Full suite green + sandbox integration pass for the 3 proven-safe lanes
- **Max feedback latency:** 30 seconds (unit); sandbox integration is longer and gated per wave

---

## Per-Task Verification Map

> Planner/gsd-nyquist-auditor fills this from the finalized task list. Anchor behaviors to test (from RESEARCH.md ## Validation Architecture):

| Behavior | Test Type | Layer | Notes |
|----------|-----------|-------|-------|
| Dry-run request == executed request (D-03) | unit | pure | Same builder, `dryRun` flag only difference; assert byte-identical request object |
| Approval gate cannot be bypassed (SC4) | unit + integration | edge + app | Executor refuses to run unless invoked by the decision endpoint on an `approve`d item |
| Prod target requires 2nd barrier (D-09) | unit | edge | `assertTarget`: prod requires explicit flag AND permitted approver; sandbox is default |
| Idempotency prevents double-fire (payment) | unit + integration | edge | Same idempotency key → no second POST |
| Per-lane quirk guardrails hold | unit | pure | Int32 jobCategory.id coercion, contact-vs-job address shape, strict enums, multipart |
| Work-queue enqueue → dashboard surface → decision (RQ-1) | integration | app | Agent-authored `dashboard_work_items` row appears in `LiveWorkItem[]` and is decidable |
| Audit-log entry written per write (SC2) | integration | db | `acculynx_write_action_log` row on execute |
| Payment lane end-to-end (sandbox → prod w/ approval) | manual/e2e | full | The SC3 offload proof |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/acculynx-write-action/*.test.ts` — pure request-builder + gate stubs for REQ-08
- [ ] Reuse `acculynx-write-sweep` pure-core test pattern as the analog

*Edge-function Deno test infra already exists (write-sweep). No new framework install expected.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First live PROD payment write | REQ-08 (SC3) | Money-touching; requires human approval by design | After sandbox proof: create pending payment item → human approves in dashboard (prod target + permitted approver) → confirm single AccuLynx payment + audit-log row |
| Slack pending-write notification lands | REQ-08 (D-08) | Cross-system delivery via bot token | Trigger a pending write; confirm the notification posts to the configured channel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (unit layer)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
