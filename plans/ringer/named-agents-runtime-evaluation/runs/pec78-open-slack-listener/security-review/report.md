# Review Report

## Summary

The candidate does not satisfy the authorized always-on open-listener behavior. Static review found three P1 findings and one P2 finding. Most security boundaries are strong: immutable Composio and Slack identity pins, exact trigger-instance preflight, code-owned routing/thread/prefix behavior, tool-free Hermes enforcement, a narrow inference environment, atomic durable deduplication, and fail-ambiguous send handling. However, the listener exits cleanly after its first accepted attempt, silently drops addressed events received while an attempt is active, and treats an insufficiently validated send result as provider confirmation. These are release-blocking because they undermine arbitrary-human/arbitrary-channel acceptance and authoritative effect accounting.

`npm test` was run in `deployment/remote/orgo/maya-slack-listener`: 70 tests passed, 0 failed.

## Findings

### F-01 — Listener exits after every completed accepted attempt

- **Evidence:** `listener.mjs:38-41` configures `onExit: scheduleCleanExit`; `listener.mjs:70-72` always calls `shutdown.completeAttempt()` after an accepted attempt. `shutdown.mjs:21-25` unconditionally calls `onExit()` from `completeAttempt()`, without checking whether shutdown was requested. `listener.mjs:85-87` then exits with status 0. `maya-slack-listener.conf:6` uses `autorestart=unexpected`, so Supervisor does not restart a clean exit.
- **Impact:** After the first accepted Maya message—whether the send is confirmed or ambiguous—the open listener stops. Subsequent humans and channels receive no service. This directly violates the authorized open-listener behavior and can turn a single ordinary message into a durable denial of service.
- **Fix:** Make `completeAttempt()` invoke `onExit()` only when a shutdown has been requested. Add an integration/lifecycle test proving that multiple sequential accepted events are processed without process exit, while SIGTERM still exits only after the active attempt reaches durable terminal state.
- **Priority:** P1
- **Confidence:** High

### F-02 — Addressed events are silently discarded while one attempt is active

- **Evidence:** `listener.mjs:50-52` immediately returns from the subscription callback whenever `shutdown.isActive()` is true. `shutdown.mjs:7-11` marks the coordinator active for the full attempt. No receipt is claimed before the return, no queue is used, and no rejection/ambiguity event is logged. Hermes may run for up to 60 seconds (`hermes-runner.mjs:69-72`) and the Slack send for up to 30 seconds (`request-options.mjs:1-15`).
- **Impact:** Any addressed message delivered during another inference/send window disappears without a reply or durable record. An arbitrary user can repeatedly occupy the single active slot, denying service to every other human/channel accessible to Maya. This violates arbitrary-human/arbitrary-channel acceptance and bypasses the otherwise sound dedupe/receipt mechanism.
- **Fix:** Serialize accepted callbacks through a bounded queue, or atomically claim each accepted event before concurrency gating and process durable claims in order. Apply explicit backpressure/fail-closed handling rather than returning silently. Add a concurrent-delivery test proving that two distinct event keys are each processed exactly once.
- **Priority:** P1
- **Confidence:** High

### F-03 — Provider confirmation accepts an unvalidated `data.ts`

- **Evidence:** `send-once.mjs:25-29` considers a send confirmed when `result.successful`, `result.data.ok`, and `result.data.ts` are merely truthy. It does not enforce the Slack timestamp grammar used elsewhere (`core.mjs:10`, `core.mjs:131`, and `core.mjs:195-198`). It then hashes the value and persists `confirmed`. By contrast, the unused alternate worker validates the timestamp with `/^\d{10}\.\d{6}$/` at `production-worker.mjs:54`.
- **Impact:** A malformed, partial, or SDK-shape-changed Composio response can be recorded as a confirmed provider effect even though no trustworthy Slack message identifier was returned. The event will remain deduped as successful and will not be available for ambiguity reconciliation, violating the required provider-confirmation boundary.
- **Fix:** Require `typeof result.data.ts === "string"` and the exact Slack timestamp regex before calling `store.confirm`; otherwise persist `ambiguous`. Prefer a shared exported validator so receive, thread, and send confirmation use the same grammar. Add negative tests for objects, booleans, malformed strings, and missing timestamps.
- **Priority:** P1
- **Confidence:** High

### F-04 — The callback does not positively establish a human Slack author

- **Evidence:** `core.mjs:54` requires only that payload key `user` exists; it does not validate its type or Slack-user-ID syntax. `core.mjs:133` rejects only a truthy `bot_id` or the exact Maya bot user ID. Consequently, a payload with `user: undefined`, an object, or a non-Slack identifier and no `bot_id` can pass through `evaluateEvent()` when its other fields are valid. Tests cover a different human ID and conventional `bot_id`, but not malformed/missing actors (`test/core.test.mjs:95-99`).
- **Impact:** Malformed provider events—and bot-like events not represented by the two negative checks—can be treated as authorized human messages. Composio trigger/account/workspace pinning limits the source, and Hermes is tool-free, so the immediate blast radius is bounded; nevertheless, the implementation does not prove the stated “any human” boundary or fully prevent self-loop-like non-human traffic.
- **Fix:** Require `typeof data.user === "string"` and an exact Slack user-ID grammar before accepting. Continue rejecting all message subtypes and `bot_id`, and add fixtures for absent, undefined, object, malformed, and Maya-self authors. If Composio exposes an authoritative bot/app marker, validate it explicitly as part of the pinned callback contract.
- **Priority:** P2
- **Confidence:** Medium

## Clean

- `policy.mjs` freezes reviewed literals for Composio user, connected account, trigger ID/UUID, Slack team, and Maya bot user.
- Startup preflights exactly one active trigger instance and verifies UUID, connected account, trigger name, and Composio user before subscribing.
- Event evaluation accepts `channel`, `group`, and `mpim` without channel/owner allowlists, while enforcing workspace pinning, start-of-message `Maya` or exact bot mention, subtype rejection, bot/self rejection, and source-thread binding.
- Send destination, thread timestamp, non-broadcast behavior, link/unfurl behavior, and `[NA-5][MAYA] -` prefix are code-owned rather than model-controlled.
- Receipt creation uses exclusive file creation, fsync, hashed identifiers only, and durable terminal states. Prepared receipts become ambiguous after restart, and existing receipts suppress repeat processing.
- Send exceptions and aborts become ambiguous and are not automatically retried. No retry loop was found in the active listener/send path.
- The Hermes prompt labels Slack text as untrusted serialized data. The subprocess receives only the OpenRouter inference credential plus a small environment allowlist; it does not receive the Composio key.
- Hermes runs one-shot on a pinned low-cost model. Root-owned configuration and startup verification require zero enabled CLI toolsets; immutable home subtrees prevent transcript, log, hook, cache, skill, and cron persistence.
- The launcher verifies ownership, modes, symlinks, release/Hermes integrity, and pinned executables before loading the owner-only credential file, then starts with an empty environment containing only the two provider credentials.
- Repository credentials or external services were not accessed, and no repository file was modified.

## Assumptions

- Review scope included every first-party source, configuration, script, lock/manifest, documentation, and test file in `deployment/remote/orgo/maya-slack-listener`. The installed `node_modules` dependency tree was treated as vendored third-party material and assessed through the pinned `package-lock.json`, call sites, install flags, and trust-chain controls rather than line-by-line source review.
- The active deployment path is `maya-slack-listener.conf` → `start-listener.sh` → `listener.mjs`. `production-worker.mjs` was inspected but is not launched by the reviewed Supervisor/launcher configuration.
- Composio's subscribed callback may invoke the async handler again while an earlier returned promise is pending; the code itself supplies no queue or delivery guarantee that would make the early return safe.
- A valid provider confirmation requires a syntactically valid Slack message timestamp, consistent with the package's own receive and alternate-worker validation.

MACHINE_VERDICT: FAIL
