# Review Report

## Summary

PASS. The reviewed change removes only the unsupported `link_names` property from the `SLACKBOT_SEND_MESSAGE` arguments and updates the corresponding unit-test expectation. It does not weaken the code-owned destination, thread, prefix, Slack-reference, credential, or provider-confirmation boundaries. No P0/P1 findings were identified.

`npm test` was run from `deployment/remote/orgo/maya-slack-listener`: 70 tests passed, 0 failed, 0 skipped. No external effects were performed during this review.

## Findings

No security findings.

## Clean

- **Destination binding:** `evaluateEvent` accepts only a validated Composio SDK envelope bound to the pinned trigger, receive connected account, Composio user, Slack team, human actor, and supported channel type. `runAcceptedAttempt` passes the accepted event's `channel` directly to `buildSendArguments`; the model cannot supply or alter it. `buildSendArguments` independently validates the channel identifier before constructing the send request.
- **Thread binding:** the reply thread is selected only from a syntactically exact Slack `thread_ts`, falling back to the syntactically exact source message `ts`. The model cannot supply the thread. The send arguments retain `thread_ts` and `reply_broadcast: false`; tests cover both source-thread fallback and preservation of an existing parent thread.
- **Prefix and reference controls:** `buildReply` retains the immutable `[NA-5][MAYA] -` prefix, and `buildSendArguments` refuses a reply without it. Model-produced Slack user, channel, special, and subteam reference syntax is replaced before send. Removing `link_names` does not bypass that sanitizer; it also avoids requesting provider-side expansion of plain names. Link and media unfurling remain disabled.
- **Tool arguments:** the delta introduces no new argument and removes one unsupported argument. The remaining `SLACKBOT_SEND_MESSAGE` object is assembled from validated code-owned routing fields plus the bounded, sanitized, prefixed reply. Hermes remains tool-free and cannot construct the provider call.
- **Credentials and identity:** the delta changes no credential loading or identity configuration. Receive and send connected accounts remain separately pinned; the send executes with the pinned Composio user, pinned send account, tool slug `SLACKBOT_SEND_MESSAGE`, and version `20260721_00`. The Hermes environment allowlist still excludes Composio and Slack credentials, with test coverage.
- **Exact provider confirmation:** `executeSlackSendOnce` confirms only when the Composio result has `successful === true`, Slack payload `data.ok === true`, and `data.ts` matching the exact `10 digits + period + 6 digits` Slack timestamp grammar. Missing or malformed timestamps are persisted as ambiguous, not confirmed. The provider message identifier is hashed in logs/receipts.
- **Regression scope:** the source diff for this change is one property removal in `core.mjs` and the same property removal from the exact-object assertion in `test/core.test.mjs`. `git diff --check` reported no whitespace errors.

## Assumptions

- The stated live Composio evidence is accepted as authoritative external evidence: attempts containing `link_names` were rejected before provider effect, and the same pinned bot-token account confirmed a send after removal. Per the no-external-effects constraint, this review did not repeat either live request.
- The review evaluates the current uncommitted Maya listener delta in `/Users/chussey/.codex/worktrees/3550/a-roofers-open-brain`. Concurrent unrelated modified/untracked files were not treated as part of this change and were not altered.
- A syntactically valid successful provider timestamp is the repository's intended exact confirmation contract; this change does not broaden that contract.

MACHINE_VERDICT: PASS
