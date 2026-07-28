# Review Report

## Summary

PASS. The reviewed change is narrowly confined to the validation of the optional `files` and `attachments` containers. It changes their accepted domain from `undefined | array` to `undefined | null | array`, matching the supplied production evidence that three ordinary human callbacks on 2026-07-28 carried `files: null` and `attachments: null` and were rejected as `malformed_attachment_container`. It does not weaken envelope, identity, scope, actor, subtype, bot/self, timestamp, or addressing checks.

`npm test` was run locally in `deployment/remote/orgo/maya-slack-listener` with no network or external effects. Exact result: **71 tests passed, 0 failed, 0 skipped, 0 cancelled, 0 todo**.

## Findings

No security findings.

## Clean

### Nullable attachment-container correction

- **Evidence:** [`core.mjs`](../../../../../deployment/remote/orgo/maya-slack-listener/core.mjs#L119) defines `isOptionalArray` as accepting only `undefined`, `null`, or an actual array. [`core.mjs`](../../../../../deployment/remote/orgo/maya-slack-listener/core.mjs#L144) applies it only to `data.files` and `data.attachments`; either failure returns `malformed_attachment_container`. [`test/core.test.mjs`](../../../../../deployment/remote/orgo/maya-slack-listener/test/core.test.mjs#L123) accepts `files: null` and `attachments: null`, while lines 128-129 retain rejection of a string-valued `files` and object-valued `attachments`. The predicate is symmetric, so strings and objects are rejected for either field.
- **Impact:** Ordinary provider callbacks with nullable optional attachment fields are admitted without expanding either field to strings, plain objects, numbers, booleans, or other malformed values.
- **Fix:** None required.
- **Priority:** Informational.
- **Confidence:** High.

### Bot, Maya-self, actor, and subtype protection

- **Evidence:** [`core.mjs`](../../../../../deployment/remote/orgo/maya-slack-listener/core.mjs#L141) rejects any truthy message subtype before attachment validation, line 142 requires a well-formed human Slack user ID, and line 143 rejects a present `bot_id` or Maya's own bot user ID. [`test/core.test.mjs`](../../../../../deployment/remote/orgo/maya-slack-listener/test/core.test.mjs#L101) covers bot rejection; lines 107-112 cover malformed actors and Maya self-replies; line 122 covers a `message_changed` subtype. Because these guards precede lines 144-145, `files: null` and `attachments: null` cannot bypass them.
- **Impact:** The correction does not allow bot messages, Maya self-replies, malformed actors, or message subtypes.
- **Fix:** None required.
- **Priority:** Informational.
- **Confidence:** High.

### Trigger, account, user, team, and channel scope protection

- **Evidence:** [`core.mjs`](../../../../../deployment/remote/orgo/maya-slack-listener/core.mjs#L128) first requires a valid duplicated Composio SDK envelope, then pins trigger slug, trigger ID/UUID, receive connected account, Composio user, and Slack team through line 138. Line 139 requires a syntactically safe channel ID and permits only the designed `channel`, `group`, and `mpim` types. [`test/core.test.mjs`](../../../../../deployment/remote/orgo/maya-slack-listener/test/core.test.mjs#L180) covers wrong trigger, account, Composio user, and team; lines 126-127 cover malformed channel IDs and disallowed channel types. Lines 120-121 confirm that the intended policy is all valid accessible channels, not a single pinned channel.
- **Impact:** Wrong trigger/account/user/team callbacks and channels outside the declared accessible-channel shape remain rejected before nullable attachment validation.
- **Fix:** None required.
- **Priority:** Informational.
- **Confidence:** High.

### Addressing protection

- **Evidence:** [`core.mjs`](../../../../../deployment/remote/orgo/maya-slack-listener/core.mjs#L106) accepts only a leading exact Maya bot mention or leading plain `Maya` address with a delimiter; line 147 rejects all other messages as `not_addressed`. [`test/core.test.mjs`](../../../../../deployment/remote/orgo/maya-slack-listener/test/core.test.mjs#L101) rejects incidental Maya text, and lines 114-117 reject lookalikes, quoted text, code blocks, and zero-width/Unicode tricks.
- **Impact:** Accepting nullable provider attachment fields cannot make an unaddressed message eligible for a reply.
- **Fix:** None required.
- **Priority:** Informational.
- **Confidence:** High.

### Regression test result

- **Evidence:** `npm test` executed `node --test test/*.test.mjs`; TAP ended with `1..71`, `tests 71`, `pass 71`, `fail 0`, `skipped 0`, `cancelled 0`, and `todo 0`. The nullable ordinary-message regression is explicit in [`test/core.test.mjs`](../../../../../deployment/remote/orgo/maya-slack-listener/test/core.test.mjs#L132).
- **Impact:** The narrow correction and the broader listener safety suite pass together.
- **Fix:** None required.
- **Priority:** Informational.
- **Confidence:** High.

## Assumptions

- The supplied production observation—that Composio emitted `files: null` and `attachments: null` on three ordinary human callbacks on 2026-07-28—is treated as authoritative; no production systems or network resources were queried.
- `files` and `attachments` are the provider fields in scope for nullable-array handling. No generalized null coercion was introduced.
- “Wrong channel” means a malformed channel identifier or a channel type outside the listener's documented all-accessible-channel policy; the listener intentionally does not pin one channel ID.
- Review scope was the working-tree versions of `core.mjs` and `test/core.test.mjs`. Existing unrelated worktree modifications were not changed, staged, or assessed.

MACHINE_VERDICT: PASS
