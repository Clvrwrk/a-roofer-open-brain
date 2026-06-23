# 45 — Communications Dashboard (design note)

Raised during the Agreement Builder review (2026-06-19, point #4). **Not built — design
note.** Chris: *"we may need a Communications dashboard that tracks all pending
communication so we have a single source of truth of what this system has generated,
awaiting feedback, approved … it is seeming to be a critical gate that we need to track
since this is such a large amount of potential activity happening in silos right now."*

## The problem

The system already drafts a growing number of outbound communications, each in its own
silo, each gated by the SOUL rule *"nothing external without approval."* There is no single
place to see everything in flight, who owns the next action, or what has actually been
sent. As surfaces multiply (renewals, credit memos, price-list requests, agreement
packages, estimates…), the approval gate needs one home.

## What it should be

A **single source of truth + human approval gate** for every system-generated
communication — the one screen where a person sees "what has this brain produced, what is
waiting on me, what is waiting on the other party, what is done."

## Communications it should aggregate (current + known-coming)

- **Price-agreement renewal requests** — `price_refresh_request` (reason
  `agreement_renewal`). Generated from Price Agreement Audit "Request renewal."
- **Credit-memo requests** — invoice-audit disposition → credit-memo flow (draft → sent →
  received).
- **Price-list requests** — `price-agreement/request-price-list`.
- **Agreement packages / negotiation worksheets** — `agreement_packages` drafts to the ABC
  national account manager (Agreement Builder "Draft for review" / future "Submit").
- **Estimates / proposals** — when that surface generates client-facing docs.
- (Anything else that leaves the building gets a row here.)

## Lifecycle states (proposed)

`draft / generated` → `awaiting internal approval` → `approved` → `sent` →
`awaiting counterparty feedback` → `received / closed` (or `declined` / `superseded`).

Each row: type, subject, counterparty, owner of next action, state, age-in-state, source
surface, deep-link back to the originating record.

## Why it's a gate, not just a log

- Enforces "nothing external without a human" centrally instead of per-surface.
- Surfaces stalls (drafts nobody approved; sent items with no reply past SLA).
- De-silos: one inbox/outbox view across every workflow.

## Open questions (to develop with Chris)

- One unified `communications` table/view vs. a view that unions the existing per-flow
  tables? (Leaning: a `v_communications` projection over existing tables first, so no data
  migration; promote to a real table if it needs its own state machine.)
- Does approval here *trigger* the send, or just authorize a human to send manually?
- Notifications / digest? Per-owner queues? SLA timers?
- Relationship to the existing Human Unblocker dashboard (`HumanUnblockerDashboard`) — merge
  or adjacent?

## Related

- [[verify-against-live-db]] · SOUL approval boundary · `HumanUnblockerDashboard.astro`.
- Recurs across: Price Agreement Audit (renewals), Invoice Audit (credit memos), Agreement
  Builder (#6 submit-on-review-complete also needs this).

## Implementation snapshot (2026-06-23)

Invoice Audit now has a first-pass communications preview workflow:

- Actions tab + Communications Preview tab in invoice disposition.
- Channel drafts (Slack/email), subject line, WYSIWYG edit/reject flow.
- Approval gate writes immutable `communication_events`.
- Internal-only release queue writes `communication_delivery_attempts` and mirrors Slack via `slack_mirror_events`.
- DB-backed routing now resolves via `communication_routes`.

This is the first vertical slice only (Invoice Audit). Fleet/Tools remain placeholder surfaces for now.
