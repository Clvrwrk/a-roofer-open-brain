---
phase: 6
slug: acculynx-agent-okf-knowledge-base
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Phase 6 is largely a provisioning/documentation phase — the automatable surface is the
> `ob-acculynx` roster identity + its access-control wiring (Command Center vitest) and OKF
> link/structure integrity; the A3, OKF prose, and Slack/Coolify provisioning are human/manual.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (Command Center — `app/command-center/vitest.config.ts`); markdown link/structure checks via a small script or grep |
| **Config file** | `app/command-center/vitest.config.ts` (exists) |
| **Quick run command** | `cd app/command-center && npx vitest run src/lib/access-control.test.ts` |
| **Full suite command** | `cd app/command-center && npx vitest run && npx astro check` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command relevant to the touched file.
- **After every plan wave:** Run the full suite command.
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> The planner populates this map per task. Anticipated automatable checks:
> - `ob-acculynx` resolves in `SERVICE_AGENT_IDENTITIES` with `departmentAccess: "all"` and the expected permission set (access-control vitest).
> - A service-token actor for `ob-acculynx` can hit `/api/agent/acculynx-write-action/enqueue` for any lane's department (department-gate test).
> - OKF `index.md` + sub-indexes link every existing bundle file (no dead links, all sections reachable) — link-integrity check.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _planner-populated_ | — | — | REQ-01 / REQ-09 | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Confirm the access-control test file exists (`app/command-center/src/lib/access-control.test.ts`) or add an `ob-acculynx` identity assertion to the existing suite.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A3 approval (rule-9 gate) | REQ-09 | Human governance decision | User reviews `proposals/<date>-acculynx-agent.md` and approves before any agent code ships. |
| Slack bot provisioning | REQ-09 | Requires Slack admin app creation + bot token (config-token cannot mint) | Create the ob-acculynx bot in Slack admin; set the bot token env in Coolify; confirm a test post. |
| Service token in prod env | REQ-09 | Secret set in Coolify, not committed (hard rule 2) | Add ob-acculynx to `AGENT_SERVICE_TOKENS` (or hashed form) in Coolify; confirm `/healthz` agentServiceTokenCount increments. |
| OKF prose completeness (who/what/how/why/where/when) | REQ-01 | Editorial/judgment | Human reads the bundle; confirms each dimension is covered and cited. |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (or are documented manual-only above)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (docs-heavy tasks noted as manual)
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
