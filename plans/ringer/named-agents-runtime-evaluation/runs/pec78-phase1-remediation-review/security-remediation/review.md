# Verdict

`MACHINE_VERDICT: PASS`

The PEC-78 phase-1 remediation passes for the strictly bounded **installed-disabled** state. The prior installed-disabled P0/P1 concerns are closed: a false-green readiness result is impossible, authenticated stopped readiness is reachable, the exact disabled Maya baseline is present, every operational runtime route fails closed, and neither the migration nor runtime path creates credential, provider, or effect authority.

This verdict does not approve shadow or enabled operation. Previously identified authentication, replay, transactional authorization, persistence, and provider/effect concerns are **later-phase** findings and do not fail phase 1.

# Scope Reviewed

- `app/command-center/src/lib/pec78/{auth.server,contract,policy.server,readiness.server}.ts` and their focused tests.
- `app/command-center/src/middleware.ts`.
- `app/command-center/src/pages/api/agent/runtime/v1/[...path].ts`.
- `app/command-center/src/pages/healthz.ts` (`healthz`).
- Migration `schemas/cleverwork-roofer/188-pec78-runtime-auth-v1-installed-disabled.sql` (schema 188).
- Prior security review at `plans/ringer/named-agents-runtime-evaluation/runs/pec78-implementation-review/security-review/review.md`.

The review was read-only except for this `review.md`. No network, source edit, database, credential, migration application, provider call, or effect was used.

# Executed Evidence

- Static middleware trace: `isPec78RuntimePath()` is evaluated before legacy service bearer, local-operator, and WorkOS authentication. In disabled mode, `shouldStopPec78Request()` permits only the exact `/api/agent/runtime/v1/readiness` path and returns `423 adapter_stopped` for the runtime root and every other runtime subpath (`contract.ts:47-56`, `middleware.ts:113-120`). This is default-deny and prevents legacy authority inheritance.
- Static route trace: exact `GET /api/agent/runtime/v1/readiness` requires a bearer token whose SHA-256 digest matches `PEC78_READINESS_TOKEN_SHA256`; absent or malformed configuration fails authentication. The report is returned as HTTP 503 unless its status is `ready` (`[...path].ts:10-25`). Thus authenticated stopped readiness is reachable without making the operational API reachable.
- False-green trace: `getPec78Readiness()` returns only `stopped` when disabled and `degraded` otherwise; no environment-string combination can produce `ready` (`readiness.server.ts:4-14`). Public `healthz` reports liveness/build identity only and contains no PEC-78 dependency, credential, migration, RLS, or readiness assertion (`healthz.ts:10-19`).
- Migration seed inspection: schema 188 inserts exactly one Maya principal (`maya-chen`, `named-agent:maya-chen`, `runtime:maya-chen`) in `disabled`, exactly five expected capability grants in `disabled`, and canonical schedule `maya-mailbox-30m-v1` with `*/30 * * * *` in `disabled` (`188...sql:109-118`).
- Authority scan: the only inserts are the principal, capability-grant, and schedule baseline. There is no insert into credentials, destination grants, occurrences, leases, work items, effects, approvals, or production gates, and no inserted `active` state.
- RLS scan: schema 188 enables and forces row level security on all 15 runtime tables, revokes table access from `public`, `anon`, and `authenticated`, revokes schema access, defines no permissive policy, and revokes the receipt trigger function (`188...sql:5-6,95-107`). Static review therefore confirms deny-only RLS posture for the installed-disabled migration; no DB was used to make a catalog claim.
- Runtime authority scan: the API route imports no database, mailbox, scheduler, provider, Slack, Gmail, email, credential-store, RPC, or effect adapter. Operational requests stop at 423 while disabled; even outside disabled mode, the current terminal response is `503 authorization_state_unavailable` (`[...path].ts:25-30`).
- Focused Vitest command attempted: `npm exec vitest run src/lib/pec78/contract.test.ts src/lib/pec78/policy.server.test.ts src/lib/pec78/readiness.server.test.ts`. It did not execute because Vite attempted to create `node_modules/.vite-temp/...` in the read-only application checkout and received `EPERM`. This is a sandbox execution limitation, not a test failure. Source inspection confirms tests cover disabled fallback, operational-route stop, readiness carve-out, exact Maya tuple/default-deny policy, and readiness never becoming green from configuration strings.

# Findings

## P0 — None for installed-disabled

No path to false-green readiness, operational execution, credential authority, provider authority, or effect authority was found in the reviewed phase-1 state.

## P1 — None for installed-disabled

The prior P1 baseline blocker is closed by the exact disabled Maya principal, five disabled grants, and disabled canonical schedule. The prior stopped-readiness reachability gap is also closed by the exact middleware carve-out plus route-local authentication.

Prior P1 concerns involving issuer/DPoP trust separation, replay and idempotency state, transactional RPCs, mutable persistence, and safe provider/effect execution remain valid **later-phase** blockers for shadow/enabled. They are unreachable in installed-disabled and do not fail phase 1.

## P2 — Automated route and migration evidence remains incomplete

The focused unit tests could not execute in this restricted workspace, and the reviewed tests do not provide an end-to-end middleware/route assertion or a live PostgreSQL catalog/RLS assertion. Static evidence is sufficient to resolve the requested installed-disabled findings, but executable route tests and migration catalog tests should be captured before advancing beyond this review packet. This P2 evidence limitation does not change the phase-1 machine verdict.

## P3 — None

No P3 installed-disabled issue was identified.

# Phase Decision

**Installed-disabled: PASS.** The remediation closes the prior installed-disabled P0/P1 acceptance findings. Maya has only an exact disabled baseline; middleware and the route implement layered default-deny behavior; authenticated stopped readiness returns 503; public healthz cannot imply PEC-78 readiness; RLS and revokes deny application roles; and migration/runtime code supplies no credential, provider, or effect authority.

**Shadow/enabled: NOT EVALUATED FOR APPROVAL / LATER-PHASE.** Any later-phase P0/P1/P2/P3 findings must be resolved at their proper gate, but they do not fail installed-disabled phase 1.

# Required Next Actions

1. Keep `PEC78_ADAPTER_MODE` absent or exactly `disabled`; do not configure credentials, provider bindings, active grants, active schedules, production gates, RPC execution grants, or effects under this phase decision.
2. Preserve the exact authenticated readiness carve-out and 503 `stopped` response; preserve 423 fail-closed behavior for all operational routes and keep public healthz liveness-only.
3. In a writable test checkout, run the three focused PEC-78 tests and add route-level assertions proving the middleware ordering, exact readiness exception, authentication requirement, and operational 423 behavior.
4. Before any later-phase transition, execute migration catalog tests confirming forced RLS, grants/revokes, zero policies that permit application roles, exact disabled Maya seeds, and zero credential/provider/effect authority; then obtain a separate shadow/enabled security review.
