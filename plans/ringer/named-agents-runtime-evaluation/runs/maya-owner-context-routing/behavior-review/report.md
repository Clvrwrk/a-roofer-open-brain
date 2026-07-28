# Review Report

Independent read-only accounting-agent behavior review of the Maya Chen owner-context routing candidate at `/private/tmp/maya-context-routing`.

**Scope owned:** `report.md` only.  
**Sources inspected:** `agents/profiles/maya-chen.yaml`, `agents/profiles/maya-chen/SOUL.md`, `deployment/remote/orgo/maya-slack-listener/SOUL.md`, `hermes-runner.mjs`, `core.mjs`, `attempt.mjs`, `policy.mjs`, and listener tests under `deployment/remote/orgo/maya-slack-listener/test/`.  
**Effects:** no source changes, credentials, network, inference, Slack, email, Linear, deployment, or external effects. Local `npm test` only.

## Summary

The candidate consistently treats **natural-language assignments** as ordinary in-scope work, requires blocked or uncertain work to open with **`[BLOCKED]`**, and escalates to **Christopher** with the full context-and-routing package: **source or assignment**, completed attempts, **exact blocker**, **recommended route or bounded options**, and **specific decision** needed. The current Slack conversation runtime injects Christopher only into the **current Slack thread**, never claims a **separate message or DM**, strips **model-supplied mentions**, and injects only the immutable owner identity for `[BLOCKED]` output. Future proactive mailbox/task escalation is restricted to a **pinned owner destination** under an authorized executor. The full listener suite reports **76 tests pass**.

**MACHINE_VERDICT: PASS**

## Findings

No material behavior defects found against the stated owner-context routing contract.

## Clean

The following controls were verified as present, consistent, and covered by automated tests where applicable.

### Natural-language assignments and in-scope inference

- **Profile SOUL** (`agents/profiles/maya-chen/SOUL.md`): “Treat concise, natural-language assignments like the normal work Maya receives. Infer reasonable next steps inside your accounting/document-intake scope…”
- **Listener SOUL** (`deployment/remote/orgo/maya-slack-listener/SOUL.md`): “Treat concise natural-language assignments as normal work. Infer reasonable next steps inside your accounting scope…”
- **Hermes prompt** (`hermes-runner.mjs` `buildHermesPrompt`): same natural-language assignment and inference instruction.
- **Tests:** `lifecycle.test.mjs` — “Hermes turns a blocker into an honest in-thread owner escalation” and “Maya asks Christopher in Slack with a complete context-and-routing escalation” assert the natural-language assignment language in both prompt and SOUL.

### `[BLOCKED]` for blocked, uncertain, missing-access, or unclear-routing responses

- **Profile** (`maya-chen.yaml` `owner_escalation.blocked_marker`): `"[BLOCKED]"`.
- **Profile SOUL / listener SOUL / hermes-runner**: blocked, materially ambiguous/uncertain, missing access or authorization, or unclear ownership/routing → start the response body with the exact marker `[BLOCKED]`.
- **Runtime** (`core.mjs` `buildReply`): only replies whose cleaned body `startsWith("[BLOCKED]")` receive the owner mention path.
- **Tests:** prompt/SOUL string matches for the exact marker; `core.test.mjs` — “only a blocked response receives the immutable Christopher mention.”

### Escalation content for Christopher

All five required escalation elements are specified and tested:

| Element | Profile `required_fields` | Listener SOUL | Hermes prompt | Lifecycle tests |
| --- | --- | --- | --- | --- |
| **source or assignment** | yes | yes | yes | yes |
| completed attempts / work completed or tried | yes | yes | yes | yes |
| **exact blocker** | yes | yes | yes | yes |
| **recommended route or bounded options** | yes | yes | yes | yes |
| **specific decision** / context needed | yes | yes | yes | yes |

Profile behavior also forbids silent stop, repeated refuse, or waiting without notifying Christopher, and requires continuing unblocked work.

### Christopher only in the current Slack thread (no separate message or DM)

- **Listener SOUL:** “This conversation runtime can mention Christopher only in the current Slack thread; never claim you sent a separate message or DM.”
- **Hermes prompt:** “This runtime can reply only in the current thread; never claim that you sent Christopher a separate message or DM.”
- **Send path:** `buildSendArguments` always binds `thread_ts` and sets `reply_broadcast: false`; `attempt.mjs` uses the decision’s `threadTs` for the single Slack send.
- **Tests:** lifecycle asserts “current Slack thread” and “never claim … separate message or DM.”

### Future proactive mailbox/task escalation → pinned owner destination

- **Listener SOUL:** “A future authorized mailbox/task executor must use its pinned owner destination for proactive escalation.”
- Current conversation runtime remains thread-bound; proactive mailbox/task path is not opened by the listener and is constrained to a pinned owner destination under authorization language.

### Model-supplied mentions stripped; immutable owner only on `[BLOCKED]`

- **`buildReply`** strips model-supplied Slack references via `/<[@#!][^>]+>/gu` and `/<![^>]+>/gu` → `"[reference removed]"` before any owner injection.
- For `[BLOCKED]` only, runtime prepends `` `${PREFIX} <@${ownerSlackUserId}> `` using the approved owner id.
- Non-blocked replies get `${PREFIX} ${cleaned}` with no owner mention even when `ownerSlackUserId` is supplied.
- Missing/invalid owner id on a blocked reply throws: “Blocked reply is missing the approved owner identity.”
- **Policy** pins `ownerSlackUserId: "U0B8SGJJZLJ"`; **attempt.mjs** passes `expected.ownerSlackUserId` into `buildReply`.
- **Tests** (`core.test.mjs`):
  - “removes model-generated Slack references”
  - “only a blocked response receives the immutable Christopher mention” (injects owner, strips model `<@U123456789>`, rejects missing owner)

### 76 tests pass

Exact local suite result from  
`cd deployment/remote/orgo/maya-slack-listener && npm test`:

```text
# tests 76
# suites 0
# pass 76
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

All **76 tests pass**.

## Assumptions

- Behavior contract is judged from committed profile, SOUL, prompt, runtime code, and unit/integration-style listener tests; no live Hermes inference or Slack send was exercised.
- Profile SOUL’s sensitive-path fallback (“approved private owner channel or human DM”) applies to the broader agent surface; the **current** conversation listener SOUL correctly narrows Christopher contact to the **current Slack thread** only and forbids claiming a separate message or DM.
- “Future authorized mailbox/task executor … pinned owner destination” is the explicit proactive-escalation control; authorization is stated on that line, and receipt discipline for effects is already embodied by the listener’s `ReceiptStore` pattern for the current path rather than re-spelled as a separate future-mailbox receipt clause.
- `policy.mjs` `ownerSlackUserId` is treated as the immutable Christopher Slack identity for injection; identity correctness is a configuration/policy pin, not re-validated against live Slack directory in this review.
- Test file inventory under `test/*.test.mjs` is the full suite invoked by `npm test` per `package.json`.

MACHINE_VERDICT: PASS
