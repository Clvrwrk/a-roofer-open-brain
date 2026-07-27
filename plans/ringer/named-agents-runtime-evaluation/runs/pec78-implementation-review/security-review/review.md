# Verdict

`VERDICT: CONDITIONAL_PASS`

The implementation is fail-closed for the narrowly defined installed-disabled deployment: the PEC-78 route family is intercepted before legacy bearer, local-operator, or WorkOS resolution; an unset or unrecognized mode normalizes to `disabled`; disabled requests return `423 adapter_stopped`; and the runtime route contains no store, mailbox, scheduler, provider, or effect invocation. Schema 188 creates no credential and performs no provider binding or backfill.

This is not an unconditional phase-1 acceptance. Schema 188 omits the contract-required disabled Maya seed, disabled canonical schedule, and five disabled capability grants. That is a P1 acceptance blocker to declaring installed-disabled complete, although installing the empty, denied schema does not itself authorize an effect. Shadow and enabled are denied: the implemented authentication and readiness surfaces contain P1 authorization and false-green defects, and the persistence model is not yet sufficient for safe mutable operation.

# Scope Reviewed

- Security contract: `pec78-design/security-contract/design.md`.
- Architecture retry contract: `pec78-design-retry/architecture-contract-retry/design.md`.
- `app/command-center/src/lib/pec78/{contract,auth.server,policy.server,readiness.server}.ts` and the two PEC-78 unit tests.
- `app/command-center/src/middleware.ts`, `src/lib/access-control.ts`, `src/env.d.ts`, `src/pages/healthz.ts`, and `src/pages/api/agent/runtime/v1/[...path].ts`.
- `schemas/cleverwork-roofer/188-pec78-runtime-auth-v1-installed-disabled.sql`.
- Read-only corroboration of the canonical named-agent registry and its validator was used to confirm that effect authorization remains `not-installed`, default-deny, and credential references remain null. No credential values, network calls, migrations, database writes, or external effects were used.

# Executed Evidence

- `npm --prefix app/command-center exec vitest run src/lib/pec78/policy.server.test.ts src/lib/pec78/readiness.server.test.ts`: PASS, 2 files / 11 tests.
- `node --test agents/registry/validate-named-agent-principals.test.mjs`: PASS, 131 tests, including absent-adapter denial, shared-token denial, cross-persona identity denial, and frozen `not-installed` adapter status.
- Migration ordering check: schema 188 follows existing schema 187.
- Static route trace: middleware checks `/api/agent/runtime/v1` before all legacy authentication branches; disabled mode returns before the Astro route; the route also independently repeats the disabled check.
- Static effect trace: no PEC-78 store/effect/provider/scheduler implementation exists and the post-auth route terminates with `503 authorization_state_unavailable`.
- `npm --prefix app/command-center run build`: NOT EXECUTED TO COMPLETION. Astro failed with `EPERM` while trying to generate `app/command-center/.astro/content.d.ts`, outside this review's writable root. This is a sandbox limitation and leaves build evidence incomplete.
- No SQL migration was applied. Schema conclusions are static review only; no local PostgreSQL/RLS harness was available within the authorized scope.

# Findings

## P1 — Installed-disabled acceptance blocker: required disabled seed/state is absent

Schema 188 ends after tables, forced RLS/revokes, and receipt rules (`188...sql:95-108`). It deliberately creates no principal, canonical schedule, or capability rows. The architecture contract requires migration order to end with a disabled Maya seed and five disabled grants, and phase 1 explicitly requires disabled seed rows. Without those rows, the installed state cannot be tied to an exact registry version or demonstrate the canonical schedule's disabled state. This is safer than an active seed, but incomplete against the phase contract.

Blocker classification: **blocks declaring/installing phase 1 complete**; it does not create credential, mailbox, scheduling, or outbound authority. Add an exact Maya principal seed, the canonical schedule in `disabled`, and all five grants in `disabled`, bound to a reviewed registry hash. Do not seed credentials or destination/provider bindings.

## P1 — Shadow/enabled blocker: Maya can self-mint the access token

`auth.server.ts:60-66` verifies both the access JWT and DPoP proof with the single configured Maya public key. It never verifies an issuer signing key independently and never enforces `cnf.jkt`. Possession of Maya's DPoP private key therefore permits minting an arbitrary access JWT with chosen capability, credential ID, runtime instance, and JTI. The configured thumbprint check at lines 88-89 does not repair issuer authenticity.

Blocker classification: **not an installed-disabled blocker** because the deployment fuse returns before authentication and the route has no mutable implementation; **P1 blocker to synthetic shadow, production shadow, or enabled**. Use a separately trusted issuer keyset for the access JWT, validate `kid`/issuer/audience, validate RFC 7638 `cnf.jkt` against the proof key, and bind credential/runtime status through the atomic authorization store.

## P1 — Shadow/enabled blocker: readiness can report false green from strings alone

`readiness.server.ts:6-13` marks readiness `ready` when four environment values merely exist. The included test explicitly blesses this behavior (`readiness.server.test.ts:7`). It does not verify build/migration/RLS versions, a current production-gate row, principal/credential state, replay storage, schedule ownership, fencing, receipts, kill switches, provider identities, cost breakers, reconciliation, or fresh probes. The contracts call configured-only readiness false green and a release P0.

Blocker classification: **not an installed-disabled authorization blocker** because readiness is not consulted by policy and disabled requests stop first; **P1 blocker to shadow/enabled and any readiness claim**. Readiness must be observational, backed by fresh authoritative checks, and remain 503 until every contract check succeeds.

## P1 — Shadow/enabled blocker: persistence cannot enforce the contracted transaction boundary

Schema 188 is a useful deny-only skeleton, but its mutable model is materially incomplete. Effects lack lease ID/epoch, credential, approval, provider-account/thread, registry version, and the complete immutable destination/intent bindings (`188...sql:64-75`). Receipts omit runtime owner/instance and do not FK their optional entity IDs (`77-82`). There is no revocations table, no typed security-definer RPC boundary, no explicit role execute matrix, and no catalog/RLS tests. `provider_refs jsonb` is unconstrained and could hold raw credential material (`15-19`). These omissions prevent atomic replay, fencing, approval consumption, receipt coupling, and safe service-role use required by both contracts.

Blocker classification: **not an installed-disabled blocker while there are no grants/RPCs and the fuse remains disabled**; **P1 blocker to any mutable synthetic shadow, production shadow, or enabled state**.

## P2 — Installed-disabled evidence gap: private stopped readiness is unreachable

Both middleware (`middleware.ts:117-119`) and the route (`[...path].ts:20`) return `423` before the readiness branch. Consequently an authenticated operator cannot obtain the contracted `stopped` readiness report while the adapter is disabled. This does not authorize traffic, but it removes the intended phase-state evidence and makes rollback verification weaker.

Blocker classification: **phase-1 observability/acceptance gap, not an effect-safety blocker**. Carve out only the exact readiness route, authenticate it with the distinct operator mechanism, and return 503 with `status: stopped`; keep every operational route at 423.

## P2 — Shadow/enabled blocker: request-proof validation is incomplete

`auth.server.ts` does not enforce HTTPS; does not claim access/DPoP JTIs or request idempotency; accepts a future access-token `iat`; does not limit `nbf` with the specified skew; does not validate credential/runtime/registry/revocation state; and reads/clones the request body before an authorization-state transaction (`67-90`). The thumbprint is `sha256(JSON.stringify(jwk))`, not RFC 7638 canonical JWK thumbprinting. The broad catch also converts missing authorization state and malformed input alike to 401 in several cases.

Blocker classification: **not an installed-disabled blocker**; **blocks shadow/enabled** until the full authentication matrix and replay/idempotency store exist.

## P2 — Test/build evidence is below the next-gate contract

The unit tests cover exact policy tuple denial and four readiness flags only. There are no route-level tests proving disabled mode cannot fall through to legacy/local/WorkOS auth, no auth cryptographic matrix, and no SQL catalog/grant/RLS tests. The build could not be completed in this restricted review workspace.

Blocker classification: **not a demonstrated installed-disabled exploit**, but the missing route/migration assertions should be closed before phase-1 sign-off; all larger suites are mandatory before shadow/enabled.

## P3 — Access-control type widening is presently unused

`access-control.ts` adds `runtime_named_agent` and `pec78_dpop`, but no PEC-78 request is converted to a legacy `CommandCenterActor`. This is currently inert. Preserve that separation; do not later use these type additions to route PEC-78 through department permissions or legacy work-queue authority.

# Phase Decision

**Installed-disabled: CONDITIONAL PASS, with one P1 completion blocker.** The code and empty denied schema are safe to install only if `PEC78_ADAPTER_MODE` is absent or exactly `disabled`, registry effect authorization remains `not-installed`/deny, no PEC-78 credential or provider secret is configured, and no schedule/provider runtime is deployed. Phase 1 is not complete until the contract-required disabled seed rows and focused route/schema evidence are added and reviewed.

**Synthetic shadow: FAIL / DENIED.** The access-token trust model, replay/state checks, readiness, persistence/RPC boundary, and tests are insufficient.

**Production shadow: FAIL / DENIED.** No production credential, resource/provider binding, schedule, or mailbox read is authorized.

**Enabled: FAIL / DENIED.** No outbound effect, approval, or provider I/O is authorized.

# Required Next Actions

1. Before phase-1 completion, amend schema 188 (before it is applied anywhere) to seed only the exact disabled Maya principal, disabled canonical schedule, and five disabled capability grants with the reviewed registry version; seed no credential, destination grant, occurrence, lease, or production gate.
2. Add route-level tests proving missing/garbage/disabled mode returns 423 before legacy bearer, local operator, WorkOS, body parsing, DB access, and provider code; test exact-prefix handling and authenticated stopped readiness.
3. Add static/catalog migration tests for forced RLS, exact revokes, zero credentials/active rows, disabled seeds, constraints, and receipt immutability. Re-run the Astro build in a writable checkout.
4. Keep `PEC78_ADAPTER_MODE=disabled`, `effect_authorization.status=not-installed`, all credential/provider variables absent, and all schedules off. Do not use the current readiness result as authorization or deployment evidence.
5. Before any shadow request is allowed, separate issuer signing trust from the DPoP key, implement RFC 7638/cnf binding and strict time/HTTPS checks, atomically claim replay/idempotency state, validate registry/credential/runtime/kill state, and complete the typed transactional RPC/data model.
6. Replace configured-only readiness with fresh authoritative checks and execute the full auth, API, SQL/RLS, concurrency, fault, regression, secret/PII, and rollback suites required by the contracts. Obtain a new security review before advancing modes.
