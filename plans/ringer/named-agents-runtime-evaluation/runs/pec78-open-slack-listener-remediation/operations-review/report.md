# Review Report

## Summary

PASS. The current on-disk remediation resolves all six findings from the prior operations review. The Supervisor-launched process remains alive after ordinary replies, overlapping accepted events are serialized, the launcher accepts exactly the Composio and OpenRouter credentials without DPoP material, send confirmation requires an exact Slack provider timestamp, startup rejects disabled or status-unknown trigger instances, and the legacy one-use/production-worker surfaces are removed. The installer remains disabled-by-default, rollback is trigger-first, receipts fail closed around ambiguous effects, and SIGTERM waits for active-attempt ambiguity persistence before clean exit.

`npm test` was run in `deployment/remote/orgo/maya-slack-listener`: 69 tests passed, 0 failed.

## Prior Findings

### 1. Listener exited after each accepted attempt — Resolved

- **Evidence:** `shutdown.mjs:21-25` now calls `onExit()` from `completeAttempt()` only when shutdown was requested. `listener.mjs:75-93` completes an attempt without otherwise ending the subscription process. `test/lifecycle.test.mjs:142-151` proves two consecutive ordinary attempt lifecycles cause no exit.
- **Impact:** Ordinary successful replies no longer terminate the durable listener, so Supervisor's `autorestart=unexpected` policy does not strand the service after one event.
- **Fix:** None required.
- **Priority:** Resolved (formerly P1)
- **Confidence:** High

### 2. Concurrent addressed events were dropped — Resolved

- **Evidence:** `listener.mjs:42-45,53-67` evaluates each callback and enqueues every accepted event. `shutdown.mjs:35-57` implements a serial promise queue; it does not reject a second item merely because the first is active. `test/lifecycle.test.mjs:153-171` blocks the first task, enqueues a second, then proves both execute in order and pending count returns to zero.
- **Impact:** Overlapping accepted events are serialized rather than silently discarded during another inference/send attempt.
- **Fix:** None required.
- **Priority:** Resolved (formerly P1)
- **Confidence:** High

### 3. Launcher required legacy DPoP/JWK credentials — Resolved

- **Evidence:** `start-listener.sh:53-71` parses only `COMPOSIO_API_KEY` and `OPENROUTER_API_KEY`, rejects blank, duplicate, CR-bearing, and every other assignment, and does not source or execute the credentials file. `start-listener.sh:72-79` uses `env -i` and launches `listener.mjs` with only those provider credentials plus fixed non-secret runtime settings. The JWK/env-loader and Command Center client files are deleted. `test/supervisor.test.mjs:104-131,158-170` locks the two-key launcher and runtime boundary.
- **Impact:** A correctly provisioned two-credential environment can launch the reviewed Composio-only listener without obsolete DPoP material or an arbitrary-shell parsing path.
- **Fix:** None required.
- **Priority:** Resolved (formerly P1)
- **Confidence:** High

### 4. Arbitrary provider timestamps could be confirmed — Resolved

- **Evidence:** `core.mjs:10,25-27` defines the exact `^\d{10}\.\d{6}$` Slack timestamp validator. `send-once.mjs:25-33` confirms only when the Composio result is successful, Slack reports `ok`, and `data.ts` passes that validator; all other outcomes become ambiguous. `test/send-once.test.mjs:33-57` covers valid, missing, malformed, and non-string timestamps.
- **Impact:** Invalid provider evidence cannot become a confirmed receipt or permanently suppress an event as a proven successful delivery.
- **Fix:** None required.
- **Priority:** Resolved (formerly P1)
- **Confidence:** High

### 5. Startup did not reject a disabled trigger — Resolved

- **Evidence:** `listener.mjs:28-36` obtains the raw trigger-instance listing with disabled records included and runs preflight before subscription. `core.mjs:160-175` requires exactly one pinned instance and requires its raw `disabled_at` field to be exactly `null`; disabled and missing-status cases fail closed. The pinned `@composio/core` 0.14.0 raw client contract uses `disabled_at`, while its higher-level transformer maps that field to `disabledAt`. `test/core.test.mjs:180-213` covers enabled, disabled, missing-status, duplicate, and identity-mismatch cases.
- **Impact:** The process cannot announce a started listener when the reviewed Composio trigger is disabled or its usable state is unknown.
- **Fix:** None required.
- **Priority:** Resolved (formerly P2)
- **Confidence:** High

### 6. One-use gate and broken production entrypoint remained — Resolved

- **Evidence:** `claimOnceGate`, `VALIDATION_GATE`, `production-worker.mjs`, `cc-client.mjs`, and their legacy tests are absent from the candidate. `attempt.mjs:14-24` proceeds directly through the per-event receipt claim. `package.json:6-8` maps `npm start` to `listener.mjs`, matching `start-listener.sh:79`; `test/supervisor.test.mjs:133-136` verifies that entrypoint alignment. The recoverable preinstall quarantine handles legacy installed artifacts rather than retaining them as runnable package surfaces.
- **Impact:** The deployable package exposes one durable open listener architecture instead of a one-use gate or a broken restricted worker.
- **Fix:** None required.
- **Priority:** Resolved (formerly P2)
- **Confidence:** High

## Findings

No unresolved operational findings were identified. There are no P0 or P1 findings.

## Clean

- The active event policy is Composio-only and accepts addressed messages from any well-formed human author in app-accessible Slack `channel`, `group`, and `mpim` conversations; it rejects bots, Maya herself, message subtypes, malformed envelopes, wrong workspace/account/trigger identity, and unsupported direct-message scope.
- Routing is bound to the accepted event's channel and original thread. Replies disable broadcasts, link-name expansion, and unfurling, and model-produced Slack references are removed.
- Receipt claims use exclusive file creation, hashed identifiers, file/directory sync, and atomic replacement. Prepared receipts recover as ambiguous; confirmed and ambiguous outcomes remain duplicate-suppressing, preventing automatic retries after uncertain provider I/O.
- Hermes inference is tool-free, output- and time-bounded, isolated to a fixed environment, and terminated on shutdown. Composio sends combine the fixed send timeout with the attempt abort signal.
- SIGTERM stops acceptance of new callbacks, aborts the active attempt, persists ambiguity, and exits only after attempt completion. Normal attempt completion does not exit.
- The Supervisor configuration launches the hardened script as the dedicated runtime user, is installed with `autostart=false`, and uses bounded unexpected-exit restart behavior.
- The installer validates staging and managed paths, rejects symlinks and unsafe ownership/modes, builds an incoming release, preserves restoration artifacts, proves exact Supervisor stopped state, and rolls back incomplete installation transactions with restoration verification.
- Operator rollback disables and confirms the Composio trigger before downstream containment, continues independent containment steps after later failures, proves the exact Supervisor program stopped, and quarantines the two-credential file while preserving receipts for reconciliation.
- Documentation and the package entrypoint describe the same durable, all-accessible-channel, all-human Composio conversation loop used by Supervisor.

## Assumptions

- Review covers the exact dirty on-disk candidate, including deletions and untracked remediation tests, rather than only committed Git state.
- “All accessible channels” means Slack channel types `channel`, `group`, and `mpim`, consistent with the prior review's accepted scope; one-to-one `im` events remain intentionally excluded.
- The in-process serial queue satisfies the explicit concurrent-event requirement. It is not a durable broker: queued-but-unclaimed callbacks can be lost on process death or operator shutdown, with recovery dependent on Composio delivery behavior. Durable queueing across process failure was not stated as an acceptance requirement.
- Vendored dependency implementation was inspected only where needed to validate the pinned Composio trigger status field. No credentials, live services, network APIs, Supervisor instance, Slack workspace, Composio account, Orgo host, or Command Center endpoint was accessed.
- Test execution created temporary fixtures only under the operating-system temporary directory and did not modify repository source.

MACHINE_VERDICT: PASS
