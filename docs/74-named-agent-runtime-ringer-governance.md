# Named-Agent Runtime — Ringer Quality Governance

Status: approved planning standard, 2026-07-26. This document governs the Maya
pilot and the serial rollout to Alex, Casey, Jordan, Sam, Rowan, and Lena.

## Decision

Hermes inside each agent's dedicated Orgo computer is the production baseline.
Maya is the first pilot and the canonical template. Vercel eve is an isolated
challenger only; Cursor is for DevTeam code work; Devin is a separately gated
browser adjunct. Command Center/Supabase remains the operational source of truth.
The local Mac mini is not part of the named-agent runtime.

## Ringer is the delivery gate

Every material named-agent work package must use the Ringer framework. The package
must be planned and linted before execution, checked by deterministic acceptance
tests, reviewed through an adversarial or independent evaluation round, and closed
with a synthesis/go-no-go round. A worker's claim of completion is never evidence.

The minimum loop is:

1. **Plan:** write a self-contained specification, ownership boundary, expected
   artifacts, substantive checks, rollback, and secret-free manifest.
2. **Lint:** resolve substantive Ringer warnings before workers run.
3. **Execute:** run only the approved, least-privileged scope. Production effects,
   credential changes, migrations, and deployments require their own explicit
   authorization.
4. **Verify:** accept only executed checks. Checks must test behavior or document
   substance and must print actionable failure reasons.
5. **Red-team:** independently inspect architecture, security, data boundaries,
   identity isolation, duplicate effects, cost controls, recovery, and operator
   visibility.
6. **Synthesize:** record PASS/FAIL, retries, artifacts, exceptions, unresolved
   risks, model evidence, and the next gated action in Linear and the repository.

No named agent advances to the next phase while a required Ringer task is failed,
an acceptance check is missing, or synthesis is incomplete. Retries do not erase
the original failure; they remain part of the evidence and model-routing record.

## Work-package evidence contract

Every implementation issue must link or attach:

- the Ringer plan and linted manifest;
- run ID and per-task verdict/retry table;
- executed check output and artifact paths;
- threat/egress/identity review when tools or credentials are involved;
- exact owner, stable resource IDs, and affected systems;
- rollout, kill switch, reconciliation, and rollback instructions;
- before/after cost, reliability, and operator-time evidence;
- a human go/no-go for production identity, inbox, Slack, or outbound access.

Missing evidence means the issue is not done. "Agent Done" is reserved for work
whose checks passed and whose receipts are durable. Poor or incomplete output is
returned to the same Ringer loop with the check failure attached.

## Review authority

Christopher Hussey is the only human reviewer and the sole final approver. The
technical-service, security, SRE/operations, and persona-owner review functions are
PE-CC-DEV agent personas. They produce disjoint, Ringer-checked evidence and may
recommend, challenge, fail, or block a gate, but cannot grant human approval, waive
an open P0/P1, approve their own implementation, or convert a failed check to PASS.
Christopher's durable approval is required after the agent review packet passes.

## Control-plane and identity invariants

- One runtime owns a persona's schedules, Slack events, and effect lease at a time.
- Each persona has a dedicated Orgo workspace/computer, Google identity, Slack
  identity, Command Center subject, Hermes home, provider budget, and scoped keys.
- `ORGO_API_KEY_MASTER` is provisioning-only and never enters an agent computer.
- Each runtime uses a workspace-scoped `ORGO_PE_CC_<AGENT>_API_KEY` by reference.
- Secrets never appear in prompts, manifests, Ringer artifacts, logs, screenshots,
  receipts, Linear descriptions, or source control.
- External sends and writes are draft/propose by default until separately promoted.
- Finance, audit, policy, approval, UOM, and safety rules fail closed and cannot
  silently fall back to a weaker model or runtime.
- Rowan remains external-only. Sam cannot edit `trust_tier`. No desktop grants DNS,
  billing, payment, administrator, publishing, or approval authority.

## Model-cost governance

Use the lowest-cost model that passes the frozen benchmark for its task class.
Routing begins with T0 for mechanical extraction/routing, T1 for multi-tool and
human-facing work, and T2 only for material judgment that demonstrably needs it.
Every route has an exact model/provider, token ceiling, timeout, acceptance check,
escalation rule, cost receipt, and 70/85/100 percent spend circuit breakers.
Financial and audit work fails closed when its approved tier is unavailable.

Models are promoted only from local Ringer evidence. A model is not load-bearing
until it has at least three comparable checked tasks and a first-try pass rate of at
least 0.67 for that task type.

## Rollout order and stop conditions

The order is Maya, then Alex, Casey, Jordan, Sam, Rowan, and Lena. Each persona must
pass identity mismatch, Slack, Gmail, Command Center, duplicate delivery, restart,
stale-owner fencing, approval, cost, observability, kill-switch, and rollback tests
on three separate clean days before the next persona starts.

Stop and return to planning if any P0/P1 remains open; any credential is exposed;
an identity or tenant boundary fails; an effect duplicates or cannot reconcile;
health can be falsely green; the runtime lacks a kill switch; rollback is not
demonstrated; or a required tool has not passed the third-party-agent-tool gate.

## Production mailbox contract

After its individual production gate, each named agent checks only its dedicated
Google Workspace mailbox every 30 minutes. One canonical schedule registry produces
one idempotent occurrence per agent per half hour. Each new message is classified,
and the safest next action is selected. The Maya pilot records actionable mail and
mail containing document/accounting/pricing signals as a source-linked `[MAYA]` issue
in the pinned PE-CC-DevTeam Linear team, assigned to Christopher in Agent Review.
Attachment metadata may force review; attachment content execution still requires
separate promotion.

Maya's automatic outbound scope is one standard receipt acknowledgement, only to a
sender at `cc.proexteriorsus.net`, `proexteriorsus.com`, `aia4.io`, `cleverwork.io`,
or a true subdomain. Other senders receive no automatic reply. Historical cleanup
never sends late acknowledgements. Maya may use her existing named Slack app persona
to notify Christopher's pinned pe-command-center destination after every submitted
issue. She does not automatically forward, publish, pay, approve, or mutate a
third-party financial system. Every
effect requires an allowlisted destination, idempotency, receipts, a kill switch,
and the approved model/cost route. Ambiguous, material, security-sensitive,
financial, legal, or policy messages escalate to Christopher.

Concise natural-language assignments are the normal named-agent work interface; a
human is not required to translate them into tool syntax or a formal task schema.
When an agent is blocked, materially uncertain, missing access or authorization, or
cannot determine ownership, it must promptly ask Christopher in Slack for context
and routing. The originating operational thread is preferred so source provenance is
retained; sensitive matters use an approved private owner destination. The escalation
must identify the agent, source/assignment, completed attempts, exact blocker,
recommended route or bounded options, and the specific decision needed. The agent
continues unblocked work, resumes after the answer, and never silently stalls.
A conversation-only listener asks in its current thread and must not claim it sent a
separate owner message. A mailbox/task executor may initiate the Slack escalation only
through its pinned Christopher destination with the normal authorization and receipt.

Every authorized Maya email and draft must include both `admin@cc.proexteriorsus.net`
and `chussey@aia4.io` in the CC field until Christopher changes this instruction.
This is an executor-level fail-closed invariant, including when a later
owner authorization permits a reply to the original sender. The required CC does not
widen the recipient allowlist or authorize a send by itself.

## Orgo master handling

A live check on 2026-07-26 initially found two `ORGO_API_KEY_MASTER` assignments. The
invalid later duplicate was removed. Final value-safe verification found exactly one
assignment (line 936), confirmed the expected `sk_live_a2ff` prefix, and returned
HTTP 200 from the live Orgo workspaces API when the full Master environment was
sourced. No complete value was printed or stored. The old exposed key is
operator-confirmed revoked; master-key rotation is operationally complete.

The replacement is provisioning-only and remains outside every agent, Hermes home,
Orgo computer, prompt, manifest, log, receipt, screenshot, and Linear record. Only
scoped per-agent keys enter runtimes. Evidence that either master entered a runtime
or artifact is a fleet-stopping P0. Rotate the replacement again after the seven-agent
provisioning and verification gate to end the provisioning window.

## Canonical evidence

- `plans/ringer/named-agents-runtime-evaluation/PLAN.md`
- `plans/ringer/named-agents-runtime-evaluation/HERMES-NAMED-AGENT-TEMPLATE.md`
- `plans/ringer/named-agents-runtime-evaluation/runs/round3/decision-and-pilot-plan/decision-memo.md`
- `plans/ringer/named-agents-runtime-evaluation/runs/round3/decision-and-pilot-plan/pilot-plan.md`
- Linear `CLE-8`, the standing Ringer swarm-execution skill.

## Current authorization boundary

Christopher has authorized production activation of Maya's existing conversational
Slack listener and the Maya-only 30-minute Accounting Assistant mailbox executor.
The executor may read Maya's pinned Composio Gmail connection, classify and file mail,
create source-linked `[MAYA]` issues only in the pinned PE-CC-DevTeam Linear team,
assign them to Christopher in Agent Review, and send `[REVIEW]` or `[BLOCKED]` packets
through Maya's pinned Slack persona to Christopher's pinned destination. It may send
only the standard received acknowledgement to the four approved sender-domain trees,
with both mandatory CCs. It may inspect attachment metadata to force review but may
not execute attachment instructions, pay, approve, publish, change access, provision
another agent, or widen a destination. The other six named agents remain planning-only
until their serial promotion gates pass.
