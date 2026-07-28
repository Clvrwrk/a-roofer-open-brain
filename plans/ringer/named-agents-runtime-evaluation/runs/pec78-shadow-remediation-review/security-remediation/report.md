# Review Report

## Summary

- **FAIL.** The focused PEC-78 Vitest suite passes (4 files, 20 tests), and the implementation now uses separate issuer/proof environment variables and validates the principal DPoP request claims. However, it does not enforce that the issuer and Maya proof keys are different, so the original issuer/proof-separation P1 is not fully closed.
- The prior database and security P1s are not all closed. Schema 189 adds transactional functions, replay tables, budgets, receipts, and rollback, but leaves broad `service_role` access, request-controlled database destination selection, authorization-to-reservation TOCTOU gaps, unsafe replay/idempotency ordering, incomplete receipt integrity, and destructive handling of ambiguous effects.
- Several operational P1s also remain: no synthetic mailbox fixture enforcement, no canonical lease/owner proof, no provider-side destination confirmation/reconciliation procedure, incomplete readiness/evidence, and no executable cost accounting. No new P0 was found; the findings below are P1-P2, so PASS is forbidden.

## Findings

### P1 — Issuer/proof separation remains configuration-dependent

**Evidence:** `auth.server.ts:122-130` reads `PEC78_MAYA_PUBLIC_JWK` and `PEC78_ISSUER_PUBLIC_JWK` separately, but never rejects identical keys or thumbprints. `readiness.server.ts:10` reports issuer separation when issuer public/private strings merely exist. `issuePec78AccessToken` accepts any configured issuer private JWK and `verifyPec78Request` ignores the access-token `kid` and `typ` (`auth.server.ts:47,119-129`). The passing test at `auth.server.test.ts:19-30` proves one deliberately separate pair, but has no same-key negative case.

**Impact:** A deployment that places Maya's proof key in the issuer variables recreates the original self-minting vulnerability: possession of Maya's private proof key can mint accepted access tokens with attacker-chosen capability and runtime claims. An unpinned/ignored `kid` also prevents controlled issuer rotation and key allowlisting.

**Fix:** Compute RFC 7638 thumbprints for both public keys and fail startup, token issuance, request verification, and readiness if they are equal. Require access header `typ=at+jwt`, exact allowlisted `kid`, and a public issuer key matching that key ID; add same-key, wrong-`kid`, wrong-`typ`, and private-material-in-public-JWK negative tests.

**Priority:** P1

**Confidence:** High

### P1 — Privileged RPCs are exposed to the shared service role

**Evidence:** Schema 189 grants `service_role` direct EXECUTE on authorization, token issuance, reservation, reconciliation, rollback, and readiness functions (`189...sql:277-282`). The app invokes them with the repository-wide `SUPABASE_SERVICE_ROLE_KEY` (`store.server.ts:12-16`; `supabase.server.ts:36-66`). These functions are `SECURITY DEFINER` and do not authenticate or constrain the caller. In particular, any service-role holder can reconcile an arbitrary effect (`189...sql:211-232`) or disable Maya and supply the audit actor/reason (`:234-251`). The migration does not create a dedicated NOLOGIN/NOBYPASSRLS execution role, change function ownership to a least-privilege owner, or lock down default privileges.

**Impact:** Compromise or misuse of any Command Center service-role path becomes full PEC-78 control, bypassing RLS and the HTTP authentication boundary. A caller can forge terminal outcomes, trigger rollback, or invoke a reservation with attacker-selected arguments. This leaves the prior service-role/RLS-containment P1 open.

**Fix:** Use a dedicated, scoped database/JWT role with EXECUTE only on the exact runtime RPCs it needs; keep rollback on a separate operator role. Use non-login, least-privilege function owners, explicitly revoke PUBLIC/anon/authenticated/service_role and default privileges, validate caller claims inside RPCs, and add catalog plus cross-role denial tests.

**Priority:** P1

**Confidence:** High

### P1 — Authorization is not rechecked atomically at effect reservation

**Evidence:** `pec78_authorize_request` checks credential time bounds, production gate, capability validity, kill switches, and destination (`189...sql:125-149`). The later `pec78_reserve_shadow_effect` only checks active credential/principal/grant/destination and budget (`:176-186`); it does not recheck credential expiry, capability/destination expiry, production gate, any kill switch, current request claim/digest, schedule/lease ownership, approval, or a caller-bound fence. The HTTP handler makes these separate calls (`[...path].ts:46-68`). Reservation then creates a synthetic occurrence without a lease and records the principal's current fence rather than comparing a previously authorized owner epoch (`189...sql:193-202`).

**Impact:** Revocation, expiry, kill, destination withdrawal, or gate closure between request authorization and reservation can still produce a provider-I/O authorization. A duplicate/stale runtime is not fenced, and direct service-role invocation skips the first check entirely. This leaves the prior atomic authority, single-owner, kill-race, and fenced-reservation P1s open.

**Fix:** Collapse request claim and effect reservation into one locked transaction, or make reservation consume a single-use database authorization handle. Under locks, recheck every credential/gate/grant/destination/kill/lease/fence/approval/budget condition, compare the caller's expected epoch, derive destination solely from authoritative rows, and write the reservation receipt before returning. Add kill/revoke/expiry/lease races and direct-RPC denial tests.

**Priority:** P1

**Confidence:** High

### P1 — Replay/idempotency conflict ordering consumes claims and cannot return a completed response

**Evidence:** `pec78_authorize_request` inserts both replay JTIs before checking the existing idempotency row (`189...sql:150-160`). A digest-conflicting request returns `idempotency_conflict` normally, so the transaction commits the new replay claims despite doing no work. An exact retry with the same access/proof pair is rejected at the replay insert before the idempotency record can be consulted. `request_claims` still has no state/expiry/completion invariants, and schema 189 never stores `response_status` or `response_body`. The route ignores `requestState.replayed` and any stored response and proceeds to operation handling (`[...path].ts:46-52`).

**Impact:** Attackers or ordinary retries can burn proof/access JTIs, safe retries cannot deterministically recover a completed response, and in-flight versus completed requests remain indistinguishable. The atomicity is transactional but the conflict semantics required by the prior replay/idempotency P1 are not implemented.

**Fix:** Lock/check the idempotency key and digest before consuming new replay claims, define explicit in-progress/completed/failed state and expiry, atomically associate claims with the request, persist the final response, and have the route return it for an exact completed retry. Roll back all claims on digest conflict. Add concurrent identical, changed-body, same-JTI, crash-window, and response-replay tests.

**Priority:** P1

**Confidence:** High

### P1 — Exact provider destinations are not enforced or proven by the database boundary

**Evidence:** App constants pin only the Slack DM and email address (`store.server.ts:5-23`). The database RPC accepts `p_destination_ref` from its caller and selects any matching active row (`189...sql:118,145-148,168-180`). Schema 189 does not constrain capability/provider combinations, Slack workspace/app, Google sender identity, CC/BCC/forward/reply-to absence, or exact account/destination digests; its unique index permits multiple active destinations with different digests (`:28-30`). No activation rows are seeded, and reconciliation records only an optional provider message ID without provider-confirmed recipient/account fields (`:211-231`).

**Impact:** A direct privileged caller can select another active destination, malformed grants can bind email capability to Slack or vice versa, and a provider ID cannot prove delivery by Maya's exact account solely to Christopher. The prior exact-destination and exact-delivery-proof P1s remain open.

**Fix:** Represent and constrain the exact reviewed workspace, app/sender account, DM/email recipient, and forbidden-envelope fields in typed columns. Enforce one active destination per outbound capability, derive it without a destination argument, validate provider/capability pairing, and store independently verified provider-returned account/recipient details in terminal evidence. Add negative migrations/RPC tests for every alternate destination and envelope expansion.

**Priority:** P1

**Confidence:** High

### P1 — Ambiguous effects and rollback cannot be safely reconciled

**Evidence:** Reconciliation accepts caller-asserted `succeeded`, `unknown`, or `failed` plus an optional provider ID; it performs no exact-provider lookup (`189...sql:211-231`). It rejects reconciliation when the effect fence differs from the principal (`:223`). Rollback increments that fence, then changes `reserved` and `executing` effects to `revoked` (`:239-247`). Consequently an in-flight ambiguous effect loses its ambiguity state and later reconciliation is rejected as stale. The app imports no reconciliation function in the reviewed route and exposes only reservation (`[...path].ts:7,52-72`).

**Impact:** Rollback can report a clean stop while a message may have been delivered. Operators cannot record the provider-side truth afterward and may retry or restore into duplicate delivery. This directly violates the contract requirement that ambiguous outcomes remain terminal until provider-side reconciliation proves zero or one delivery.

**Fix:** On rollback, retain `reserved`/`executing` effects as reconciliation-required (or transition them to `failed_unknown`) while fencing further sends. Permit a separately authorized reconciliation role to append provider-verified evidence across fence changes without authorizing retry. Implement exact Slack/email lookup, zero/one/multiple-match handling, lane quiescence, and kill-during-each-state plus rollback/roll-forward tests.

**Priority:** P1

**Confidence:** High

### P1 — Receipt integrity is incomplete and can fork at initialization

**Evidence:** `append_receipt` locks only the current last receipt row (`189...sql:98-110`). When the table is empty, concurrent transactions lock nothing and can both insert genesis receipts with `previous_receipt_hash = NULL`. Receipt linkage fields remain nullable and lack foreign keys (`188...sql:77-81`); reconciliation writes null destination/request values (`189...sql:228-230`). There is no uniqueness rule for one reservation and one terminal receipt per effect/attempt, no effect ID or provider ID in the receipt schema, and no database assertion that `append_receipt` actually inserted a row before it returns its generated UUID.

**Impact:** The audit chain can fork or contain orphaned/incomplete evidence, and terminal provider delivery cannot be cryptographically tied to a particular effect and provider message. Append-only mutation protection does not close the prior trustworthy-receipts P1.

**Fix:** Serialize receipt sequencing through a dedicated singleton/advisory lock, add typed non-null effect/attempt/provider linkage with foreign keys, compute canonical hashes in-database including all evidence, require exactly one reservation and permitted terminal transition per attempt, and fail if insertion does not occur. Add empty-ledger concurrency, mutation, orphan, duplicate-event, and service-role insertion-denial tests.

**Priority:** P1

**Confidence:** High

### P1 — The synthetic intake, model-cost, and readiness operational gates are not implemented

**Evidence:** Reservation fabricates `provider_message_id='synthetic:'||p_idempotency_key` rather than verifying the activation's enumerated Gmail message ID, label, sender, subject, and body digest (`189...sql:193-199`). No reviewed route implements mailbox fixture reads/classification. The activation budget stores ceilings and `spent_usd`, but no reviewed function records model usage/cost or increments spend (`:32-48,182-186`). Readiness counts rows and configuration strings but does not prove issuer-key inequality, registry/migration/build hash agreement, exact provider identities/destinations, receipt-sink health, cost receipts, or freshness of database observations (`:254-267`; `readiness.server.ts:4-17`).

**Impact:** Ordinary mailbox access is not mechanically excluded, spend can remain zero regardless of actual usage, and readiness can become green without the operational evidence required by the activation contract. The corresponding prior operations P1s remain open.

**Fix:** Add a production gate row for the one enumerated fixture and enforce all label/message/sender/subject/body digest checks before any fetch, with negative-access evidence. Atomically record model route, tokens, tool steps, runtime, and spend against the budget. Expand readiness to validated fresh observations and exact deployment/provider/hash assertions, then test all degraded cases and rollback drills.

**Priority:** P1

**Confidence:** High

### P2 — Secret-reference validation is shallow and secrets remain co-located

**Evidence:** The new JSON constraint rejects only seven exact top-level keys (`189...sql:8-11`). Nested objects, differently cased keys, aliases such as `client_secret`, and secret-shaped values remain valid. `PEC78_ISSUER_PRIVATE_JWK` is intentionally loaded into the same web runtime that holds the broad Supabase service-role key (`env.d.ts:11,41`; `auth.server.ts:43-58`), and no secret scan/rotation gate is present in the reviewed artifacts.

**Impact:** Raw provider credentials can still be persisted in `provider_refs`, and compromise of the Command Center process exposes both token-minting and database-bypass credentials, increasing blast radius.

**Fix:** Replace JSON with typed opaque reference IDs and allowlisted metadata; reject nested/unrecognized fields at the only write RPC. Isolate issuer signing behind a narrowly authenticated signer/KMS boundary, use a scoped database credential, and require source/artifact/database/log/environment scans plus rotation evidence before promotion.

**Priority:** P2

**Confidence:** High

## Clean

- `verifyPec78Request` now verifies access tokens with the issuer public key and DPoP proofs with Maya's registered public key, validates `iss`, `aud`, identity, time bounds, `htu`, `htm`, `ath`, body digest, JTIs, and exact RFC 7638 `cnf.jkt` binding.
- Route contracts now separate Slack and email reservation paths, reject destination/envelope fields in request JSON, pin the visible DM/email constants, and constrain synthetic message text and the email subject.
- Schema 189 is transactional and installs disabled: it seeds no credential, active grant, destination, gate, schedule, budget, or provider. It adds bounded one-Slack/one-email counters, time-order checks, pre-I/O receipt insertion, terminal effect states, and an atomic rollback function as useful foundations.
- The focused command `npm test -- src/lib/pec78 --configLoader runner --no-cache` passed all 4 test files and 20 tests. The first ordinary run could not write Vite's cache under the read-only source tree; the cacheless runner completed without modifying source.
- No raw secret value was found in the reviewed source, schema, activation contract, or prior reports. No P0 issue was identified.

## Assumptions

- This is a read-only static review of the requested activation contract, three prior FAIL reports, current `src/lib/pec78`, runtime route, `env.d.ts`, schemas 188-189 as needed for inherited definitions, and the focused Vitest results. No migration was applied to a live database and no provider call was made.
- Schema 189 is reviewed together with schema 188 because it alters and depends on schema-188 tables, constraints, states, privileges, and receipt structure.
- No unreviewed gateway, provider adapter, database role, catalog policy, fixture gate, operator endpoint, or deployment configuration is assumed to close a finding.
- The activation document's Linear authorization may authorize the two immutable test intents, but it does not waive exact destination, fencing, reconciliation, receipt, replay, service-role, synthetic-fixture, budget, or readiness requirements.
- A successful controlled test remains non-live: ordinary mailbox intake and the recurring schedule remain disabled pending a separate promotion and evidence gate.

MACHINE_VERDICT: FAIL
