# Review Report

## Summary

PASS. The checked-out Maya listener correctly separates the two Composio connections: trigger preflight, callback admission, and subscription use the pinned receive connection `ca_X9dQyRDSS0sa`; Slack execution uses the pinned send connection `ca_V3cdfxA1veTS`. Both paths use the same immutable Composio user, `maya-chen`. Policy, implementation, tests, and README describe the same receive/send roles.

The queue remains serial and non-dropping, shutdown remains fail-closed around Hermes and the send boundary, and a send becomes confirmed only after Composio returns `successful: true`, Slack `ok: true`, and a syntactically valid provider timestamp. Supervisor still launches the reviewed `listener.mjs` through the trust-checking launcher, with installation disabled by default. Runtime startup accepts only `COMPOSIO_API_KEY` and `OPENROUTER_API_KEY`.

`npm test` was run from `deployment/remote/orgo/maya-slack-listener`: 70 tests passed, 0 failed, 0 skipped, 0 todo. No external provider calls, credential reads, deployments, or other external effects were performed.

## Findings

### F-01 — Subscription connection selection lacks a direct regression assertion

- **Evidence:** `listener.mjs:53-72` correctly passes `expected.receiveConnectedAccountId` and `expected.composioUserId` to `composio.triggers.subscribe(...)`. `core.test.mjs:178-209` directly covers the receive account/user in trigger preflight, `lifecycle.test.mjs:173-186` directly covers the send connection, and `supervisor.test.mjs:137-170` locks the exact policy values and credential set. No test imports a dependency-injected listener startup or statically asserts the subscription options, so changing `listener.mjs:70` to the send connection would not fail the present suite.
- **Impact:** A future one-line regression could subscribe through the wrong Composio account while all current tests remain green, preventing or misrouting inbound events despite correct preflight and send-unit behavior.
- **Fix:** Extract listener startup/subscription assembly behind dependency injection and assert the exact `{ triggerId, connectedAccountId: APPROVED.receiveConnectedAccountId, userId: APPROVED.composioUserId }` options. A narrow source-contract assertion is acceptable if startup extraction is intentionally deferred.
- **Priority:** P2
- **Confidence:** High

## Clean

- `policy.mjs:1-9` freezes `composioUserId: "maya-chen"`, receive `ca_X9dQyRDSS0sa`, and send `ca_V3cdfxA1veTS` as reviewed literals.
- `core.mjs:120-180` admits callbacks and preflights the active trigger only when the receive account and pinned Maya user match; wrong account/user cases are tested.
- `listener.mjs:28-36,53-72` preflights before subscribing and uses the receive connection for subscription.
- `attempt.mjs:29-36` passes the same pinned Maya user and the send connection to the sole Slack-send function. `send-once.mjs:15-33` forwards both to Composio and records ambiguous—not confirmed—on errors or malformed provider confirmation.
- `lifecycle.test.mjs` covers interrupted Hermes work, the Hermes-to-send boundary, abort during send, continued lifecycle after ordinary completion, serialization of overlapping events, and the split send connection.
- Queue behavior remains deterministic: `shutdown.mjs:35-57` chains every accepted task to the prior tail and decrements pending state in `finally`; the overlapping-event test proves both events run in order without loss.
- Provider confirmation is exact: tests cover valid Slack timestamp confirmation and malformed/missing timestamp ambiguity. Failed or interrupted sends are not automatically retried.
- Supervisor/entrypoint alignment is intact: `maya-slack-listener.conf` invokes `start-listener.sh`; the launcher verifies its trust chain, constructs an empty environment, passes only the two allowed credentials, and execs `/usr/bin/node /opt/pe-cc-agents/maya-slack-listener/listener.mjs`. `package.json` starts the same listener. Tests lock these paths and installed-disabled lifecycle controls.
- `README.md:8-16,47-52` accurately documents separate OAuth receive and bot-token send roles, the pinned user/accounts, the two-credential boundary, serialization, and Supervisor-only operation.
- `git diff --check` passed. Existing unrelated worktree changes were not modified.

## Assumptions

- This was a source-and-test review of the current checkout, not a live Composio control-plane inspection. The remote ownership and enabled state of the two connected accounts were not queried because the task prohibited credentials and external effects.
- “Share the pinned Maya Composio user” is evaluated from the immutable policy and the arguments passed to preflight/subscription/send. It does not claim independent provider-side confirmation that both remote connected-account records currently belong to that user.
- Provider confirmation means the runtime’s local confirmation contract and receipt transition were verified in source and tests; no real Slack message was sent.
- The existing dirty worktree is treated as the review candidate. Only this `report.md` was created by the reviewer.

MACHINE_VERDICT: PASS
