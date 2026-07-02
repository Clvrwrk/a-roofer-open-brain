---
phase: 06-acculynx-agent-okf-knowledge-base
plan: 03
subsystem: command-center
tags: [ob-acculynx, roster-identity, service-agent, access-control, slack, coolify]

# Dependency graph
requires:
  - phase: 06-01
    provides: "Approved A3 (proposals/2026-07-01-acculynx-agent.md) — D-04 hard gate cleared before any agent code"
  - phase: 05-read-write-action-layer
    provides: "The human-gated write-action enqueue path the identity's departmentAccess:'all' authorizes it to reach"
provides:
  - "ob-acculynx in SERVICE_AGENT_IDENTITIES with departmentAccess:'all' (deployed live @942649a, inert until token provisioned)"
  - "Wave-0 access-control test covering the new identity (CC suite 98/98 green)"
  - "acculynx-api skill bound_agents wiring (ob-acculynx listed)"
affects: [06-04, acculynx-agent, phase-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Roster identity lands code-first and stays inert until its AGENT_SERVICE_TOKEN_SHA256_* + bot token env vars exist — safe to deploy ahead of provisioning"

key-files:
  created: []
  modified:
    - app/command-center (SERVICE_AGENT_IDENTITIES + access-control test)
    - skills/cleverwork-roofer/acculynx-api/SKILL.md (bound_agents)

status: CODE-COMPLETE + DEPLOYED; PROVISIONING DEFERRED (2026-07-01)
---

# 06-03 Summary — ob-acculynx roster identity

## What shipped (Tasks 1–2, complete)

- `ob-acculynx` added to `SERVICE_AGENT_IDENTITIES` with `departmentAccess: "all"`; Wave-0
  access-control test added; full CC suite 98/98 green; deployed to cc.proexteriorsus.net
  (buildCommit 942649a confirmed live). The identity is **live but inert** — token count stays
  13 until its secrets exist.
- `acculynx-api` skill `bound_agents` lists ob-acculynx.

## What is DEFERRED (Tasks 3–4)

**Slack bot + Coolify secret provisioning (Task 3) and the cross-department enqueue smoke test
(Task 4) are deferred OUT of this project** — decision by Chris 2026-07-01: the Slack team is
in-flight on another project, so the ob-acculynx Slack bot will be provisioned as part of that
separate project, not here. Verified absent in Coolify at deferral time (key names only):
`OB_ACCULYNX_BOT_TOKEN`, `AGENT_SERVICE_TOKEN_SHA256_OB_ACCULYNX`.

**Resume recipe (when the Slack project provisions the bot):** set the two env vars above in
Coolify + redeploy → confirm service-token count 13→14 → run the Task 4 smoke test per
06-03-PLAN.md (authenticated enqueue against a non-home department proving
`departmentAccess:"all"`). No code changes needed — everything is already deployed.

## Verdict on SC2 (REQ-09)

The dev-session half of the hybrid agent (06-04) is live and verified; the live roster half is
code-complete and deployed but cannot authenticate until provisioned. Phase 6 closes
**complete-with-deferral** on this item.
