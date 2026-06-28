# 59 — Red Team milestone protocol

**Date:** 2026-06-28  
**Owner:** Red Team / Dev Conductor  
**Related:** [`agents/cadences/dev-team-architecture.yaml`](../agents/cadences/dev-team-architecture.yaml), PEC-3 skill `red-team-milestone-protocol`

## Milestone definition

A **milestone** is any Linear epic, phase ship, major feature, infra change, or release tagged `milestone:*` by Feature Planner or Dev Conductor.

## Three mandatory cycles (no ship without Cycle 3 pass)

Each cycle is a Linear issue: `[agent instructions][pe-cc-agents][red-team] <milestone> cycle-N`.

| Cycle | Focus | Pass criteria |
| --- | --- | --- |
| **1 — Design / threat** | Plane boundaries (doc 58), auth matrix, prompt injection surfaces | Zero open CRITICAL/HIGH |
| **2 — Implementation attack** | OWASP on changed routes, CVEs, token abuse, CSRF | Zero CRITICAL; HIGH fixed or accepted |
| **3 — E2E production-like** | `validate-agent.py`, API matrix, PageSpeed, rollback | Score ≥90%; P0 guardrails green |

Receipt format on milestone issue:

```text
RED TEAM CYCLE N
Findings: CRITICAL=n HIGH=n MEDIUM=n LOW=n
Score: NN%
Status: pass | fail
```

Dev Conductor may not report "shipped" to Chris until Cycle 3 pass receipt exists.

## Post-ship random watchlist

After ship, Dev Conductor adds item to **Red Team watchlist** (PEC-1 section).

- Random target selection, min **1 attack per 14 days** per item until retired
- Weight: recent ships, high traffic, security-sensitive paths, agent env changes

### Diminishing returns — retire when ALL:

1. Two consecutive random cycles: zero new CRITICAL/HIGH
2. Marginal finding rate ≤1 MEDIUM per cycle for two consecutive cycles
3. No regressions reopened within 7 days of fix
4. Dev Conductor posts `RED TEAM RETIRED <milestone>` to `#ob-dev-team`

### Re-activation

New deploy on surface, Sentry P0/P1 on route, plane-boundary test failure, or Chris request.

## Watchlist (initial)

| Item | Added | Status |
| --- | --- | --- |
| Open Engine automation (Phase 2) | 2026-06-28 | active |
| Dev webhook → Linear pipeline | 2026-06-28 | active |
| Activity rollups + Session Analyst | 2026-06-28 | active |
| Endpoint auth matrix enforcement | 2026-06-28 | active |

## Tooling by cycle

| Cycle | Tools |
| --- | --- |
| 1 | doc 58, docs/59-endpoint-auth-matrix, prompt-injection canary spec |
| 2 | gsd-secure-phase, npm audit, endpoint matrix script |
| 3 | validate-agent.py, uptime-check, PageSpeed gate, Coolify rollback smoke |
