# Verdict

`MACHINE_VERDICT: PASS`

The PEC-78 Phase 1 remediation passes for the **installed-disabled** state. Static evidence confirms a transactional, additive migration; the exact disabled Maya principal, five disabled capability grants, and disabled half-hour schedule; forced RLS and privilege revokes; visibly denied receipt mutation; authenticated readiness reporting `503 stopped`; middleware isolation from legacy authentication; and zero seeded credentials, destination grants, or effects. No P0 or P1 finding remains within Phase 1 scope.

# Scope Reviewed

- `schemas/cleverwork-roofer/188-pec78-runtime-auth-v1-installed-disabled.sql`.
- PEC-78 code under `app/command-center/src/lib/pec78/` and `app/command-center/src/pages/api/agent/runtime/v1/[...path].ts`.
- PEC-78 changes in `app/command-center/src/middleware.ts`, `app/command-center/src/pages/healthz.ts`, `app/command-center/src/lib/access-control.ts`, and `app/command-center/src/env.d.ts`.
- Prior operations review at `plans/ringer/named-agents-runtime-evaluation/runs/pec78-implementation-review/operations-database-review/review.md`.
- Review boundary: Phase 1 installed-disabled remediation only. Shadow and enabled behavior is later-phase and does not fail this decision.
- Review-only constraints were honored: no network, source edit, database access, credential access, migration execution, provider call, or external effect. This `review.md` is the only owned output.

# Executed Evidence

- Read the complete migration and traced the PEC-78 middleware, route fuse, readiness handler, policy, authentication boundary, and public `healthz` response.
- Compared the remediation directly with every Phase 1 blocker in the prior operations review.
- Confirmed the migration is enclosed by one `begin;` / `commit;`. It contains additive schema/table/index/function/trigger creation, RLS configuration, revokes, and disabled seed inserts; it contains no drop, destructive alter, update, delete, backfill, credential material, provider call, or effect execution. PostgreSQL migration execution was prohibited, so transactional conclusions are static rather than catalog-backed.
- Confirmed the exact Maya seed is `maya-chen` / `named-agent:maya-chen` / `runtime:maya-chen`, contract `pec78-runtime-authorization-v1`, fixed registry digest, and state `disabled`.
- Confirmed exactly five capability grants, all disabled: `mailbox.read`, `mailbox.classify`, `command_center.record_decision`, `slack.send.christopher`, and `email.send.admin`.
- Confirmed exactly one schedule seed: `maya-mailbox-30m-v1`, cron `*/30 * * * *`, Maya runtime owner, state `disabled`, with bounded catch-up and lease defaults.
- Confirmed all 15 tables receive both `enable row level security` and `force row level security`, followed by `revoke all` from `public`, `anon`, and `authenticated`; the schema and receipt trigger function are likewise revoked. No RLS policies or application execute grants are installed, preserving default-deny.
- Confirmed the receipt trigger covers both `UPDATE` and `DELETE` and raises `runtime_receipts_are_append_only`, making forbidden mutation visibly fail instead of silently succeeding.
- Confirmed middleware intercepts the PEC-78 route family before legacy service-token, local-operator, or WorkOS resolution. Disabled mode stops operational routes with `423 adapter_stopped` while allowing only the readiness path to reach its separate bearer-digest check.
- Confirmed private readiness defaults to `stopped`, can never report ready from configuration strings, and returns HTTP `503` when stopped. Public `healthz` remains liveness-only and exposes no PEC-78 credential, destination, dependency, or authorization state.
- Confirmed seed inserts into `credentials`, `destination_grants`, `occurrences`, `leases`, `replay_claims`, `request_claims`, `work_items`, `effects`, `approvals`, `receipts`, `kill_switches`, and `production_gates`: zero.
- `git diff --check` on the scoped remediation returned clean.
- Targeted Vitest was attempted but no assertions executed: Vite could not create its generated config file under the read-only application `node_modules/.vite-temp` (`EPERM`). This is an evidence limitation, not contradictory evidence; the relevant tests were inspected statically.

# Findings

## P0

None in installed-disabled Phase 1. In particular, readiness cannot become false-green: it is `stopped` in disabled mode and only `degraded` in shadow/enabled until an authoritative database probe is implemented.

## P1

None in installed-disabled Phase 1. The prior P1 gaps are remediated: Maya's exact disabled principal/five grants/schedule exist, and authenticated stopped readiness is reachable through middleware.

## P2

None that fails Phase 1. Database execution and catalog assertions were prohibited, so actual PostgreSQL rollback, ownership, RLS, revoke, trigger, and row-count behavior remain to be proven during the separately controlled migration gate. The SQL itself is fail-closed and internally consistent on static review.

## P3 — test execution limitation

The focused unit suite could not start because the sandbox prevented Vitest's generated cache write outside the owned review directory. Static inspection covers the relevant assertions, including disabled route stopping, the readiness exception, default-disabled mode, and the impossibility of configuration-only ready state. This does not overturn the Phase 1 PASS, but executed tests should accompany the migration approval packet.

## Later-phase observations — do not fail Phase 1

- Shadow/enabled still needs authoritative database RPCs and probes for replay, idempotency, fencing, grants, kill state, receipts, and readiness. The current route intentionally returns `503 authorization_state_unavailable` after authentication, so there is no mutable path or effect in installed-disabled.
- Shadow/enabled authentication and provider/effect authorization require their own full review before activation. These are later-phase P1 gates, not installed-disabled findings.

# Phase Decision

**PASS — PEC-78 Phase 1 installed-disabled remediation is ready for its controlled migration/readiness gate.**

The accepted state is narrowly bounded: Maya exists only as a disabled principal with five disabled grants and one disabled schedule; the database remains default-deny through forced RLS and revokes; receipt mutation fails visibly; middleware stops operational PEC-78 traffic; private readiness is stopped; public `healthz` is liveness-only; and credentials, destination grants, work, and effects remain absent. This verdict authorizes no migration, credential provisioning, destination binding, shadow mode, enabled mode, or external effect.

# Required Next Actions

1. At the separately authorized migration gate, preflight that `runtime_auth` is absent, verify the migration checksum, apply the migration transactionally, and capture catalog evidence for all 15 forced-RLS tables, exact revokes, receipt mutation denial, exact disabled Maya/five-grant/schedule rows, and zero credential/destination/effect rows.
2. Execute the focused unit/API suite in a writable test environment and record proof that middleware returns `423` for disabled operational routes, readiness authentication is required, authenticated readiness returns `503 stopped`, and `healthz` remains liveness-only.
3. Keep `PEC78_ADAPTER_MODE` absent or `disabled`. Treat shadow and enabled as later phases requiring new review and explicit approval; do not provision credentials, destinations, schedules outside the disabled seed, or effects under this PASS.
