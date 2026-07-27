# Verdict

`VERDICT: CONDITIONAL_PASS`

The schema foundation and request routing are safe enough to **install with `PEC78_ADAPTER_MODE` absent or `disabled`**, provided a preflight confirms that `runtime_auth` does not already exist and the migration is applied transactionally as written. In that state, the migration creates no principal, credential, grant row, schedule row, occurrence, effect, provider adapter, or callable RPC; middleware returns `423 adapter_stopped` before legacy bearer, local-operator, or WorkOS authentication. Its installed-disabled posture is **default-deny**, so Phase 1 can be physically installed while remaining inert.

This is not a pass to declare installed-disabled complete, enter synthetic/production shadow, or enable. Disabled readiness is unreachable, the design-required disabled seed/grant records and database RPC authorization boundary are absent, and readiness can later become falsely green from four environment strings without inspecting authoritative database state. The latter is a release P0 under the architecture contract.

# Scope Reviewed

- Design contract: `plans/ringer/named-agents-runtime-evaluation/runs/pec78-design-retry/architecture-contract-retry/design.md`.
- `app/command-center/src/lib/pec78/{contract,policy.server,auth.server,readiness.server}.ts` and the two PEC-78 unit-test files.
- `app/command-center/src/middleware.ts`.
- `app/command-center/src/pages/healthz.ts`.
- `app/command-center/src/pages/api/agent/runtime/v1/[...path].ts`.
- `schemas/cleverwork-roofer/188-pec78-runtime-auth-v1-installed-disabled.sql`.
- Narrow supporting inspection of `env.d.ts`, `runtime-env.ts`, `access-control.ts`, package scripts, and the health/middleware diffs.
- Review only: no source edits, database/network access, migration execution, credentials, provider calls, or external effects. Only this `review.md` was created.

# Executed Evidence

- Read the complete design sections governing versioned authorization, transaction/fencing behavior, persistence/RLS, readiness, rollback, tests, and production gates.
- Inspected all scoped files with line numbers and traced middleware ordering into the catch-all runtime route.
- Inspected the health and middleware diffs against the worktree base.
- Confirmed statically that the SQL is wrapped in one `BEGIN`/`COMMIT`, contains only DDL/revokes, and has no inserts, functions, RPC execute grants, backfill, provider operation, destructive DDL, or down-migration.
- Confirmed every created table has RLS enabled and forced, and direct table privileges are revoked from `public`, `anon`, and `authenticated`.
- Attempted targeted Vitest execution for `policy.server.test.ts` and `readiness.server.test.ts`. Vitest failed before loading tests because Vite attempted to write `node_modules/.vite-temp/vitest.config...mjs` in the read-only application worktree (`EPERM`). No assertion executed.
- Attempted a read-only TypeScript check; the project has no local `node_modules/.bin/tsc`, so no compiler check executed.
- Did not run SQL/catalog tests because database access and migration execution were prohibited. The repository contains no scoped PEC-78 SQL/RLS test supplied with this implementation.

# Findings

## P0 — enabled blocker: readiness can report a false green

`readiness.server.ts:4-13` declares `ready` when mode is `enabled` and three environment bindings are merely non-empty. It does not validate exact build/contract/migration, a current production-gate row, active Maya-only principal/credential/runtime, capability and destination grants, schedule ownership/duplicates, RLS/grant checksum, replay store, fencing, receipt probes, provider tuple, breakers, kill state, unresolved effects, or recent probes. Values such as `sha256:x` and `{}` are accepted by `readiness.server.test.ts:7` as ready.

This directly violates the contract's “missing/stale/contradictory evidence is false” rule and its explicit classification of false-green readiness as a release P0. It does not block installing disabled because disabled requests cannot execute, but it blocks any enabled gate and makes the present readiness test evidence actively misleading.

## P1 — installed-disabled completion/rollback blocker: stopped readiness is unreachable

`middleware.ts:117-120` returns `423` for every PEC-78 runtime path while disabled. Even if middleware were bypassed, `[...path].ts:20` returns the same response before its readiness branch. Consequently `GET /api/agent/runtime/v1/readiness` cannot authenticate its distinct operator token and return the contract-required HTTP `503` report with `status: "stopped"`.

This does not make the database installation active or unsafe, but it prevents the phase-1/rollback proof “verify readiness stopped” and violates the private-readiness response contract. Disabled readiness must be routed before the runtime mutation fuse while remaining operator-authenticated.

## P1 — shadow/enabled blocker: no transactional authorization plane exists

Migration 188 defines storage but none of the required narrowly typed RPCs (`claim_request`, occurrence/lease/work/effect transitions, approval/reservation/reconciliation, kill, readiness). The API intentionally returns `503 authorization_state_unavailable` after environment-only DPoP verification. There is therefore no atomic replay/idempotency claim, locked readiness/lease/fence recheck, compare-and-set state transition, same-transaction receipt, provider reservation, kill fencing, or non-destructive database rollback operation.

This absence is safe for installation because it prevents all mutations and effects. It is a hard blocker to synthetic shadow, production shadow, and enabled—not a defect that should be “worked around” with direct table access or the app service role.

## P1 — shadow/enabled blocker: the authentication implementation is not the complete contract boundary

`auth.server.ts:43-90` provides useful signature, exact-identity, time, method/URL, access-token hash, and body-hash checks, but it does not enforce HTTPS, validate the access token's `cnf.jkt`, constrain/validate key shape and registered credential, atomically claim JWT/DPoP replay IDs and idempotency, use RFC 8785 canonical JSON, validate request schemas before allow, or consult registry/credential/instance/kill/database state. The configured thumbprint is computed from ordinary `JSON.stringify(publicJwk)`, which is property-order-sensitive and is not the RFC 7638 JWK thumbprint required for DPoP binding.

The route policy also enumerates only claim, intake, and one email-only effects route (`contract.ts:26-30`); dynamic lease/effect execution/reconciliation, operator kill, and Slack effect policy are absent. These gaps do not defeat disabled mode, because verification is never reached there, but they prohibit describing shadow as a complete authentication boundary.

## P1 — phase-1 acceptance blocker: migration does not install the contracted disabled identity/grant baseline

The contract's migration order and installed-disabled gate call for a disabled Maya principal seed and five disabled capability grants, with no credential, enabled schedule, or effect. Migration 188 instead seeds nothing (`188...sql:106-108`), and the fixed schedule table cannot contain a disabled schedule without first creating a principal. This is maximally inert but does not produce the catalog state the reviewed design says phase 1 installs and later activation binds.

Installing the empty foundation is conditionally safe; labeling it a completed PEC-78 installed-disabled implementation is not. Add the exact disabled baseline in a reviewed additive migration or formally revise the contract before phase acceptance.

## P2 — install preflight: `create schema if not exists` can mutate a pre-existing namespace

`188...sql:5-6` reuses any existing `runtime_auth` schema and revokes schema privileges from `public`, `anon`, and `authenticated`. If an unrelated or partially installed schema already exists and all subsequent creates happen to succeed, this is not purely additive to that namespace and may alter existing access. If a later statement fails, PostgreSQL transactional DDL should roll the transaction back, which limits partial-install risk.

Before installation, prove the schema is absent (preferred) or exactly matches an approved predecessor. Do not treat `IF NOT EXISTS` as a compatibility check.

## P2 — shadow/enabled blocker: grants/RLS do not yet implement role separation or prove catalog safety

All tables are force-RLS with no policies and no direct grants to normal application roles, which is a strong inert default. However, the migration revokes tables only from `public`, `anon`, and `authenticated`, not the contract's existing named/service roles; it creates none of the dedicated `pec78_maya_runtime`, `pec78_human_approver`, or `pec78_readiness` execute surfaces; and there are no catalog tests for owners, `BYPASSRLS`, default privileges, exact grants, or fixed `search_path` security-definer functions.

The lack of policies and grants means ordinary roles cannot currently use the tables, so this is not an install-disabled activation path. Before shadow, catalog tests must demonstrate denial for every generic/existing role and exact execute-only access for dedicated roles. The app service-role path must never become Maya's authorization identity.

## P2 — shadow/enabled blocker: append-only receipts silently absorb forbidden changes

`188...sql:103-104` implements update/delete protection as `DO INSTEAD NOTHING` rules. This preserves rows but can make an unauthorized or buggy mutation appear successful rather than fail closed. The contract requires receipt immutability and transaction failure when required receipt work fails. Use privilege isolation plus a mechanism/tests that make forbidden mutations error visibly, including owner/service/BYPASSRLS cases; never rely on silent no-op semantics as authorization evidence.

## P2 — public health regression risk requires consumer validation

`healthz.ts` now returns exactly the design's public liveness fields and removes tenant/resource identifiers, raw errors, configuration details, and dependency probing. That is a security improvement and is correct for PEC-78: public liveness returning `200 status=ok` while dependencies are degraded is not PEC-78 readiness and must never authorize work.

The diff also removes many legacy fields (`phase`, route/agent counts, runtime/auth configuration, live-surface status/errors) and eliminates the database-touching probe. Any deployment monitor or client that treated those undocumented fields as its contract may regress or become less sensitive to dependency failure. No route snapshot, health consumer test, or build executed here, so validate consumers and provide a separate authenticated dependency/readiness surface before shipping this response change.

## P3 — test coverage is too narrow even though the two unit tests are directionally useful

The policy tests cover exact tuple denial, and readiness tests cover disabled-by-default and flag-only denial. They do not cover middleware non-fallthrough, disabled readiness, DPoP/auth negatives, public response shape, replay/idempotency, SQL constraints/grants/RLS, transaction rollback, or catalog ownership. The existing readiness “all bindings” case encodes the P0 false-green defect. Required database, API, concurrency, fault, state-machine, rollback, and regression suites remain absent or unexecuted.

# Phase Decision

- **Physical installation with adapter disabled: CONDITIONAL GO.** Preflight that `runtime_auth` is absent, verify the deployed environment resolves mode to `disabled`, apply migration 188 transactionally, and prove no rows/RPCs/grants/schedules/credentials/effects were created. This installation remains inert because both HTTP routing and database privileges deny work.
- **Declare Phase 1 installed-disabled complete: NO-GO.** The stopped-readiness contract, disabled baseline seeds/grants, catalog evidence, and executable regression evidence are missing.
- **Synthetic shadow: NO-GO.** The transactional RPC/store, atomic replay/idempotency, database-backed authorization checks, complete DPoP binding, schemas, receipts, and rollback controls do not exist.
- **Maya production shadow: NO-GO.** In addition to the synthetic blockers, no reviewed production resource bindings, probes, three-day evidence, or production gate exists.
- **Enabled: P0 NO-GO.** Readiness is false-green and there is no transactional/effect authorization implementation.

# Required Next Actions

1. **Before installing disabled:** confirm `runtime_auth` is absent; capture the migration checksum; confirm mode is absent/`disabled`; run the migration in a controlled transaction; then use catalog-only evidence to prove zero rows, zero executable RPCs, no dedicated role grants, force RLS on every table, and no privilege widening. Keep provider credentials and schedules absent.
2. **To complete Phase 1:** make authenticated readiness reachable while disabled and return `503 stopped`; add or contractually reconcile the exact disabled Maya principal/five disabled-grant baseline; add public-health response regression/consumer tests; run build, unit, API isolation, SQL syntax/catalog/RLS, and rollback checks.
3. **Before any shadow:** implement the narrowly typed transactional RPC layer with locked rechecks, fencing, atomic replay/idempotency, state/receipt atomicity, visible append-only enforcement, dedicated DB roles, exact grants, fixed search paths, and exhaustive denial/catalog tests. Do not grant direct table access as a shortcut.
4. **Before production shadow/enabled:** finish standards-compliant DPoP binding and canonicalization, registry/credential/kill integration, all endpoint policies/schemas, authoritative readiness probes, synthetic concurrency/fault/rollback drills, provider sandbox evidence, and the separately approved production-gate record.
5. Treat the P0 readiness false green, any RLS escape, receipt gap, stale-owner success, identity mismatch, or provider ambiguity as a global-stop condition. Do not advance phases with an environment-only readiness result.
