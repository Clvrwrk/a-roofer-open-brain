# Review Report

## Summary

- The contract strongly fixes Maya's identities, provider destinations, effect count, and receipt timing, but it does not supply the operational controls or executed evidence required by the named-agent governance.
- Open P1 gaps remain in single-owner fencing, synthetic mailbox safety, exact-recipient proof, provider reconciliation, observability/readiness, cost limits, kill-switch behavior, and rollback/restoration.
- This gate may support implementation and tightly controlled tests only. Maya cannot be called live, connected to ordinary production mailbox intake, or placed on the recurring schedule after this gate.

## Findings

### 1. Single-owner scheduling and stale-owner fencing are not specified or proven

**Evidence:** The activation contract says the recurring 30-minute schedule remains disabled, identifies `runtime:maya-chen`, and checks whether a kill switch matches. It does not require a canonical schedule/effect lease, an owner epoch in every occurrence and effect, rejection of stale epochs, overlap tests, or proof that Hermes/eve and any legacy consumer cannot simultaneously own Maya. The governance requires one runtime owner and tests for restart and stale-owner fencing; the execution map places fenced ownership and schedule registry before the exactly-once effect ledger.

**Impact:** A controlled effect or later promotion could be executed by a stale or duplicate consumer, creating duplicate deliveries or conflicting cursor advancement even though the recurring schedule is nominally disabled.

**Fix:** Bind every intake, decision, proposed effect, and provider attempt to a canonical owner lease and fence epoch; reject stale owners transactionally before provider I/O. Execute overlap, lease-expiry, restart, stale-epoch, and Hermes/eve mutual-exclusion tests and attach their durable evidence before this gate closes.

**Priority:** P1

**Confidence:** High

### 2. Exact-recipient enforcement is designed, but exact-recipient delivery proof is incomplete

**Evidence:** The contract hard-codes Slack workspace `T0B8QEGPVQW`, Maya app `A0BD0PAEU2E`, DM `D0B8B2NHP39`, and email recipient `admin@cc.proexteriorsus.net`, and forbids request-supplied alternatives. Acceptance requires a durable provider ID and receipt, but does not require retaining and independently checking the provider account identity, normalized provider-returned conversation/recipient, sender/app identity, and absence of CC/BCC against those exact values. “Destination tests” is not an executed evidence specification.

**Impact:** A provider ID can prove that some provider operation occurred without proving that the named Maya account delivered solely to Christopher through the authorized route.

**Fix:** Define the receipt fields and verifier: expected and provider-confirmed tenant/account/app/sender, conversation or normalized envelope recipient, CC/BCC absence, provider message ID, request hash, owner epoch, and terminal status. Require positive verification plus negative tests for alternate DM, workspace, app, email recipient, CC/BCC, shared-bot fallback, and provider-account mismatch.

**Priority:** P1

**Confidence:** High

### 3. The mailbox test is not constrained to synthetic intake

**Evidence:** Human authorization permits Maya to “read and classify her Google Workspace mailbox.” The outbound body is constrained from containing mailbox or customer content, but the contract does not require a synthetic inbound fixture, a unique test label/message ID, bounded query, unrelated-message exclusion, cursor isolation, or proof that no ordinary mailbox content was read or recorded. The runtime plan requires one synthetic Google Workspace email and prohibits exposure of unrelated mailbox content; governance's present boundary still prohibits real-inbox access absent a later explicit gate.

**Impact:** Controlled testing could process production or personal mailbox content, expanding data access beyond the synthetic gate and putting real content into decisions, traces, or Command Center records.

**Fix:** Limit this gate to a uniquely identified synthetic email created for the test; query and authorize only that fixture, start from an isolated test cursor, assert zero access to unrelated messages, and scan decisions/logs/receipts/artifacts for mailbox or customer content. Keep ordinary mailbox sources disconnected.

**Priority:** P1

**Confidence:** High

### 4. Ambiguous provider outcomes have no terminal reconciliation procedure

**Evidence:** The contract correctly forbids automatic retry after an ambiguous provider result and requires a terminal receipt after provider I/O. It does not define how Slack or email delivery is queried using the exact account/destination/request markers, who owns reconciliation, which terminal states exist, how long an effect may remain unknown, or what evidence permits retry or permanent closure. The governance stops on any effect that cannot reconcile, and the execution map requires preserving queues and reconciling unknowns.

**Impact:** Operators may resend an effect that actually succeeded, or abandon an effect that failed, causing duplicate or missing delivery and an inaccurate terminal receipt.

**Fix:** Define `reserved`, `attempted`, `confirmed`, `failed`, and `unknown` states; preserve the idempotency key and provider correlation data; quiesce the lane on `unknown`; reconcile against the exact Slack/email provider; require named operator disposition and durable evidence before any retry or closure. Test timeout-before-send, timeout-after-acceptance, delayed receipt, and reconciliation failure.

**Priority:** P1

**Confidence:** High

### 5. Receipt durability and effect accounting lack an acceptance schema

**Evidence:** The contract requires an immutable pre-I/O receipt, a reconciled terminal receipt, and exactly one Slack plus one email effect. It does not specify the atomic relationship among JTI claims, request idempotency, owner epoch, proposed effect, attempt, provider ID, terminal transition, or an evidence query proving that no other effect occurred. It also does not state that the receipt sink must be healthy before intake and remain observable through rollback.

**Impact:** The test could appear successful while losing correlation between authorization and provider delivery, overwriting status, or failing to detect an extra attempted effect.

**Fix:** Publish and test an append-only receipt schema with principal, owner epoch, gate/approval ID, access/proof JTIs, request/effect idempotency keys, exact destination tuple, payload hash, provider account and ID, timestamps, model/cost route, and state transitions. Fail closed when the sink is unhealthy and close the gate with a deterministic zero/one/two-effect reconciliation query.

**Priority:** P1

**Confidence:** High

### 6. Observability and readiness criteria are too generic to operate safely

**Evidence:** Acceptance says “production catalog/readiness checks pass” but defines no checks, thresholds, evidence IDs, or responder. The governance and template require honest health for gateway, schedule owner, Slack, Orgo, Google session, Command Center, last/next run, queue depth, trace/retry state, daily spend, breakers, SLOs, runbooks, and three separate clean days. The activation contract names none of those signals or stop thresholds.

**Impact:** A partially disconnected or falsely green runtime could execute tests or be promoted without operators seeing a stuck queue, stale owner, broken receipt sink, lost provider session, or budget breaker.

**Fix:** Define a machine-checkable readiness packet with component health, freshness thresholds, queue/unknown-effect counts, owner and epoch, kill status, receipt-sink health, trace linkage, provider-session identity, alert routes, named responder and rollback owner. Require executed negative-health tests and the governance-required three clean days before any later production gate.

**Priority:** P1

**Confidence:** High

### 7. No exact model route, token ceiling, or spend circuit breakers are bound to the gate

**Evidence:** The activation contract sets an effect-count budget but no exact model/provider, input/output token ceilings, timeout, retry/escalation rule, per-run cost ceiling, daily/monthly budget, cost receipt, or 70/85/100 percent breakers. Governance requires all of these and forbids ambiguous/free/random provider routing; the Hermes template requires per-agent provider credentials and benchmarked promotion.

**Impact:** Maya could incur unbounded or unattributed model cost, route mailbox data through an unapproved provider, or silently fall back to a model/provider outside the evaluated data-handling contract.

**Fix:** Bind the controlled test to an approved exact model and provider, per-agent credential, frozen task class, token and timeout ceilings, acceptance check, allowed retry/escalation behavior, maximum test/daily/monthly spend, cost receipts, and tested 70/85/100 percent circuit breakers. Fail closed on route ambiguity or breaker failure.

**Priority:** P1

**Confidence:** High

### 8. Kill-switch and rollback do not cover in-flight work or proven restoration

**Evidence:** Rollback disables the adapter, revokes gates/credentials/grants/destinations, increments the fence epoch, preserves receipts, and expects HTTP 423. It does not require engaging trigger and outbound kills before revocation, quiescing the active consumer, preserving queue/cursor/checkpoints, rejecting all stale epochs, reconciling reserved/unknown provider effects, validating receipt-sink health, or restoring and testing the prior owner. No rollback/roll-forward drill or response-time objective is defined.

**Impact:** Rollback could stop new calls while leaving accepted intake or an unknown Slack/email effect unresolved. Restoration could then duplicate delivery, lose cursor state, or reactivate the wrong owner.

**Fix:** Require the governance rollback sequence: engage schedule/intake and outbound kills, quiesce the named owner, fence the epoch, preserve queues/cursors/checkpoints, reconcile every reserved or unknown effect with the exact provider, revoke scoped access, verify the receipt sink, and run a read-only canary before restoration. Test kill during each effect state, rollback, and roll-forward with named owners and measured timing.

**Priority:** P1

**Confidence:** High

### 9. Successful controlled delivery must not be interpreted as live activation

**Evidence:** The status authorizes implementation and controlled testing, explicitly leaves the recurring schedule disabled, and requires a separate promotion to shadow. Standing governance requires serial predecessor closure, passed evidence packets, three clean days, named responders and budgets, the Maya go/no-go, and Christopher Hussey's separate final production approval. The contract does not end with an explicit statement that its acceptance cannot authorize ordinary production mailbox intake or recurring operation.

**Impact:** Two successful test messages could be misread as permission to connect the production mailbox source, enable the 30-minute job, or call Maya for ordinary live work before the later approvals and evidence exist.

**Fix:** Add a terminal authorization statement: completion closes only this controlled-test gate. Maya remains non-live; ordinary mailbox intake stays disconnected; the recurring schedule and non-test effects remain disabled. Any later shadow or production activation must identify the canonical owner/epoch, exact effects, evidence packet, expiry, responders, budgets, rollback owner, predecessor issues, and Christopher's signed approval.

**Priority:** P1

**Confidence:** High

## Clean

- Slack is fixed to one workspace, one Maya app, and Christopher's exact DM ID; shared-bot fallback is prohibited.
- Email is fixed to `admin@cc.proexteriorsus.net`; alternate recipients, CC, BCC, forwarding, and reply-to-original-sender are prohibited.
- The outbound content and two-effect cap are appropriately narrow, and recurring scheduling is explicitly disabled.
- DPoP binding, atomic replay/idempotency claims, pre-I/O receipts, terminal receipts, and the ban on automatic retry after ambiguity are sound design elements.
- Secrets are prohibited from SQL, logs, prompts, receipts, source, and Ringer artifacts; rollback preserves receipts and requires disabled endpoints to fail closed with HTTP 423.

## Assumptions

- This is a contract/readiness review, not evidence that implementation tests, provider deliveries, receipts, clean-day operation, or rollback exercises have occurred.
- “Live” means ordinary production mailbox intake, recurring scheduling, or operational use beyond the one synthetic Slack and one synthetic email test explicitly bounded by this gate.
- Christopher's authorization is valid for the stated controlled-test scope but does not waive the standing synthetic-data, evidence, model-cost, independent-review, and production-approval requirements.
- The standing governance and execution map remain authoritative where this activation contract is silent.

MACHINE_VERDICT: FAIL
