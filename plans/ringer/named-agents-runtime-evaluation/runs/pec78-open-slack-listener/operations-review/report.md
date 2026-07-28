# Review Report

## Summary

Activation is not safe. The on-disk candidate correctly broadens event policy to all human authors in app-accessible `channel`, `group`, and `mpim` conversations, rejects bot/self/subtype events, binds replies to the source thread, persists hashed duplicate-suppression receipts, and bounds inference and Composio sends. However, the production loop exits cleanly after its first accepted event, drops every addressed event that arrives while an attempt is active, and cannot start from the documented two-credential environment because the launcher still requires a legacy PEC-78 private JWK. A send can also be permanently marked confirmed without validating the provider timestamp format. These are activation-blocking P1 defects.

`npm test` was run in `deployment/remote/orgo/maya-slack-listener`: 70 tests passed, 0 failed. The green suite does not cover a normal successful attempt followed by a second event, overlapping addressed events, the real launcher with exactly two credentials, or malformed provider timestamps.

## Findings

### 1. The listener cleanly exits after every completed accepted attempt

- **Evidence:** `listener.mjs:58-72` calls `shutdown.completeAttempt()` in the callback's `finally` block. `shutdown.mjs:21-25` invokes `onExit()` unconditionally from `completeAttempt()`, regardless of whether shutdown was requested. `listener.mjs:85-87` then exits with status 0. Supervisor uses `autorestart=unexpected` (`maya-slack-listener.conf:6`), so it does not restart that expected clean exit. The lifecycle tests (`test/lifecycle.test.mjs:62-138`) cover only SIGTERM paths and never assert that ordinary completion remains running.
- **Impact:** The supposed durable listener processes at most one accepted Maya conversation after each manual start. Restart behavior does not restore service because the exit is successful. Subsequent users receive no response.
- **Fix:** Make `completeAttempt()` call `onExit()` only when `requested` is true. Add an integration/lifecycle test that completes one successful attempt, asserts no exit, and then successfully processes a second distinct event under the same listener process. Verify Supervisor state remains `RUNNING` after both.
- **Priority:** P1
- **Confidence:** High

### 2. Addressed events are silently dropped while one inference/send is active

- **Evidence:** `listener.mjs:51` returns whenever `shutdown.isActive()` is true. `shutdown.mjs:7-11` also refuses a second `beginAttempt()` while active. There is no queue, durable pending-event claim, or later replay of those callback payloads. Hermes may run for 60 seconds (`hermes-runner.mjs:69-72`) and send may run for 30 seconds (`request-options.mjs:1-15`), creating a substantial drop window. No test submits overlapping accepted events.
- **Impact:** Any human who addresses Maya during another attempt can lose the event without a receipt or response, violating the requirement that every eligible human can receive an in-thread response and preventing reliable burst handling.
- **Fix:** Serialize accepted callbacks through a bounded in-process queue whose events are durably claimed before waiting, or safely process bounded concurrency with an independent abort controller per attempt. Define overload behavior explicitly and never silently discard an accepted event. Add overlap, queue-bound, shutdown-drain, and duplicate tests.
- **Priority:** P1
- **Confidence:** High

### 3. The Supervisor launcher cannot use the documented two-credential environment

- **Evidence:** `start-listener.sh:52-58` requires and invokes `load-private-jwk.mjs` via `load-listener-env.sh` before launching. `load-listener-env.sh:7-10` fails if that loader fails, and `load-private-jwk.mjs:7-14` requires exactly one valid `PEC78_MAYA_PRIVATE_JWK=` assignment. Yet the README says the environment is a “two-credential environment file” (`README.md:50-52`), the listener requires only `COMPOSIO_API_KEY` and `OPENROUTER_API_KEY` (`listener.mjs:14-17`), and the final `env -i` passes only those two provider credentials (`start-listener.sh:62-69`). The launcher test (`test/supervisor.test.mjs:104-126`) asserts the obsolete loader is present instead of executing the launcher with exactly two credentials.
- **Impact:** A correctly provisioned Composio-plus-inference secret file fails before `listener.mjs` starts. Retaining an unrelated private DPoP credential also violates the requested minimal credential boundary and increases operational secret burden.
- **Fix:** Remove `load-private-jwk.mjs` and `load-listener-env.sh` from the listener launch path. Parse a strictly validated two-key environment file without executing arbitrary shell content, then `exec env -i` with only Composio and inference credentials. Add a real launcher test proving exactly those two assignments start the pinned listener and any extra assignment fails closed.
- **Priority:** P1
- **Confidence:** High

### 4. Send confirmation accepts an arbitrary truthy provider timestamp

- **Evidence:** `send-once.mjs:25-29` treats any truthy `result.data.ts` as confirmed and persists its hash. The stricter timestamp regex exists elsewhere (`core.mjs:10`) and the obsolete `production-worker.mjs:54` uses an explicit Slack timestamp check, but the actual Supervisor-launched `listener.mjs` path does not. Tests use only a valid-looking timestamp and have no malformed-timestamp rejection case.
- **Impact:** A malformed or non-provider value can be recorded as confirmed, permanently suppressing the source event as a duplicate even though delivery was not authoritatively confirmed.
- **Fix:** Require `result.data.ts` to match the Slack provider timestamp contract (`^\d{10}\.\d{6}$`) before confirmation; otherwise persist `ambiguous`. Prefer exporting a shared validator and add missing/null/malformed timestamp tests.
- **Priority:** P1
- **Confidence:** High

### 5. Trigger preflight proves identity but not enabled/usable state

- **Evidence:** `listener.mjs:28-35` requests `show_disabled: true`; `verifyTriggerInstancePreflight()` (`core.mjs:154-174`) checks ID, UUID, connected account, trigger name, and user but no enabled/disabled status. Its test fixture (`test/core.test.mjs:170-198`) contains no status field and therefore cannot detect this omission.
- **Impact:** Startup preflight may accept the reviewed trigger object even when it is disabled, after which subscription cannot provide the required live conversation loop. The process can appear started without proving an operational event source.
- **Fix:** Validate the exact SDK field(s) proving the trigger is enabled and active, using a fixture captured from the pinned Composio SDK contract. Add disabled, missing-status, duplicate, and active cases; fail startup before logging `listener_started` unless usable state is proven.
- **Priority:** P2
- **Confidence:** Medium

### 6. Legacy one-use and restricted-worker surfaces remain in the deployable package

- **Evidence:** `ReceiptStore.claimOnceGate()` remains at `core.mjs:273-291`, and `test/core.test.mjs:301-310` explicitly preserves the `pec78-one-controlled-slack-event` one-use gate. `package.json:7` maps the standard `npm start` entrypoint to `production-worker.mjs`, not `listener.mjs`. That worker requires three PEC-78 credentials (`production-worker.mjs:9-16`), uses Command Center receive capabilities, and references nonexistent `APPROVED.channelId` and `APPROVED.ownerUserId` (`production-worker.mjs:21,31`) from the now-open policy.
- **Impact:** Although Supervisor currently pins `start-listener.sh`, the release still advertises a broken, legacy restricted runtime and retains the exact one-use validation mechanism the candidate is meant to remove. Operators or automation using `npm start` get the wrong architecture and credential model.
- **Fix:** Delete the unused one-use gate and its test. Remove/quarantine obsolete PEC-78 worker/client/JWK files from this release, or make `npm start` invoke `listener.mjs`. Add a package-entrypoint test confirming the same open Composio subscription path used by Supervisor.
- **Priority:** P2
- **Confidence:** High

## Clean

- Event policy has no owner or channel allowlist in the actual `listener.mjs` path. It accepts human authors across `channel`, `group`, and `mpim`, while rejecting Slack DMs as outside the stated public/private/multi-person scope.
- Plain `Maya` addressing and exact `<@MayaBotId>` prefix addressing are anchored and tested; incidental text, lookalikes, quoted/code-block starts, bot IDs, the Maya bot user, and message subtypes are rejected.
- Slack receive and send use Composio in the actual listener path; no direct Slack token or Slack SDK is present there.
- Destination and thread binding are derived from the accepted event, with `reply_broadcast: false`; model-generated Slack references are removed.
- Receipt creation uses exclusive create, file and directory sync, atomic rename, hashed identifiers only, and restart conversion of `prepared` to `ambiguous`. Confirmed/ambiguous receipts suppress duplicate automatic sends.
- Hermes inference is tool-free by policy/trust verification, has a 60-second timeout and 4,000-byte output bound, and replies are capped at 1,500 characters/120 words.
- Composio sends combine a 30-second timeout with shutdown cancellation. Ambiguous sends are not automatically retried.
- The installer is designed to install disabled, verifies exact stopped Supervisor state, checks ownership/modes/symlinks, pins trust hashes, and has restoration verification. The Supervisor definition targets the existing Orgo Supervisor and pins `start-listener.sh`.
- SIGTERM uses process-group containment and waits for the active attempt's ambiguity persistence before clean exit in the tested shutdown scenarios.

## Assumptions

- “Every file” is interpreted as every first-party source, script, configuration, manifest/lockfile, and test in the candidate. Vendored dependency implementation files under `node_modules` were treated as third-party artifacts; package metadata pins `@composio/core` 0.14.0.
- Review is of the exact dirty on-disk worktree supplied, not only committed Git state. No live Composio, Slack, Orgo, Command Center, Supervisor, credential, or network operation was performed.
- Composio SDK response field names for enabled trigger state should be confirmed against the pinned 0.14.0 implementation or a sanitized real response before implementing Finding 5.
- Test execution was local and read-only with respect to the repository; tests created only temporary fixtures in the operating-system temporary directory.

MACHINE_VERDICT: FAIL
