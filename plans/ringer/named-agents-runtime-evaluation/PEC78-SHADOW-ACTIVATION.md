# PEC-78 Maya shadow activation contract

Status: authorized for implementation and controlled testing on 2026-07-26.

## Human authorization

Christopher Hussey authorizes Maya Chen only to enter shadow mode, read and
classify one enumerated synthetic Google Workspace message, and send controlled
Slack/email test messages only to Christopher. Ordinary mailbox intake is excluded.
This authorization does not activate the recurring 30-minute schedule or any other
named agent.

## Fixed identities and destinations

- Persona: `maya-chen`; subject: `named-agent:maya-chen`; runtime owner:
  `runtime:maya-chen`.
- Orgo workspace: `8cf44774-2b46-4089-8bfe-4deb1b078e46`; existing computer:
  `37b262e0-a915-47e6-8c3b-f180a32ab6fe`. No duplicate computer may be created.
- Google identity: `maya.chen@cc.proexteriorsus.net`.
- Slack workspace: `T0B8QEGPVQW`; Maya app: `A0BD0PAEU2E`; sole destination:
  Christopher DM `D0B8B2NHP39`.
- Sole email recipient: `admin@cc.proexteriorsus.net`.

Destination values must be enforced by exact database grants and exact runtime
comparisons. The request cannot supply a different destination. Slack shared-bot
fallback is forbidden. Email CC/BCC, reply-to-original-sender, forwarding, and
additional recipients are forbidden.

Before the test, provider identity introspection must prove Maya's exact Slack bot
user and the Google sender account above. Their stable IDs and digests are bound to
the destination grants and receipts. Shared Slack identity, AgentMail, SMTP, and any
Google account other than Maya are denied.

## Runtime and fixture ownership

The sole owner is Hermes on Maya's existing Orgo computer, with one new UUID runtime
instance and a one-shot occurrence per test. eve, legacy listeners, local Mac Mini
runtimes, and the recurring schedule remain disabled. The principal fence epoch is
bound into every reservation; stale or concurrent owners deny.

Mailbox testing is limited to one exact message ID under the dedicated
`PEC78-SHADOW-SYNTHETIC` Gmail label. The allowed sender, subject, message ID, and
body digest are added to the production gate before read. Negative evidence must
show that unrelated message IDs, metadata, bodies, and attachments were not fetched.

## Shadow semantics

Shadow permits mailbox read/classification and durable decision recording. A
controlled outbound test may create a proposed effect and execute it only when:

1. the principal, credential, capability, destination, and production gate are
   active and unexpired;
2. no kill switch matches;
3. the separately trusted Command Center issuer signs the short-lived access
   token and binds it to Maya's RFC 7638 DPoP thumbprint via `cnf.jkt`;
4. access/proof JTIs and request idempotency are atomically claimed;
5. the payload exactly matches the destination grant;
6. one immutable receipt is written before provider I/O and a terminal receipt is
   reconciled after provider I/O.

No model output can change identity, capability, destination, provider account,
or approval scope. Raw secrets may not enter SQL, logs, prompts, receipts, source,
or Ringer artifacts.

## Initial effect budget

- Maximum one Slack test and one email test during this activation gate.
- Text must identify itself as a PEC-78 Maya shadow test and contain no customer
  data, mailbox content, links, attachments, financial data, or instructions.
- Recurring schedule remains disabled.
- Provider failures stop the run; no automatic retry after an ambiguous result.
- Model route: a separately verified low-cost Hermes T0 model; maximum 4,000 input
  tokens, 2,000 output tokens, 20 tool/browser steps, 300 seconds, no model retry,
  and $1.00 aggregate gate spend. Any exceeded or missing cost receipt hard-stops.
- The Linear human-authorization receipt is
  `0a8dc0f8-c8d5-4003-ae43-61b8939a9b33`. It authorizes only the two unchanged
  synthetic intents described here; Maya cannot approve or widen them.

## Rollback

Rollback sets `PEC78_ADAPTER_MODE=disabled`, revokes the production gate,
credential, grants, and destinations, increments the principal fence epoch, and
leaves receipts intact. It fences active leases and in-flight effects; ambiguous
provider outcomes remain terminal until provider-side reconciliation proves zero or
one delivery. Operational endpoints must then return 423. Restoration requires a
new credential, gate, and human authorization; rollback never re-enables authority.

## Acceptance

- Automated auth, replay, destination, transactional RPC, route, and rollback
  tests pass.
- Ringer security, database, and operations reviewers return no P0/P1.
- Deployment occurs disabled; production catalog/readiness checks pass before a
  separate promotion to shadow.
- Exactly one controlled Slack message and one controlled email reach Christopher,
  each with a durable provider ID and receipt. No other effect occurs.
- Private readiness remains degraded until issuer key separation, registry and
  migration hashes, credential/provider identities, current gate, replay store,
  budgets, zero active kill switches, zero duplicate owners, and zero unreconciled
  effects are all observed fresh. A successful test is not live activation.
