# Review Report

## Summary

PASS. The Maya listener implements a fail-closed, immutable separation between its Composio receive and send connections. The OAuth connection `ca_X9dQyRDSS0sa` is pinned only to trigger-instance preflight, callback authorization, and trigger subscription. The bearer bot-token connection `ca_V3cdfxA1veTS` is pinned only to `SLACKBOT_SEND_MESSAGE` execution. Both operations use the same immutable Maya Composio user, `maya-chen`.

No event-controlled field can select or replace either account or the Composio user. No Slack, Composio, or OpenRouter credential is embedded in the reviewed listener. `npm test` passed all 70 tests.

## Findings

No security findings.

## Clean

- `policy.mjs` defines the receive account, send account, trigger identifiers, Slack workspace, Maya bot, and Composio user as reviewed literals in a frozen object. The two account IDs are distinct.
- `core.mjs::verifyTriggerInstancePreflight` requires the exact trigger ID/UUID, trigger slug, enabled state, pinned Maya user, and `receiveConnectedAccountId`; it fails closed on missing, duplicate, malformed, accessor-backed, inherited, or mismatched identity data.
- `core.mjs::evaluateEvent` derives callback identity from the SDK envelope but only accepts an exact match to `receiveConnectedAccountId` and `composioUserId`. Event payload content is never used as an account or user argument.
- `listener.mjs` subscribes with only the pinned `triggerId`, `receiveConnectedAccountId`, and `composioUserId` after successful preflight.
- `attempt.mjs` supplies only the pinned `sendConnectedAccountId` and pinned `composioUserId` to `executeSlackSendOnce`; `send-once.mjs` passes those values to the fixed `SLACKBOT_SEND_MESSAGE` tool/version. The untrusted event controls only a validated Slack channel, source-bound thread timestamp, and sanitized message/reply content.
- The split did not weaken prior controls: strict plain-data callback parsing, exact trigger/user/team checks, human and explicit-address requirements, bot/self rejection, bounded content, reply sanitization, safe destination binding, serialized processing, atomic at-most-once receipts, no automatic retry of ambiguous sends, provider timestamp confirmation, bounded/abortable execution, restricted Hermes environment, root-owned runtime integrity checks, and fail-closed rollback tests remain present.
- Runtime secrets remain limited to `COMPOSIO_API_KEY` and `OPENROUTER_API_KEY`. A source scan found no Slack token, private-key marker, or common embedded API-key form in the listener tree. Account IDs are identifiers, not credentials.
- Verification: `npm test` in `deployment/remote/orgo/maya-slack-listener` completed with 70 passed, 0 failed, 0 skipped. `git diff --check` reported no whitespace errors in the reviewed listener changes.

## Assumptions

- The supplied live-probe facts are trusted evidence: the trigger-bound OAuth connection returns `auth_refresh_required` for `SLACKBOT_SEND_MESSAGE`, and the separately created bearer bot-token connection has prior confirmed send evidence. This review made no external calls and did not independently re-probe either connection.
- The reviewed account IDs are bound in Composio to the stated credential types and to the pinned `maya-chen` user. Code enforces the user on trigger preflight, callback identity, subscription, and send execution, but local source alone cannot inspect provider-side account ownership.
- Review scope is the current uncommitted Maya listener change set and its existing tests; unrelated modified files in the broader worktree were not assessed or changed.

MACHINE_VERDICT: PASS
