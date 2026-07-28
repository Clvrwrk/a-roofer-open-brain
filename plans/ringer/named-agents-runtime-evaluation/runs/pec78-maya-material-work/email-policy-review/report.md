# Review Report

Independent, read-only agent-communications governance review of the candidate at `/private/tmp/pec78-maya-material-work`. Scope was limited to the listed policy, profile, template, governance, and listener-test artifacts. Owned output is only this `report.md`. No source changes, credentials, network access, inference calls, email, Slack, Linear, deployment, or other external effects were performed. Listener verification used local `npm test` only.

## Summary

The candidate elevates mandatory outbound-email CC of `admin@cc.proexteriorsus.net` to an **executor-level fail-closed** rule for named agents (Maya pilot plus Hermes named-agent template), not mere prompt guidance. Governance and the template both state that the required CC **does not widen** the approved To-recipient allowlist and does not authorize a send by itself. Maya durable fleet memory is consistent across profile YAML, profile `SOUL.md`, and the deployed listener `SOUL.md`: **Vehicle Master List** is the canonical fleet record, **WEX** is the fuel-card system, and join keys are **VIN**, **unit number**, and **license plate**. The full maya-slack-listener suite reports **73 tests pass** (`# tests 73` / `# pass 73` / `# fail 0`).

No P0 or P1 findings. **MACHINE_VERDICT: PASS.**

## Findings

None. No P0/P1/P2/P3 defects were found against the stated verification criteria.

Finding template (unused; required when defects exist): Evidence / Impact / Fix / Priority / Confidence.

## Clean

### 1. Mandatory CC is executor-level (not merely prompt guidance)

| Artifact | Evidence |
| --- | --- |
| `docs/74-named-agent-runtime-ringer-governance.md` | “Every authorized named-agent email must include `admin@cc.proexteriorsus.net` in the CC field. This is an **executor-level fail-closed invariant**, including when a later owner authorization permits a reply to the original sender.” |
| `plans/ringer/named-agents-runtime-evaluation/HERMES-NAMED-AGENT-TEMPLATE.md` | Full package Email policy: every authorized email, including an approved reply to an original sender, must contain `admin@cc.proexteriorsus.net` in the CC field. “**Enforce this in the executor** and **fail closed before provider I/O** when the required CC is absent.” |
| `agents/profiles/maya-chen.yaml` | Structured fields (not SOUL-only): `google_workspace.required_cc_recipient: "admin@cc.proexteriorsus.net"` and `guardrails.email_required_cc: "admin@cc.proexteriorsus.net"`. |
| Maya SOUL surfaces | Profile and listener `SOUL.md` reinforce fail-closed send refusal when CC is missing; they supplement the executor/governance rule and do not replace it. |

The rule is therefore specified as runtime/executor policy with fail-closed semantics, not as optional model wording alone.

### 2. Applies to Maya and the named-agent template

| Surface | Coverage |
| --- | --- |
| Maya profile YAML | `required_cc_recipient` + `email_required_cc` both set to `admin@cc.proexteriorsus.net`. |
| `agents/profiles/maya-chen/SOUL.md` | “Every authorized email you send must include `admin@cc.proexteriorsus.net` in the CC field. If that CC is absent, do not send.” |
| `deployment/remote/orgo/maya-slack-listener/SOUL.md` | “Every authorized email must include `admin@cc.proexteriorsus.net` in CC; an email missing that CC must not be sent.” |
| Hermes named-agent template | Package-level email policy for every generated named-agent package; mailbox job may contact Christopher only at `admin@cc.proexteriorsus.net` subject to the effect gate. |
| Governance doc | Production mailbox contract + mandatory CC apply to the named-agent fleet (Maya pilot first). |

### 3. Explicitly does not widen the approved To-recipient allowlist

| Artifact | Exact / equivalent language |
| --- | --- |
| `docs/74-named-agent-runtime-ringer-governance.md` | “The required CC **does not widen** the recipient allowlist or authorize a send by itself.” |
| `HERMES-NAMED-AGENT-TEMPLATE.md` | “The mandatory CC rule applies independently of the destination allowlist: adding `admin@cc.proexteriorsus.net` to CC **never authorizes an otherwise unapproved recipient**.” |

CC is a hard side-channel copy requirement independent of To authorization. Initial outbound To-scope remains Christopher-only (`admin@cc.proexteriorsus.net` as sole approved email destination until a later owner authorization).

### 4. Maya fleet memory: Vehicle Master List, WEX, VIN, unit number, license plate

Consistent fact pattern across all three durable Maya memory surfaces and the lifecycle retention test:

| Source | Statement |
| --- | --- |
| `agents/profiles/maya-chen.yaml` `domain_memory.fleet_fuel_card_relationship` | Fact: **Vehicle Master List** is the canonical fleet record and **WEX** is the fuel-card system attached to each vehicle record. Join rule: link WEX using durable identifiers **VIN**, **unit number**, or **license plate** (prefer over display names). |
| `agents/profiles/maya-chen/SOUL.md` | Same: Vehicle Master List canonical; WEX fuel-card system; join via VIN, unit number, or license plate. |
| `deployment/remote/orgo/maya-slack-listener/SOUL.md` | Same three entities and three durable identifiers. |
| `test/lifecycle.test.mjs` | Asserts listener SOUL matches: Vehicle Master List canonical fleet record; WEX fuel-card system; `VIN, unit number, or license plate`; `admin@cc.proexteriorsus.net`; “email missing that CC must not be sent”. |

No material contradiction among profile YAML, profile SOUL, listener SOUL, or the retention test.

### 5. Listener test suite — exact 73-pass result

Command (local only):

```text
cd deployment/remote/orgo/maya-slack-listener && npm test
```

Executed result:

```text
1..73
# tests 73
# suites 0
# pass 73
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

**73 tests pass.** Includes `Maya retains the fleet-to-WEX relationship and mandatory email CC` and the full trust/lifecycle/send/supervisor suite. Exit code 0.

## Assumptions

1. **Review target is the policy/profile/template/governance candidate and the listed listener SOUL/test surface**, not a claim that a full production Gmail send adapter is already live with hard CC injection in executable send code outside this package. The maya-slack-listener is conversational/Slack-only (SOUL: “no tools”); email CC is correctly encoded as governance + template executor requirements + Maya profile guardrails and SOUL reinforcement.
2. **“Executor-level” satisfaction** for this gate means the written rule and package contract require enforcement in the send executor (fail closed before provider I/O), as stated in `docs/74` and `HERMES-NAMED-AGENT-TEMPLATE.md`, rather than relying solely on model compliance with SOUL text.
3. **`does not widen`** is satisfied by the exact phrase in `docs/74` and the equivalent independent-allowlist language in the Hermes template.
4. **Fleet-memory consistency** is judged on named entities and join identifiers (Vehicle Master List, WEX, VIN, unit number, license plate), not identical prose word-for-word across YAML vs SOUL.
5. **No external systems** were contacted; npm test used local Node fixtures only.

---

**MACHINE_VERDICT: PASS**
