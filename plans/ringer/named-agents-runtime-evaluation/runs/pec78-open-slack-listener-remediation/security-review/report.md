# Review Report

## Summary

The remediation candidate resolves all four findings from the prior FAIL and preserves the authorized Maya open-listener boundaries. Ordinary completion leaves the listener alive, overlapping accepted events are serialized, provider confirmation requires the package's exact Slack timestamp grammar, and accepted authors must have valid Slack user-ID syntax while bot, subtype, and self events remain rejected. The active runtime continues to use Composio as its sole Slack trigger/send layer, binds replies to the source thread with `[NA-5][MAYA]`, and invokes low-cost Hermes with no tools.

Every first-party file under `deployment/remote/orgo/maya-slack-listener` was inspected, including runtime source, tests, manifests/lockfile, Supervisor and launcher configuration, installer/restoration/quarantine code, rollback code, Hermes policy/shim, and trust-chain verification. No P0, P1, or other unresolved security finding was identified. `npm test` was run in that directory: 69 tests passed, 0 failed.

## Prior Findings

### F-01 — Listener exits after every completed accepted attempt: Resolved

- **Evidence:** `shutdown.mjs:21-25` now calls `onExit()` from `completeAttempt()` only when `requested` is true. `listener.mjs:75-93` begins and completes each queued attempt without requesting shutdown. `test/lifecycle.test.mjs:140-149` proves two ordinary sequential attempts complete with no exit, while the SIGTERM cases at lines 62-138 prove exit remains deferred until the active attempt reaches a durable terminal state.
- **Resolution:** Ordinary completion keeps the process running; only a requested shutdown schedules clean exit.

### F-02 — Addressed events are silently discarded while one attempt is active: Resolved

- **Evidence:** `listener.mjs:42-45` creates one serial queue and `listener.mjs:53-67` enqueues every accepted callback rather than returning when an attempt is active. `shutdown.mjs:35-57` chains each handler after the prior task and maintains pending state. `test/lifecycle.test.mjs:151-171` submits two overlapping events and proves the second starts after the first finishes, with neither dropped.
- **Resolution:** Overlapping accepted events are serialized through the listener-owned queue.

### F-03 — Provider confirmation accepts an unvalidated `data.ts`: Resolved

- **Evidence:** `core.mjs:10,25-27` defines and exports the exact `^\d{10}\.\d{6}$` Slack timestamp validator. `send-once.mjs:25-29` requires that validator before persisting `confirmed`; all other response shapes become `ambiguous`. `test/send-once.test.mjs:33-48` covers a valid timestamp and rejects missing, boolean, object, and malformed string values. `test/core.test.mjs` also exercises the shared validator.
- **Resolution:** Provider confirmation now requires an exact syntactically valid Slack timestamp.

### F-04 — Callback does not positively establish a human Slack author: Resolved

- **Evidence:** `core.mjs:12,138-139` requires a string matching Slack user-ID grammar (`U` or `W`, followed by at least eight uppercase alphanumeric characters), then independently rejects message subtypes, `bot_id`, and Maya's own user ID. `test/core.test.mjs` covers missing, undefined, object, malformed, bot-marked, subtype, and self actors as well as a distinct valid human actor.
- **Resolution:** Malformed actors and the available bot/self event markers fail closed; valid non-self Slack user events remain eligible.

## Findings

None.

## Clean

- Event acceptance is pinned to the exact Composio user, connected account, trigger identity, active trigger state, and Slack workspace while permitting `channel`, `group`, and `mpim` destinations accessible to the app.
- Addressing is restricted to message-start plain `Maya` or the exact pinned Maya mention. Incidental text, lookalikes, subtypes, bots, self events, malformed actors, malformed destinations, and malformed timestamps fail closed.
- The event-derived channel and source thread timestamp are code-bound into a non-broadcast Composio send; model output cannot choose routing. Replies require the immutable `[NA-5][MAYA] -` prefix.
- Composio is the only Slack authentication and tooling layer in the active listener. Removed Command Center worker/auth helpers are no longer referenced by the launcher or package start path.
- Durable exclusive receipt claims suppress duplicates. Prepared receipts recover to `ambiguous`; send exceptions, timeouts, aborts, and malformed provider confirmations remain ambiguous and are not automatically retried.
- Hermes receives only the inference credential in a narrow environment, runs one-shot on `google/gemini-3.1-flash-lite`, and is constrained by root-owned zero-tool configuration plus startup verification of the pinned Hermes environment.
- Launcher, Supervisor, installer, restoration, quarantine, rollback, tree-integrity, and trust-chain controls remain fail-closed with bounded process behavior and no embedded credentials.
- No credentials or external systems were accessed. No source or deployment file was modified.

## Assumptions

- Review scope is the current filesystem state at `/Users/chussey/.codex/worktrees/3550/a-roofers-open-brain`, including uncommitted candidate changes and the newly added first-party test file. Installed `node_modules` dependencies were treated as third-party code and assessed through the pinned manifest/lockfile, first-party call sites, installation flags, and trust-chain controls rather than line-by-line source review.
- The active deployment path is `maya-slack-listener.conf` → `start-listener.sh` → `listener.mjs`, consistent with the Supervisor definition and `package.json` start command.
- Slack's callback contract represents bot-originated message events through the rejected subtype and/or `bot_id` markers; the listener additionally rejects Maya's pinned user ID and requires Slack user-ID syntax.
- Queue serialization is process-local. Durable deduplication protects already claimed events, while delivery of events not yet received by the process remains a Composio transport responsibility.

MACHINE_VERDICT: PASS
