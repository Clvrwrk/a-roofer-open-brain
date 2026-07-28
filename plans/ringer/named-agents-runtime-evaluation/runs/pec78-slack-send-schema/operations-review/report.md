# Review Report

## Summary

PASS. The current Maya Slack listener matches the supplied live-accepted Composio `SLACKBOT_SEND_MESSAGE` schema: `buildSendArguments` now emits only `channel`, `thread_ts`, `markdown_text`, `reply_broadcast`, `unfurl_links`, and `unfurl_media`, and its exact-object unit test locks that shape without the unsupported `link_names` field. The supplied live evidence says the pinned bot-token connection rejected requests containing `link_names` before provider effect and confirmed a send after that field was removed. A confirmed Slack provider timestamp is consistent with the runtime contract because confirmation additionally requires Composio `successful: true`, provider `ok: true`, and the exact `^\d{10}\.\d{6}$` timestamp grammar.

The narrowly scoped change does not alter receive/send separation, serialization, receipt lifecycle, shutdown, Supervisor, credential, or no-retry behavior. `npm test` was run in `deployment/remote/orgo/maya-slack-listener`: 70 tests passed, 0 failed.

## Findings

No actionable findings.

- **Evidence:** The only listener diff removes `link_names: false` from `core.mjs::buildSendArguments` and the corresponding expected property from `test/core.test.mjs`. The resulting exact-object test passed. `attempt.mjs` continues to derive the destination channel and thread from the accepted event decision, add the immutable `[NA-5][MAYA] -` reply prefix, and send with the pinned `sendConnectedAccountId`. `send-once.mjs` makes one bounded `composio.tools.execute` call and confirms only on `successful === true`, `data.ok === true`, and `isSlackTimestamp(data.ts)`. The receipt store makes interrupted or failed/unknown effects ambiguous, and no send retry loop or automatic receipt reclaim exists. `listener.mjs` continues to preflight and subscribe with `receiveConnectedAccountId`, enqueue accepted events through `createSerialQueue`, and remain alive after ordinary completion. Supervisor remains `autostart=false`, `autorestart=unexpected`, `startretries=0`, with TERM/group shutdown controls. The launcher still accepts exactly `COMPOSIO_API_KEY` and `OPENROUTER_API_KEY` from a mode-checked file and starts through the trust verifier. Tests directly cover exact send arguments, provider timestamp rejection, receive/send account separation, queue serialization, ordinary lifecycle continuity, shutdown ambiguity, Supervisor configuration, launcher credentials, and time-bounded sends.
- **Impact:** The candidate is operationally consistent with the accepted provider schema while preserving the previously reviewed fail-closed controls. Removing the unsupported optional field changes provider compatibility, not authorization, routing, delivery confirmation, or retry semantics.
- **Fix:** None required.
- **Priority:** None.
- **Confidence:** High.

## Clean

- `buildSendArguments` and its exact expected-object test agree on the supported six-field argument object.
- Destination and thread binding, immutable prefixing, reference removal, broadcasts disabled, and link/media unfurls disabled remain intact.
- Receive preflight/subscription remains pinned to `ca_X9dQyRDSS0sa`; send execution remains pinned to `ca_V3cdfxA1veTS`; both remain under immutable Composio user `maya-chen`.
- Accepted events remain serialized rather than dropped, and normal completion does not terminate the listener.
- Receipt claiming remains atomic and at-most-once; prepared or uncertain sends become ambiguous and are not automatically retried.
- Provider confirmation remains exact and requires a Slack-format timestamp before a receipt can become confirmed.
- Supervisor remains installed disabled with bounded unexpected-restart behavior and coordinated TERM shutdown.
- The runtime still exposes only the Composio and inference credentials; Hermes receives only its restricted environment and remains tool-free.
- `npm test`: 70 passed, 0 failed.

## Assumptions

- The live Composio observations stated in the review assignment are trusted evidence. This review made no external calls and did not independently reproduce the rejected `link_names` request or successful send.
- The confirmed live provider timestamp was returned as Slack's canonical ten-digit-seconds, dot, six-digit-fraction string. Its specific value was not included in the local evidence, so consistency is established against the supplied confirmation fact and the runtime's exact validator, not by inspecting a live response artifact.
- Review scope is the current on-disk listener and the `link_names` delta; unrelated dirty-worktree files were not modified or attributed to this change.

MACHINE_VERDICT: PASS
