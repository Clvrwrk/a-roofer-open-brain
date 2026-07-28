# Maya 30-Minute Mailbox/Task-Intake Activation

Status: source gate passed; live activation and postcheck pending.
Owner and sole human approver: Christopher Hussey.
Runtime: Maya's dedicated Orgo computer `37b262e0-a915-47e6-8c3b-f180a32ab6fe`.
Release: `@open-brain/maya-slack-listener` 0.2.0.

## Authorized outcome

The existing Maya Slack listener remains continuously live. The same single
Supervisor-owned process schedules one mailbox occurrence at every UTC half-hour.
The first activation stores the current cursor and does not replay historical mail.
Later occurrences read only Maya's pinned Composio Gmail connection and classify
each new message as `ignore`, `track`, or `block` with the tool-free low-cost Hermes
model.

- `ignore`: mark a successfully classified unread message read.
- `track`: create one source-linked `[MAYA]` issue in the pinned PE-CC-DevTeam
  Linear team, then mark the message read.
- `block`: create the Linear issue, send one `[NA-5][MAYA] - [BLOCKED]` routing
  packet to Christopher through Maya's pinned Slack persona/destination, then mark
  the message read.

This is a live task-intake and routing executor, not unrestricted material work. It
does not send email, reply to the sender, parse attachment contents, pay, approve,
publish, change access, or choose a different team or destination. Those task
classes require separate Composio actions and production promotion.

## Deterministic evidence

- Listener tests: 91/91 PASS.
- Ringer manifest lint: clean, three tasks.
- Final full local Ringer run:
  `maya-mailbox-30m-production-gate-20260728T112938Z-p99742`.
- Security/egress gate: PASS, first attempt.
- Operations/cadence gate: PASS, first attempt.
- Accounting workflow gate: PASS, first attempt.
- The gates executed the full test suite and source-level checks for pinned
  Composio identity/destinations, prompt-injection boundaries, absence of email
  send/reply tools, private hashed receipts, terminal ambiguity, half-hour cadence,
  restart behavior, bounded pagination, empty-inbox isolation, graceful shutdown,
  Linear provenance, blocked Slack routing, mark-read behavior, and honest scope.

An earlier run, `maya-mailbox-30m-production-gate-20260728T111853Z-p96597`, passed
security and operations but failed the workflow checker because its README wording
match was case-sensitive. The follow-up exposed a second checker-only line-break
defect. Both failures remain recorded. The check was corrected and independently
executed before the final three-gate PASS; no product failure was waived.

The first stopped-state deployment also exposed that the new mailbox directories
were created with the correct private ownership but were not named in both layers of
the trust verifier. Activation remained fenced. The installer now rejects a hostile
pre-existing mailbox symlink while permitting the extension to be absent during an
upgrade, and the runtime trust chain requires both mailbox directories to be exact
owner-only paths. The 91-test suite and all three Ringer gates were rerun after this
fix; the earlier full PASS `maya-mailbox-30m-production-gate-20260728T112243Z-p97871`
is superseded by the final run above.

The initially selected external adversarial reviewers were not used because that
would have disclosed private repository content to external model providers without
a distinct disclosure approval. The replacement Ringer engine and checks ran
locally without network access. This evidence is deterministic, not a claim of an
external AI review.

## Activation order

1. Confirm the exact Maya Composio trigger and four pinned connected accounts.
2. Disable the Slack trigger and confirm it disabled.
3. Stop the exact Supervisor program and confirm it stopped.
4. Install the exact source archive disabled; preserve the prior release privately.
5. Run the release and Hermes trust-chain checks while stopped.
6. Re-enable the exact Slack trigger.
7. Start the exact Supervisor program.
8. Confirm one running process, release 0.2.0, `mailbox_bootstrapped`, and a bounded
   `mailbox_next_occurrence_scheduled` delay. Activation must not call Gmail,
   Linear, or Slack proactively.
9. At the next UTC half-hour, confirm one terminal mailbox occurrence without
   exposing mailbox content in operator evidence.

## Rollback

Disable and confirm the exact Composio Slack trigger first, stop and confirm the
Supervisor program, restore the privately retained prior release, validate its trust
chain, re-enable the trigger, and restart. Retain mailbox cursor/receipts and any
ambiguous provider-effect evidence; never delete or recreate them to manufacture a
clean result.

## Live evidence

Pending deployment. Record the deployed commit, release archive hash, trigger state,
Supervisor state, bootstrap/schedule events, next occurrence result, and Linear
issue/comment here and in the PE-CC-DevTeam activation record.
