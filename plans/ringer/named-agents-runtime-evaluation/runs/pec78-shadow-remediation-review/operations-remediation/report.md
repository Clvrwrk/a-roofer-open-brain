# Review Report

## Summary

The remediation materially improves the installed-disabled boundary: recipient references are fixed in server code, the recurring schedule must remain disabled for readiness, effect counts are atomically reserved, and the focused unit suite passes. It is not yet safe to execute the authorized shadow test. The runtime has no provider execution path or provider-identity verification, no bounded Gmail fixture intake, no enforceable token/tool/time/spend accounting, and no recoverable reconciliation path for ambiguous delivery. Its one-shot reservation also writes a `leased` occurrence into the canonical recurring schedule, so test state can be confused with or collide with later live scheduling. These are P1 blockers; the verdict is FAIL.

## Findings

### 1. Exact recipients are fixed, but exact provider identities and delivery are not implemented

**Evidence:** `store.server.ts` fixes Slack destination `D0B8B2NHP39` and email destination `admin@cc.proexteriorsus.net`, and the route does not accept recipient fields. Schema 189 only compares `destination_ref` and copies the grant's opaque `account_digest`; it never verifies Slack workspace `T0B8QEGPVQW`, Maya app `A0BD0PAEU2E`, Maya's bot-user identity, Google sender `maya.chen@cc.proexteriorsus.net`, or provider-returned recipient/sender fields. The only operational endpoints implemented are token issuance and `/reserve`; `reconcileEffect` has no route and there is no provider-send adapter. The focused tests contain no provider introspection, alternate-account, alternate-workspace, shared-bot, CC/BCC, or provider delivery test.

**Impact:** A grant can contain an unverified account digest, and a 201 reservation can exist without proving that Maya's exact Slack/Google identity delivered solely to Christopher. The activation acceptance criterion cannot be met safely.

**Fix:** Before readiness can become ready, introspect and bind the stable Slack team/app/bot-user IDs and Google sender ID to the credential and destination grants. Implement a provider adapter that ignores request-supplied routing, verifies provider-returned sender and recipient metadata, forbids CC/BCC and fallback identities, and durably records provider IDs. Add positive and mismatch tests for every identity and destination component.

**Priority:** P1

**Confidence:** High

### 2. Synthetic-only Gmail intake is absent and readiness does not require its fixture

**Evidence:** The contract requires one exact Gmail message ID under `PEC78-SHADOW-SYNTHETIC`, with sender, subject, body digest, and negative evidence for unrelated content. The policy maps claim/intake routes, but the route returns `operation_not_installed` for every authenticated non-reserve operation. Schema 189 instead fabricates `provider_message_id = 'synthetic:' || idempotency_key` during outbound reservation and creates no fixture grant or label/message/digest checks. Neither readiness nor focused tests mention the Gmail label, enumerated message ID, allowed sender/subject/body digest, attachments, or unrelated-message exclusion.

**Impact:** The authorized read/classification test cannot run. Adding mailbox access behind the existing green readiness result could expose ordinary mailbox content because the production gate has no enforceable fixture boundary.

**Fix:** Add an expiring, one-use fixture grant keyed to Maya's Google account, label, exact provider message ID, sender, subject, and body digest. Implement bounded lookup by exact ID, deny attachment and unrelated-message fetches, record negative-access evidence, and make fresh fixture verification a readiness requirement. Add positive and adversarial mailbox tests before any provider session is connected.

**Priority:** P1

**Confidence:** High

### 3. The one-shot test is recorded as a leased occurrence of the recurring live schedule

**Evidence:** `pec78_reserve_shadow_effect` inserts or reuses an occurrence with schedule ID `maya-mailbox-30m-v1`, `scheduled_for = date_trunc('hour', clock_timestamp())`, and state `leased`, even though no lease is created and readiness requires that schedule to be disabled and that zero active leases exist. The occurrence uniqueness key is the same contract/principal/schedule/time key intended for normal scheduling. There is no separate one-shot activation occurrence or test discriminator beyond fields on the generated work item.

**Impact:** A successful test produces scheduler state that looks live, can collide with a future top-of-hour recurring occurrence, and can be consumed or reported as scheduled work. Readiness can remain green despite the internally inconsistent `leased` occurrence, allowing a controlled test to be mistaken for live scheduling history.

**Fix:** Model the activation as a distinct one-shot occurrence type and immutable activation-gate ID, not the recurring schedule key. Require a real fenced lease if state is `leased`, or use an explicit non-scheduled test state. Make readiness reject orphaned/inconsistent occurrences and add tests proving test completion cannot enable, satisfy, collide with, or be counted as the recurring schedule.

**Priority:** P1

**Confidence:** High

### 4. Owner and fence checks are not atomic at effect reservation

**Evidence:** Token/request authorization checks credential, gate, capability, and kill state before `pec78_reserve_shadow_effect` is called in a separate RPC transaction. The reservation RPC rechecks only active credential/principal/grant/destination and an active budget; it does not recheck credential time bounds, grant time bounds, production gate, kill switches, disabled schedule, a canonical active owner lease, or a caller-supplied/current fence epoch. It merely copies the principal epoch into the effect. Schema 189 also has no unique constraint limiting a principal to one active credential/runtime instance. Focused tests do not exercise overlap, revocation between RPCs, stale epochs, restart, or Hermes/eve exclusion.

**Impact:** Authority can be revoked or fenced after request authorization but before reservation, yet the reservation may still succeed. Multiple active credentials can reserve under the same principal, defeating the single-owner guarantee.

**Fix:** Combine request claim and effect reservation or revalidate the complete authority tuple under the same locked transaction, including exact runtime instance, current caller fence epoch, gate, time bounds, kill switches, and schedule/test mode. Enforce one active credential/owner per principal and test concurrent owners, stale epoch, mid-flight rollback, expiry, and restart.

**Priority:** P1

**Confidence:** High

### 5. Cost controls are declared but not metered or enforced

**Evidence:** `activation_budgets` constrains configured maxima for input/output tokens, tool steps, runtime seconds, and aggregate dollars and binds `model_route_id`. No runtime path accepts or records actual token counts, tool steps, duration, retry count, or cost; `spent_usd` is never updated in schema 189 or the TypeScript code. Readiness only checks `spent_usd <= max_gate_cost_usd`, so its default zero can stay green indefinitely. The request supplies `modelRouteId`; equality with the budget protects the label but does not prove the actual Hermes/provider route. There are no focused cost or exhaustion tests.

**Impact:** The test can exceed its token, tool, time, retry, or $1.00 limits without a hard stop or missing-cost-receipt failure, and readiness can falsely report the budget healthy.

**Fix:** Resolve the model route server-side from the gate, meter actual usage, atomically charge spend before further work, require a terminal cost receipt, and fail closed on missing or late usage. Enforce no model retry and all configured ceilings at execution time; add boundary, concurrency, missing-receipt, and over-budget tests.

**Priority:** P1

**Confidence:** High

### 6. Ambiguous outcomes are terminal but cannot be reconciled

**Evidence:** `pec78_reconcile_shadow_effect` converts `unknown` to `failed_unknown`, then treats `failed_unknown` as an already-terminal replay on every later call. It cannot transition that effect to `reconciled_succeeded` or `failed_final` after provider-side inquiry. It accepts a caller-provided outcome/message ID without querying or validating the exact provider account/destination, and no API route exposes reconciliation. Readiness remains degraded while any `failed_unknown` exists, but there is no implemented way to clear it safely.

**Impact:** A timeout after provider acceptance permanently wedges readiness or invites manual database intervention. Operators cannot prove zero-or-one delivery, and any resend risks duplication.

**Fix:** Add a provider-specific, identity-bound reconciliation workflow that queries by durable correlation markers and allows guarded `failed_unknown -> reconciled_succeeded|failed_final` transitions with append-only evidence. Keep retry forbidden until reconciliation proves non-delivery, name the operator disposition, and test timeout-before-send, timeout-after-acceptance, delayed visibility, and reconciliation failure.

**Priority:** P1

**Confidence:** High

### 7. Readiness can report ready without critical operational evidence

**Evidence:** Application readiness treats nonempty key/config strings as proof of issuer separation, gate configuration, and registry version. Database readiness counts five active capabilities and two destinations but does not compare exact capability sets, destination/provider/account digests, build/registry/migration hashes, runtime owner/instance/fence, provider introspection, fixture grant, receipt-chain health, actual cost receipts, orphaned occurrences, or the global scope of its kill-switch and effect queries. Every check receives a fresh application timestamp even though the underlying RPC supplies no observation timestamps. The readiness test constructs booleans and proves only that all booleans yield `ready`.

**Impact:** A misbound provider, stale or mismatched gate, missing fixture, unusable receipt chain, or unmetered run can appear production-ready. Operators lack trustworthy freshness and provenance for promotion decisions.

**Fix:** Return evidence-bearing database observations with source timestamps and exact expected values; compare cryptographic build/registry/migration and gate digests; validate issuer public/private pairing and separation from Maya's key; scope kill/effect checks to the contract while also honoring global kills; and include provider, fixture, owner/fence, receipt, and cost checks. Add a negative test for each degraded condition.

**Priority:** P1

**Confidence:** High

### 8. Rollback does not preserve ambiguous in-flight delivery semantics

**Evidence:** The rollback RPC revokes every `reserved` or `executing` effect immediately, without first querying the provider or preserving a distinct unknown state. Because no implemented provider execution protocol atomically advances `reserved -> executing` around I/O, rollback cannot know whether a reserved effect has reached Slack or Google. The RPC cannot set the external `PEC78_ADAPTER_MODE=disabled`; no operator route or rollback drill is present. Although the principal epoch and schedules are fenced, the focused tests do not cover kill during I/O, retained receipts, HTTP 423 after rollback, or restoration requiring new authority.

**Impact:** Rollback can label a possibly delivered effect `revoked`, hiding an ambiguous outcome and making later resend unsafe. The database rollback result alone may be mistaken for a stopped adapter while the deployment mode remains shadow.

**Fix:** Quiesce the adapter first, atomically mark provider-attempted work unknown, reconcile it to zero-or-one delivery, then revoke authority while retaining immutable receipts. Provide an authenticated operator workflow that verifies the external disabled fuse and HTTP 423, and test rollback at every effect state plus restoration with a new credential, gate, and authorization.

**Priority:** P1

**Confidence:** High

## Clean

- Server-owned constants prevent request-supplied Slack or email recipient substitution on the reservation routes.
- The migration installs no active credential, destination, production gate, budget, provider, or recurring schedule.
- Atomic row locking and one-per-channel counters provide a sound base for the one Slack/one email reservation budget.
- DPoP issuer/proof key separation and exact Maya subject/persona/runtime-owner claims are implemented and covered by focused tests.
- Disabled mode returns 423 on operational routes, private readiness uses a bearer-token digest, and readiness requires the recurring schedule to remain disabled.
- The four focused PEC-78 test files pass: 20 tests total using Vitest's non-bundling config loader.

## Assumptions

- This is a static, read-only remediation review. No live catalog, provider introspection, migration application, delivery, or rollback-drill evidence was claimed.
- Schema 188 is the installed foundation on which schema 189 is intended to run.
- A reservation is not a provider delivery, and passing unit tests or a successful controlled delivery does not authorize ordinary mailbox intake or the recurring schedule.
- The exact provider identities and synthetic Gmail fixture described by the activation contract must be machine-enforced before the test, not supplied by operator convention.
- The initial Vitest attempt failed only because its default config loader tried to write outside this task's sandbox; rerunning the same four files with `--configLoader runner` passed.

MACHINE_VERDICT: FAIL
