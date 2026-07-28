# Review Report

Independent Slack authorization and runtime review of the Maya owner-context routing candidate under `/private/tmp/maya-context-routing`. Scope is read-only: `deployment/remote/orgo/maya-slack-listener` (full package), `agents/profiles/maya-chen.yaml`, `agents/profiles/maya-chen/SOUL.md`, `plans/ringer/named-agents-runtime-evaluation/HERMES-NAMED-AGENT-TEMPLATE.md`, and `docs/74-named-agent-runtime-ringer-governance.md`. This reviewer owns only this `report.md`. No source changes, credentials, network calls, inference, Slack, email, Linear, deployment, or other external effects were performed beyond local `npm test` in the listener package.

## Summary

The conversation-only Maya Slack listener pins Christopher’s Slack user identity as an immutable reviewed literal, injects that fixed mention only for sanitized replies that begin with `[BLOCKED]`, strips other model-supplied Slack mentions, and binds every send to the accepted source channel and current Slack thread. Ordinary replies never receive the owner mention. Natural-language assignments are treated as normal answerable work in SOUL, Hermes prompt, profile, template, and governance. Blocker contracts require source or assignment, attempted work, exact blocker, recommended route or bounded options, and specific decision needed. Proactive email/task escalation is documented only as a future executor contract through a pinned owner destination with normal authorization and receipt—not claimed as live in this tool-free listener. Full package suite: **76 tests pass**.

## Findings

No authorization or runtime findings that fail the acceptance criteria for this review.

## Clean

### Fixed owner Slack identity (immutable; not model/request-supplied)

- `policy.mjs` freezes `APPROVED` with `ownerSlackUserId: "U0B8SGJJZLJ"` alongside other reviewed Composio/Slack identities. `Object.isFrozen(APPROVED)` is asserted in tests.
- `attempt.mjs` calls `buildReply(answer, expected.ownerSlackUserId)` only from that pinned policy object—never from the Hermes answer, Slack payload, or environment.
- `listener.mjs` / `hermes-runner.mjs` accept only `COMPOSIO_API_KEY` and `OPENROUTER_API_KEY` from `process.env`. Supervisor tests forbid `SLACK_OWNER_USER_ID` and related identity env overrides.

### Ordinary replies never mention the owner; only `[BLOCKED]` receives Christopher’s fixed mention

- `buildReply` in `core.mjs`:
  1. Sanitizes model text (strips `<@…>`, `<#…>`, `<!…>` to `[reference removed]`).
  2. If cleaned text **starts with** `[BLOCKED]` and `ownerSlackUserId` matches `SLACK_USER_ID`, returns `` `${PREFIX} <@${ownerSlackUserId}> ${cleaned}` ``.
  3. Otherwise returns `` `${PREFIX} ${cleaned}` `` with **no** owner mention.
- Missing owner identity on a `[BLOCKED]` body throws (`Blocked reply is missing the approved owner identity`).
- Tests: `only a blocked response receives the immutable Christopher mention`; ordinary `Ready for review.` keeps prefix only; `[BLOCKED] Hello <@U123456789>` becomes fixed Christopher mention + `[reference removed]`.

### Model-supplied mentions remain stripped

- All model-generated Slack references are replaced before any owner injection, so a model cannot redirect or add alternate user/channel/special mentions. Confirmed by `removes model-generated Slack references` and the blocked dual-mention case.

### Destination channel and thread bound to the accepted source event (current Slack thread)

- `evaluateEvent` sets `threadTs` from valid `data.thread_ts` or falls back to message `ts`; `eventKey` includes team, channel, and `ts`.
- `runAcceptedAttempt` builds send args only as `buildSendArguments(decision.event.data.channel, decision.threadTs, reply)`.
- `buildSendArguments` validates channel id and Slack timestamp, sets `channel`, `thread_ts`, `reply_broadcast: false`, and requires the Maya prefix. No alternate channel, DM, or broadcast path exists in the send path.

### Runtime does not claim a separate message or DM

- Listener `SOUL.md`: “This conversation runtime can mention Christopher only in the current Slack thread; never claim you sent a separate message or DM.”
- `buildHermesPrompt`: “This runtime can reply only in the current thread; never claim that you sent Christopher a separate message or DM.”
- Governance (`docs/74-…`) and Hermes template: conversation-only listener asks in its current thread and must not claim a separate owner message; mailbox/task executor is a separate future path.
- Unverified action-claim language in replies is rejected by `buildReply` (`I sent` / `I emailed` / etc.).

### Natural-language assignments remain answerable

- Listener `SOUL.md`, `hermes-runner.mjs` prompt, profile `maya-chen.yaml` / `maya-chen/SOUL.md`, Hermes template, and governance all state that concise natural-language assignments are normal work; the agent infers reasonable next steps inside accounting/document-intake scope without requiring formal command syntax.
- Lifecycle tests lock the prompt/SOUL language: “Treat concise natural-language assignments as normal work.”

### Blocker contract fields

Each blocker path (prompt, SOUL, profile owner_escalation, template, governance) requires:

| Required field | Present in contract |
| --- | --- |
| source or assignment | yes |
| work completed or attempted | yes |
| exact blocker | yes |
| recommended route or bounded options | yes |
| specific decision (or context) needed | yes |

Runtime hard-gates the `[BLOCKED]` marker and fixed Christopher mention; field content is prompt/SOUL contract plus test-enforced language (not a structural body parser—appropriate for this zero-tool conversation runtime).

### Proactive email/task escalation is future-only (not live)

- Listener `SOUL.md`: “A future authorized mailbox/task executor must use its pinned owner destination for proactive escalation.”
- `docs/74-named-agent-runtime-ringer-governance.md`: conversation-only listener stays in-thread; a mailbox/task executor may initiate Slack escalation only through its pinned Christopher destination with normal authorization and receipt.
- Hermes template: same split (conversation listener vs executor with pinned destination and effect receipt).
- This package is tool-free conversational send-to-source-thread only; it does not implement mailbox polling, email send, Linear, or proactive DM. No false claim of live proactive escalation.

### Test evidence

```text
npm test  # in deployment/remote/orgo/maya-slack-listener
# tests 76
# pass 76
# fail 0
```

**76 tests pass.**

## Assumptions

- Review is of repository artifacts and local unit/integration tests only; production Supervisor state, live Composio trigger enablement, and remote Orgo identity were not observed.
- “Mention the owner” is interpreted as Slack `@` mention injection (`<@U…>`), which the runtime hard-controls; free-text names in ordinary prose remain model-generated but do not create a second destination or DM.
- Blocker body completeness (five content fields) is enforced by SOUL/prompt contracts and regression tests on those strings, not by a second code parser after Hermes—consistent with the documented conversation-only design.
- Pinned owner destination for future mailbox/task executors is a planning/contract obligation for a later gated package; this review does not certify a non-existent executor implementation.

MACHINE_VERDICT: PASS
