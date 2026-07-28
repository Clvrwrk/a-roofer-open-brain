# Review Report

## Summary

The PEC-78 Maya Composio production plan is not operationally ready for implementation or activation. Its intended safety model is directionally sound, but the current tree has no public Composio webhook route and no migration 190, while the only Maya listener is explicitly the retired WebSocket validation design. More importantly, the plan does not specify executable proofs for ingress reachability, production queue/lease recovery, provider/recipient identity, production readiness, unknown outcomes, bounded spend/runtime, or quarantine of the old trigger. Those are activation-critical controls under the named-agent governance standard.

The existing validation listener test suite passes (61/61), but those tests cover the one-shot WebSocket listener and cannot establish the proposed webhook production path. Verdict: FAIL with open P1 findings.

## Findings

### 1. Public ingress has no deployable surface or reachability proof

- **Evidence:** `PEC78-MAYA-COMPOSIO-PRODUCTION.md:22-24` describes a public Command Center endpoint, and lines 43-45 name its expected route boundary, but `app/command-center/src/pages/api/integrations/composio/` is absent. The plan never gives the exact URL, method, expected unauthenticated/provider response, proxy/raw-body constraint, DNS/TLS check, or a Composio-origin delivery receipt. The current runtime route is only `app/command-center/src/pages/api/agent/runtime/v1/[...path].ts`; it exposes no Composio ingress handler.
- **Impact:** Installation can reach the webhook-subscription step without proving that Composio can reach the application or that signature verification receives the exact bytes Composio signed. Activation could silently drop all messages or reject valid deliveries.
- **Fix:** Define the exact production URL and POST contract; add raw-body-preservation and middleware-bypass requirements; add an external canary that proves DNS, TLS, routing, signature verification, replay rejection, and durable enqueue; require a recorded Composio delivery ID plus Command Center trace/event digest before trigger activation.
- **Priority:** P1
- **Confidence:** High

### 2. The production queue, owner fence, and lease lifecycle are not implementable from the plan

- **Evidence:** The plan promises encrypted durable events, atomic claims, a principal fence, and a “short lease” (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:28-38`, `75-79`) but gives no lease duration, heartbeat policy, queue ordering, maximum queue age, attempt ceiling, poison-event state, clock source, or transactional state machine. The named migration `schemas/cleverwork-roofer/190-pec78-composio-slack-production.sql` is absent. Current `store.server.ts:26-88` only wraps token/request authorization and shadow effect reservation/reconciliation; it has no inbound enqueue, production claim, lease renewal, event completion, or recovery API. The current runtime route returns `operation_not_installed` for non-reserve operations (`[...path].ts:52`).
- **Impact:** Two workers, a restart, or an expired lease cannot be shown to preserve one-owner execution. Events may strand indefinitely, be processed out of policy, or be reclaimed inconsistently.
- **Fix:** Specify and implement a database-enforced event/effect state machine with exact lease TTL and database-clock timestamps, atomic claim/renew/complete RPCs, fence generation checks on every transition, FIFO or documented ordering, bounded attempts/age, poison quarantine, and concurrency/crash tests. Readiness must prove there is exactly one eligible runtime owner and no conflicting live lease.
- **Priority:** P1
- **Confidence:** High

### 3. Exact provider and recipient proof is asserted, not operationally defined

- **Evidence:** The plan says the endpoint checks project/user/account/trigger/workspace/channel/sender and the worker calls Slack through Composio (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:25-36`), but it does not define the exact webhook fields and canonical paths for those identities, the Composio project/environment identity, or a startup API lookup that proves the connected account is Maya’s Slack app in the intended workspace. It also lacks a pre-send provider lookup proving the destination channel/thread and a post-send receipt binding provider message ID, app/bot author, channel, and thread. Current immutable IDs in `deployment/remote/orgo/maya-slack-listener/policy.mjs:1-10` belong to the old trigger, and that listener’s README states it is not the production design (`README.md:3-7`).
- **Impact:** A syntactically valid event or send result can be associated with the wrong Composio project, connected account, Slack app, channel, or thread while still satisfying an incomplete tuple check.
- **Fix:** Freeze a versioned production identity manifest containing project/environment, Composio user, connected account, new trigger ID/UUID, Slack team, Maya app/bot, owner, channel, and tool version. At startup and immediately before activation, resolve each through provider APIs and compare exact values. Persist a secret-free receipt that binds inbound delivery/event, reserved effect, connected account, destination channel/thread, returned Slack timestamp, and verified sending app/bot.
- **Priority:** P1
- **Confidence:** High

### 4. Readiness can be green without production ingress or worker readiness

- **Evidence:** `readiness.server.ts:7-18` declares readiness only when adapter mode is `shadow` and checks shadow-era store flags. It does not observe webhook secret/key validity, ingress availability, encryption round-trip, webhook subscription identity, new-trigger disabled state, old-trigger quarantine, production queue/RPC version, worker release hash, Supervisor state, or sole-owner fence. The route serves this report at `[...path].ts:21-24`. The production plan nevertheless uses “private readiness” and deployed commit matching as activation gates (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:103-109`, `123-126`).
- **Impact:** Operators can receive `status: ready` for the shadow adapter while every production-path dependency is absent or wrong. Governance explicitly requires stopping when health can be falsely green (`docs/74-named-agent-runtime-ringer-governance.md:102-105`).
- **Fix:** Create a separately versioned production-readiness report whose status is derived from fresh, observed checks for every dependency above. Include per-check timestamps and max age, expected/observed digests, queue/effect counts, owner/fence generation, worker state, and trigger states. Fail closed on unavailable or stale observations; do not reuse shadow readiness as the activation signal.
- **Priority:** P1
- **Confidence:** High

### 5. Unknown send outcomes have no complete reconciliation runbook

- **Evidence:** The plan correctly forbids automatic retry (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:37-38`, `94-95`) but only says to “reconcile” reserved or unknown effects during rollback (`111-114`). It defines no lookup key, provider query, decision authority, terminal transitions, timeout, evidence, or rule for unblocking the event. Current `store.server.ts:75-84` exposes a shadow reconcile call accepting a caller-supplied outcome; it does not itself prove the provider result. The old listener marks interrupted sends ambiguous (`send-once.mjs:25-33`) and intentionally never recovers them.
- **Impact:** An API timeout after Slack accepted a send can either block the queue forever or tempt an operator to retry and duplicate the reply. A caller can also label an outcome without provider-backed proof.
- **Fix:** Define an operator-only reconciliation workflow: query Slack/Composio using the bound channel/thread, attempt window, app author, payload digest or provider id; persist the query receipt; transition unknown to confirmed-sent, confirmed-not-sent, or permanently quarantined under an explicit human decision. Never permit resend from `unknown`; require a new authorized effect if confirmed not sent.
- **Priority:** P1
- **Confidence:** High

### 6. Production cost, time, and backlog bounds are missing

- **Evidence:** Governance requires an exact model/provider, token ceiling, timeout, cost receipt, and 70/85/100 percent breakers (`docs/74-named-agent-runtime-ringer-governance.md:82-89`). The production plan mentions a pinned Hermes runner and budget fail-closed checks but specifies none of those values. The old listener happens to pin `google/gemini-3.1-flash-lite` (`policy.mjs:17`), a 60-second inference timeout and 4,000-byte output limit (`hermes-runner.mjs:67-76`), and a 30-second send timeout (`request-options.mjs:1-15`), but the production plan neither adopts those bounds nor adds input-token, per-event cost, daily spend, queue age, or end-to-end deadline controls.
- **Impact:** A message can consume unbounded input/context spend, queue indefinitely, or exceed the owner’s expected response window; a budget check can be nominally present without enforceable thresholds.
- **Fix:** Freeze the production provider/model revision and exact input/output token ceilings, inference/send/end-to-end timeouts, per-event and daily dollar caps, maximum queue age/depth, and 70/85/100 percent actions. Persist cost and duration receipts and test each breaker, including fail-closed provider unavailability.
- **Priority:** P1
- **Confidence:** High

### 7. Old-trigger quarantine and trigger-first rollback are not tied to the new production identity

- **Evidence:** The plan says the old malformed trigger is never enabled/reused and requires both old-disabled/new-disabled proof (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:108-109`, `124-126`), but it provides no old-trigger ID, quarantine transaction, continuous check, or prevention against re-enable. The checked-in rollback implementation disables `APPROVED.triggerId` (`operator-rollback.mjs:132-140`), which is the old listener’s hard-coded trigger (`policy.mjs:4-5`), and there is no new production trigger identity in source. The rollback ordering test passes, but only for that validation trigger.
- **Impact:** Operators cannot prove which trigger was quarantined or ensure rollback disables the production trigger first. The old WebSocket trigger could coexist with the webhook trigger and create duplicate consumption/sends.
- **Fix:** Record old and new trigger IDs/UUIDs separately in the production identity manifest. Disable and verify the old trigger before installation; remove all old listener subscriptions/schedules from executable paths; continuously assert old-disabled/new-expected state. Parameterize a production rollback artifact by the reviewed new trigger identity and test that downstream containment never begins until provider-confirmed disablement.
- **Priority:** P1
- **Confidence:** High

### 8. The next fresh-message authorization is not a durable, single-use capability

- **Evidence:** The activation gate says Christopher authorizes one fresh, non-sensitive owner message after readiness (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:127-129`), but it does not define where approval is recorded, its channel/trigger/runtime/fence binding, issuance and expiry, single-use consumption, or invalidation on readiness/build/identity drift. Governance requires durable human go/no-go and an exact next gated action (`docs/74-named-agent-runtime-ringer-governance.md:41-56`, `58-65`).
- **Impact:** A stale or vague approval can be reused after deployment drift, applied to the wrong trigger/channel, or interpreted as broader conversational authorization.
- **Fix:** Represent authorization as a durable, one-use activation record issued only after all readiness checks pass. Bind it to Christopher, production build/registry version, runtime instance and fence, new trigger, workspace/channel, capability, issuance/expiry, and exactly one event; atomically consume it at ingress or claim. Any drift, timeout, rollback, or failed/unknown attempt invalidates it and requires a fresh approval.
- **Priority:** P1
- **Confidence:** High

## Clean

- The plan separates implementation from activation and explicitly forbids implementation-time sends (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:16-18`).
- Its intended full-tuple filtering, encrypted payload storage, database uniqueness, owner fencing, trigger-last activation, and no-auto-retry posture are appropriate foundations.
- The existing validation listener has strong local controls: immutable identities, bounded inference/send timeouts, durable prepared/ambiguous receipts, one-shot Supervisor settings, and trigger-first rollback.
- The listener’s 61 tests passed during this review, including duplicate claim, crash ambiguity, shutdown handoff, Supervisor stopped-state, trust-chain, legacy quarantine, and rollback-order tests.
- No reviewed file was modified. Only this report was created.

## Assumptions

- This is a source-backed design/readiness review, not a live Composio, Slack, Supabase, Orgo, DNS, or Command Center probe; no live credentials or production effects were authorized.
- Missing untracked production surfaces are treated as absent because the requested review targets the current worktree state.
- The existing `maya-slack-listener` subtree is considered legacy validation evidence because its own README explicitly excludes it from the production design.
- Prior shadow readiness and shadow store behavior do not prove the proposed production webhook path.

MACHINE_VERDICT: FAIL
